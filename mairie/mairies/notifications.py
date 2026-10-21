"""Notification de l'encadrant lorsqu'un stagiaire lui est affecté.

Deux canaux :
  • un message automatique dans la messagerie interne, envoyé au nom de la personne qui a fait
    l'affectation (pastille « non lu » et son de notification dans l'application) ;
  • un e-mail à l'adresse de l'encadrant, envoyé en arrière-plan pour ne pas ralentir l'enregistrement.
"""

import logging
import threading

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction

from .models import Conversation, EtatConversation, Message

logger = logging.getLogger(__name__)

FORMAT_DATE = '%d/%m/%Y'


def _nom(user):
    return f'{user.prenom} {user.nom}'.strip() or user.email or user.username


def _conversation_entre(a, b):
    """Conversation privée entre deux utilisateurs (créée si elle n'existe pas encore)."""
    communes = Conversation.objects.filter(participants=a).filter(participants=b).distinct()
    conversation = next((c for c in communes if c.participants.count() == 2), None)
    if conversation is None:
        conversation = Conversation.objects.create()
        conversation.participants.add(a, b)
    return conversation


def _texte_affectation(stage):
    st = stage.stagiaire
    return (
        '📌 Nouvelle affectation de stagiaire\n\n'
        f'Vous êtes désormais l\'encadrant de {st.prenom} {st.nom} '
        f'({st.niveau_etudes}) pour le stage « {stage.intitule} ».\n'
        f'• Service : {stage.service.nom}\n'
        f'• Période : du {stage.date_debut.strftime(FORMAT_DATE)} au {stage.date_fin.strftime(FORMAT_DATE)}\n'
        + (f'• Contact du stagiaire : {st.email}' + (f' · {st.telephone}' if st.telephone else '') + '\n')
        + '\nRetrouvez votre stagiaire dans l\'onglet « Mes Stagiaires ».'
    )


def _message_interne(stage, auteur, texte):
    conversation = _conversation_entre(auteur, stage.tuteur)
    message = Message.objects.create(conversation=conversation, auteur=auteur, contenu=texte)
    conversation.mis_a_jour_le = message.envoye_le
    conversation.save(update_fields=['mis_a_jour_le'])
    # La conversation revient dans la boîte de réception de l'encadrant si elle était archivée
    EtatConversation.objects.update_or_create(
        conversation=conversation, utilisateur=stage.tuteur, defaults={'archivee': False}
    )


def _email(stage, auteur, texte):
    tuteur, st = stage.tuteur, stage.stagiaire
    url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
    sujet = f'Nouveau stagiaire à encadrer : {st.prenom} {st.nom} — Gestion des Stagiaires'
    corps = f'Bonjour {tuteur.prenom or ""},\n\n{texte}\n\nVoir mes stagiaires : {url}/stagiaires\n\n{_nom(auteur)}'
    html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f172a">
      <div style="background:#0b1533;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <strong style="font-size:16px">Gestion des Stagiaires</strong><br>
        <span style="color:#a5b0cc;font-size:13px">Mairie</span>
      </div>
      <div style="border:1px solid #e6e9f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        <p>Bonjour {tuteur.prenom or ''},</p>
        <p>Un stagiaire vient de vous être affecté : vous en êtes désormais l'<strong>encadrant</strong>.</p>
        <table style="width:100%;background:#f4f6fb;border-radius:8px;padding:12px;font-size:14px">
          <tr><td style="color:#64748b;padding:4px 8px">Stagiaire</td><td style="padding:4px 8px"><strong>{st.prenom} {st.nom}</strong> ({st.niveau_etudes})</td></tr>
          <tr><td style="color:#64748b;padding:4px 8px">Stage</td><td style="padding:4px 8px">{stage.intitule}</td></tr>
          <tr><td style="color:#64748b;padding:4px 8px">Service</td><td style="padding:4px 8px">{stage.service.nom}</td></tr>
          <tr><td style="color:#64748b;padding:4px 8px">Période</td><td style="padding:4px 8px">du {stage.date_debut.strftime(FORMAT_DATE)} au {stage.date_fin.strftime(FORMAT_DATE)}</td></tr>
          <tr><td style="color:#64748b;padding:4px 8px">Contact</td><td style="padding:4px 8px">{st.email}{' · ' + st.telephone if st.telephone else ''}</td></tr>
        </table>
        <p style="margin:24px 0">
          <a href="{url}/stagiaires" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Voir mes stagiaires</a>
        </p>
        <p style="font-size:13px;color:#64748b">Retrouvez-le dans l'onglet <strong>Mes Stagiaires</strong>. Affectation effectuée par {_nom(auteur)}.</p>
      </div>
    </div>
    """
    try:
        send_mail(sujet, corps, None, [tuteur.email], html_message=html, fail_silently=False)
    except Exception:  # SMTP indisponible, adresse invalide…
        logger.exception("Échec de l'e-mail d'affectation à %s", tuteur.email)


def notifier_affectation(stage, auteur):
    """Prévient l'encadrant du stage qu'un stagiaire lui est affecté. Ne lève jamais d'erreur :
    un échec de notification ne doit pas empêcher l'enregistrement du stage."""
    tuteur = stage.tuteur
    if tuteur is None or tuteur.pk == auteur.pk or not tuteur.is_active:
        return
    texte = _texte_affectation(stage)
    try:
        _message_interne(stage, auteur, texte)
    except Exception:
        logger.exception("Échec du message d'affectation pour le stage %s", stage.pk)
    if tuteur.email:
        # E-mail envoyé seulement une fois le stage réellement enregistré en base
        transaction.on_commit(
            lambda: threading.Thread(target=_email, args=(stage, auteur, texte), daemon=True).start()
        )

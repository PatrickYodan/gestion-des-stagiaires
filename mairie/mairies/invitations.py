"""Création de comptes avec mot de passe provisoire et envoi des identifiants par e-mail."""

import logging
import re
import secrets
import string

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

# Caractères sans ambiguïté de lecture (pas de 0/O, 1/l/I)
_ALPHABET = ''.join(c for c in string.ascii_letters + string.digits if c not in '0O1lI')


def generer_mot_de_passe_provisoire(longueur=10):
    """Mot de passe aléatoire contenant au moins une majuscule, une minuscule et un chiffre."""
    while True:
        mdp = ''.join(secrets.choice(_ALPHABET) for _ in range(longueur))
        if any(c.isupper() for c in mdp) and any(c.islower() for c in mdp) and any(c.isdigit() for c in mdp):
            return mdp


def generer_username(email):
    """Nom d'utilisateur interne unique dérivé de l'e-mail (la connexion se fait par e-mail)."""
    from .models import Utilisateur

    base = re.sub(r'[^a-zA-Z0-9._-]', '', email.split('@')[0])[:120] or 'utilisateur'
    username, n = base, 1
    while Utilisateur.objects.filter(username__iexact=username).exists():
        n += 1
        username = f'{base}{n}'
    return username


# Type de compte annoncé dans l'e-mail d'invitation, selon le rôle
TYPES_COMPTE = {
    'TUTEUR': 'encadrant',
    'RH': 'agent des ressources humaines',
    'ADMIN': 'administrateur',
}


def envoyer_identifiants(user, mot_de_passe):
    """Envoie l'e-mail d'invitation. Retourne True si l'envoi a réussi."""
    url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    type_compte = TYPES_COMPTE.get(user.role, 'utilisateur')
    sujet = 'Vos identifiants — Gestion des Stagiaires (Mairie)'
    texte = (
        'Bonjour,\n\n'
        f'Un compte {type_compte} a été créé pour vous sur la plateforme de gestion des stagiaires de la Mairie.\n\n'
        'Vos identifiants de connexion :\n'
        f'  • Adresse e-mail : {user.email}\n'
        f'  • Mot de passe provisoire : {mot_de_passe}\n\n'
        f'Connectez-vous ici : {url}\n\n'
        'Lors de votre première connexion, il vous sera demandé de renseigner votre nom et votre prénom, '
        'puis de choisir votre propre mot de passe.\n\n'
        "Si vous n'êtes pas concerné par ce message, vous pouvez l'ignorer.\n\n"
        'Le service des ressources humaines'
    )
    html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f172a">
      <div style="background:#0b1533;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <strong style="font-size:16px">Gestion des Stagiaires</strong><br>
        <span style="color:#a5b0cc;font-size:13px">Mairie</span>
      </div>
      <div style="border:1px solid #e6e9f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        <p>Bonjour,</p>
        <p>Un compte <strong>{type_compte}</strong> a été créé pour vous sur la plateforme de gestion des stagiaires.</p>
        <table style="width:100%;background:#f4f6fb;border-radius:8px;padding:12px;font-size:14px">
          <tr><td style="color:#64748b;padding:4px 8px">Adresse e-mail</td><td style="padding:4px 8px"><strong>{user.email}</strong></td></tr>
          <tr><td style="color:#64748b;padding:4px 8px">Mot de passe provisoire</td>
              <td style="padding:4px 8px"><code style="font-size:15px;background:#fff;padding:2px 6px;border-radius:4px">{mot_de_passe}</code></td></tr>
        </table>
        <p style="margin:24px 0">
          <a href="{url}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Se connecter</a>
        </p>
        <p style="font-size:13px;color:#64748b">À votre première connexion, vous renseignerez votre nom et votre prénom,
        puis vous choisirez votre propre mot de passe.</p>
      </div>
    </div>
    """
    try:
        send_mail(sujet, texte, None, [user.email], html_message=html, fail_silently=False)
        return True
    except Exception:  # SMTP indisponible, identifiants invalides…
        logger.exception("Échec de l'envoi des identifiants à %s", user.email)
        return False


def inviter(user):
    """Attribue un nouveau mot de passe provisoire, marque le compte « première connexion » et envoie l'e-mail.
    Retourne (email_envoye, mot_de_passe)."""
    mot_de_passe = generer_mot_de_passe_provisoire()
    user.set_password(mot_de_passe)
    user.doit_changer_mdp = True
    user.save(update_fields=['password', 'doit_changer_mdp'])
    return envoyer_identifiants(user, mot_de_passe), mot_de_passe


def email_en_mode_console():
    return settings.EMAIL_BACKEND == 'django.core.mail.backends.console.EmailBackend'


def envoyer_lien_reinitialisation(user, lien):
    """E-mail « mot de passe oublié » contenant un lien de réinitialisation à usage unique."""
    minutes = getattr(settings, 'PASSWORD_RESET_TIMEOUT', 3600) // 60
    sujet = 'Réinitialisation de votre mot de passe — Gestion des Stagiaires'
    texte = (
        'Bonjour,\n\n'
        'Une demande de réinitialisation du mot de passe a été faite pour votre compte '
        f'({user.email}) sur la plateforme de gestion des stagiaires de la Mairie.\n\n'
        f'Pour choisir un nouveau mot de passe, ouvrez ce lien (valable {minutes} minutes, une seule fois) :\n'
        f'{lien}\n\n'
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : "
        'votre mot de passe actuel reste inchangé.\n\n'
        'Le service des ressources humaines'
    )
    html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f172a">
      <div style="background:#0b1533;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <strong style="font-size:16px">Gestion des Stagiaires</strong><br>
        <span style="color:#a5b0cc;font-size:13px">Mairie</span>
      </div>
      <div style="border:1px solid #e6e9f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        <p>Bonjour,</p>
        <p>Une demande de réinitialisation du mot de passe a été faite pour le compte <strong>{user.email}</strong>.</p>
        <p style="margin:24px 0">
          <a href="{lien}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Choisir un nouveau mot de passe</a>
        </p>
        <p style="font-size:13px;color:#64748b">Ce lien est valable {minutes} minutes et ne peut être utilisé qu'une seule fois.</p>
        <p style="font-size:13px;color:#64748b">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste inchangé.</p>
      </div>
    </div>
    """
    try:
        send_mail(sujet, texte, None, [user.email], html_message=html, fail_silently=False)
        return True
    except Exception:
        logger.exception("Échec de l'envoi du lien de réinitialisation à %s", user.email)
        return False

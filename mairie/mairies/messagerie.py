"""Messagerie interne : conversations privées entre deux utilisateurs de la plateforme.

Routes (toutes réservées aux utilisateurs connectés ayant finalisé leur première connexion) :
  GET    /api/messagerie/contacts/                       personnes à qui écrire
  GET    /api/messagerie/conversations/?dossier=…        mes conversations : boite (défaut), brouillons ou archives
  POST   /api/messagerie/conversations/                  ouvrir (ou retrouver) une conversation {destinataire}
  PATCH  /api/messagerie/conversations/<id>/             {brouillon} et/ou {archivee}
  DELETE /api/messagerie/conversations/<id>/             supprimer la conversation de MA messagerie
  GET    /api/messagerie/conversations/<id>/messages/    messages (?apres=<id> pour les nouveaux uniquement)
  POST   /api/messagerie/conversations/<id>/messages/    envoyer un message {contenu}
  GET    /api/messagerie/non-lus/                        nombre total de messages non lus

Seuls les participants d'une conversation peuvent la lire ou y écrire (l'administrateur compris).
Brouillon, archivage et suppression sont propres à chaque participant (EtatConversation) :
supprimer une conversation l'efface de sa propre messagerie seulement ; l'autre personne la conserve.
"""

from django.db.models import Exists, OuterRef
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .acces import Connecte
from .models import Conversation, EtatConversation, Message, Utilisateur

LONGUEUR_MAX = 2000
DOSSIERS = ('boite', 'brouillons', 'archives')


def _photo(user, request):
    if not user.photo:
        return None
    return request.build_absolute_uri(user.photo.url) if request else user.photo.url


def personne(user, request):
    """Informations publiques d'un utilisateur pour la messagerie."""
    nom_affiche = f'{user.prenom or ""} {user.nom or ""}'.strip() or user.email or user.username
    return {
        'id': user.id,
        'nom_affiche': nom_affiche,
        'prenom': user.prenom,
        'nom': user.nom,
        'email': user.email,
        'role': user.role,
        'service': user.service.nom if user.service_id else None,
        'photo': _photo(user, request),
    }


def message_json(message):
    return {
        'id': message.id,
        'auteur': message.auteur_id,
        'contenu': message.contenu,
        'envoye_le': message.envoye_le.isoformat(),
        'lu_le': message.lu_le.isoformat() if message.lu_le else None,
    }


def etat_de(conversation, user):
    """État personnel (brouillon, archivage, suppression) d'un participant ; créé au besoin."""
    etat, _ = EtatConversation.objects.get_or_create(conversation=conversation, utilisateur=user)
    return etat


def messages_visibles(conversation, etat):
    """Messages que le participant voit encore (ceux d'avant sa suppression sont masqués)."""
    messages = conversation.messages.all()
    if etat.supprimee_le:
        messages = messages.filter(envoye_le__gt=etat.supprimee_le)
    return messages


def _conversation_de(user, pk):
    """Conversation dont l'utilisateur est participant (sinon 404 : on ne révèle pas son existence)."""
    return get_object_or_404(Conversation.objects.filter(participants=user), pk=pk)


def conversation_json(conversation, user, request, etat=None):
    etat = etat or etat_de(conversation, user)
    autre = next((p for p in conversation.participants.all() if p.id != user.id), None)
    visibles = messages_visibles(conversation, etat)
    dernier = visibles.order_by('-envoye_le', '-id').first()
    return {
        'id': conversation.id,
        'interlocuteur': personne(autre, request) if autre else None,
        'dernier_message': message_json(dernier) if dernier else None,
        'non_lus': visibles.filter(lu_le__isnull=True).exclude(auteur=user).count(),
        'brouillon': etat.brouillon,
        'archivee': etat.archivee,
        'mis_a_jour_le': (dernier.envoye_le if dernier else etat.modifie_le).isoformat(),
    }


class ContactsView(APIView):
    """Utilisateurs actifs à qui l'on peut écrire."""
    permission_classes = [Connecte]

    def get(self, request):
        users = (
            Utilisateur.objects.filter(is_active=True, statut_compte='ACTIF')
            .exclude(pk=request.user.pk)
            .select_related('service')
            .order_by('prenom', 'nom', 'email')
        )
        return Response([personne(u, request) for u in users])


class ConversationsView(APIView):
    permission_classes = [Connecte]

    def get(self, request):
        """Conversations du dossier demandé + compteurs des trois dossiers."""
        dossier = request.query_params.get('dossier', 'boite')
        if dossier not in DOSSIERS:
            dossier = 'boite'

        conversations = Conversation.objects.filter(participants=request.user).prefetch_related(
            'participants__service'
        )
        lignes = []
        for conversation in conversations:
            ligne = conversation_json(conversation, request.user, request)
            # Une conversation sans message visible ni brouillon n'apparaît nulle part
            if ligne['dernier_message'] or ligne['brouillon']:
                lignes.append(ligne)

        dans = {
            'boite': lambda c: not c['archivee'] and c['dernier_message'] is not None,
            'brouillons': lambda c: bool(c['brouillon']),
            'archives': lambda c: c['archivee'],
        }
        compteurs = {nom: sum(1 for c in lignes if test(c)) for nom, test in dans.items()}
        # Boîte de réception : on y signale aussi les conversations avec des messages non lus
        compteurs['boite_non_lus'] = sum(1 for c in lignes if dans['boite'](c) and c['non_lus'])

        choisies = sorted((c for c in lignes if dans[dossier](c)), key=lambda c: c['mis_a_jour_le'], reverse=True)
        return Response({'dossier': dossier, 'conversations': choisies, 'compteurs': compteurs})

    def post(self, request):
        """Ouvre la conversation avec un destinataire (la réutilise si elle existe déjà)."""
        try:
            destinataire = Utilisateur.objects.get(
                pk=int(request.data.get('destinataire')), is_active=True, statut_compte='ACTIF'
            )
        except (TypeError, ValueError, Utilisateur.DoesNotExist):
            return Response({'detail': 'Destinataire introuvable.'}, status=status.HTTP_400_BAD_REQUEST)
        if destinataire.pk == request.user.pk:
            return Response({'detail': 'Vous ne pouvez pas vous écrire à vous-même.'}, status=status.HTTP_400_BAD_REQUEST)

        # Conversation existante entre ces deux personnes (et elles seules)
        communes = Conversation.objects.filter(participants=request.user).filter(participants=destinataire).distinct()
        conversation = next((c for c in communes if c.participants.count() == 2), None)
        if conversation is None:
            conversation = Conversation.objects.create()
            conversation.participants.add(request.user, destinataire)
        return Response(conversation_json(conversation, request.user, request), status=status.HTTP_200_OK)


class ConversationDetailView(APIView):
    """Brouillon, archivage et suppression d'une conversation, pour l'utilisateur connecté uniquement."""
    permission_classes = [Connecte]

    def patch(self, request, pk):
        conversation = _conversation_de(request.user, pk)
        etat = etat_de(conversation, request.user)
        champs = []
        if 'brouillon' in request.data:
            brouillon = str(request.data.get('brouillon') or '')
            if len(brouillon) > LONGUEUR_MAX:
                return Response(
                    {'brouillon': [f'Le brouillon ne doit pas dépasser {LONGUEUR_MAX} caractères.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            etat.brouillon = brouillon if brouillon.strip() else ''
            champs.append('brouillon')
        if 'archivee' in request.data:
            etat.archivee = bool(request.data.get('archivee'))
            champs.append('archivee')
        if champs:
            etat.save(update_fields=[*champs, 'modifie_le'])
        return Response(conversation_json(conversation, request.user, request, etat))

    def delete(self, request, pk):
        conversation = _conversation_de(request.user, pk)
        maintenant = timezone.now()
        # Les messages reçus sont considérés comme lus (pas de pastille pour un historique effacé)
        conversation.messages.filter(lu_le__isnull=True).exclude(auteur=request.user).update(lu_le=maintenant)
        etat = etat_de(conversation, request.user)
        etat.supprimee_le = maintenant
        etat.archivee = False
        etat.brouillon = ''
        etat.save(update_fields=['supprimee_le', 'archivee', 'brouillon', 'modifie_le'])

        # Si tous les participants l'ont supprimée après le dernier message, elle est effacée du serveur
        dernier = conversation.messages.order_by('-envoye_le').first()
        etats = {e.utilisateur_id: e for e in conversation.etats.all()}
        if all(
            (e := etats.get(p.id)) and e.supprimee_le and (dernier is None or e.supprimee_le >= dernier.envoye_le)
            for p in conversation.participants.all()
        ):
            conversation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessagesView(APIView):
    permission_classes = [Connecte]

    def get(self, request, pk):
        conversation = _conversation_de(request.user, pk)
        etat = etat_de(conversation, request.user)
        visibles = messages_visibles(conversation, etat)
        apres = request.query_params.get('apres')
        if apres and apres.isdigit():
            messages = visibles.filter(id__gt=int(apres))
        else:
            # Ouverture de la conversation : les 200 derniers messages
            derniers = list(visibles.order_by('-envoye_le', '-id')[:200].values_list('id', flat=True))
            messages = visibles.filter(id__in=derniers)

        # Les messages reçus sont marqués comme lus à leur lecture
        conversation.messages.filter(lu_le__isnull=True).exclude(auteur=request.user).update(lu_le=timezone.now())

        autre = conversation.participants.exclude(pk=request.user.pk).first()
        # Dernier de mes messages lu par l'interlocuteur (pour l'indication « Lu »)
        mes_lus = conversation.messages.filter(auteur=request.user, lu_le__isnull=False).order_by('-id').first()
        return Response({
            'conversation': conversation.id,
            'interlocuteur': personne(autre, request) if autre else None,
            'messages': [message_json(m) for m in messages.order_by('envoye_le', 'id')],
            'dernier_lu': mes_lus.id if mes_lus else None,
            'brouillon': etat.brouillon,
            'archivee': etat.archivee,
        })

    def post(self, request, pk):
        conversation = _conversation_de(request.user, pk)
        contenu = str(request.data.get('contenu', '')).strip()
        if not contenu:
            return Response({'contenu': ['Le message est vide.']}, status=status.HTTP_400_BAD_REQUEST)
        if len(contenu) > LONGUEUR_MAX:
            return Response(
                {'contenu': [f'Le message ne doit pas dépasser {LONGUEUR_MAX} caractères.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        message = Message.objects.create(conversation=conversation, auteur=request.user, contenu=contenu)
        conversation.mis_a_jour_le = message.envoye_le
        conversation.save(update_fields=['mis_a_jour_le'])

        # Le brouillon de l'expéditeur est vidé ; chez les autres participants, la conversation
        # revient dans la boîte de réception si elle était archivée (pour ne pas manquer le message)
        etat = etat_de(conversation, request.user)
        if etat.brouillon:
            etat.brouillon = ''
            etat.save(update_fields=['brouillon', 'modifie_le'])
        for participant in conversation.participants.exclude(pk=request.user.pk):
            EtatConversation.objects.update_or_create(
                conversation=conversation, utilisateur=participant, defaults={'archivee': False}
            )
        return Response(message_json(message), status=status.HTTP_201_CREATED)


class NonLusView(APIView):
    """Nombre total de messages reçus non lus (pastille du menu), hors historique supprimé."""
    permission_classes = [Connecte]

    def get(self, request):
        supprime_apres = EtatConversation.objects.filter(
            conversation=OuterRef('conversation'),
            utilisateur=request.user,
            supprimee_le__gte=OuterRef('envoye_le'),
        )
        total = (
            Message.objects.filter(conversation__participants=request.user, lu_le__isnull=True)
            .exclude(auteur=request.user)
            .exclude(Exists(supprime_apres))
            .count()
        )
        return Response({'non_lus': total})

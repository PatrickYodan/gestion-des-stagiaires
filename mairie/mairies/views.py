from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models.functions import ExtractMonth
from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from urllib.parse import urlencode
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from . import acces
from rest_framework.exceptions import PermissionDenied
from .acces import Connecte, EstAdmin, GestionUtilisateursPermission, ModulePermission, est_admin, est_tuteur
from .invitations import email_en_mode_console, envoyer_lien_reinitialisation, inviter
from .models import AccesRole, Document, Etablissement, Service, Stage, Stagiaire, Utilisateur
from .serializers import (
    ChangerMotDePasseSerializer,
    DocumentSerializer,
    MonCompteSerializer,
    PremiereConnexionSerializer,
    EtablissementSerializer,
    ServiceSerializer,
    StageSerializer,
    StagiaireSerializer,
    UtilisateurSerializer,
)


class ServiceViewSet(viewsets.ModelViewSet):
  permission_classes = [ModulePermission]
  module = 'services'  # écriture : accès complet requis sur ce module
  queryset = Service.objects.all()
  serializer_class = ServiceSerializer


class EtablissementViewSet(viewsets.ModelViewSet):
  permission_classes = [ModulePermission]
  module = 'services'  # écriture : accès complet requis sur ce module
  queryset = Etablissement.objects.all()
  serializer_class = EtablissementSerializer


class UtilisateurViewSet(viewsets.ModelViewSet):
  # Admin : tous les comptes. Accès complet au module « tuteurs » : comptes TUTEUR uniquement.
  permission_classes = [GestionUtilisateursPermission]
  queryset = Utilisateur.objects.all()
  serializer_class = UtilisateurSerializer

  def perform_create(self, serializer):
    if est_admin(self.request.user):
      user = serializer.save()
    else:
      user = serializer.save(role='TUTEUR')  # un non-admin ne peut créer que des tuteurs

    # Sans mot de passe fourni : mot de passe provisoire envoyé par e-mail (invitation)
    self._invitation = None
    if not self.request.data.get('password'):
      self._invitation = inviter(user)

  def _infos_invitation(self, user, email_envoye, mot_de_passe):
    infos = {'email': user.email, 'email_envoye': email_envoye, 'mode_console': email_en_mode_console()}
    if not email_envoye:
      # L'e-mail n'est pas parti : le mot de passe provisoire est communiqué à la personne qui crée le compte
      infos['mot_de_passe_provisoire'] = mot_de_passe
    return infos

  def create(self, request, *args, **kwargs):
    response = super().create(request, *args, **kwargs)
    if getattr(self, '_invitation', None):
      user = Utilisateur.objects.get(pk=response.data['id'])
      response.data['invitation'] = self._infos_invitation(user, *self._invitation)
      response.data['doit_changer_mdp'] = True
    return response

  @action(detail=True, methods=['post'], url_path='renvoyer-identifiants')
  def renvoyer_identifiants(self, request, pk=None):
    """Génère un nouveau mot de passe provisoire et renvoie l'e-mail d'invitation."""
    user = self.get_object()  # contrôle des droits (un RH ne peut agir que sur un tuteur)
    if not user.email:
      return Response({'detail': "Ce compte n'a pas d'adresse e-mail."}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'invitation': self._infos_invitation(user, *inviter(user))})

  def perform_update(self, serializer):
    if est_admin(self.request.user):
      serializer.save()
    else:
      serializer.save(role='TUTEUR')  # empêche de promouvoir un tuteur en RH / ADMIN


class StagiaireViewSet(viewsets.ModelViewSet):
  permission_classes = [ModulePermission]
  module = 'stagiaires'  # écriture : accès complet requis sur ce module
  # 1. Filtre pour n'afficher que les stagiaires non "supprimés"
  #    Un encadrant ne voit que les stagiaires dont il est le tuteur sur au moins un stage
  def get_queryset(self):
      queryset = Stagiaire.objects.filter(is_deleted=False)
      if est_tuteur(self.request.user):
          queryset = queryset.filter(stages__tuteur=self.request.user).distinct()
      return queryset

  # 2. Surcharge de la suppression physique par une suppression douce
  def destroy(self, request, *args, **kwargs):
    instance = self.get_object()
    instance.is_deleted = True
    instance.save()
    return Response(
      {"message": "Stagiaire masqué avec succès."}, 
      status=status.HTTP_200_OK # ou status.HTTP_204_NO_CONTENT
    )
  queryset = Stagiaire.objects.all()
  serializer_class = StagiaireSerializer


class StageViewSet(viewsets.ModelViewSet):
  permission_classes = [ModulePermission]
  module = 'stages'  # écriture : accès complet requis sur ce module
  queryset = Stage.objects.all()
  serializer_class = StageSerializer

  # Un encadrant ne voit que les stages qu'il encadre
  def get_queryset(self):
    queryset = Stage.objects.all()
    if est_tuteur(self.request.user):
      queryset = queryset.filter(tuteur=self.request.user)
    return queryset


class DocumentViewSet(viewsets.ModelViewSet):
  permission_classes = [ModulePermission]
  module = 'documents'  # écriture : accès complet requis sur ce module
  queryset = Document.objects.all()
  serializer_class = DocumentSerializer

  # Un encadrant ne voit que les documents des stages qu'il encadre
  def get_queryset(self):
    queryset = Document.objects.all()
    if est_tuteur(self.request.user):
      queryset = queryset.filter(stage__tuteur=self.request.user)
    return queryset

  def _verifier_stage(self, serializer):
    stage = serializer.validated_data.get('stage')
    if stage is not None and est_tuteur(self.request.user) and stage.tuteur_id != self.request.user.id:
      raise PermissionDenied("Vous ne pouvez ajouter des documents qu'aux stages que vous encadrez.")

  def perform_create(self, serializer):
    self._verifier_stage(serializer)
    serializer.save()

  def perform_update(self, serializer):
    self._verifier_stage(serializer)
    serializer.save()

class DashboardStatsView(APIView):
    permission_classes = [Connecte]

    def get(self, request):
        # 1. Nombre total de stagiaires et d'encadrants
        total_stagiaires = Stagiaire.objects.count()
        total_encadrants = Utilisateur.objects.filter(role='TUTEUR').count()

        # 2. Évolution du nombre de stagiaires groupés par mois (via la date_debut des stages)
        stages_par_mois = (
            Stage.objects
            .annotate(month=ExtractMonth('date_debut'))
            .values('month')
            .annotate(count=Count('stagiaire', distinct=True))
            .order_by('month')
        )

        months_names = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]
        
        formatted_chart_data = [
            {
                "month": months_names[item['month'] - 1],
                "stagiaires": item['count']
            }
            for item in stages_par_mois if item['month'] is not None
        ]

        return Response({
            "total_stagiaires": total_stagiaires,
            "total_encadrants": total_encadrants,
            "chart_data": formatted_chart_data
        })

class MonCompteView(APIView):
    """Profil de l'utilisateur connecté : lecture et modification de ses informations personnelles."""
    permission_classes = [Connecte]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        return Response(UtilisateurSerializer(request.user, context={'request': request}).data)

    def patch(self, request):
        user = request.user
        serializer = MonCompteSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Suppression de la photo de profil sur demande
        if str(request.data.get('supprimer_photo', '')).lower() in ('1', 'true') and user.photo:
            user.photo.delete(save=False)
            user.photo = None
            user.save(update_fields=['photo'])

        return Response(UtilisateurSerializer(user, context={'request': request}).data)


class ChangerMotDePasseView(APIView):
    """Changement du mot de passe de l'utilisateur connecté (l'ancien mot de passe est exigé)."""
    permission_classes = [Connecte]

    def post(self, request):
        serializer = ChangerMotDePasseSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['nouveau_mot_de_passe'])
        request.user.save(update_fields=['password'])
        return Response({'detail': 'Mot de passe modifié avec succès.'})


class AccesView(APIView):
    """Matrice des droits d'accès : lecture pour tout utilisateur connecté, modification par l'administrateur."""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [Connecte()]
        return [EstAdmin()]

    def _reponse(self):
        return Response({
            'modules': acces.MODULES,
            'roles': ['ADMIN', *acces.ROLES_CONFIGURABLES],
            'matrice': acces.matrice(),
            'defauts': acces.DEFAUTS,
        })

    def get(self, request):
        return self._reponse()

    def put(self, request):
        nouvelle = request.data.get('matrice')
        if not isinstance(nouvelle, dict):
            return Response({'detail': 'Format de matrice invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        for role in acces.ROLES_CONFIGURABLES:  # le rôle ADMIN n'est jamais modifiable
            for module, niveau in (nouvelle.get(role) or {}).items():
                if module not in acces.MODULE_IDS:
                    continue
                try:
                    niveau = int(niveau)
                except (TypeError, ValueError):
                    continue
                maxi = acces.LECTURE if module in acces.MODULES_LECTURE_SEULE else acces.COMPLET
                niveau = max(acces.AUCUN, min(niveau, maxi))
                AccesRole.objects.update_or_create(role=role, module=module, defaults={'niveau': niveau})

        return self._reponse()


class PremiereConnexionView(APIView):
    """Première connexion : nom, prénom et nouveau mot de passe, puis accès normal à l'application."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if not user.doit_changer_mdp:
            return Response({'detail': 'Votre compte est déjà configuré.'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = PremiereConnexionSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user.prenom = serializer.validated_data['prenom'].strip()
        user.nom = serializer.validated_data['nom'].strip()
        user.set_password(serializer.validated_data['nouveau_mot_de_passe'])
        user.doit_changer_mdp = False
        user.save(update_fields=['prenom', 'nom', 'password', 'doit_changer_mdp'])
        return Response(UtilisateurSerializer(user, context={'request': request}).data)


# ==========================================
# MOT DE PASSE OUBLIÉ
# ==========================================

class MotDePasseOublieView(APIView):
    """Envoie un lien de réinitialisation à l'adresse indiquée.
    La réponse est toujours la même, que le compte existe ou non, pour ne pas révéler les adresses inscrites."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'mot_de_passe_oublie'

    def post(self, request):
        email = str(request.data.get('email', '')).strip()
        if not email:
            return Response({'email': ["L'adresse e-mail est obligatoire."]}, status=status.HTTP_400_BAD_REQUEST)

        user = Utilisateur.objects.filter(email__iexact=email, is_active=True, statut_compte='ACTIF').first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            lien = f"{settings.FRONTEND_URL}/reinitialiser-mot-de-passe?{urlencode({'uid': uid, 'token': token})}"
            envoyer_lien_reinitialisation(user, lien)

        return Response({
            'detail': "Si un compte actif correspond à cette adresse, un e-mail contenant un lien de réinitialisation vient d'être envoyé.",
            'mode_console': email_en_mode_console(),
        })


class ReinitialiserMotDePasseView(APIView):
    """Définit un nouveau mot de passe à partir du lien reçu par e-mail (uid + jeton à usage unique)."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'reinitialisation_mot_de_passe'

    def post(self, request):
        lien_invalide = Response(
            {'detail': 'Ce lien de réinitialisation est invalide ou a expiré. Faites une nouvelle demande.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
        try:
            pk = force_str(urlsafe_base64_decode(str(request.data.get('uid', ''))))
            user = Utilisateur.objects.get(pk=pk)
        except (TypeError, ValueError, OverflowError, Utilisateur.DoesNotExist):
            return lien_invalide
        if not default_token_generator.check_token(user, str(request.data.get('token', ''))):
            return lien_invalide

        nouveau = str(request.data.get('nouveau_mot_de_passe', ''))
        try:
            validate_password(nouveau, user=user)
        except DjangoValidationError as exc:
            return Response({'nouveau_mot_de_passe': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(nouveau)  # change le hachage : le lien devient inutilisable
        # Compte invité ayant déjà renseigné son identité : plus besoin de l'écran de première connexion
        if user.doit_changer_mdp and user.prenom and user.nom:
            user.doit_changer_mdp = False
        user.save()
        return Response({'detail': 'Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.'})

import json
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models.functions import ExtractMonth
from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from urllib.parse import urlencode
from django.conf import settings
from django.utils import timezone
from django.db import transaction
from django.core.files.base import ContentFile
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from . import acces
from rest_framework.exceptions import PermissionDenied
from .acces import Connecte, EstAdmin, GestionUtilisateursPermission, ModulePermission, est_admin, est_tuteur
from .invitations import email_en_mode_console, envoyer_lien_reinitialisation, inviter
from .models import AccesRole, Document, Etablissement, JournalAudit, Service, Stage, Stagiaire, Utilisateur
from .audit import AuditMixin, differences, journaliser
from .notifications import (
  notifier_affectation, notifier_cloture, notifier_evaluation, notifier_reouverture, notifier_retour,
)
from .fiches import generer_fiche_notes
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


class ServiceViewSet(AuditMixin, viewsets.ModelViewSet):
  audit_categorie = 'service'
  audit_nom = "le service"
  permission_classes = [ModulePermission]
  module = 'services'  # écriture : accès complet requis sur ce module
  queryset = Service.objects.all()
  serializer_class = ServiceSerializer


class EtablissementViewSet(AuditMixin, viewsets.ModelViewSet):
  audit_categorie = 'etablissement'
  audit_nom = "l'établissement"
  permission_classes = [ModulePermission]
  module = 'services'  # écriture : accès complet requis sur ce module
  queryset = Etablissement.objects.all()
  serializer_class = EtablissementSerializer


def _nom_court(user):
  return (f'{user.prenom} {user.nom}'.strip() or user.email or user.username) if user else None


class UtilisateurViewSet(AuditMixin, viewsets.ModelViewSet):
  audit_categorie = 'compte'
  audit_nom = "le compte"
  # Admin : tous les comptes. Accès complet au module « tuteurs » : comptes TUTEUR uniquement.
  permission_classes = [GestionUtilisateursPermission]
  queryset = Utilisateur.objects.all()
  serializer_class = UtilisateurSerializer

  # Les comptes supprimés n'apparaissent plus nulle part (ils restent en base, marqués supprimés)
  def get_queryset(self):
    return Utilisateur.objects.filter(est_supprime=False)

  def get_permissions(self):
    # Corbeille : droits vérifiés dans les actions (lecture d'une liste réservée aux gestionnaires)
    if self.action in ('supprimes', 'restaurer'):
      return [Connecte()]
    return super().get_permissions()

  def destroy(self, request, *args, **kwargs):
    """Suppression douce : compte désactivé et masqué, données conservées en base."""
    user = self.get_object()  # contrôle des droits (un RH ne peut agir que sur un tuteur)
    if user.pk == request.user.pk:
      return Response({'detail': 'Vous ne pouvez pas supprimer votre propre compte.'}, status=status.HTTP_400_BAD_REQUEST)
    user.est_supprime = True
    user.supprime_le = timezone.now()
    user.supprime_par = request.user
    user.is_active = False  # plus de connexion possible, sessions en cours refusées
    user.statut_compte = 'INACTIF'
    if user.email:
      user.email_supprime = user.email
      user.email = None  # libère l'adresse pour un éventuel nouveau compte
    user.save()
    return Response(status=status.HTTP_204_NO_CONTENT)

  def _supprimes_visibles(self, request):
    """Comptes supprimés que l'utilisateur a le droit de restaurer (un non-admin : tuteurs seulement)."""
    qs = Utilisateur.objects.filter(est_supprime=True)
    if not est_admin(request.user):
      qs = qs.filter(role='TUTEUR', is_superuser=False)
    return qs

  @action(detail=False, methods=['get'])
  def supprimes(self, request):
    """Corbeille : comptes supprimés (filtrable par rôle : ?role=TUTEUR)."""
    if not (est_admin(request.user) or acces.niveau_pour(request.user, 'tuteurs') >= acces.COMPLET):
      raise PermissionDenied("Vous n'avez pas accès aux comptes supprimés.")
    qs = self._supprimes_visibles(request).select_related('supprime_par', 'service').order_by('-supprime_le')
    role = request.query_params.get('role')
    if role:
      qs = qs.filter(role=role)
    return Response([
      {
        'id': u.id,
        'nom': _nom_court(u) if (u.prenom or u.nom) else u.email_supprime or u.username,
        'email': u.email_supprime,
        'role': u.role,
        'service': u.service.nom if u.service else None,
        'supprime_le': u.supprime_le,
        'supprime_par': _nom_court(u.supprime_par),
      }
      for u in qs
    ])

  @action(detail=True, methods=['post'])
  def restaurer(self, request, pk=None):
    """Restaure un compte supprimé : il réapparaît et peut de nouveau se connecter."""
    if not (est_admin(request.user) or acces.niveau_pour(request.user, 'tuteurs') >= acces.COMPLET):
      raise PermissionDenied("Vous n'avez pas le droit de restaurer ce compte.")
    user = self._supprimes_visibles(request).filter(pk=pk).first()
    if user is None:
      return Response({'detail': 'Compte supprimé introuvable.'}, status=status.HTTP_404_NOT_FOUND)
    email = user.email_supprime
    if email and Utilisateur.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
      return Response(
        {'detail': f"L'adresse {email} est déjà utilisée par un autre compte : impossible de restaurer celui-ci."},
        status=status.HTTP_400_BAD_REQUEST,
      )
    user.email = email or None
    user.email_supprime = ''
    user.est_supprime = False
    user.supprime_le = None
    user.supprime_par = None
    user.is_active = True
    user.statut_compte = 'ACTIF'
    user.save()
    return Response(UtilisateurSerializer(user, context={'request': request}).data)

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


class StagiaireViewSet(AuditMixin, viewsets.ModelViewSet):
  audit_categorie = 'stagiaire'
  audit_nom = "le stagiaire"
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
    instance.supprime_le = timezone.now()
    instance.supprime_par = request.user
    # L'e-mail d'origine est conservé ; le champ unique est libéré pour un éventuel nouveau dossier
    if not instance.email_supprime:
      instance.email_supprime = instance.email
    instance.email = f'supprime-{instance.pk}@stagiaire.supprime'
    instance.save()
    return Response(
      {"message": "Stagiaire masqué avec succès."},
      status=status.HTTP_200_OK
    )

  def _peut_gerer(self, request):
    return acces.niveau_pour(request.user, 'stagiaires') >= acces.COMPLET

  @action(detail=False, methods=['get'])
  def supprimes(self, request):
    """Corbeille : stagiaires supprimés."""
    if not self._peut_gerer(request):
      raise PermissionDenied("Vous n'avez pas accès aux stagiaires supprimés.")
    qs = Stagiaire.objects.filter(is_deleted=True).select_related('supprime_par', 'etablissement').order_by('-supprime_le')
    return Response([
      {
        'id': st.id,
        'nom': f'{st.prenom} {st.nom}'.strip(),
        'email': st.email_supprime or st.email,
        'etablissement': st.etablissement.nom if st.etablissement else None,
        'supprime_le': st.supprime_le,
        'supprime_par': _nom_court(st.supprime_par),
      }
      for st in qs
    ])

  @action(detail=True, methods=['post'])
  def restaurer(self, request, pk=None):
    """Restaure un stagiaire supprimé (il réapparaît avec ses stages et ses documents)."""
    if not self._peut_gerer(request):
      raise PermissionDenied("Vous n'avez pas le droit de restaurer ce stagiaire.")
    st = Stagiaire.objects.filter(is_deleted=True, pk=pk).first()
    if st is None:
      return Response({'detail': 'Stagiaire supprimé introuvable.'}, status=status.HTTP_404_NOT_FOUND)
    email = st.email_supprime or st.email
    if Stagiaire.objects.filter(email__iexact=email).exclude(pk=st.pk).exists():
      return Response(
        {'detail': f"L'adresse {email} est déjà utilisée par un autre stagiaire : impossible de restaurer celui-ci."},
        status=status.HTTP_400_BAD_REQUEST,
      )
    st.email = email
    st.email_supprime = ''
    st.is_deleted = False
    st.supprime_le = None
    st.supprime_par = None
    st.save()
    return Response(StagiaireSerializer(st, context={'request': request}).data)

  queryset = Stagiaire.objects.all()
  serializer_class = StagiaireSerializer


class StageViewSet(AuditMixin, viewsets.ModelViewSet):
  audit_categorie = 'stage'
  audit_nom = "le stage"
  permission_classes = [ModulePermission]
  module = 'stages'  # écriture : accès complet requis sur ce module
  queryset = Stage.objects.all()
  serializer_class = StageSerializer

  # Un encadrant ne voit que les stages qu'il encadre ; les stages d'un stagiaire supprimé sont masqués
  def get_queryset(self):
    queryset = Stage.objects.filter(stagiaire__is_deleted=False)
    if est_tuteur(self.request.user):
      queryset = queryset.filter(tuteur=self.request.user)
    return queryset

  # L'encadrant est prévenu (messagerie + e-mail) quand un stagiaire lui est affecté
  def perform_create(self, serializer):
    stage = serializer.save()
    notifier_affectation(stage, self.request.user)

  def perform_update(self, serializer):
    ancien_tuteur_id = serializer.instance.tuteur_id
    stage = serializer.save()
    if stage.tuteur_id and stage.tuteur_id != ancien_tuteur_id:
      notifier_affectation(stage, self.request.user)

  # --- Workflow de validation -------------------------------------------------------------
  # 1. Documents : l'encadrant les ajoute au dossier (module Documents).
  # 2. valider-encadrant : l'encadrant évalue (note + appréciation) -> statut VALIDE.
  # 3. valider-rh : l'agent RH valide -> statut TERMINE + fiche de notes PDF ; ou renvoyer -> EN_COURS.
  # Ces actions ont leurs propres règles : un encadrant peut les utiliser même sans accès au module « stages ».

  def get_permissions(self):
    if self.action in ('valider_encadrant', 'valider_rh', 'renvoyer', 'rouvrir'):
      return [Connecte()]
    return super().get_permissions()

  @staticmethod
  def _peut_valider_rh(user):
    return est_admin(user) or getattr(user, 'role', None) == 'RH'

  @action(detail=True, methods=['post'], url_path='valider-encadrant')
  def valider_encadrant(self, request, pk=None):
    stage = self.get_object()
    if not (est_admin(request.user) or stage.tuteur_id == request.user.id):
      raise PermissionDenied("Seul l'encadrant de ce stage peut l'évaluer.")
    if stage.statut != 'EN_COURS':
      return Response(
        {'detail': "Seul un stage en cours peut être évalué (statut actuel : %s)." % stage.get_statut_display()},
        status=status.HTTP_400_BAD_REQUEST,
      )
    try:
      note = round(float(str(request.data.get('note', '')).replace(',', '.')), 2)
    except ValueError:
      note = None
    if note is None or not 0 <= note <= 20:
      return Response({'note': ['Indiquez une note comprise entre 0 et 20.']}, status=status.HTTP_400_BAD_REQUEST)
    appreciation = str(request.data.get('appreciation', '')).strip()
    if len(appreciation) < 10:
      return Response(
        {'appreciation': ['Rédigez une appréciation (10 caractères minimum).']}, status=status.HTTP_400_BAD_REQUEST
      )

    stage.gratification = note
    stage.appreciation = appreciation[:3000]
    stage.statut = 'VALIDE'
    stage.evalue_le = timezone.now()
    stage.evalue_par = request.user
    stage.motif_retour = ''
    stage.valide_rh_le = None
    stage.valide_rh_par = None
    stage.save()
    notifier_evaluation(stage, request.user)
    return Response(StageSerializer(stage, context={'request': request}).data)

  @action(detail=True, methods=['post'], url_path='valider-rh')
  def valider_rh(self, request, pk=None):
    stage = self.get_object()
    if not self._peut_valider_rh(request.user):
      raise PermissionDenied("La validation finale est réservée aux agents RH.")
    if stage.statut != 'VALIDE':
      return Response(
        {'detail': "Le stage doit d'abord être évalué et validé par son encadrant."},
        status=status.HTTP_400_BAD_REQUEST,
      )

    with transaction.atomic():
      stage.statut = 'TERMINE'
      stage.valide_rh_le = timezone.now()
      stage.valide_rh_par = request.user
      stage.save()

      # Fiche de notes : une seule par stage, régénérée si elle existait déjà
      for ancienne in Document.objects.filter(stage=stage, type_doc='FICHE_NOTES'):
        ancienne.chemin_fichier.delete(save=False)
        ancienne.delete()
      fiche = Document(
        nom_fichier=f'Fiche de notes - {stage.stagiaire.prenom} {stage.stagiaire.nom}',
        type_doc='FICHE_NOTES',
        stage=stage,
      )
      fiche.chemin_fichier.save(f'fiche_notes_stage_{stage.id}.pdf', ContentFile(generer_fiche_notes(stage)), save=False)
      fiche.save()

    notifier_cloture(stage, request.user)
    data = StageSerializer(stage, context={'request': request}).data
    data['fiche'] = DocumentSerializer(fiche, context={'request': request}).data
    return Response(data)

  @staticmethod
  def _reinitialiser_fiche(stage):
    """Efface tout ce que contient la fiche de notes (note, appréciation, validations) et supprime le PDF."""
    stage.gratification = 0
    stage.appreciation = ''
    stage.evalue_le = None
    stage.evalue_par = None
    stage.valide_rh_le = None
    stage.valide_rh_par = None
    for fiche in Document.objects.filter(stage=stage, type_doc='FICHE_NOTES'):
      fiche.chemin_fichier.delete(save=False)
      fiche.delete()

  @action(detail=True, methods=['post'])
  def rouvrir(self, request, pk=None):
    """L'agent RH rouvre un stage terminé : la fiche de notes est réinitialisée et le stage
    reprend le workflow (évaluation de l'encadrant, puis validation RH)."""
    stage = self.get_object()
    if not self._peut_valider_rh(request.user):
      raise PermissionDenied('Seul un agent RH peut rouvrir un stage terminé.')
    if stage.statut != 'TERMINE':
      return Response({'detail': 'Seul un stage terminé peut être rouvert.'}, status=status.HTTP_400_BAD_REQUEST)
    motif = str(request.data.get('motif', '')).strip()
    if len(motif) < 5:
      return Response({'motif': ['Précisez le motif de la réouverture.']}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
      self._reinitialiser_fiche(stage)
      stage.statut = 'EN_COURS'
      # Le motif s'affiche chez l'encadrant, comme pour un renvoi
      stage.motif_retour = f'Stage rouvert : {motif}'[:1000]
      stage.save()

    notifier_reouverture(stage, request.user, motif)
    return Response(StageSerializer(stage, context={'request': request}).data)

  @action(detail=True, methods=['post'])
  def renvoyer(self, request, pk=None):
    stage = self.get_object()
    if not self._peut_valider_rh(request.user):
      raise PermissionDenied("Seul un agent RH peut renvoyer le dossier à l'encadrant.")
    if stage.statut != 'VALIDE':
      return Response({'detail': "Seul un dossier en attente de validation RH peut être renvoyé."},
                      status=status.HTTP_400_BAD_REQUEST)
    motif = str(request.data.get('motif', '')).strip()
    if len(motif) < 5:
      return Response({'motif': ['Précisez le motif du renvoi.']}, status=status.HTTP_400_BAD_REQUEST)
    stage.statut = 'EN_COURS'
    stage.motif_retour = motif[:1000]
    stage.save(update_fields=['statut', 'motif_retour'])
    notifier_retour(stage, request.user, motif)
    return Response(StageSerializer(stage, context={'request': request}).data)


class DocumentViewSet(AuditMixin, viewsets.ModelViewSet):
  audit_categorie = 'document'
  audit_nom = "le document"
  permission_classes = [ModulePermission]
  module = 'documents'  # écriture : accès complet requis sur ce module
  queryset = Document.objects.all()
  serializer_class = DocumentSerializer

  # Un encadrant ne voit que les documents des stages qu'il encadre.
  # La fiche de notes n'est visible qu'une fois le stage terminé (toutes les validations effectuées).
  def get_queryset(self):
    queryset = Document.objects.filter(stage__stagiaire__is_deleted=False).exclude(
      Q(type_doc='FICHE_NOTES') & ~Q(stage__statut='TERMINE')
    )
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

        journaliser(request, 'compte', 'profil', 'Modification de son profil', objet=user,
                    details={'champs': sorted(k for k in request.data.keys() if k != 'photo')})
        return Response(UtilisateurSerializer(user, context={'request': request}).data)


class ChangerMotDePasseView(APIView):
    """Changement du mot de passe de l'utilisateur connecté (l'ancien mot de passe est exigé)."""
    permission_classes = [Connecte]

    def post(self, request):
        serializer = ChangerMotDePasseSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['nouveau_mot_de_passe'])
        request.user.save(update_fields=['password'])
        journaliser(request, 'securite', 'mot_de_passe', 'Changement de son mot de passe', objet=request.user)
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
            # Niveau maximum autorisé par rôle et par module (ex. tuteur : lecture seule sur les stages)
            'plafonds': {r: {m: acces.plafond(r, m) for m in acces.MODULE_IDS} for r in acces.ROLES_CONFIGURABLES},
        })

    def get(self, request):
        return self._reponse()

    def put(self, request):
        nouvelle = request.data.get('matrice')
        if not isinstance(nouvelle, dict):
            return Response({'detail': 'Format de matrice invalide.'}, status=status.HTTP_400_BAD_REQUEST)
        avant = acces.matrice()

        for role in acces.ROLES_CONFIGURABLES:  # le rôle ADMIN n'est jamais modifiable
            for module, niveau in (nouvelle.get(role) or {}).items():
                if module not in acces.MODULE_IDS:
                    continue
                try:
                    niveau = int(niveau)
                except (TypeError, ValueError):
                    continue
                niveau = max(acces.AUCUN, min(niveau, acces.plafond(role, module)))
                AccesRole.objects.update_or_create(role=role, module=module, defaults={'niveau': niveau})

        apres = acces.matrice()
        modifs = {
            f'{role} · {module}': [avant[role].get(module), apres[role].get(module)]
            for role in acces.ROLES_CONFIGURABLES
            for module in apres[role]
            if avant[role].get(module) != apres[role].get(module)
        }
        if modifs:
            journaliser(request, 'droits', 'droits', "Modification des droits d'accès", details={'modifications': modifs})
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
        journaliser(request, 'securite', 'premiere_connexion', 'Finalisation du compte (première connexion)', objet=user)
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
        journaliser(request, 'securite', 'reinitialisation', 'Réinitialisation du mot de passe (lien reçu par e-mail)',
                    objet=user, utilisateur=user)
        return Response({'detail': 'Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.'})


class JournalAuditView(APIView):
    """Journal d'audit, réservé à l'administrateur.
    Filtres : categorie, utilisateur (id), q (recherche), du / au (AAAA-MM-JJ), echecs=1.
    Pagination : page (à partir de 1), taille (50 par défaut, 200 au plus). export=csv : export complet filtré."""

    permission_classes = [EstAdmin]

    def _filtrer(self, request):
        qs = JournalAudit.objects.all()
        p = request.query_params
        if p.get('categorie'):
            qs = qs.filter(categorie=p['categorie'])
        if p.get('utilisateur'):
            qs = qs.filter(utilisateur_id=p['utilisateur'])
        if p.get('q'):
            q = p['q'].strip()
            qs = qs.filter(Q(libelle__icontains=q) | Q(utilisateur_nom__icontains=q) | Q(ip__icontains=q))
        if p.get('du'):
            qs = qs.filter(date__date__gte=p['du'])
        if p.get('au'):
            qs = qs.filter(date__date__lte=p['au'])
        if p.get('echecs') in ('1', 'true'):
            qs = qs.filter(succes=False)
        return qs

    @staticmethod
    def _json(e):
        return {
            'id': e.id,
            'date': e.date,
            'utilisateur': e.utilisateur_id,
            'utilisateur_nom': e.utilisateur_nom,
            'role': e.role,
            'categorie': e.categorie,
            'action': e.action,
            'libelle': e.libelle,
            'details': e.details,
            'ip': e.ip,
            'succes': e.succes,
        }

    def get(self, request):
        qs = self._filtrer(request)

        if request.query_params.get('export') == 'csv':
            import csv
            from django.http import HttpResponse

            reponse = HttpResponse(content_type='text/csv; charset=utf-8')
            reponse['Content-Disposition'] = 'attachment; filename="journal-audit.csv"'
            reponse.write('\ufeff')  # BOM : accents corrects à l'ouverture dans Excel
            w = csv.writer(reponse, delimiter=';')
            w.writerow(['Date', 'Utilisateur', 'Rôle', 'Catégorie', 'Action', 'Résultat', 'Adresse IP', 'Détails'])
            for e in qs[:10000]:
                w.writerow([
                    timezone.localtime(e.date).strftime('%d/%m/%Y %H:%M:%S'),
                    e.utilisateur_nom or '—', e.role, e.get_categorie_display(), e.libelle,
                    'Réussi' if e.succes else 'Échec', e.ip or '', json.dumps(e.details, ensure_ascii=False) if e.details else '',
                ])
            return reponse

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            taille = min(200, max(1, int(request.query_params.get('taille', 50))))
        except ValueError:
            page, taille = 1, 50
        total = qs.count()
        entrees = qs[(page - 1) * taille: page * taille]
        auteurs = (
            JournalAudit.objects.exclude(utilisateur=None)
            .values('utilisateur', 'utilisateur_nom').distinct().order_by('utilisateur_nom')
        )
        return Response({
            'total': total,
            'page': page,
            'taille': taille,
            'resultats': [self._json(e) for e in entrees],
            'categories': [{'id': k, 'label': v} for k, v in JournalAudit.CATEGORIES],
            'auteurs': [{'id': a['utilisateur'], 'nom': a['utilisateur_nom']} for a in auteurs],
            'echecs_connexion_24h': JournalAudit.objects.filter(
                categorie='connexion', succes=False, date__gte=timezone.now() - timezone.timedelta(hours=24)
            ).count(),
        })

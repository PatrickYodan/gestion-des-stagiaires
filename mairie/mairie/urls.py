from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
# CORRECTION 1 : Import de serializers depuis rest_framework
from rest_framework import serializers 
# CORRECTION 2 : Alias pour vos serializers locaux (si nécessaire)
from mairies import serializers as mairies_serializers 
from mairies.views import (
    AccesView,
    ChangerMotDePasseView,
    DashboardStatsView,
    MonCompteView,
    MotDePasseOublieView,
    ReinitialiserMotDePasseView,
    PremiereConnexionView,
    DocumentViewSet,
    EtablissementViewSet,
    ServiceViewSet,
    StageViewSet,
    StagiaireViewSet,
    UtilisateurViewSet,
)
from mairies.messagerie import (
    ContactsView,
    ConversationDetailView,
    ConversationsView,
    MessagesView,
    NonLusView,
)
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

# Enrichissement du token pour inclure les informations et la photo de l'utilisateur dans la réponse JSON
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
  # Connexion avec l'adresse e-mail au lieu du nom d'utilisateur (voir mairies.backends.EmailBackend)
  username_field = 'email'
  default_error_messages = {
    'no_active_account': 'Adresse e-mail ou mot de passe incorrect.',
  }

  def validate(self, attrs):
    # Validation e-mail / mot de passe
    data = super().validate(attrs)

    # Si l'utilisateur est inactif, il ne se connecte pas sur le site
    if self.user.statut_compte == 'INACTIF':
        raise serializers.ValidationError(
            {"detail": "Votre compte est inactif. Veuillez contacter un administrateur."}
        )

    # Enrichissement de la réponse JSON si le compte est actif
    data['id'] = self.user.id
    data['username'] = self.user.username
    data['email'] = self.user.email
    data['nom'] = self.user.nom
    data['prenom'] = self.user.prenom
    data['role'] = self.user.role
    # Mot de passe provisoire : nom, prénom et nouveau mot de passe à saisir avant d'accéder à l'application
    data['doit_changer_mdp'] = self.user.doit_changer_mdp

    # Récupération de la requête HTTP pour générer l'URL complète
    request = self.context.get('request')
    if self.user.photo:
        data['photo'] = request.build_absolute_uri(self.user.photo.url) if request else self.user.photo.url
    else:
        data['photo'] = None

    return data


class CustomTokenObtainPairView(TokenObtainPairView):
  serializer_class = CustomTokenObtainPairSerializer

router = DefaultRouter()
router.register(r'services', ServiceViewSet)
router.register(r'etablissements', EtablissementViewSet)
router.register(r'utilisateurs', UtilisateurViewSet)
router.register(r'stagiaires', StagiaireViewSet)
router.register(r'stages', StageViewSet)
router.register(r'documents', DocumentViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    
    # Endpoint JWT pour se connecter
    path(
        'api/token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'
    ),
    # Endpoint pour rafraîchir un token expiré
    path(
        'api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'
    ),
    path(
      'api/dashboard-stats/', DashboardStatsView.as_view(), name='dashboard-stats'
    ),
    # Droits d'accès par rôle (lecture : connecté, modification : administrateur)
    path('api/acces/', AccesView.as_view(), name='acces'),
    # Mot de passe oublié (accessible sans être connecté)
    path('api/mot-de-passe-oublie/', MotDePasseOublieView.as_view(), name='mot-de-passe-oublie'),
    path(
      'api/mot-de-passe-oublie/confirmer/',
      ReinitialiserMotDePasseView.as_view(),
      name='reinitialiser-mot-de-passe',
    ),
    # Messagerie interne entre utilisateurs
    path('api/messagerie/contacts/', ContactsView.as_view(), name='messagerie-contacts'),
    path('api/messagerie/conversations/', ConversationsView.as_view(), name='messagerie-conversations'),
    path(
      'api/messagerie/conversations/<int:pk>/',
      ConversationDetailView.as_view(),
      name='messagerie-conversation',
    ),
    path(
      'api/messagerie/conversations/<int:pk>/messages/',
      MessagesView.as_view(),
      name='messagerie-messages',
    ),
    path('api/messagerie/non-lus/', NonLusView.as_view(), name='messagerie-non-lus'),
    # Espace « Mon compte » de l'utilisateur connecté
    path('api/mon-compte/', MonCompteView.as_view(), name='mon-compte'),
    path(
      'api/mon-compte/premiere-connexion/',
      PremiereConnexionView.as_view(),
      name='premiere-connexion',
    ),
    path(
      'api/mon-compte/mot-de-passe/',
      ChangerMotDePasseView.as_view(),
      name='changer-mot-de-passe',
    ),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
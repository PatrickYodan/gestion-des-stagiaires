from rest_framework import serializers
from .models import Document, Etablissement, Service, Stage, Stagiaire, Utilisateur


class ServiceSerializer(serializers.ModelSerializer):

  class Meta:
    model = Service
    fields = '__all__'


class EtablissementSerializer(serializers.ModelSerializer):

  class Meta:
    model = Etablissement
    fields = '__all__'


def valider_email_connexion(value, instance=None):
  """L'e-mail sert d'identifiant de connexion : obligatoire et unique (sans tenir compte de la casse)."""
  email = (value or '').strip().lower()
  if not email:
    raise serializers.ValidationError("L'adresse e-mail est obligatoire : elle sert à se connecter.")
  doublons = Utilisateur.objects.filter(email__iexact=email)
  if instance is not None:
    doublons = doublons.exclude(pk=instance.pk)
  if doublons.exists():
    raise serializers.ValidationError('Cette adresse e-mail est déjà utilisée par un autre compte.')
  return email


class UtilisateurSerializer(serializers.ModelSerializer):
  email = serializers.EmailField(required=True)
  # Facultatif : généré à partir de l'e-mail s'il n'est pas fourni (la connexion se fait par e-mail)
  username = serializers.CharField(required=False, max_length=150)

  def validate_email(self, value):
    return valider_email_connexion(value, self.instance)

  class Meta:
    model = Utilisateur
    fields = [
        'id',
        'username',
        'nom',
        'prenom',
        'email',
        'telephone',
        'role',
        'statut_compte',
        'service',
        'photo',  # Ajouté pour transmettre l'URL de la photo
        'password',
        'doit_changer_mdp',
    ]
    read_only_fields = ['doit_changer_mdp']
    extra_kwargs = {'password': {'write_only': True, 'required': False}}

  def validate_username(self, value):
    doublons = Utilisateur.objects.filter(username__iexact=value)
    if self.instance is not None:
      doublons = doublons.exclude(pk=self.instance.pk)
    if doublons.exists():
      raise serializers.ValidationError("Ce nom d'utilisateur est déjà pris.")
    return value

  # Le mot de passe doit être haché, pas enregistré en clair
  def create(self, validated_data):
    from .invitations import generer_username

    password = validated_data.pop('password', None)
    if not validated_data.get('username'):
      validated_data['username'] = generer_username(validated_data['email'])
    user = Utilisateur(**validated_data)
    if password:
      user.set_password(password)
    else:
      user.set_unusable_password()
    user.save()
    return user

  def update(self, instance, validated_data):
    password = validated_data.pop('password', None)
    instance = super().update(instance, validated_data)
    if password:
      instance.set_password(password)
      instance.save()
    return instance


class MonCompteSerializer(serializers.ModelSerializer):
  """Champs que l'utilisateur connecté peut modifier lui-même (ni rôle, ni statut, ni service)."""

  class Meta:
    model = Utilisateur
    fields = ['prenom', 'nom', 'email', 'telephone', 'photo']

  email = serializers.EmailField(required=False)

  def validate_email(self, value):
    # L'e-mail est l'identifiant de connexion : il ne peut pas être vidé
    return valider_email_connexion(value, self.instance)


class PremiereConnexionSerializer(serializers.Serializer):
  """Première connexion : l'utilisateur renseigne son identité et remplace son mot de passe provisoire."""
  prenom = serializers.CharField(max_length=100)
  nom = serializers.CharField(max_length=100)
  nouveau_mot_de_passe = serializers.CharField(write_only=True)

  def validate_nouveau_mot_de_passe(self, value):
    from django.contrib.auth.password_validation import validate_password

    user = self.context['request'].user
    if user.check_password(value):
      raise serializers.ValidationError('Choisissez un mot de passe différent du mot de passe provisoire.')
    validate_password(value, user=user)
    return value


class ChangerMotDePasseSerializer(serializers.Serializer):
  ancien_mot_de_passe = serializers.CharField(write_only=True)
  nouveau_mot_de_passe = serializers.CharField(write_only=True)

  def validate_ancien_mot_de_passe(self, value):
    if not self.context['request'].user.check_password(value):
      raise serializers.ValidationError('Le mot de passe actuel est incorrect.')
    return value

  def validate_nouveau_mot_de_passe(self, value):
    from django.contrib.auth.password_validation import validate_password
    validate_password(value, user=self.context['request'].user)
    return value


class StagiaireSerializer(serializers.ModelSerializer):

  class Meta:
    model = Stagiaire
    fields = '__all__'  # Inclut automatiquement 'photo' si vous l'avez ajouté au modèle Stagiaire


class StageSerializer(serializers.ModelSerializer):

  class Meta:
    model = Stage
    fields = '__all__'

  # Le champ « gratification » contient la note de stage, sur 20
  def validate_gratification(self, value):
    if value is not None and not 0 <= value <= 20:
      raise serializers.ValidationError('La note doit être comprise entre 0 et 20.')
    return value


class DocumentSerializer(serializers.ModelSerializer):

  class Meta:
    model = Document
    fields = '__all__'
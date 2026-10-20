from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class EmailBackend(ModelBackend):
    """Authentification par adresse e-mail (insensible à la casse) et mot de passe."""

    def authenticate(self, request, email=None, password=None, **kwargs):
        if not email or password is None:
            return None
        UserModel = get_user_model()
        try:
            user = UserModel.objects.get(email__iexact=email.strip())
        except (UserModel.DoesNotExist, UserModel.MultipleObjectsReturned):
            # Exécute le hachage malgré tout pour ne pas révéler l'existence du compte par le temps de réponse
            UserModel().set_password(password)
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None

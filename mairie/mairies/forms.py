# forms.py
from django import forms
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from .models import Utilisateur


class UtilisateurCreationForm(UserCreationForm):

    class Meta(UserCreationForm.Meta):
        model = Utilisateur
        fields = (
            'username',
            'email',
            'nom',
            'prenom',
            'telephone',
            'role',
            'service',
            'photo',  # Ajout de la photo lors de la création
        )


class UtilisateurChangeForm(UserChangeForm):

    class Meta:
        model = Utilisateur
        fields = (
            'username',
            'email',
            'nom',
            'prenom',
            'telephone',
            'role',
            'service',
            'statut_compte',
            'photo',  # Ajout de la photo lors de la modification
        )
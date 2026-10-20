from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Document, Etablissement, Service, Stage, Stagiaire, Utilisateur
from .forms import UtilisateurCreationForm


@admin.register(Utilisateur)
class UtilisateurCustomAdmin(UserAdmin):
    add_form = UtilisateurCreationForm

    # Champs affichés lors de l'édition d'un utilisateur existant
    fieldsets = UserAdmin.fieldsets + (
        (
            'Informations Mairie',
            {
                'fields': (
                    'nom',
                    'prenom',
                    'telephone',
                    'role',
                    'statut_compte',
                    'service',
                    'photo',
                )
            },
        ),
    )

    # Redéfinition complète pour la création d'un utilisateur
    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': (
                    'username',
                    'email',
                    'password1',
                    'password2',
                    'nom',
                    'prenom',
                    'telephone',
                    'role',
                    'service',
                    'photo',
                ),
            },
        ),
    )

    list_display = [
        'username',
        'email',
        'nom',
        'prenom',
        'role',
        'statut_compte',
        'service',
        'photo',
    ]


admin.site.register(Service)
admin.site.register(Etablissement)
admin.site.register(Stagiaire)
admin.site.register(Stage)
admin.site.register(Document)
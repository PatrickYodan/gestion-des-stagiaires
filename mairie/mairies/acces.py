"""Gestion des droits d'accès par rôle et par module.

Niveaux : 0 = aucun accès, 1 = lecture seule, 2 = accès complet (création, modification, suppression).
L'administrateur (rôle ADMIN ou superutilisateur) a toujours un accès complet.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

AUCUN, LECTURE, COMPLET = 0, 1, 2

# Modules configurables. « lecture_seule » : le module n'a pas d'actions d'écriture.
MODULES = [
    {'id': 'dashboard', 'label': 'Tableau de bord', 'lecture_seule': True},
    {'id': 'stagiaires', 'label': 'Stagiaires', 'lecture_seule': False},
    {'id': 'tuteurs', 'label': 'Liste des encadrants', 'lecture_seule': False},
    {'id': 'stages', 'label': 'Affectations & Stages', 'lecture_seule': False},
    {'id': 'services', 'label': 'Services & Établissements', 'lecture_seule': False},
    {'id': 'documents', 'label': 'Documents & Attestations', 'lecture_seule': False},
]
MODULE_IDS = {m['id'] for m in MODULES}
MODULES_LECTURE_SEULE = {m['id'] for m in MODULES if m['lecture_seule']}

ROLES_CONFIGURABLES = ['RH', 'TUTEUR']

# Droits par défaut (reprennent le comportement d'origine de l'application)
DEFAUTS = {
    'RH': {
        'dashboard': LECTURE,
        'stagiaires': COMPLET,
        'tuteurs': COMPLET,  # ajout / modification des comptes tuteurs
        'stages': COMPLET,
        'services': COMPLET,
        'documents': COMPLET,
    },
    'TUTEUR': {
        'dashboard': LECTURE,
        'stagiaires': LECTURE,
        'tuteurs': AUCUN,
        'stages': AUCUN,
        'services': AUCUN,
        'documents': COMPLET,
    },
}


def premiere_connexion_en_attente(user):
    return bool(user and user.is_authenticated and getattr(user, 'doit_changer_mdp', False))


class Connecte(BasePermission):
    """Utilisateur connecté ayant finalisé sa première connexion."""

    message = 'Veuillez finaliser votre première connexion (nom, prénom et nouveau mot de passe).'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated) and not premiere_connexion_en_attente(request.user)


def est_admin(user):
    return bool(user and user.is_authenticated and (user.is_superuser or user.role == 'ADMIN'))


def est_tuteur(user):
    """Encadrant (hors administrateur) : il ne voit que les stagiaires, stages et documents qui lui sont assignés."""
    return bool(user and user.is_authenticated and user.role == 'TUTEUR' and not est_admin(user))


def matrice():
    """Matrice complète {role: {module: niveau}}, valeurs en base sinon valeurs par défaut."""
    from .models import AccesRole

    resultat = {role: dict(DEFAUTS[role]) for role in ROLES_CONFIGURABLES}
    for acces in AccesRole.objects.filter(role__in=ROLES_CONFIGURABLES, module__in=MODULE_IDS):
        resultat[acces.role][acces.module] = acces.niveau
    resultat['ADMIN'] = {m: COMPLET for m in MODULE_IDS}
    return resultat


def niveau_pour(user, module):
    if est_admin(user):
        return COMPLET
    if not user or not user.is_authenticated:
        return AUCUN
    if module == 'utilisateurs':
        return AUCUN
    from .models import AccesRole

    acces = AccesRole.objects.filter(role=user.role, module=module).first()
    if acces is not None:
        return acces.niveau
    return DEFAUTS.get(user.role, {}).get(module, AUCUN)


class ModulePermission(BasePermission):
    """Lecture : tout utilisateur connecté (données de référence partagées entre les écrans).
    Écriture : accès complet requis sur le module déclaré par la vue (attribut « module »)."""

    message = "Vous n'avez pas les droits nécessaires pour effectuer cette action."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if premiere_connexion_en_attente(request.user):
            self.message = Connecte.message
            return False
        if request.method in SAFE_METHODS:
            return True
        module = getattr(view, 'module', None)
        return module is None or niveau_pour(request.user, module) >= COMPLET


class EstAdmin(BasePermission):
    message = "Action réservée à l'administrateur."

    def has_permission(self, request, view):
        return est_admin(request.user) and not premiere_connexion_en_attente(request.user)


class GestionUtilisateursPermission(BasePermission):
    """Comptes utilisateurs : l'administrateur gère tous les comptes ; un rôle disposant d'un accès complet
    au module « tuteurs » peut créer, modifier et supprimer uniquement des comptes TUTEUR."""

    message = "Vous ne pouvez gérer que les comptes des tuteurs."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if premiere_connexion_en_attente(request.user):
            self.message = Connecte.message
            return False
        if request.method in SAFE_METHODS or est_admin(request.user):
            return True
        return niveau_pour(request.user, 'tuteurs') >= COMPLET

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS or est_admin(request.user):
            return True
        return obj.role == 'TUTEUR' and not obj.is_superuser

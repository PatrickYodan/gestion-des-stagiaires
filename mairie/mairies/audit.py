"""Journal d'audit : enregistrement des actions des utilisateurs.

  • journaliser(...)  : enregistre une entrée (n'interrompt jamais la requête en cas d'erreur)
  • AuditMixin       : à placer sur un ModelViewSet ; trace automatiquement création, modification
                       (avec les champs modifiés), suppression et actions personnalisées réussies.
"""

import logging
from datetime import date, datetime
from decimal import Decimal

from django.db.models.fields.files import FieldFile
from rest_framework.permissions import SAFE_METHODS

logger = logging.getLogger(__name__)

# Champs jamais recopiés dans le journal
CHAMPS_IGNORES = {'password', 'last_login', 'date_joined', 'groups', 'user_permissions', 'email_supprime'}

# Libellés lisibles des actions
ACTIONS = {
    'create': ('creation', 'Création'),
    'update': ('modification', 'Modification'),
    'partial_update': ('modification', 'Modification'),
    'destroy': ('suppression', 'Suppression'),
    'restaurer': ('restauration', 'Restauration'),
    'valider_encadrant': ('evaluation', 'Évaluation par l\'encadrant'),
    'valider_rh': ('validation_rh', 'Validation RH et clôture'),
    'renvoyer': ('renvoi', 'Renvoi à l\'encadrant'),
    'rouvrir': ('reouverture', 'Réouverture'),
    'renvoyer_identifiants': ('identifiants', 'Envoi des identifiants'),
}


def adresse_ip(request):
    if request is None:
        return None
    transmise = request.META.get('HTTP_X_FORWARDED_FOR')
    ip = (transmise.split(',')[0] if transmise else request.META.get('REMOTE_ADDR')) or ''
    return ip.strip() or None


def nom_utilisateur(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return ''
    return f'{user.prenom} {user.nom}'.strip() or user.email or user.username


def journaliser(request, categorie, action, libelle, objet=None, details=None, succes=True, utilisateur=None):
    """Enregistre une entrée du journal. Ne lève jamais d'erreur : l'audit ne doit pas bloquer l'action."""
    from .models import JournalAudit

    try:
        user = utilisateur if utilisateur is not None else getattr(request, 'user', None)
        connecte = bool(user and getattr(user, 'is_authenticated', False))
        JournalAudit.objects.create(
            utilisateur=user if connecte else None,
            utilisateur_nom=nom_utilisateur(user) if connecte else '',
            role=getattr(user, 'role', '') if connecte else '',
            categorie=categorie,
            action=action,
            libelle=libelle[:255],
            objet_type=objet.__class__.__name__ if objet is not None else '',
            objet_id=getattr(objet, 'pk', None),
            details=details or {},
            ip=adresse_ip(request),
            succes=succes,
        )
    except Exception:
        logger.exception("Échec de l'enregistrement dans le journal d'audit")


def _valeur(v):
    """Valeur lisible et sérialisable pour le journal."""
    if isinstance(v, FieldFile):
        return v.name or ''
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, 'pk'):
        return str(v)
    return v


def instantane(obj):
    """Valeurs des champs d'un objet (clés étrangères lisibles), pour comparer avant / après."""
    if obj is None:
        return {}
    valeurs = {}
    for f in obj._meta.concrete_fields:
        if f.name in CHAMPS_IGNORES:
            continue
        if f.is_relation:
            cible = getattr(obj, f.name, None)
            valeurs[f.name] = str(cible) if cible is not None else None
        else:
            valeurs[f.name] = _valeur(getattr(obj, f.attname, None))
    return valeurs


def differences(avant, apres):
    return {
        champ: [avant.get(champ), apres.get(champ)]
        for champ in apres
        if champ in avant and avant.get(champ) != apres.get(champ)
    }


class AuditMixin:
    """Trace automatiquement les actions d'écriture réussies d'un ModelViewSet.

    Attributs de la vue :
      audit_categorie : catégorie du journal (ex. 'stagiaire')
      audit_nom       : nom de l'élément au singulier, avec article (ex. 'le stagiaire')
    """

    audit_categorie = ''
    audit_nom = "l'élément"

    def _cible_brute(self):
        """Objet visé par l'URL, sans les filtres de la vue (il peut être supprimé ou masqué)."""
        pk = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field)
        if pk is None:
            return None
        try:
            return self.get_queryset().model._default_manager.filter(pk=pk).first()
        except Exception:
            return None

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self._audit_avant = None
        if request.method not in SAFE_METHODS:
            cible = self._cible_brute()
            self._audit_libelle = str(cible) if cible is not None else ''
            self._audit_avant = instantane(cible) if cible is not None else None

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        try:
            if request.method not in SAFE_METHODS and 200 <= response.status_code < 300:
                self._audit_enregistrer(request, response)
        except Exception:
            logger.exception("Échec de l'audit automatique")
        return response

    def _audit_enregistrer(self, request, response):
        code, verbe = ACTIONS.get(self.action, (self.action or 'action', (self.action or 'Action').replace('_', ' ')))
        objet = None
        if self.action == 'create':
            pk = response.data.get('id') if isinstance(response.data, dict) else None
            objet = self.get_queryset().model._default_manager.filter(pk=pk).first() if pk else None
        else:
            objet = self._cible_brute()
        nom_objet = str(objet) if objet is not None else getattr(self, '_audit_libelle', '')

        details = {}
        if self.action in ('update', 'partial_update') and self._audit_avant is not None and objet is not None:
            details['modifications'] = differences(self._audit_avant, instantane(objet))
            if not details['modifications']:
                return  # enregistrement sans changement réel : rien à tracer
        elif self.action in ('valider_encadrant',) and objet is not None:
            details = {'note': _valeur(getattr(objet, 'gratification', None))}
        elif self.action in ('renvoyer', 'rouvrir'):
            details = {'motif': str(request.data.get('motif', ''))[:500]}

        journaliser(
            request,
            self.audit_categorie,
            code,
            f'{verbe} — {self.audit_nom} {nom_objet}'.strip(),
            objet=objet,
            details=details,
        )

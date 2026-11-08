from django.contrib.auth.models import AbstractUser, Group, Permission
from django.db import models


class Service(models.Model):
    nom = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.nom


class Etablissement(models.Model):
    nom = models.CharField(max_length=150)
    ville = models.TextField()
    # Quartier, rue, repère ou coordonnées GPS : sert à situer l'école sur la carte
    localisation = models.TextField(blank=True, default='')
    email_contact = models.EmailField()
    telephone = models.TextField(blank=True, null=True)

    def __str__(self):
        return f'{self.nom} ({self.ville})'


class Utilisateur(AbstractUser):
    nom = models.CharField(max_length=100, verbose_name='Nom', blank=True)
    prenom = models.CharField(max_length=100, verbose_name='Prénom', blank=True)
    email = models.EmailField(
        unique=True, null=True, blank=True
    )  # null=True évite les conflits d'unicité sur les chaînes vides
    telephone = models.CharField(
        max_length=20, blank=True, null=True
    )

    # Champ ajouté pour la photo de profil de l'utilisateur
    photo = models.ImageField(
        upload_to='photos_profils/', 
        blank=True, 
        null=True, 
        verbose_name='Photo de profil'
    )

    ROLE_CHOICES = [
        ('ADMIN', 'Administrateur'),
        ('RH', 'Agent RH'),
        ('TUTEUR', 'Tuteur'),
    ]

    STATUT_CHOICES = [
        ('ACTIF', 'Actif'),
        ('INACTIF', 'Inactif'),
    ]

    role = models.CharField(
        max_length=10, choices=ROLE_CHOICES, default='TUTEUR'
    )
    statut_compte = models.CharField(
        max_length=10, choices=STATUT_CHOICES, default='ACTIF'
    )

    # Compte créé avec un mot de passe provisoire envoyé par e-mail : à la première connexion,
    # l'utilisateur doit renseigner son nom / prénom et choisir son propre mot de passe.
    doit_changer_mdp = models.BooleanField(
        default=False, verbose_name='Première connexion à finaliser'
    )

    service = models.ForeignKey(
        Service,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tuteurs',
    )

    # Suppression « douce » : le compte disparaît de l'application mais reste en base, désactivé.
    # L'e-mail est mis de côté (email_supprime) pour pouvoir le réutiliser sur un nouveau compte.
    est_supprime = models.BooleanField(default=False, verbose_name='Supprimé')
    supprime_le = models.DateTimeField(null=True, blank=True, verbose_name='Supprimé le')
    supprime_par = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='comptes_supprimes'
    )
    email_supprime = models.EmailField(blank=True, default='', verbose_name="E-mail avant suppression")

    groups = models.ManyToManyField(
        Group,
        verbose_name='groups',
        blank=True,
        help_text='The groups this user belongs to.',
        related_name='mairies_utilisateurs_groups',
        related_query_name='mairies_utilisateur',
    )

    user_permissions = models.ManyToManyField(
        Permission,
        verbose_name='user permissions',
        blank=True,
        help_text='Specific permissions for this user.',
        related_name='mairies_utilisateurs_permissions',
        related_query_name='mairies_utilisateur',
    )

    def __str__(self):
        return (
            f'{self.prenom} {self.nom} ({self.role})'
            if self.nom
            else self.username
        )


class Stagiaire(models.Model):
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    telephone = models.CharField(max_length=20, blank=True, null=True)
    
    # Champ optionnel si vous voulez aussi une photo pour le stagiaire
    photo = models.ImageField(
        upload_to='photos_stagiaires/', 
        blank=True, 
        null=True, 
        verbose_name='Photo du stagiaire'
    )
    
    adresse = models.TextField(blank=True, null=True)
    niveau_etudes = models.TextField()
    # Suppression « douce » : le stagiaire est masqué dans l'application mais reste en base.
    # L'e-mail d'origine est conservé dans email_supprime ; le champ email reçoit une valeur neutre
    # pour qu'un nouveau dossier puisse être créé avec la même adresse.
    is_deleted = models.BooleanField(default=False)
    supprime_le = models.DateTimeField(null=True, blank=True, verbose_name='Supprimé le')
    supprime_par = models.ForeignKey(
        'Utilisateur', on_delete=models.SET_NULL, null=True, blank=True, related_name='stagiaires_supprimes'
    )
    email_supprime = models.EmailField(blank=True, default='', verbose_name="E-mail avant suppression")
    etablissement = models.ForeignKey(
        Etablissement,
        on_delete=models.SET_NULL,
        null=True,
        related_name='stagiaires',
    )

    def __str__(self):
        return f'{self.prenom} {self.nom}'


class Stage(models.Model):
    # Workflow : EN_ATTENTE -> EN_COURS -> VALIDE (évalué par l'encadrant, en attente de l'agent RH)
    #            -> TERMINE (validé par l'agent RH, fiche de notes établie). ANNULEE à tout moment.
    STATUT_CHOICES = [
        ('EN_ATTENTE', 'En attente'),
        ('EN_COURS', 'En cours'),
        ('TERMINE', 'Terminé'),
        ('ANNULEE', 'Annulé'),
        ('VALIDE', "Validé par l'encadrant"),
    ]

    intitule = models.CharField(
        max_length=255, verbose_name='Intitulé du stage'
    )
    missions = models.TextField(blank=True, null=True)
    date_debut = models.DateField()
    date_fin = models.DateField()
    gratification = models.DecimalField(
        max_digits=8, decimal_places=2, default=0.00
    )
    statut = models.CharField(
        max_length=15, choices=STATUT_CHOICES, default='EN_ATTENTE'
    )

    stagiaire = models.ForeignKey(
        Stagiaire, on_delete=models.CASCADE, related_name='stages'
    )
    tuteur = models.ForeignKey(
        Utilisateur,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'role': 'TUTEUR'},
        related_name='stages_encadres',
    )
    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, related_name='stages'
    )

    # --- Suivi du workflow de validation ---
    appreciation = models.TextField(blank=True, default='', verbose_name="Appréciation de l'encadrant")
    evalue_le = models.DateTimeField(null=True, blank=True, verbose_name="Évalué par l'encadrant le")
    evalue_par = models.ForeignKey(
        Utilisateur, on_delete=models.SET_NULL, null=True, blank=True, related_name='stages_evalues'
    )
    valide_rh_le = models.DateTimeField(null=True, blank=True, verbose_name="Validé par l'agent RH le")
    valide_rh_par = models.ForeignKey(
        Utilisateur, on_delete=models.SET_NULL, null=True, blank=True, related_name='stages_valides_rh'
    )
    # Dernier motif de renvoi à l'encadrant (vidé à la nouvelle évaluation)
    motif_retour = models.TextField(blank=True, default='')

    def __str__(self):
        return f'{self.intitule} - {self.stagiaire.prenom} {self.stagiaire.nom}'


class Document(models.Model):
    TYPE_DOC_CHOICES = [
        ('CONVENTIONS', 'Convention de stage'),
        ('ATTESTATION', 'Attestation de présence'),
        ('RAPPORT', 'Rapport de stage'),
        ('FICHE_NOTES', 'Fiche de notes'),
        ('AUTRE', 'Autre document'),
    ]

    nom_fichier = models.CharField(
        max_length=255, verbose_name='Nom du fichier'
    )
    type_doc = models.CharField(
        max_length=20,
        choices=TYPE_DOC_CHOICES,
        default='AUTRE',
        verbose_name='Type de document',
    )
    # Type saisi librement quand « Autre document » est choisi (ex. « Fiche d'évaluation »)
    type_precision = models.CharField(
        max_length=100, blank=True, default='', verbose_name='Type précisé'
    )
    chemin_fichier = models.FileField(
        upload_to='document_stages/', verbose_name='Fichier'
    )
    stage = models.ForeignKey(
        Stage, on_delete=models.CASCADE, related_name='documents'
    )
    date_ajout = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.nom_fichier} ({self.get_type_doc_display()})'

class AccesRole(models.Model):
    """Niveau d'accès d'un rôle à un module de l'application (géré par l'administrateur)."""

    NIVEAU_CHOICES = [
        (0, 'Aucun accès'),
        (1, 'Lecture seule'),
        (2, 'Accès complet'),
    ]

    role = models.CharField(max_length=10, choices=Utilisateur.ROLE_CHOICES)
    module = models.CharField(max_length=30)
    niveau = models.PositiveSmallIntegerField(choices=NIVEAU_CHOICES, default=0)

    class Meta:
        unique_together = ('role', 'module')
        verbose_name = "Droit d'accès"
        verbose_name_plural = "Droits d'accès"

    def __str__(self):
        return f'{self.role} → {self.module} : {self.get_niveau_display()}'


class Conversation(models.Model):
    """Conversation privée entre deux utilisateurs (messagerie interne)."""

    participants = models.ManyToManyField(Utilisateur, related_name='conversations')
    cree_le = models.DateTimeField(auto_now_add=True)
    # Date du dernier message : sert à trier les conversations
    mis_a_jour_le = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-mis_a_jour_le']

    def __str__(self):
        return ' / '.join(str(p) for p in self.participants.all())


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    auteur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='messages_envoyes')
    contenu = models.TextField(max_length=2000)
    envoye_le = models.DateTimeField(auto_now_add=True, db_index=True)
    # Date de lecture par le destinataire (vide = non lu)
    lu_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['envoye_le', 'id']

    def __str__(self):
        return f'{self.auteur} : {self.contenu[:40]}'


class EtatConversation(models.Model):
    """Préférences d'un participant pour une conversation : brouillon, archivage, suppression.
    Elles ne concernent que lui : l'autre participant n'est pas affecté."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='etats')
    utilisateur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='etats_conversations')
    brouillon = models.TextField(blank=True, default='')
    archivee = models.BooleanField(default=False)
    # Suppression « pour moi » : les messages antérieurs à cette date sont masqués pour ce participant
    supprimee_le = models.DateTimeField(null=True, blank=True)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('conversation', 'utilisateur')

    def __str__(self):
        return f'{self.utilisateur} — conversation {self.conversation_id}'


class JournalAudit(models.Model):
    """Journal d'audit : trace des actions des utilisateurs, consultable par l'administrateur.
    Le nom et le rôle de l'auteur sont copiés au moment de l'action (lisibles même si le compte change)."""

    CATEGORIES = [
        ('connexion', 'Connexion'),
        ('compte', 'Comptes'),
        ('stagiaire', 'Stagiaires'),
        ('stage', 'Stages'),
        ('document', 'Documents'),
        ('service', 'Services'),
        ('etablissement', 'Établissements'),
        ('droits', "Droits d'accès"),
        ('securite', 'Sécurité'),
    ]

    date = models.DateTimeField(auto_now_add=True, db_index=True)
    utilisateur = models.ForeignKey(
        Utilisateur, on_delete=models.SET_NULL, null=True, blank=True, related_name='actions_journal'
    )
    utilisateur_nom = models.CharField(max_length=200, blank=True, default='')
    role = models.CharField(max_length=10, blank=True, default='')
    categorie = models.CharField(max_length=20, choices=CATEGORIES, db_index=True)
    action = models.CharField(max_length=40, db_index=True)  # ex. creation, modification, suppression…
    libelle = models.CharField(max_length=255)  # phrase lisible : « Suppression du stagiaire Jean Dupont »
    objet_type = models.CharField(max_length=40, blank=True, default='')
    objet_id = models.IntegerField(null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)  # ex. champs modifiés {champ: [avant, après]}
    ip = models.GenericIPAddressField(null=True, blank=True)
    succes = models.BooleanField(default=True)

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.date:%d/%m/%Y %H:%M} — {self.utilisateur_nom} — {self.libelle}'


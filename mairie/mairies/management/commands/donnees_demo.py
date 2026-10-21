import random
from datetime import date, timedelta

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction

from mairies.models import Document, Etablissement, Service, Stage, Stagiaire, Utilisateur

# Toutes les données de démonstration utilisent ce domaine d'e-mail : on peut ainsi
# les retrouver et les supprimer sans toucher aux vraies données.
DOMAINE = 'demo.mairie.ci'

ENCADRANTS = [
    ('Kouassi', 'Yao', 'Service informatique'),
    ('Bamba', 'Mariam', 'Service des ressources humaines'),
    ('Traoré', 'Seydou', 'Service courrier'),
    ('Koné', 'Aminata', 'Service hygiène'),
    ("N'Guessan", 'Didier', 'Secretariat generale'),
    ('Diabaté', 'Fatou', 'Etat civil'),
    ('Kouamé', 'Serge', 'Service informatique'),
]

STAGIAIRES = [
    ('Aka', 'Esther', 'BTS'), ('Coulibaly', 'Ibrahim', 'Licence 2'), ('Gbagbo', 'Prisca', 'Licence 3'),
    ('Touré', 'Moussa', 'Master 1'), ('Yapi', 'Josiane', 'BTS'), ('Ouattara', 'Karim', 'Licence 3'),
    ('Kassi', 'Brice', 'Master 2'), ('Dosso', 'Awa', 'BAC'), ('Ehui', 'Chantal', 'Licence 1'),
    ('Sangaré', 'Lassina', 'BTS'), ('Assi', 'Rebecca', 'Master 1'), ('Fofana', 'Adama', 'Licence 2'),
    ('Kouadio', 'Ange', 'BTS'), ('Doumbia', 'Salimata', 'Licence 3'), ('Brou', 'Hervé', 'Master 2'),
    ('Konaté', 'Mariame', 'BAC'), ('Tanoh', 'Cédric', 'Licence 1'), ('Silué', 'Nadège', 'BTS'),
    ('Ahoussou', 'Paul', 'Master 1'), ('Cissé', 'Aïcha', 'Licence 2'), ('Gnamien', 'Ruth', 'BTS'),
    ('Diomandé', 'Yacouba', 'Licence 3'),
]

INTITULES = [
    'Stage de découverte', 'Stage de qualification', 'Stage de validation', 'Stage pratique',
    "Stage d'immersion professionnelle", 'Stage de fin de cycle', "Stage d'observation",
]

MISSIONS = {
    'Service informatique': 'Maintenance du parc informatique, assistance aux agents, mise à jour du site de la mairie.',
    'Service des ressources humaines': 'Classement des dossiers du personnel, suivi des congés, préparation des fiches de paie.',
    'Service courrier': 'Enregistrement du courrier arrivée / départ, distribution interne, archivage.',
    'Service hygiène': 'Participation aux contrôles sanitaires, sensibilisation, rédaction de rapports de visite.',
    'Secretariat generale': "Accueil, rédaction de courriers administratifs, préparation des réunions.",
    'Etat civil': "Accueil des usagers, saisie des actes de naissance et de mariage, délivrance d'extraits.",
}


FORMAT_DATE = '%d/%m/%Y'


def pdf_simple(titre, lignes):
    """Petit PDF d'une page (titre + lignes de texte), sans bibliothèque externe."""
    def texte(t):
        t = t.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
        return t.encode('cp1252', 'replace')

    flux = b'BT /F1 20 Tf 72 760 Td (' + texte(titre) + b') Tj ET\n'
    flux += b'0.12 0.31 0.85 RG 2 w 72 748 m 523 748 l S\n'
    y = 715
    for ligne in lignes:
        flux += b'BT /F1 12 Tf 72 ' + str(y).encode() + b' Td (' + texte(ligne) + b') Tj ET\n'
        y -= 22
    flux += b'BT /F1 9 Tf 72 60 Td (' + texte('Document de démonstration - Mairie, gestion des stagiaires') + b') Tj ET\n'

    objets = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        b'<< /Length ' + str(len(flux)).encode() + b' >>\nstream\n' + flux + b'endstream',
    ]
    sortie = b'%PDF-1.4\n'
    positions = []
    for i, obj in enumerate(objets, start=1):
        positions.append(len(sortie))
        sortie += str(i).encode() + b' 0 obj\n' + obj + b'\nendobj\n'
    xref = len(sortie)
    sortie += b'xref\n0 ' + str(len(objets) + 1).encode() + b'\n0000000000 65535 f \n'
    for pos in positions:
        sortie += f'{pos:010d} 00000 n \n'.encode()
    sortie += b'trailer\n<< /Size ' + str(len(objets) + 1).encode() + b' /Root 1 0 R >>\nstartxref\n' + str(xref).encode() + b'\n%%EOF\n'
    return sortie


def slug(texte):
    remplacements = str.maketrans("éèêëàâäîïôöûüçÉÈ' ", 'eeeeaaaiioouucEE--')
    return texte.translate(remplacements).lower()


class Command(BaseCommand):
    help = (
        "Ajoute des encadrants, des stagiaires, des stages et des documents de démonstration "
        "(répartis sur 2025 et 2026). Option --supprimer pour retirer ces données de démonstration."
    )

    def add_arguments(self, parser):
        parser.add_argument('--supprimer', action='store_true', help='Supprime les données de démonstration.')

    @transaction.atomic
    def handle(self, *args, **options):
        stagiaires_demo = Stagiaire.objects.filter(email__endswith=f'@{DOMAINE}')
        encadrants_demo = Utilisateur.objects.filter(email__endswith=f'@{DOMAINE}')

        if options['supprimer']:
            documents_demo = Document.objects.filter(stage__stagiaire__in=stagiaires_demo)
            nb_documents = documents_demo.count()
            for doc in documents_demo:
                doc.chemin_fichier.delete(save=False)  # fichier PDF retiré du dossier media
            nb_stages = Stage.objects.filter(stagiaire__in=stagiaires_demo).count()
            nb_stagiaires = stagiaires_demo.count()
            nb_encadrants = encadrants_demo.count()
            stagiaires_demo.delete()  # supprime aussi leurs stages (CASCADE)
            encadrants_demo.delete()
            self.stdout.write(self.style.SUCCESS(
                f'Supprimé : {nb_encadrants} encadrants, {nb_stagiaires} stagiaires, {nb_stages} stages, '
                f'{nb_documents} documents de démonstration.'
            ))
            return

        if stagiaires_demo.exists():
            # Données déjà présentes : on complète seulement les documents manquants
            nb_documents = self.creer_documents(Stage.objects.filter(stagiaire__in=stagiaires_demo))
            if nb_documents:
                self.stdout.write(self.style.SUCCESS(f'Ajouté : {nb_documents} documents de démonstration.'))
            else:
                self.stdout.write(self.style.WARNING(
                    'Les données de démonstration existent déjà. Pour les recréer : '
                    'python manage.py donnees_demo --supprimer, puis relancez la commande.'
                ))
            return

        rng = random.Random(2026)  # mêmes données à chaque exécution

        # Services et établissements (créés seulement s'ils manquent)
        services = {}
        for nom in MISSIONS:
            services[nom], _ = Service.objects.get_or_create(nom=nom)
        etablissements = list(Etablissement.objects.all())
        if not etablissements:
            etablissements = [
                Etablissement.objects.create(nom='ESATIC', ville='Abidjan', email_contact=f'contact.esatic@{DOMAINE}'),
                Etablissement.objects.create(nom='IIPEA', ville='Abidjan', email_contact=f'contact.iipea@{DOMAINE}'),
            ]

        # Encadrants (comptes tuteurs sans mot de passe utilisable : démonstration uniquement)
        encadrants = []
        for nom, prenom, service_nom in ENCADRANTS:
            identifiant = f'{slug(prenom)}.{slug(nom)}'
            user = Utilisateur(
                username=identifiant,
                nom=nom,
                prenom=prenom,
                email=f'{identifiant}@{DOMAINE}',
                telephone=f'07 {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)}',
                role='TUTEUR',
                statut_compte='ACTIF',
                doit_changer_mdp=False,
                service=services[service_nom],
            )
            user.set_unusable_password()
            user.save()
            encadrants.append(user)

        # Stagiaires
        stagiaires = []
        for nom, prenom, niveau in STAGIAIRES:
            stagiaires.append(Stagiaire.objects.create(
                nom=nom,
                prenom=prenom,
                email=f'{slug(prenom)}.{slug(nom)}@{DOMAINE}',
                telephone=f'05 {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)} {rng.randint(10, 99)}',
                adresse=rng.choice(['Cocody', 'Yopougon', 'Abobo', 'Marcory', 'Treichville', 'Plateau', 'Koumassi']),
                niveau_etudes=niveau,
                etablissement=rng.choice(etablissements),
            ))

        # Stages : début réparti sur les mois de 2025 et 2026, statut cohérent avec les dates
        aujourdhui = date.today()
        debuts = []
        for annee, nb in ((2025, 16), (2026, 22)):
            for _ in range(nb):
                mois = rng.choices(range(1, 13), weights=[2, 2, 3, 3, 2, 4, 5, 4, 3, 3, 2, 1])[0]
                debuts.append(date(annee, mois, rng.randint(1, 28)))

        nb_stages = 0
        for i, debut in enumerate(sorted(debuts)):
            stagiaire = stagiaires[i % len(stagiaires)]
            encadrant = rng.choice(encadrants)
            fin = debut + timedelta(days=rng.choice([30, 45, 60, 90, 120]))
            if debut > aujourdhui:
                statut, note = 'EN_ATTENTE', 0
            elif fin >= aujourdhui:
                statut, note = 'EN_COURS', 0
            else:
                statut = rng.choices(['VALIDE', 'TERMINE', 'ANNULEE'], weights=[6, 3, 1])[0]
                note = round(rng.uniform(11, 18.5), 1) if statut == 'VALIDE' else 0
            Stage.objects.create(
                intitule=rng.choice(INTITULES),
                missions=MISSIONS[encadrant.service.nom],
                date_debut=debut,
                date_fin=fin,
                gratification=note,
                statut=statut,
                stagiaire=stagiaire,
                tuteur=encadrant,
                service=encadrant.service,
            )
            nb_stages += 1

        nb_documents = self.creer_documents(Stage.objects.filter(stagiaire__in=stagiaires))

        self.stdout.write(self.style.SUCCESS(
            f'Ajouté : {len(encadrants)} encadrants, {len(stagiaires)} stagiaires, {nb_stages} stages, '
            f'{nb_documents} documents (e-mails en @{DOMAINE}). '
            'Pour les retirer : python manage.py donnees_demo --supprimer'
        ))

    def creer_documents(self, stages):
        """Documents selon l'avancement du stage : convention dès l'affectation, attestation et rapport
        une fois le stage terminé. Les stages qui ont déjà des documents sont ignorés."""
        rng = random.Random(1789)
        nb = 0
        for stage in stages.select_related('stagiaire', 'tuteur', 'service').filter(documents__isnull=True):
            st = stage.stagiaire
            nom_complet = f'{st.prenom} {st.nom}'
            tuteur = f'{stage.tuteur.prenom} {stage.tuteur.nom}' if stage.tuteur else 'non assigné'
            periode = f'Du {stage.date_debut.strftime(FORMAT_DATE)} au {stage.date_fin.strftime(FORMAT_DATE)}'
            a_creer = []
            if stage.statut != 'ANNULEE':
                a_creer.append(('CONVENTIONS', f'Convention de stage - {nom_complet}', 'Convention de stage', [
                    f'Stagiaire : {nom_complet} ({st.niveau_etudes})',
                    f'Intitulé : {stage.intitule}',
                    f'Service d\'accueil : {stage.service.nom}',
                    f'Encadrant : {tuteur}',
                    periode,
                    '',
                    'La mairie s\'engage à accueillir le stagiaire et à lui confier',
                    'des missions en rapport avec sa formation.',
                ]))
            if stage.statut in ('VALIDE', 'TERMINE'):
                a_creer.append(('ATTESTATION', f'Attestation de présence - {nom_complet}', 'Attestation de présence', [
                    'Le service des ressources humaines atteste que',
                    f'{nom_complet} a effectué un stage au sein du {stage.service.nom},',
                    periode.lower() + '.',
                    '',
                    f'Encadrant : {tuteur}',
                ]))
            if stage.statut == 'VALIDE':
                a_creer.append(('RAPPORT', f'Rapport de stage - {nom_complet}', 'Rapport de stage', [
                    f'Auteur : {nom_complet}',
                    f'Intitulé : {stage.intitule}',
                    f'Service : {stage.service.nom}',
                    periode,
                    '',
                    'Sommaire : 1. Présentation de la mairie  2. Missions réalisées',
                    '3. Compétences acquises  4. Conclusion',
                ]))
                if rng.random() < 0.25:
                    a_creer.append(('AUTRE', f"Fiche d'évaluation - {nom_complet}", "Fiche d'évaluation", [
                        f'Stagiaire : {nom_complet}',
                        f'Note obtenue : {stage.gratification} / 20',
                        f'Évaluateur : {tuteur}',
                    ]))
            for type_doc, nom, titre, lignes in a_creer:
                doc = Document(
                    nom_fichier=nom,
                    type_doc=type_doc,
                    type_precision=titre if type_doc == 'AUTRE' else '',
                    stage=stage,
                )
                fichier = f'demo_{type_doc.lower()}_{stage.id}.pdf'
                doc.chemin_fichier.save(fichier, ContentFile(pdf_simple(titre, lignes)), save=False)
                doc.save()
                nb += 1
        return nb

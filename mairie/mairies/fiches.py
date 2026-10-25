"""Fiche de notes de stage au format PDF, générée à la clôture du stage (validation par l'agent RH).

Le PDF est construit à la main (une page A4, police Helvetica), sans bibliothèque externe.
"""

import textwrap

FORMAT_DATE = '%d/%m/%Y'

# Couleurs (RVB 0-1)
BLEU = (0.145, 0.388, 0.922)
BLEU_NUIT = (0.118, 0.227, 0.541)
GRIS = (0.39, 0.44, 0.54)
GRIS_CLAIR = (0.90, 0.92, 0.95)
NOIR = (0.04, 0.07, 0.14)


def mention(note):
    n = float(note or 0)
    if n >= 16:
        return 'Très bien'
    if n >= 14:
        return 'Bien'
    if n >= 12:
        return 'Assez bien'
    if n >= 10:
        return 'Passable'
    return 'Insuffisant'


def _nom(user):
    if not user:
        return '—'
    return f'{user.prenom} {user.nom}'.strip() or user.email or user.username


def _texte(t):
    t = str(t).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    return t.encode('cp1252', 'replace')


class _Page:
    """Petit outil de dessin : accumule les opérateurs PDF d'une page."""

    def __init__(self):
        self.ops = []

    def couleur(self, rgb, trait=False):
        self.ops.append(('%.3f %.3f %.3f ' % rgb + ('RG' if trait else 'rg')).encode())

    def rect(self, x, y, w, h, rgb):
        self.couleur(rgb)
        self.ops.append(f'{x} {y} {w} {h} re f'.encode())

    def ligne(self, x1, y1, x2, y2, rgb, epaisseur=1):
        self.couleur(rgb, trait=True)
        self.ops.append(f'{epaisseur} w {x1} {y1} m {x2} {y2} l S'.encode())

    def texte(self, x, y, contenu, taille=11, gras=False, rgb=NOIR):
        self.couleur(rgb)
        police = 'F2' if gras else 'F1'
        self.ops.append(b'BT /' + police.encode() + f' {taille} Tf {x} {y} Td ('.encode() + _texte(contenu) + b') Tj ET')

    def flux(self):
        return b'\n'.join(self.ops) + b'\n'


def _assembler(page):
    flux = page.flux()
    objets = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
        b'/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
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
    sortie += (
        b'trailer\n<< /Size ' + str(len(objets) + 1).encode() + b' /Root 1 0 R >>\nstartxref\n'
        + str(xref).encode() + b'\n%%EOF\n'
    )
    return sortie


def generer_fiche_notes(stage):
    """Retourne le contenu PDF (bytes) de la fiche de notes du stage."""
    st = stage.stagiaire
    etab = st.etablissement.nom if st.etablissement else '—'
    p = _Page()

    # Bandeau
    p.rect(0, 772, 595, 70, BLEU_NUIT)
    p.texte(48, 812, 'MAIRIE', 18, gras=True, rgb=(1, 1, 1))
    p.texte(48, 793, 'Service des ressources humaines — Gestion des stagiaires', 10, rgb=(0.80, 0.86, 1))
    p.texte(400, 812, f'Réf. STG-{stage.id:04d}', 10, gras=True, rgb=(1, 1, 1))
    date_cloture = stage.valide_rh_le.strftime(FORMAT_DATE) if stage.valide_rh_le else '—'
    p.texte(400, 795, f'Établie le {date_cloture}', 10, rgb=(0.80, 0.86, 1))

    # Titre
    p.texte(48, 735, 'FICHE DE NOTES DE STAGE', 20, gras=True, rgb=NOIR)
    p.texte(48, 715, stage.intitule, 12, rgb=GRIS)
    p.ligne(48, 703, 547, 703, BLEU, 2)

    y = 678

    def section(titre):
        nonlocal y
        p.texte(48, y, titre.upper(), 10, gras=True, rgb=BLEU)
        y -= 8
        p.ligne(48, y, 547, y, GRIS_CLAIR)
        y -= 18

    def ligne(libelle, valeur):
        nonlocal y
        p.texte(48, y, libelle, 10, rgb=GRIS)
        p.texte(190, y, valeur or '—', 11, rgb=NOIR)
        y -= 18

    section('1. Stagiaire')
    ligne('Nom et prénom', f'{st.nom.upper()} {st.prenom}')
    ligne('Établissement', etab)
    ligne("Niveau d'études", st.niveau_etudes)
    ligne('Contact', f'{st.email}' + (f'  ·  {st.telephone}' if st.telephone else ''))
    y -= 8

    section('2. Stage')
    ligne('Service d\'accueil', stage.service.nom)
    ligne('Encadrant', _nom(stage.tuteur))
    ligne('Période', f'du {stage.date_debut.strftime(FORMAT_DATE)} au {stage.date_fin.strftime(FORMAT_DATE)}')
    y -= 8

    section('3. Évaluation')
    # Encadré de la note
    p.rect(48, y - 52, 160, 62, GRIS_CLAIR)
    p.texte(62, y - 8, 'NOTE FINALE', 9, gras=True, rgb=GRIS)
    note = float(stage.gratification or 0)
    p.texte(62, y - 38, f'{note:.2f}'.rstrip('0').rstrip('.') + ' / 20', 24, gras=True, rgb=BLEU_NUIT)
    p.rect(224, y - 52, 160, 62, GRIS_CLAIR)
    p.texte(238, y - 8, 'MENTION', 9, gras=True, rgb=GRIS)
    p.texte(238, y - 38, mention(note), 18, gras=True, rgb=BLEU_NUIT)
    y -= 78

    p.texte(48, y, "Appréciation de l'encadrant", 10, gras=True, rgb=GRIS)
    y -= 18
    for paragraphe in (stage.appreciation or '—').splitlines() or ['—']:
        for morceau in textwrap.wrap(paragraphe, 92) or ['']:
            p.texte(48, y, morceau, 10.5, rgb=NOIR)
            y -= 15
            if y < 190:
                break
    y -= 12

    section('4. Validations')
    evalue = stage.evalue_le.strftime(FORMAT_DATE) if stage.evalue_le else '—'
    ligne("Évalué par l'encadrant", f'{_nom(stage.evalue_par)} — le {evalue}')
    ligne("Validé par l'agent RH", f'{_nom(stage.valide_rh_par)} — le {date_cloture}')
    ligne('Statut', 'Terminé')

    # Pied
    p.ligne(48, 70, 547, 70, GRIS_CLAIR)
    p.texte(48, 52, 'Document généré automatiquement à la clôture du stage — Gestion des stagiaires', 8.5, rgb=GRIS)

    return _assembler(p)

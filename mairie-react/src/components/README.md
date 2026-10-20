# Composants

Composants React réutilisables, rangés par rôle. Les écrans complets (une page = une adresse) sont dans `src/pages/`.

| Dossier | Contenu | Composants |
|---|---|---|
| `layout/` | Structure de l'application, autour des pages | `Navbar` (barre du haut), `Sidebar` (menu), `AuthLayout` (écrans de connexion et mot de passe oublié) |
| `ui/` | Briques d'interface génériques, sans logique métier | `Icon`, `Avatar`, `EmptyState`, `Modal` |
| `utilisateurs/` | Comptes et droits d'accès | `UserFormModal` (création / modification d'un compte), `InvitationNotice` (résultat de l'envoi des identifiants), `AccessMatrix` (droits par rôle) |
| `stages/` | Stages et évaluations | `FicheNoteStage` (fiche de note imprimable) |
| `services/` | Services municipaux | `ServiceGlyph` (icône d'un service selon son type) |

## Où ranger un nouveau composant ?

- Il est générique et pourrait servir dans n'importe quelle application (bouton, badge, onglets…) : **`ui/`**.
- Il fait partie du cadre de l'application (menu, en-tête, mise en page) : **`layout/`**.
- Il est lié à un domaine précis : le dossier du domaine (**`utilisateurs/`**, **`stages/`**, **`services/`**…), à créer s'il n'existe pas encore (par ex. `messagerie/`, `documents/`).

Import depuis une page : `import Icon from "../components/ui/Icon";`

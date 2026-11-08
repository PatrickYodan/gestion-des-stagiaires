// Messages de chargement propres à chaque écran (et au rôle connecté), utilisés par <LoadingState>.
//   icon   : icône de l'écran (voir components/ui/Icon.jsx)
//   titre  : texte principal, ou fonction (utilisateur) => texte pour l'adapter au rôle
//   etapes : ce qui est récupéré, affiché tour à tour pendant les premières secondes
const estTuteur = (u) => u?.role === "TUTEUR";

export const CHARGEMENTS = {
  tableau: {
    icon: "trending",
    titre: (u) => (estTuteur(u) ? "Préparation de votre tableau de bord" : "Calcul des statistiques"),
    etapes: ["Comptage des stages de l'année", "Répartition mois par mois", "Préparation du graphique"],
  },
  stagiaires: {
    icon: "graduation",
    titre: (u) => (estTuteur(u) ? "Chargement de vos stagiaires" : "Chargement des stagiaires"),
    etapes: ["Récupération des dossiers", "Établissements et filières", "Préparation de la liste"],
  },
  tuteurs: {
    icon: "userCheck",
    titre: "Chargement des encadrants",
    etapes: ["Récupération des encadrants", "Services de rattachement", "Préparation de la liste"],
  },
  stages: {
    icon: "clipboard",
    titre: "Chargement des stages",
    etapes: ["Récupération des affectations", "Avancement de chaque stage", "Préparation de la liste"],
  },
  services: {
    icon: "building",
    titre: "Chargement des services",
    etapes: ["Récupération des services", "Encadrants et stagiaires accueillis", "Préparation des fiches"],
  },
  etablissements: {
    icon: "landmark",
    titre: "Chargement des établissements",
    etapes: ["Récupération des établissements", "Coordonnées et localisation", "Préparation des fiches"],
  },
  documents: {
    icon: "folder",
    titre: (u) => (estTuteur(u) ? "Chargement des documents de vos stagiaires" : "Chargement des documents"),
    etapes: ["Conventions et attestations", "Rapports de stage", "Préparation des fiches"],
  },
  utilisateurs: {
    icon: "users",
    titre: "Chargement des comptes",
    etapes: ["Récupération des comptes", "Rôles et statuts", "Préparation de la liste"],
  },
  acces: {
    icon: "shield",
    titre: "Chargement des droits d'accès",
    etapes: ["Matrice des rôles", "Niveaux par module"],
  },
  journal: {
    icon: "archive",
    titre: "Chargement du journal d'activité",
    etapes: ["Dernières actions", "Auteurs et dates"],
  },
  compte: {
    icon: "user",
    titre: (u) => (u?.prenom ? `Chargement de votre profil, ${u.prenom}` : "Chargement de votre profil"),
    etapes: ["Informations personnelles", "Photo et coordonnées"],
  },
};

// Messages d'attente quand le serveur tarde (après LENT_S, puis TRES_LENT_S secondes)
export const LENT_S = 5;
export const TRES_LENT_S = 12;
export const MESSAGE_LENT = "Le serveur met un peu plus de temps que d'habitude…";
export const MESSAGE_TRES_LENT = "Toujours en cours. Si cela persiste, vérifiez votre connexion.";

// Libellé lisible du rôle
export const ROLE_LABELS = {
  ADMIN: "Administrateur",
  RH: "Ressources humaines",
  TUTEUR: "Encadrant",
};

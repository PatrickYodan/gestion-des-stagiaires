// Workflow de validation d'un stage, partagé par les pages Stagiaires, Stages et la fiche de notes.
//   EN_COURS  -> l'encadrant ajoute les documents puis évalue le stagiaire
//   VALIDE    -> évalué par l'encadrant, en attente de la validation de l'agent RH
//   TERMINE   -> validé par l'agent RH : stage clôturé, fiche de notes établie

export const STATUTS = {
  EN_ATTENTE: { label: "En attente", badge: "badge-warning" },
  EN_COURS: { label: "En cours", badge: "badge-blue" },
  VALIDE: { label: "À valider (RH)", badge: "badge-violet" },
  TERMINE: { label: "Terminé", badge: "badge-success" },
  ANNULEE: { label: "Annulé", badge: "badge-danger" },
};

// Statuts que l'on peut choisir à la main dans le formulaire (les autres viennent du workflow)
export const STATUTS_MANUELS = ["EN_ATTENTE", "EN_COURS", "ANNULEE"];

// Documents attendus dans le dossier d'un stage
export const DOCUMENTS_REQUIS = [
  { type: "CONVENTIONS", label: "Convention de stage" },
  { type: "ATTESTATION", label: "Attestation de présence" },
  { type: "RAPPORT", label: "Rapport de stage" },
];

export const mentionOf = (note) => {
  const n = Number(note);
  if (n >= 16) return "Très bien";
  if (n >= 14) return "Bien";
  if (n >= 12) return "Assez bien";
  if (n >= 10) return "Passable";
  return "Insuffisant";
};

// Étape en cours du workflow (1 à 4), 0 si le stage n'a pas démarré ou est annulé
export const etapeCourante = (stage, documents = []) => {
  if (!stage) return 0;
  if (stage.statut === "TERMINE") return 5; // tout est fait
  if (stage.statut === "VALIDE") return 3;
  if (stage.statut === "EN_COURS") {
    const complet = DOCUMENTS_REQUIS.every((d) => documents.some((doc) => doc.type_doc === d.type));
    return complet ? 2 : 1;
  }
  return 0;
};

const finAtteinte = (stage) => {
  const fin = new Date(stage.date_fin);
  fin.setHours(23, 59, 59);
  return fin <= new Date();
};

// Action attendue de l'utilisateur sur ce stage (pastille « À faire »), ou null
export const actionAttendue = (stage, user) => {
  if (!stage || !user) return null;
  const estEncadrant = stage.tuteur === user.id;
  const estRH = user.role === "RH" || user.role === "ADMIN";
  if (stage.statut === "EN_COURS" && estEncadrant && finAtteinte(stage)) return "À évaluer";
  if (stage.statut === "EN_COURS" && estEncadrant && stage.motif_retour)
    return stage.motif_retour.startsWith("Stage rouvert : ") ? "Rouvert : à réévaluer" : "Renvoyé par les RH";
  if (stage.statut === "VALIDE" && estRH) return "À valider";
  return null;
};

export { finAtteinte };

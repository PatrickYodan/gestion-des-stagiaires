// Coordonnées GPS saisies sous la forme « latitude, longitude »
const GPS = /^\s*-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?\s*$/;

// Recherche envoyée à la carte : coordonnées GPS telles quelles, sinon nom + localisation + ville
export const etabMapQuery = (etab) => {
  const loc = (etab.localisation || "").trim();
  if (GPS.test(loc)) return loc.replace(/\s+/g, "");
  return [etab.nom, loc, etab.ville].filter(Boolean).join(", ");
};

export const isGps = (value) => GPS.test(value || "");

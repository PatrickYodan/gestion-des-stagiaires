// Icône et couleur d'un service municipal, déduites des mots-clés de son nom (puis de sa description).
// Les règles sont testées dans l'ordre : la première qui correspond l'emporte.
const RULES = [
  { icon: "monitor", tone: "tone-blue", keys: ["informatique", "numerique", "digital", "systeme d'information", "reseau", "\\bit\\b", "\\bdsi\\b"] },
  { icon: "users", tone: "tone-violet", keys: ["ressources humaines", "\\brh\\b", "\\bgrh\\b", "personnel", "recrutement", "carriere"] },
  { icon: "mail", tone: "tone-amber", keys: ["courrier", "correspondance", "bureau d'ordre", "\\bposte\\b", "expedition"] },
  { icon: "idCard", tone: "tone-teal", keys: ["etat civil", "etat-civil", "naissance", "mariage", "deces", "\\bpieces? d'identite"] },
  { icon: "megaphone", tone: "tone-rose", keys: ["communication", "presse", "relations publiques", "medias?\\b", "evenementiel"] },
  { icon: "wallet", tone: "tone-green", keys: ["financ", "comptab", "budget", "tresor", "\\bpaie\\b", "recette", "fiscal", "impot", "taxe"] },
  { icon: "hardHat", tone: "tone-orange", keys: ["urbanisme", "travaux", "technique", "batiment", "genie civil", "voirie", "cadastre", "foncier", "amenagement"] },
  { icon: "truck", tone: "tone-slate", keys: ["transport", "logistique", "parc auto", "garage", "mobilite", "materiel roulant"] },
  { icon: "leaf", tone: "tone-green", keys: ["environnement", "espaces? verts?", "proprete", "hygiene", "salubrite", "dechet", "jardin"] },
  { icon: "droplet", tone: "tone-cyan", keys: ["\\beaux?\\b", "assainissement", "hydraul"] },
  { icon: "music", tone: "tone-rose", keys: ["culture", "\\barts?\\b", "musique", "bibliotheque", "mediatheque", "spectacle"] },
  { icon: "trophy", tone: "tone-amber", keys: ["sport", "jeunesse", "loisir"] },
  { icon: "book", tone: "tone-blue", keys: ["education", "enseignement", "scolaire", "ecole", "formation", "alphabetisation"] },
  { icon: "heart", tone: "tone-rose", keys: ["social", "\\bccas\\b", "solidarite", "famille", "enfance", "personnes agees", "handicap"] },
  { icon: "activity", tone: "tone-rose", keys: ["sante", "medic", "sanitaire", "infirmerie", "dispensaire"] },
  { icon: "scale", tone: "tone-slate", keys: ["juridique", "contentieux", "\\blegal", "affaires juridiques", "marches publics"] },
  { icon: "shield", tone: "tone-slate", keys: ["securite", "police", "gardiennage", "protection civile", "surete"] },
  { icon: "archive", tone: "tone-amber", keys: ["archive", "documentation", "classement"] },
  { icon: "store", tone: "tone-orange", keys: ["commerce", "marche", "economi", "artisanat", "entreprise"] },
  { icon: "mapPin", tone: "tone-cyan", keys: ["tourisme", "patrimoine", "jumelage"] },
  { icon: "headset", tone: "tone-teal", keys: ["accueil", "guichet", "relation usagers?", "citoyen", "standard"] },
  { icon: "briefcase", tone: "tone-violet", keys: ["secretariat", "administrati", "cabinet", "direction", "affaires generales", "\\bsg\\b"] },
];

const DEFAULT = { icon: "building", tone: "tone-violet" };

// Minuscules et sans accents : « État civil » -> « etat civil »
const normalize = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const COMPILED = RULES.map((rule) => ({ ...rule, regex: new RegExp(rule.keys.join("|")) }));

export const serviceVisual = (service) => {
  if (!service) return DEFAULT;
  // Le nom est prioritaire sur la description
  for (const text of [service.nom, service.description]) {
    const value = normalize(text);
    if (!value) continue;
    const match = COMPILED.find((rule) => rule.regex.test(value));
    if (match) return { icon: match.icon, tone: match.tone };
  }
  return DEFAULT;
};

// Formate une date "AAAA-MM-JJ" (ou ISO) sans décalage de fuseau horaire
export const formatDate = (value, options = { day: "numeric", month: "short", year: "numeric" }) => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", options);
};

// Note de stage (champ « gratification » côté API), sur 20
export const NOTE_MAX = 20;

// 0 est la valeur par défaut en base : on la considère comme « non notée »
export const isNoted = (value) => Number(value) > 0;

export const formatNote = (value) =>
  `${Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} / ${NOTE_MAX}`;

export const noteBadge = (value) => {
  const n = Number(value);
  if (n >= 14) return "badge-success";
  if (n >= 10) return "badge-blue";
  return "badge-danger";
};

// Transforme une erreur DRF ({champ: ["message"]}) en texte lisible
export const apiErrorMessage = (err, fallback = "Une erreur est survenue.") => {
  const data = err?.response?.data;
  if (!data) return "Impossible de joindre le serveur.";
  if (typeof data === "string") return fallback;
  if (data.detail) return data.detail;
  const parts = Object.entries(data).map(([field, msgs]) => {
    const text = Array.isArray(msgs) ? msgs.join(" ") : String(msgs);
    return field === "non_field_errors" ? text : `${field} : ${text}`;
  });
  return parts.length ? parts.join(" — ") : fallback;
};

// Nom affiché : prénom + nom, sinon l'e-mail (compte pas encore finalisé), sinon l'identifiant
export const fullName = (person) => {
  if (!person) return "";
  const name = `${person.prenom || ""} ${person.nom || ""}`.trim();
  return name || person.email || person.username || "";
};

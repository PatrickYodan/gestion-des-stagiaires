import { useEffect, useState } from "react";

// Adresse (URL) de chaque onglet de l'application
export const ROUTES = {
  dashboard: "/dashboard",
  stagiaires: "/stagiaires",
  tuteurs: "/encadrants",
  stages: "/stages",
  services: "/services",
  utilisateurs: "/utilisateurs",
  documents: "/documents",
  messagerie: "/messagerie",
  compte: "/mon-compte",
};

// Pages hors application : connexion et finalisation du compte (première connexion)
export const LOGIN_PATH = "/login";
export const FIRST_LOGIN_PATH = "/premiere-connexion";
export const FORGOT_PATH = "/mot-de-passe-oublie";
export const RESET_PATH = "/reinitialiser-mot-de-passe";
// Pages accessibles sans être connecté
export const PUBLIC_PATHS = [LOGIN_PATH, FORGOT_PATH, RESET_PATH];

const NAVIGATE_EVENT = "app:navigate";

// Segments de l'adresse : "/services/etablissements" -> ["services", "etablissements"]
export const pathSegments = (path) => path.split("/").filter(Boolean);

// Onglet correspondant à une adresse (null si l'adresse est inconnue).
// « / » n'est associé à aucun onglet : l'application redirige vers la première page autorisée (/dashboard).
export const tabFromPath = (path) => {
  const first = pathSegments(path)[0];
  if (!first) return null;
  const entry = Object.entries(ROUTES).find(
    ([, route]) => route === `/${first}`,
  );
  return entry ? entry[0] : null;
};

// Change l'adresse sans recharger la page (replace : remplace l'entrée de l'historique)
export const navigate = (path, { replace = false } = {}) => {
  if (path === window.location.pathname + window.location.search) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
};

// Adresse courante, mise à jour par navigate() et par les boutons Précédent / Suivant du navigateur
export const usePath = () => {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener(NAVIGATE_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAVIGATE_EVENT, update);
    };
  }, []);
  return path;
};

// Clic sur un lien interne : navigation dans l'application, sauf Ctrl/Cmd/Maj/clic molette (nouvel onglet)
export const handleLinkClick = (e, path, after) => {
  if (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  )
    return;
  e.preventDefault();
  navigate(path);
  after?.();
};

import { useEffect, useState } from "react";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Navbar from "./components/layout/Navbar";
import Sidebar from "./components/layout/Sidebar";
import Dashboard from "./pages/Dashboard";
import Stagiaires from "./pages/Stagiaires";
import Tuteurs from "./pages/Tuteurs";
import Stages from "./pages/Stages";
import Services from "./pages/Services";
import Utilisateurs from "./pages/Utilisateurs";
import Documents from "./pages/Documents";
import MonCompte from "./pages/MonCompte";
import Messagerie from "./pages/Messagerie";
import PremiereConnexion from "./pages/PremiereConnexion";
import MotDePasseOublie from "./pages/MotDePasseOublie";
import ReinitialiserMotDePasse from "./pages/ReinitialiserMotDePasse";
import {
  FIRST_LOGIN_PATH,
  FORGOT_PATH,
  LOGIN_PATH,
  PUBLIC_PATHS,
  RESET_PATH,
  ROUTES,
  navigate,
  tabFromPath,
  usePath,
} from "./utils/router";

const TABS = Object.keys(ROUTES);

// Titre affiché dans la barre du haut (et l'onglet du navigateur) pour chaque page
const TITLES = {
  dashboard: "Tableau de bord",
  stagiaires: "Gestion des Stagiaires",
  tuteurs: "Liste des Encadrants",
  stages: "Affectations & Stages",
  services: "Services & Établissements",
  utilisateurs: "Gestion des Utilisateurs",
  documents: "Documents & Attestations",
  messagerie: "Messagerie",
  compte: "Mon compte",
};

function App() {
  const { user, can, accessReady } = useAuth();
  // L'onglet affiché est déterminé par l'adresse (ex. /stagiaires), ce qui permet
  // de recharger la page, de partager un lien et d'utiliser Précédent / Suivant.
  const path = usePath();
  const activeTab = tabFromPath(path);
  const setActiveTab = (tab) => navigate(ROUTES[tab]);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile : menu ouvert par-dessus
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  }); // ordinateur : barre réduite aux icônes

  const ready = Boolean(user && !user.doit_changer_mdp && accessReady);
  // Onglet réellement affiché : celui de l'adresse s'il est autorisé, sinon le premier accessible
  const currentTab = ready
    ? activeTab && can(activeTab)
      ? activeTab
      : TABS.find((t) => can(t))
    : null;

  const mustFinishAccount = Boolean(user?.doit_changer_mdp);

  // Correction de l'adresse selon l'état de connexion (sans ajouter d'entrée à l'historique)
  useEffect(() => {
    // Non connecté : formulaire de connexion sur /login, en mémorisant la page demandée
    if (!user) {
      // Les pages « mot de passe oublié » restent accessibles sans connexion
      if (!PUBLIC_PATHS.includes(path)) {
        const asked = path !== "/" && path !== FIRST_LOGIN_PATH ? `?redirect=${encodeURIComponent(path)}` : "";
        navigate(LOGIN_PATH + asked, { replace: true });
      }
      return;
    }
    // Compte avec mot de passe provisoire : page de première connexion
    if (mustFinishAccount) {
      if (path !== FIRST_LOGIN_PATH) navigate(FIRST_LOGIN_PATH + window.location.search, { replace: true });
      return;
    }
    if (!currentTab) return;
    // Juste après la connexion : page demandée avant la connexion (si autorisée), sinon la page par défaut
    if (PUBLIC_PATHS.includes(path) || path === FIRST_LOGIN_PATH) {
      const asked = new URLSearchParams(window.location.search).get("redirect");
      const askedTab = asked && tabFromPath(asked);
      navigate(askedTab && can(askedTab) ? asked : ROUTES[currentTab], { replace: true });
      return;
    }
    // Adresse inconnue ou onglet non autorisé
    if (currentTab !== activeTab) navigate(ROUTES[currentTab], { replace: true });
  }, [user, mustFinishAccount, path, currentTab, activeTab, can]);

  // Titre de l'onglet du navigateur
  useEffect(() => {
    document.title = currentTab
      ? `${TITLES[currentTab]} — Gestion des Stagiaires`
      : !user
        ? `${path === FORGOT_PATH ? "Mot de passe oublié" : path === RESET_PATH ? "Nouveau mot de passe" : "Connexion"} — Gestion des Stagiaires`
        : mustFinishAccount
          ? "Première connexion — Gestion des Stagiaires"
          : "Gestion des Stagiaires — Mairie";
  }, [currentTab, user, mustFinishAccount, path]);

  if (!user) {
    if (path === FORGOT_PATH) return <MotDePasseOublie />;
    if (path === RESET_PATH) return <ReinitialiserMotDePasse />;
    return <Login />;
  }

  // Compte créé avec un mot de passe provisoire : identité + nouveau mot de passe d'abord
  if (user.doit_changer_mdp) {
    return <PremiereConnexion />;
  }

  if (!accessReady) {
    return (
      <div className="app-loading">
        <span className="spinner spinner-dark" />
        Chargement de votre espace…
      </div>
    );
  }

  const titles = {
    ...TITLES,
    stagiaires: user.role === "TUTEUR" ? "Mes Stagiaires" : TITLES.stagiaires,
  };

  // Le bouton menu ouvre le tiroir sur mobile, et réduit/déplie la barre sur ordinateur
  const handleMenuClick = () => {
    if (window.matchMedia("(max-width: 960px)").matches) {
      setSidebarOpen(true);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("sidebar_collapsed", next ? "1" : "0");
    } catch {
      // stockage indisponible : l'état ne sera simplement pas mémorisé
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeTab={currentTab}
        open={sidebarOpen}
        collapsed={collapsed}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-main">
        <Navbar
          onMenuClick={handleMenuClick}
          collapsed={collapsed}
          onAccountClick={() => setActiveTab("compte")}
          title={titles[currentTab]}
        />

        <main className="app-content">
          {currentTab === "dashboard" && <Dashboard />}
          {currentTab === "stagiaires" && <Stagiaires />}
          {currentTab === "tuteurs" && <Tuteurs />}
          {currentTab === "stages" && <Stages />}
          {currentTab === "services" && <Services />}
          {currentTab === "utilisateurs" && <Utilisateurs />}
          {currentTab === "documents" && <Documents />}
          {currentTab === "messagerie" && <Messagerie />}
          {currentTab === "compte" && <MonCompte />}
        </main>
      </div>
    </div>
  );
}

export default App;

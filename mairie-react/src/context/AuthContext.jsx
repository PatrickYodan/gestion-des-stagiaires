import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";
import { LOGIN_PATH, navigate } from "../utils/router";

const AuthContext = createContext(null);

// Droits utilisés si l'API des accès est indisponible (identiques aux valeurs par défaut du backend)
// Niveaux : 0 = aucun accès, 1 = lecture seule, 2 = accès complet
const FALLBACK_MATRICE = {
  RH: { dashboard: 1, stagiaires: 2, tuteurs: 2, stages: 2, services: 2, documents: 2 },
  TUTEUR: { dashboard: 1, stagiaires: 1, tuteurs: 0, stages: 0, services: 0, documents: 2 },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(
    localStorage.getItem("access_token") || null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("user_info");
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, [token]);

  // Droits d'accès du rôle connecté (matrice gérée par l'administrateur)
  const [access, setAccess] = useState(null);
  // Les droits sont rechargés après la première connexion (l'API les refuse avant)
  const userKey = user && !user.doit_changer_mdp ? `${user.id}-${user.role}` : null;

  useEffect(() => {
    if (!userKey) return;
    api
      .get("acces/")
      .then((res) => setAccess(res.data))
      .catch(() => setAccess({ matrice: FALLBACK_MATRICE }));
  }, [userKey]);

  const isAdmin = user?.role === "ADMIN";

  // can("stages")     -> l'onglet est-il visible ? (lecture au minimum)
  // can("stages", 2)  -> l'utilisateur peut-il créer / modifier / supprimer ?
  const can = (module, level = 1) => {
    if (!user) return false;
    // Mon compte et la messagerie sont accessibles à tous les utilisateurs connectés
    if (module === "compte" || module === "messagerie") return true;
    if (isAdmin) return true;
    if (module === "utilisateurs") return false;
    const niveau = access?.matrice?.[user.role]?.[module] ?? 0;
    return niveau >= level;
  };

  const login = (data) => {
    localStorage.setItem("access_token", data.access);
    localStorage.setItem("refresh_token", data.refresh);

    const userInfo = {
      id: data.id,
      username: data.username,
      email: data.email,
      nom: data.nom,
      prenom: data.prenom,
      role: data.role,
      photo: data.photo, // URL de la photo
      doit_changer_mdp: Boolean(data.doit_changer_mdp), // première connexion à finaliser
    };

    localStorage.setItem("user_info", JSON.stringify(userInfo));
    setToken(data.access);
    setUser(userInfo);
  };

  // Permet de mettre à jour la photo ou les infos utilisateur à la volée
  const updateUser = (updatedData) => {
    const newInfo = { ...user, ...updatedData };
    localStorage.setItem("user_info", JSON.stringify(newInfo));
    setUser(newInfo);
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_info");
    setToken(null);
    setUser(null);
    setAccess(null);
    // Retour au formulaire de connexion (sans mémoriser la page quittée)
    navigate(LOGIN_PATH);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        updateUser,
        loading,
        access,
        accessReady: Boolean(access),
        setAccess,
        can,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useAuth doit être utilisé à l'intérieur d'un AuthProvider",
    );
  }
  return context;
};
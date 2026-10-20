import axios from "axios";

// L'API Django est jointe sur la même machine que celle qui sert l'application :
// localhost depuis le poste de développement, 192.168.x.x depuis un autre appareil du réseau.
// VITE_API_URL (fichier .env de Vite) permet de forcer une autre adresse.
const apiHost = window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname;
const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${apiHost}:8000/api/`;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user_info");
      // Session expirée : retour au formulaire de connexion, en mémorisant la page en cours
      if (window.location.pathname !== "/login") {
        const page = window.location.pathname;
        window.location.href = page === "/" ? "/login" : `/login?redirect=${encodeURIComponent(page)}`;
      }
    }
    return Promise.reject(error);
  },
);

export default api;

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import TopProgress from "./components/ui/TopProgress";
import ConfirmHost from "./components/ui/ConfirmHost";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";
import { startTableLabels } from "./utils/tableLabels";

// Libellés de colonnes pour l'affichage des tableaux en cartes sur téléphone
startTableLabels();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TopProgress />
    {/* Fenêtre de confirmation commune (suppression, réinitialisation…) */}
    <ConfirmHost />
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);

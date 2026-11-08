import { useEffect, useState } from "react";
import Icon from "./Icon";
import { useAuth } from "../../context/AuthContext";
import { CHARGEMENTS, LENT_S, MESSAGE_LENT, MESSAGE_TRES_LENT, TRES_LENT_S } from "../../utils/chargements";

// Chargement personnalisé d'un écran : un bandeau dit CE qui est chargé (adapté au rôle),
// fait défiler ce qui est récupéré, puis prévient si le serveur tarde.
// La silhouette du contenu attendu (squelette) est passée en enfant et s'affiche dessous.
// Le bandeau n'apparaît qu'après un court délai (CSS) : rien ne clignote sur une réponse rapide.
const ETAPE_MS = 1500; // durée d'affichage de chaque étape

function LoadingState({ contexte, children }) {
  const { user } = useAuth();
  const config = CHARGEMENTS[contexte] || { icon: "clock", titre: "Chargement", etapes: [] };
  const titre = typeof config.titre === "function" ? config.titre(user) : config.titre;
  const [ecoule, setEcoule] = useState(0); // millisecondes depuis le début du chargement

  useEffect(() => {
    const debut = Date.now();
    const timer = setInterval(() => setEcoule(Date.now() - debut), 500);
    return () => clearInterval(timer);
  }, []);

  const secondes = ecoule / 1000;
  const lent = secondes >= LENT_S;
  const message =
    secondes >= TRES_LENT_S
      ? MESSAGE_TRES_LENT
      : lent
        ? MESSAGE_LENT
        : config.etapes[Math.min(Math.floor(ecoule / ETAPE_MS), config.etapes.length - 1)] || "";
  const nbEtapes = config.etapes.length;
  const etapeCourante = Math.min(Math.floor(ecoule / ETAPE_MS), nbEtapes - 1);

  return (
    <div className="loading-state" role="status" aria-live="polite" aria-busy="true">
      <div className={`loading-banner ${lent ? "is-slow" : ""}`}>
        <span className="loading-banner-icon" aria-hidden="true">
          <span className="loading-banner-ring" />
          <Icon name={config.icon} size={18} />
        </span>
        <div className="loading-banner-text">
          <strong>{titre}</strong>
          {/* La clé relance le fondu à chaque nouveau message */}
          <span key={message}>{message}</span>
        </div>
        {nbEtapes > 1 && !lent && (
          <span className="loading-banner-steps" aria-hidden="true">
            {config.etapes.map((_, i) => (
              <i key={i} className={i < etapeCourante ? "is-done" : i === etapeCourante ? "is-current" : ""} />
            ))}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export default LoadingState;

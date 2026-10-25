import { useRef } from "react";
import Icon from "../ui/Icon";
import Particles from "./Particles";
import Footer from "./Footer";
import StageJourney from "./StageJourney";
import Logo from "../ui/Logo";

// Mise en page des écrans hors connexion (connexion, mot de passe oublié, réinitialisation) :
// panneau de présentation à gauche, contenu à droite.
function AuthLayout({ children }) {
  const asideRef = useRef(null);

  // Halo et parallaxe : position de la souris transmise au CSS (sans re-rendu React).
  // --mx / --my : position en pixels ; --px / --py : décalage de -1 à 1 depuis le centre.
  const suivreSouris = (e) => {
    if (e.pointerType !== "mouse") return; // pas d'effet au doigt
    const el = asideRef.current;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    el.style.setProperty("--px", ((x / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--py", ((y / r.height) * 2 - 1).toFixed(3));
    el.classList.add("is-pointer");
  };

  const quitter = () => {
    const el = asideRef.current;
    el.style.setProperty("--px", "0");
    el.style.setProperty("--py", "0");
    el.classList.remove("is-pointer");
  };

  return (
    <div className="login">
      <aside className="login-aside" ref={asideRef} onPointerMove={suivreSouris} onPointerLeave={quitter}>
        {/* Halo lumineux qui suit la souris */}
        <div className="login-spotlight" aria-hidden="true" />
        {/* Particules sur trois plans de profondeur */}
        <Particles />
        {/* Animation du parcours d'un stage, derrière l'accroche */}
        <StageJourney />
        <div className="login-brand">
          <div className="brand-mark">
            <Logo size={40} />
          </div>
          <div>
            <div className="brand-name">Gestion des Stagiaires</div>
            <div className="brand-sub">Mairie</div>
          </div>
        </div>

        <div className="login-pitch">
          <h2>Suivez chaque stage, du premier jour à l'attestation.</h2>
          <p>
            Une plateforme unique pour les ressources humaines, les encadrants
            et l'administration municipale.
          </p>
          <ul className="login-features">
            <li>
              <span className="feature-icon">
                <Icon name="graduation" size={17} />
              </span>
              Dossiers des stagiaires centralisés
            </li>
            <li>
              <span className="feature-icon">
                <Icon name="building" size={17} />
              </span>
              Affectations par service et encadrant
            </li>
            <li>
              <span className="feature-icon">
                <Icon name="shield" size={17} />
              </span>
              Accès sécurisé selon votre rôle
            </li>
          </ul>
        </div>

        <div className="login-legal">
          © {new Date().getFullYear()} Mairie — Service des ressources humaines
        </div>
      </aside>

      <main className="login-panel">
        {children}
        <Footer className="app-footer-auth" />
      </main>
    </div>
  );
}

export default AuthLayout;

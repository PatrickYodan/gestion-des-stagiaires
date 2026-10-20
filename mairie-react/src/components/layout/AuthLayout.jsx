import Icon from "../ui/Icon";

// Mise en page des écrans hors connexion (connexion, mot de passe oublié, réinitialisation) :
// panneau de présentation à gauche, contenu à droite.
function AuthLayout({ children }) {
  return (
    <div className="login">
      <aside className="login-aside">
        <div className="login-brand">
          <div className="brand-mark">
            <Icon name="landmark" size={20} />
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

      <main className="login-panel">{children}</main>
    </div>
  );
}

export default AuthLayout;

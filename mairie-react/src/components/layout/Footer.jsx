// Pied de page affiché sous le contenu de l'application et sur les écrans de connexion
function Footer({ className = "" }) {
  return (
    <footer className={`app-footer ${className}`}>
      <span>© 2026 Gestion des stagiaires. Tous droits réservés.</span>
      <span className="app-footer-sep" aria-hidden="true">•</span>
      <span>
        Développé par <strong>Patrick Yodan</strong>
      </span>
    </footer>
  );
}

export default Footer;

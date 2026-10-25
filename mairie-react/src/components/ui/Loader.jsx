import Logo from "./Logo";

// Écran de chargement : logo de l'application entouré d'un anneau qui tourne, message et,
// si une durée est donnée, une barre qui se remplit pendant ce temps.
function Loader({ label = "Chargement…", greeting = "", duration = 0 }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader-mark">
        <span className="loader-ring" />
        <Logo size={64} />
      </div>
      {greeting && <div className="loader-greeting">{greeting}</div>}
      <div className="loader-label">
        {label}
        <span className="loader-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      {duration > 0 && (
        <div className="loader-progress" aria-hidden="true">
          <span style={{ animationDuration: `${duration}ms` }} />
        </div>
      )}
    </div>
  );
}

export default Loader;

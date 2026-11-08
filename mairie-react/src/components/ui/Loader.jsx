import Logo from "./Logo";
import Icon from "./Icon";

// Écran de chargement : logo de l'application entouré d'un anneau qui tourne, message et,
// si une durée est donnée, une barre qui se remplit pendant ce temps.
// Après la connexion, il est personnalisé : salutation avec le prénom, rôle, et la liste de
// ce qui est préparé (steps : [{ label, done }]) qui se coche au fur et à mesure.
function Loader({ label = "Chargement…", greeting = "", subtitle = "", steps = [], duration = 0 }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader-mark">
        <span className="loader-ring" />
        <Logo size={64} />
      </div>
      {greeting && <div className="loader-greeting">{greeting}</div>}
      {subtitle && <div className="loader-subtitle">{subtitle}</div>}
      {steps.length > 0 ? (
        <ul className="loader-steps">
          {steps.map((s, i) => (
            <li key={s.label} className={s.done ? "is-done" : ""} style={{ "--i": i }}>
              {/* Pastille d'attente, recouverte par la coche (apparition décalée d'une étape à l'autre) */}
              <span className="loader-step-dot" aria-hidden="true">
                <span className="loader-step-spin" />
                {s.done && (
                  <span className="loader-step-check">
                    <Icon name="check" size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
              {s.label}
            </li>
          ))}
        </ul>
      ) : (
        <div className="loader-label">
          {label}
          <span className="loader-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      {duration > 0 && (
        <div className="loader-progress" aria-hidden="true">
          <span style={{ animationDuration: `${duration}ms` }} />
        </div>
      )}
    </div>
  );
}

export default Loader;

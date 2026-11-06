import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { enregistrerHote } from "../../utils/confirm";

// Affiche les demandes de confirmation de l'application (voir utils/confirm.js).
// Échap ou clic à côté : annuler. Entrée : confirmer. Pour une action destructive,
// le bouton « Annuler » a le focus par défaut, pour éviter une suppression par réflexe.
function ConfirmHost() {
  const [demande, setDemande] = useState(null);
  const annulerRef = useRef(null);
  const confirmerRef = useRef(null);

  useEffect(() => enregistrerHote((d) => setDemande(d)), []);

  const repondre = (ok) => {
    demande?.resolve(ok);
    setDemande(null);
  };

  useEffect(() => {
    if (!demande) return undefined;
    (demande.danger ? annulerRef : confirmerRef).current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        repondre(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande]);

  if (!demande) return null;

  const danger = Boolean(demande.danger);
  const icon = demande.icon || (danger ? "trash" : "alert");

  return createPortal(
    <div className="modal-overlay confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && repondre(false)}>
      <div
        className={`modal confirm-dialog ${danger ? "is-danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titre"
        aria-describedby="confirm-message"
      >
        <div className="confirm-body">
          <span className="confirm-icon" aria-hidden="true">
            <Icon name={icon} size={22} />
          </span>
          <h3 id="confirm-titre" className="confirm-titre">
            {demande.titre}
          </h3>
          {demande.message && (
            <p id="confirm-message" className="confirm-message">
              {demande.message}
            </p>
          )}
          {demande.details && (
            <div className="confirm-details">
              <Icon name="alert" size={15} />
              <span>{demande.details}</span>
            </div>
          )}
        </div>
        <div className="confirm-actions">
          <button ref={annulerRef} type="button" className="btn btn-secondary" onClick={() => repondre(false)}>
            {demande.annuler || "Annuler"}
          </button>
          <button
            ref={confirmerRef}
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => repondre(true)}
          >
            {demande.confirmer || "Confirmer"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ConfirmHost;

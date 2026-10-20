import { useEffect } from "react";
import Icon from "./Icon";

// Fenêtre modale contenant un formulaire (en-tête, corps défilant, pied d'actions)
function Modal({
  title,
  subtitle,
  onClose,
  onSubmit,
  children,
  submitLabel = "Enregistrer",
  saving = false,
  error = "",
  size = 600,
}) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="modal"
        style={{ maxWidth: size }}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{title}</h3>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={onClose}
            aria-label="Fermer"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}
          {children}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Modal;

import { useEffect, useState } from "react";
import api from "../../api/axios";
import Icon from "./Icon";
import EmptyState from "./EmptyState";
import { apiErrorMessage, formatDate } from "../../utils/format";
import { confirmer } from "../../utils/confirm";

// Corbeille : éléments supprimés (encadrants, comptes, stagiaires) et leur restauration.
// Les suppressions sont « douces » : les données sont toujours en base, la restauration les fait réapparaître.
//   url       : point d'API de la corbeille (ex. "utilisateurs/supprimes/?role=TUTEUR")
//   restaurer : (id) => point d'API de restauration (ex. `utilisateurs/${id}/restaurer/`)
//   libelle   : nom de l'élément au singulier (« encadrant », « compte », « stagiaire »)
function Corbeille({ titre, url, restaurer, libelle, detail, onClose, onRestaure }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api
      .get(url)
      .then((res) => setItems(res.data))
      .catch((err) => {
        setItems([]);
        setError(apiErrorMessage(err, "Impossible de charger les éléments supprimés."));
      });
  }, [url]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const restaurerItem = async (item) => {
    const ok = await confirmer({
      titre: `Restaurer ce ${libelle} ?`,
      message: item.nom,
      details:
        libelle === "stagiaire"
          ? "Il réapparaîtra dans la liste, avec ses stages et ses documents."
          : "Le compte réapparaîtra et la personne pourra de nouveau se connecter avec son mot de passe.",
      confirmer: "Restaurer",
      icon: "check",
    });
    if (!ok) return;
    setBusy(item.id);
    setError("");
    try {
      const res = await api.post(restaurer(item.id));
      setItems((list) => list.filter((x) => x.id !== item.id));
      setMessage(`${item.nom} a été restauré(e).`);
      onRestaure?.(res.data);
    } catch (err) {
      setError(apiErrorMessage(err, "La restauration a échoué."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal corbeille-modal" role="dialog" aria-modal="true" aria-label={titre}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{titre}</h3>
            <p className="modal-subtitle">
              Les éléments supprimés restent enregistrés : vous pouvez les restaurer à tout moment.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Fermer">
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
          {message && (
            <div className="alert alert-success" role="status">
              <Icon name="check" size={18} />
              <span>{message}</span>
            </div>
          )}

          {items === null ? (
            [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 58, marginBottom: 8 }} />)
          ) : items.length === 0 ? (
            <EmptyState icon="archive" title="La corbeille est vide" description={`Aucun ${libelle} supprimé.`} />
          ) : (
            <ul className="corbeille-list">
              {items.map((item) => (
                <li key={item.id}>
                  <span className="corbeille-avatar">
                    {item.nom
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0].toUpperCase())
                      .join("")}
                  </span>
                  <div className="corbeille-info">
                    <strong>{item.nom}</strong>
                    <span>{[item.email, detail?.(item)].filter(Boolean).join(" · ")}</span>
                    <small>
                      Supprimé{item.supprime_le ? ` le ${formatDate(item.supprime_le)}` : ""}
                      {item.supprime_par ? ` par ${item.supprime_par}` : ""}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => restaurerItem(item)}
                    disabled={busy === item.id}
                  >
                    {busy === item.id ? <span className="spinner spinner-dark" /> : <Icon name="archive" size={14} />}
                    Restaurer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default Corbeille;

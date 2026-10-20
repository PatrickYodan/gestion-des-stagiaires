import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import { etabMapQuery, isGps } from "../../utils/etablissement";

// Fenêtre affichant la position d'un établissement sur une carte Google Maps
function EtablissementMap({ etablissement, nbStagiaires = 0, onClose }) {
  const [loaded, setLoaded] = useState(false);
  const query = etabMapQuery(etablissement);
  const q = encodeURIComponent(query);
  const precise = isGps(etablissement.localisation);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal etab-map-modal" role="dialog" aria-modal="true" aria-label={`Position de ${etablissement.nom}`}>
        <div className="modal-header">
          <div className="person" style={{ minWidth: 0 }}>
            <div className="entity-icon tone-teal" style={{ width: 40, height: 40 }}>
              <Icon name="graduation" size={19} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 className="modal-title">{etablissement.nom}</h3>
              <p className="modal-subtitle">
                <Icon name="mapPin" size={12} /> {etablissement.ville}
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="x" size={18} />
          </button>
        </div>

        {etablissement.localisation && (
          <div className="etab-map-localisation">
            <Icon name="mapPin" size={15} />
            <div>
              <strong>Localisation</strong>
              <span>{etablissement.localisation}</span>
            </div>
          </div>
        )}

        <div className="etab-map">
          {!loaded && (
            <div className="etab-map-loading">
              <span className="spinner spinner-dark" /> Chargement de la carte…
            </div>
          )}
          <iframe
            title={`Carte : ${query}`}
            src={`https://maps.google.com/maps?q=${q}&z=15&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setLoaded(true)}
          />
        </div>

        <div className="etab-map-info">
          <span className="contact">
            <Icon name="mail" size={14} />
            <a href={`mailto:${etablissement.email_contact}`}>{etablissement.email_contact}</a>
          </span>
          {etablissement.telephone && (
            <span className="contact">
              <Icon name="phone" size={14} />
              <a href={`tel:${etablissement.telephone}`}>{etablissement.telephone}</a>
            </span>
          )}
          <span className="badge badge-teal">
            {nbStagiaires} stagiaire{nbStagiaires > 1 ? "s" : ""}
          </span>
        </div>

        <div className="modal-footer">
          <span className="etab-map-hint">
            {precise
              ? "Position exacte (coordonnées GPS)."
              : etablissement.localisation
                ? "Position d'après la localisation renseignée."
                : "Position approximative : renseignez la localisation de l'école pour plus de précision."}
          </span>
          <a
            className="btn btn-secondary"
            href={`https://www.google.com/maps/search/?api=1&query=${q}`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external" size={15} /> Ouvrir dans Google Maps
          </a>
          <a
            className="btn btn-primary"
            href={`https://www.google.com/maps/dir/?api=1&destination=${q}`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="mapPin" size={15} /> Itinéraire
          </a>
        </div>
      </div>
    </div>
  );
}

export default EtablissementMap;

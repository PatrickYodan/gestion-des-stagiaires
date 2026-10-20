import { useState, useEffect } from "react";
import api from "../api/axios";
import { navigate, pathSegments, usePath } from "../utils/router";
import { useAuth } from "../context/AuthContext";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import { serviceVisual } from "../utils/serviceIcons";
import Modal from "../components/ui/Modal";
import EtablissementMap from "../components/services/EtablissementMap";
import { etabMapQuery } from "../utils/etablissement";
import { apiErrorMessage } from "../utils/format";

const emptyService = { nom: "", description: "" };
const emptyEtab = { nom: "", ville: "", localisation: "", email_contact: "", telephone: "" };

const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

function Services() {
  const { can } = useAuth();
  const canEdit = can("services", 2); // accès complet : création, modification, suppression
  // Sous-onglet lu dans l'adresse : /services ou /services/etablissements
  const path = usePath();
  const tab = pathSegments(path)[1] === "etablissements" ? "etablissements" : "services";
  const setTab = (t) => navigate(t === "etablissements" ? "/services/etablissements" : "/services");
  const [services, setServices] = useState([]);
  const [etablissements, setEtablissements] = useState([]);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [stages, setStages] = useState([]);
  const [stagiaires, setStagiaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Formulaire partagé : { kind: "service" | "etablissement", item }
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  // Établissement dont on affiche la position sur la carte
  const [mapEtab, setMapEtab] = useState(null);

  const loadData = () =>
    Promise.all([
      api.get("services/"),
      api.get("etablissements/"),
      api.get("utilisateurs/"),
      api.get("stages/"),
      api.get("stagiaires/"),
    ])
      .then(([resSrv, resEtab, resUsers, resStages, resStagiaires]) => {
        setServices(resSrv.data);
        setEtablissements(resEtab.data);
        setUtilisateurs(resUsers.data);
        setStages(resStages.data);
        setStagiaires(resStagiaires.data);
        setError("");
      })
      .catch(() => setError("Impossible de charger les services et établissements."))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadData();
  }, []);

  const openForm = (kind, item = null) => {
    const base = kind === "service" ? emptyService : emptyEtab;
    const values = item
      ? Object.fromEntries(Object.keys(base).map((k) => [k, item[k] ?? ""]))
      : base;
    setFormData(values);
    setFormError("");
    setEditing({ kind, item });
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Remplit la localisation avec la position GPS de l'appareil (utile quand on est sur place)
  const [locating, setLocating] = useState(false);
  const fillMyPosition = () => {
    if (!navigator.geolocation) {
      setFormError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setFormData((f) => ({ ...f, localisation: `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}` }));
        setFormError("");
        setLocating(false);
      },
      () => {
        setFormError(
          "Position introuvable : autorisez la localisation dans le navigateur (elle n'est possible qu'en HTTPS ou sur localhost).",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const endpoint = (kind) => (kind === "service" ? "services/" : "etablissements/");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { kind, item } = editing;
      if (item) {
        await api.put(`${endpoint(kind)}${item.id}/`, formData);
      } else {
        await api.post(endpoint(kind), formData);
      }
      setEditing(null);
      loadData();
    } catch (err) {
      setFormError(apiErrorMessage(err, "Erreur lors de l'enregistrement."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (kind, item, warning) => {
    if (!window.confirm(`Supprimer « ${item.nom} » ?${warning ? `\n\n${warning}` : ""}`)) return;
    try {
      await api.delete(`${endpoint(kind)}${item.id}/`);
      loadData();
    } catch (err) {
      alert(apiErrorMessage(err, "Erreur lors de la suppression."));
    }
  };

  const query = search.trim().toLowerCase();
  const matches = (...values) =>
    !query || values.filter(Boolean).join(" ").toLowerCase().includes(query);

  const filteredServices = services.filter((s) => matches(s.nom, s.description));
  const filteredEtabs = etablissements.filter((e) =>
    matches(e.nom, e.ville, e.localisation, e.email_contact, e.telephone),
  );

  const isServices = tab === "services";

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Référentiel</div>
          <h2 className="page-title">Services & Établissements</h2>
          <p className="page-subtitle">
            Services municipaux d'accueil et établissements d'origine des stagiaires
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => openForm(isServices ? "service" : "etablissement")}
            className="btn btn-primary"
          >
            <Icon name="plus" size={18} />
            <span className="btn-label">
              {isServices ? "Nouveau service" : "Nouvel établissement"}
            </span>
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="Type de référentiel">
            <button
              role="tab"
              aria-selected={isServices}
              className={isServices ? "active" : ""}
              onClick={() => setTab("services")}
            >
              Services ({services.length})
            </button>
            <button
              role="tab"
              aria-selected={!isServices}
              className={!isServices ? "active" : ""}
              onClick={() => setTab("etablissements")}
            >
              Établissements ({etablissements.length})
            </button>
          </div>
          <div className="search">
            <Icon name="search" size={16} />
            <input
              className="input"
              placeholder={isServices ? "Rechercher un service…" : "Rechercher un établissement, une ville…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="entity-grid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 150 }} />
            ))}
          </div>
        ) : isServices ? (
          filteredServices.length === 0 ? (
            <EmptyState
              icon="building"
              title={services.length ? "Aucun résultat" : "Aucun service"}
              description={
                services.length
                  ? "Aucun service ne correspond à votre recherche."
                  : "Ajoutez les services municipaux qui accueillent des stagiaires."
              }
            />
          ) : (
            <div className="entity-grid services-grid">
              {filteredServices.map((srv, i) => {
                const nbTuteurs = utilisateurs.filter((u) => u.role === "TUTEUR" && u.service === srv.id).length;
                const srvStages = stages.filter((s) => s.service === srv.id);
                const nbEnCours = srvStages.filter((s) => s.statut === "EN_COURS").length;
                const visual = serviceVisual(srv); // icône + couleur selon le type de service
                return (
                  <div
                    key={srv.id}
                    className={`entity-card ${visual.tone}`}
                    style={{ "--i": Math.min(i, 12) }} // rang pour l'apparition en cascade
                  >
                    <div className="entity-card-head">
                      <div className="entity-icon">
                        <Icon name={visual.icon} size={20} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="entity-title">{srv.nom}</div>
                        <div className="entity-desc">
                          {srv.description || "Aucune description."}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="row-actions">
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={() => openForm("service", srv)}
                            aria-label={`Modifier ${srv.nom}`}
                            title="Modifier"
                          >
                            <Icon name="pencil" size={15} />
                          </button>
                          <button
                            className="btn btn-danger-ghost btn-sm btn-icon"
                            onClick={() =>
                              handleDelete(
                                "service",
                                srv,
                                srvStages.length
                                  ? `Attention : ${plural(srvStages.length, "stage")} rattaché(s) à ce service seront aussi supprimés.`
                                  : "",
                              )
                            }
                            aria-label={`Supprimer ${srv.nom}`}
                            title="Supprimer"
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="entity-meta">
                      <span className="badge">
                        <Icon name="userCheck" size={13} /> {plural(nbTuteurs, "tuteur")}
                      </span>
                      <span className="badge">
                        <Icon name="clipboard" size={13} /> {plural(srvStages.length, "stage")}
                      </span>
                      {nbEnCours > 0 && (
                        <span className="badge badge-blue badge-dot">{nbEnCours} en cours</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : filteredEtabs.length === 0 ? (
          <EmptyState
            icon="graduation"
            title={etablissements.length ? "Aucun résultat" : "Aucun établissement"}
            description={
              etablissements.length
                ? "Aucun établissement ne correspond à votre recherche."
                : "Ajoutez les écoles et universités d'origine des stagiaires."
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Établissement</th>
                  <th>Contact</th>
                  <th>Téléphone</th>
                  <th className="num">Stagiaires</th>
                  {canEdit && <th className="col-actions">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredEtabs.map((etab) => {
                  const nb = stagiaires.filter((s) => s.etablissement === etab.id).length;
                  return (
                    <tr
                      key={etab.id}
                      className="row-clickable"
                      onClick={() => setMapEtab(etab)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          setMapEtab(etab);
                        }
                      }}
                      tabIndex={0}
                      title="Voir la position sur la carte"
                    >
                      <td>
                        <div className="person">
                          <div className="entity-icon tone-teal" style={{ width: 36, height: 36 }}>
                            <Icon name="graduation" size={17} />
                          </div>
                          <div>
                            <div className="person-name">{etab.nom}</div>
                            <div className="person-meta">
                              <Icon name="mapPin" size={12} /> {etab.ville}
                              <span className="map-link">Voir sur la carte</span>
                            </div>
                            {etab.localisation && (
                              <div className="person-meta etab-localisation" title={etab.localisation}>
                                {etab.localisation}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="contact" title={etab.email_contact}>
                          <Icon name="mail" size={14} />
                          <span className="truncate">{etab.email_contact}</span>
                        </span>
                      </td>
                      <td>
                        {etab.telephone ? (
                          <span className="contact">
                            <Icon name="phone" size={14} />
                            {etab.telephone}
                          </span>
                        ) : (
                          <span className="muted">Non renseigné</span>
                        )}
                      </td>
                      <td className="num">
                        <span className="badge badge-teal">{nb}</span>
                      </td>
                      {canEdit && (
                        <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="row-actions">
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => openForm("etablissement", etab)}
                              aria-label={`Modifier ${etab.nom}`}
                              title="Modifier"
                            >
                              <Icon name="pencil" size={15} />
                            </button>
                            <button
                              className="btn btn-danger-ghost btn-sm btn-icon"
                              onClick={() =>
                                handleDelete(
                                  "etablissement",
                                  etab,
                                  nb ? `${plural(nb, "stagiaire")} n'auront plus d'établissement associé.` : "",
                                )
                              }
                              aria-label={`Supprimer ${etab.nom}`}
                              title="Supprimer"
                            >
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mapEtab && (
        <EtablissementMap
          etablissement={mapEtab}
          nbStagiaires={stagiaires.filter((st) => st.etablissement === mapEtab.id).length}
          onClose={() => setMapEtab(null)}
        />
      )}

      {editing?.kind === "service" && (
        <Modal
          title={editing.item ? "Modifier le service" : "Nouveau service"}
          subtitle="Service municipal pouvant accueillir des stagiaires."
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
          size={520}
        >
          <div className="form-grid">
            <div className="field span-2">
              <label className="label" htmlFor="nom">Nom du service</label>
              <input id="nom" name="nom" className="input" value={formData.nom} onChange={handleChange} required placeholder="ex. État civil" />
            </div>
            <div className="field span-2">
              <label className="label" htmlFor="description">
                Description <span className="optional">(facultatif)</span>
              </label>
              <textarea id="description" name="description" className="input" value={formData.description} onChange={handleChange} />
            </div>
          </div>
        </Modal>
      )}

      {editing?.kind === "etablissement" && (
        <Modal
          title={editing.item ? "Modifier l'établissement" : "Nouvel établissement"}
          subtitle="École, université ou centre de formation d'origine."
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
        >
          <div className="form-grid">
            <div className="field span-2">
              <label className="label" htmlFor="nom">Nom de l'établissement</label>
              <input id="nom" name="nom" className="input" value={formData.nom} onChange={handleChange} required />
            </div>
            <div className="field span-2">
              <label className="label" htmlFor="ville">Ville</label>
              <input id="ville" name="ville" className="input" value={formData.ville} onChange={handleChange} required />
            </div>
            <div className="field span-2">
              <label className="label" htmlFor="localisation">
                Localisation <span className="optional">(facultatif)</span>
              </label>
              <textarea
                id="localisation"
                name="localisation"
                className="input"
                style={{ minHeight: 70 }}
                value={formData.localisation}
                onChange={handleChange}
                placeholder="ex. Cocody Riviera 2, rue des Jardins, en face de la pharmacie — ou coordonnées GPS : 5.3600, -3.9500"
              />
              <div className="localisation-tools">
                <span className="field-hint">
                  Quartier, rue, point de repère ou coordonnées GPS, pour situer l'école sur la carte.
                </span>
                <div className="row-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={fillMyPosition} disabled={locating}>
                    {locating ? <span className="spinner spinner-dark" /> : <Icon name="mapPin" size={14} />}
                    Ma position actuelle
                  </button>
                  {(formData.localisation || formData.nom) && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(etabMapQuery(formData))}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="external" size={14} /> Vérifier sur la carte
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="email_contact">Email de contact</label>
              <input id="email_contact" type="email" name="email_contact" className="input" value={formData.email_contact} onChange={handleChange} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="telephone">
                Téléphone <span className="optional">(facultatif)</span>
              </label>
              <input id="telephone" type="tel" name="telephone" className="input" value={formData.telephone} onChange={handleChange} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Services;

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
import { SkeletonCards } from "../components/ui/Skeleton";

const emptyService = { nom: "", description: "" };
const emptyEtab = { nom: "", ville: "", localisation: "", email_contact: "", telephone: "" };

const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

// Palette de 12 teintes bien distinctes, ordonnées pour que deux cartes voisines
// ne se ressemblent jamais (bleu, orange, vert, rose, violet, jaune…)
const PALETTE = [
  { tone: "#2563eb", soft: "#dbeafe" }, // bleu
  { tone: "#ea580c", soft: "#ffedd5" }, // orange
  { tone: "#059669", soft: "#d1fae5" }, // émeraude
  { tone: "#e11d48", soft: "#ffe4e6" }, // rose
  { tone: "#7c3aed", soft: "#ede9fe" }, // violet
  { tone: "#ca8a04", soft: "#fef9c3" }, // jaune moutarde
  { tone: "#0891b2", soft: "#cffafe" }, // cyan
  { tone: "#c026d3", soft: "#fae8ff" }, // fuchsia
  { tone: "#65a30d", soft: "#ecfccb" }, // vert anis
  { tone: "#4338ca", soft: "#e0e7ff" }, // indigo
  { tone: "#0d9488", soft: "#ccfbf1" }, // sarcelle
  { tone: "#92400e", soft: "#fef3c7" }, // brun
];

// Couleur d'un élément selon son rang (par identifiant) dans la liste complète :
// chacun a sa propre teinte, et elle ne change pas quand on filtre ou recherche.
const colorOf = (items, id) => {
  const rank = [...items].sort((a, b) => a.id - b.id).findIndex((x) => x.id === id);
  const c = PALETTE[Math.max(rank, 0) % PALETTE.length];
  return { "--tone": c.tone, "--tone-soft": c.soft };
};

// Monogramme : initiales des deux premiers mots significatifs (« Institut Supérieur » → « IS »)
const monogram = (nom = "") =>
  nom
    .split(/[\s'-]+/)
    .filter((w) => w.length > 2 || /^[A-Z0-9]+$/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

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
          <SkeletonCards count={6} />
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
            <div className="org-grid">
              {filteredServices.map((srv, i) => {
                const nbTuteurs = utilisateurs.filter((u) => u.role === "TUTEUR" && u.service === srv.id).length;
                const srvStages = stages.filter((s) => s.service === srv.id);
                const nbEnCours = srvStages.filter((s) => s.statut === "EN_COURS").length;
                const visual = serviceVisual(srv); // icône selon le type de service
                const activite = srvStages.length ? Math.round((nbEnCours / srvStages.length) * 100) : 0;
                return (
                  <article
                    key={srv.id}
                    className="org-card"
                    // rang pour l'apparition en cascade + couleur propre au service
                    style={{ "--i": Math.min(i, 12), ...colorOf(services, srv.id) }}
                  >
                    <header className="org-head">
                      <span className="org-icon">
                        <Icon name={visual.icon} size={22} />
                      </span>
                      <div className="org-titles">
                        <h3 className="org-name" title={srv.nom}>{srv.nom}</h3>
                        <p className="org-desc">{srv.description || "Aucune description."}</p>
                      </div>
                      {canEdit && (
                        <div className="org-tools">
                          <button
                            className="org-tool"
                            onClick={() => openForm("service", srv)}
                            aria-label={`Modifier ${srv.nom}`}
                            title="Modifier"
                          >
                            <Icon name="pencil" size={14} />
                          </button>
                          <button
                            className="org-tool danger"
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
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      )}
                    </header>

                    <div className="org-stats">
                      <div className="org-stat">
                        <strong>{nbTuteurs}</strong>
                        <span>Encadrant{nbTuteurs > 1 ? "s" : ""}</span>
                      </div>
                      <div className="org-stat">
                        <strong>{srvStages.length}</strong>
                        <span>Stage{srvStages.length > 1 ? "s" : ""}</span>
                      </div>
                      <div className={`org-stat ${nbEnCours ? "is-live" : ""}`}>
                        <strong>{nbEnCours}</strong>
                        <span>En cours</span>
                      </div>
                    </div>

                    <div className="org-activity" title={`${activite}% des stages du service sont en cours`}>
                      <div className="org-activity-label">
                        <span>Stages en cours</span>
                        <strong>{activite}%</strong>
                      </div>
                      <div className="org-activity-track">
                        <span style={{ width: `${activite}%` }} />
                      </div>
                    </div>
                  </article>
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
          <div className="org-grid">
            {filteredEtabs.map((etab, i) => {
              const nb = stagiaires.filter((st) => st.etablissement === etab.id).length;
              return (
                <article
                  key={etab.id}
                  className="org-card etab-card"
                  style={{ "--i": Math.min(i, 12), ...colorOf(etablissements, etab.id) }}
                >
                  <header className="org-head">
                    <span className="org-monogram" aria-hidden="true">{monogram(etab.nom)}</span>
                    <div className="org-titles">
                      <h3 className="org-name" title={etab.nom}>{etab.nom}</h3>
                      <p className="org-city">
                        <Icon name="mapPin" size={13} /> {etab.ville}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="org-tools">
                        <button
                          className="org-tool"
                          onClick={() => openForm("etablissement", etab)}
                          aria-label={`Modifier ${etab.nom}`}
                          title="Modifier"
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          className="org-tool danger"
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
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    )}
                  </header>

                  {etab.localisation && (
                    <p className="etab-loc" title={etab.localisation}>
                      {etab.localisation}
                    </p>
                  )}

                  <ul className="etab-contacts">
                    <li>
                      <Icon name="mail" size={14} />
                      <a href={`mailto:${etab.email_contact}`} title={etab.email_contact}>
                        {etab.email_contact}
                      </a>
                    </li>
                    <li>
                      <Icon name="phone" size={14} />
                      {etab.telephone ? (
                        <a href={`tel:${etab.telephone}`}>{etab.telephone}</a>
                      ) : (
                        <span className="muted">Non renseigné</span>
                      )}
                    </li>
                  </ul>

                  <footer className="etab-foot">
                    <span className="etab-count">
                      <Icon name="graduation" size={14} />
                      {plural(nb, "stagiaire")}
                    </span>
                    <button type="button" className="etab-map-btn" onClick={() => setMapEtab(etab)}>
                      <Icon name="mapPin" size={14} /> Voir sur la carte
                    </button>
                  </footer>
                </article>
              );
            })}
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

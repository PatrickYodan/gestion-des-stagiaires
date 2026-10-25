import { useState, useEffect } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import { apiErrorMessage, formatDate, fullName } from "../utils/format";
import { SkeletonCards } from "../components/ui/Skeleton";

const TYPES = {
  CONVENTIONS: { label: "Convention de stage", short: "Conventions", tone: "tone-blue", badge: "badge-blue", icon: "clipboard" },
  ATTESTATION: { label: "Attestation de présence", short: "Attestations", tone: "tone-teal", badge: "badge-teal", icon: "check" },
  RAPPORT: { label: "Rapport de stage", short: "Rapports", tone: "tone-violet", badge: "badge-violet", icon: "briefcase" },
  FICHE_NOTES: { label: "Fiche de notes", short: "Fiches de notes", tone: "tone-blue", badge: "badge-blue", icon: "trophy", auto: true },
  AUTRE: { label: "Autre document", short: "Autres", tone: "tone-slate", badge: "", icon: "folder" },
};

// Initiales affichées dans la pastille du stagiaire (ex. « Esther Aka » → « EA »)
const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

const emptyForm = { nom_fichier: "", type_doc: "CONVENTIONS", type_precision: "", stage: "" };

// Libellé affiché d'un document : le type précisé pour « Autre document »
const typeLabel = (doc) =>
  doc.type_doc === "AUTRE" && doc.type_precision ? doc.type_precision : (TYPES[doc.type_doc] || TYPES.AUTRE).label;

const extensionOf = (url) => {
  const match = String(url || "").split("?")[0].match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : "FICHIER";
};

function Documents() {
  const { user, can } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [stages, setStages] = useState([]);
  const [stagiaires, setStagiaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const isTuteur = user?.role === "TUTEUR";
  // Accès complet au module : ajout et suppression de documents
  const canEdit = can("documents", 2);

  const loadData = () =>
    Promise.all([api.get("documents/"), api.get("stages/"), api.get("stagiaires/")])
      .then(([resDocs, resStages, resStagiaires]) => {
        setDocuments(resDocs.data);
        setStages(resStages.data);
        setStagiaires(resStagiaires.data);
        setError("");
      })
      .catch(() => setError("Impossible de charger les documents."))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadData();
  }, []);

  // Un tuteur ne voit que les stages qu'il encadre (et leurs documents)
  const visibleStages = isTuteur ? stages.filter((s) => s.tuteur === user.id) : stages;
  const visibleStageIds = new Set(visibleStages.map((s) => s.id));
  const visibleDocs = documents.filter((d) => visibleStageIds.has(d.stage));

  const stageLabel = (stageId) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return { title: "Stage inconnu", sub: "" };
    const stagiaire = stagiaires.find((s) => s.id === stage.stagiaire);
    return { title: stage.intitule, sub: fullName(stagiaire) };
  };

  const openForm = () => {
    setFormData(emptyForm);
    setFile(null);
    setFormError("");
    setShowForm(true);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    // Pré-remplit le nom avec celui du fichier (sans extension)
    if (!formData.nom_fichier) {
      setFormData({ ...formData, nom_fichier: selected.name.replace(/\.[^.]+$/, "") });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setFormError("Veuillez sélectionner un fichier.");
      return;
    }
    const data = new FormData();
    data.append("nom_fichier", formData.nom_fichier);
    data.append("type_doc", formData.type_doc);
    data.append("type_precision", formData.type_doc === "AUTRE" ? formData.type_precision.trim() : "");
    data.append("stage", formData.stage);
    data.append("chemin_fichier", file);

    setSaving(true);
    try {
      await api.post("documents/", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setShowForm(false);
      loadData();
    } catch (err) {
      setFormError(apiErrorMessage(err, "Erreur lors de l'envoi du document."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Supprimer le document « ${doc.nom_fichier} » ?`)) return;
    try {
      await api.delete(`documents/${doc.id}/`);
      setDocuments(documents.filter((d) => d.id !== doc.id));
    } catch (err) {
      alert(apiErrorMessage(err, "Erreur lors de la suppression."));
    }
  };

  const counts = visibleDocs.reduce((acc, d) => {
    acc[d.type_doc] = (acc[d.type_doc] || 0) + 1;
    return acc;
  }, {});

  const query = search.trim().toLowerCase();
  const filtered = visibleDocs
    .filter((d) => typeFilter === "ALL" || d.type_doc === typeFilter)
    .filter((d) => {
      if (!query) return true;
      const { title, sub } = stageLabel(d.stage);
      return [d.nom_fichier, d.type_precision, title, sub].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => String(b.date_ajout).localeCompare(String(a.date_ajout)));

  return (
    <div className="docs-page">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Documents</div>
          <h2 className="page-title">Documents & Attestations</h2>
          <p className="page-subtitle">
            {isTuteur
              ? "Documents des stages que vous encadrez"
              : "Conventions, attestations et rapports liés aux stages"}
          </p>
        </div>
        {canEdit && (
          <button onClick={openForm} className="btn btn-primary">
            <Icon name="upload" size={18} />
            <span className="btn-label">Ajouter un document</span>
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
          <div className="chips" role="tablist" aria-label="Filtrer par type">
            <button
              className={`chip ${typeFilter === "ALL" ? "active" : ""}`}
              onClick={() => setTypeFilter("ALL")}
            >
              Tous <span className="chip-count">{visibleDocs.length}</span>
            </button>
            {Object.entries(TYPES).map(([key, t]) => (
              <button
                key={key}
                className={`chip ${typeFilter === key ? "active" : ""}`}
                onClick={() => setTypeFilter(key)}
              >
                {t.short} <span className="chip-count">{counts[key] || 0}</span>
              </button>
            ))}
          </div>
          <div className="search">
            <Icon name="search" size={16} />
            <input
              className="input"
              placeholder="Rechercher un document, un stagiaire…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <SkeletonCards count={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="folder"
            title={visibleDocs.length ? "Aucun résultat" : "Aucun document"}
            description={
              visibleDocs.length
                ? "Aucun document ne correspond à ces filtres."
                : "Les conventions, attestations et rapports ajoutés apparaîtront ici."
            }
          >
            {!visibleDocs.length && visibleStages.length > 0 && canEdit && (
              <button className="btn btn-primary" style={{ marginTop: "1.25rem" }} onClick={openForm}>
                <Icon name="upload" size={18} /> Ajouter un document
              </button>
            )}
          </EmptyState>
        ) : (
          <div className="entity-grid docs-grid">
            {filtered.map((doc, i) => {
              const type = TYPES[doc.type_doc] || TYPES.AUTRE;
              const { title, sub } = stageLabel(doc.stage);
              return (
                <article
                  key={doc.id}
                  className={`doc-card doc-${(TYPES[doc.type_doc] ? doc.type_doc : "AUTRE").toLowerCase()}`}
                  style={{ "--i": Math.min(i, 12) }} // rang pour l'apparition en cascade
                >
                  {/* Couverture colorée selon le type de document */}
                  <div className="doc-cover" aria-hidden="true">
                    <span className="doc-cover-icon">
                      <Icon name={type.icon} size={26} />
                    </span>
                    <span className="doc-cover-ext">{extensionOf(doc.chemin_fichier)}</span>
                  </div>

                  <div className="doc-body">
                    <span className="doc-type" title={typeLabel(doc)}>
                      {typeLabel(doc)}
                    </span>
                    <h3 className="doc-title" title={doc.nom_fichier}>
                      {doc.nom_fichier}
                    </h3>
                    <div className="doc-date">
                      <Icon name="calendar" size={13} /> Ajouté le {formatDate(doc.date_ajout)}
                    </div>

                    <div className="doc-person" title={`${title}${sub ? ` — ${sub}` : ""}`}>
                      <span className="doc-person-avatar">{initials(sub)}</span>
                      <span className="doc-person-text">
                        <strong>{sub || "Stagiaire inconnu"}</strong>
                        <span>{title}</span>
                      </span>
                    </div>
                  </div>

                  <div className="doc-foot">
                    {doc.chemin_fichier ? (
                      <a className="doc-action" href={doc.chemin_fichier} target="_blank" rel="noreferrer">
                        <Icon name="eye" size={15} /> Consulter
                      </a>
                    ) : (
                      <span className="doc-action is-disabled">Fichier indisponible</span>
                    )}
                    {canEdit && (
                      <button
                        className="doc-delete"
                        onClick={() => handleDelete(doc)}
                        title="Supprimer"
                        aria-label={`Supprimer ${doc.nom_fichier}`}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <Modal
          title="Ajouter un document"
          subtitle="Le document sera rattaché au stage sélectionné."
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
          submitLabel="Envoyer"
          size={560}
        >
          <div className="form-grid">
            <label className="upload span-2">
              <div className="upload-preview">
                <Icon name={file ? "fileText" : "upload"} size={22} />
              </div>
              <div className="upload-text">
                <strong>{file ? file.name : "Choisir un fichier"}</strong>
                <span>
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(2)} Mo — cliquez pour changer`
                    : "PDF, Word, image…"}
                </span>
              </div>
              <input type="file" onChange={handleFileChange} />
            </label>

            <div className="field span-2">
              <label className="label" htmlFor="nom_fichier">Nom du document</label>
              <input id="nom_fichier" name="nom_fichier" className="input" value={formData.nom_fichier} onChange={handleChange} required />
            </div>

            <div className="field">
              <label className="label" htmlFor="type_doc">Type</label>
              <select id="type_doc" name="type_doc" className="input" value={formData.type_doc} onChange={handleChange}>
                {Object.entries(TYPES)
                  .filter(([, t]) => !t.auto)
                  .map(([key, t]) => (
                  <option key={key} value={key}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="stage">Stage</label>
              <select id="stage" name="stage" className="input" value={formData.stage} onChange={handleChange} required>
                <option value="">Sélectionner…</option>
                {visibleStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.intitule} — {fullName(stagiaires.find((x) => x.id === s.stagiaire))}
                  </option>
                ))}
              </select>
            </div>

            {/* « Autre document » : champ libre pour préciser le type */}
            {formData.type_doc === "AUTRE" && (
              <div className="field span-2 field-reveal">
                <label className="label" htmlFor="type_precision">Précisez le type de document</label>
                <input
                  id="type_precision"
                  name="type_precision"
                  className="input"
                  value={formData.type_precision}
                  onChange={handleChange}
                  placeholder="ex. Fiche d'évaluation, Certificat médical, Lettre de recommandation…"
                  maxLength={100}
                  list="types-precises"
                  autoFocus
                  required
                />
                <datalist id="types-precises">
                  {[...new Set(documents.map((d) => d.type_precision).filter(Boolean))].map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <span className="field-hint">Ce libellé s'affichera sur la carte du document à la place de « Autre document ».</span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Documents;

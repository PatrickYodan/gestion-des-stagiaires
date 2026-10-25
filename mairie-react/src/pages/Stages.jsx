import { useState, useEffect } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/ui/Avatar";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import ServiceGlyph from "../components/services/ServiceGlyph";
import Modal from "../components/ui/Modal";
import { SkeletonRows } from "../components/ui/Skeleton";
import {
  apiErrorMessage,
  formatDate,
  formatNote,
  fullName,
  isNoted,
  noteBadge,
  NOTE_MAX,
} from "../utils/format";
import StageWorkflow from "../components/stages/StageWorkflow";
import { STATUTS, STATUTS_MANUELS, actionAttendue } from "../utils/workflow";

// Dates courtes dans le tableau (ex. 01/09/2026) pour garder la colonne Période compacte
const SHORT_DATE = { day: "2-digit", month: "2-digit", year: "numeric" };


const emptyForm = {
  intitule: "",
  missions: "",
  date_debut: "",
  date_fin: "",
  gratification: "", // note de stage sur 20 (vide = non notée)
  statut: "EN_ATTENTE",
  stagiaire: "",
  tuteur: "",
  service: "",
};

// Avancement (en %) d'un stage entre sa date de début et sa date de fin
const progressOf = (debut, fin) => {
  const start = new Date(debut).getTime();
  const end = new Date(fin).getTime();
  const now = Date.now();
  if (!start || !end || end <= start) return null;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
};

// Nombre de jours entre aujourd'hui et une date (positif = à venir, négatif = passée)
const daysFromToday = (date) => {
  const d = new Date(date);
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};

const jours = (n) => `${n} j`;

const durationLabel = (debut, fin) => {
  const days = Math.round((new Date(fin) - new Date(debut)) / 86400000) + 1;
  if (!days || days < 1) return "";
  if (days < 14) return `${days} jour${days > 1 ? "s" : ""}`;
  if (days < 60) return `${Math.round(days / 7)} semaines`;
  return `${Math.round(days / 30)} mois`;
};

// Barre de la colonne Période selon le statut du stage :
// tone = couleur, p = remplissage (%), live = rayures animées, left / right = textes sous la barre
const periodBar = (stage) => {
  const duree = durationLabel(stage.date_debut, stage.date_fin);
  const p = progressOf(stage.date_debut, stage.date_fin) ?? 0;
  const avantDebut = daysFromToday(stage.date_debut);
  const avantFin = daysFromToday(stage.date_fin);

  switch (stage.statut) {
    case "EN_COURS":
      if (avantDebut > 0)
        return { tone: "info", p: 0, left: "0%", right: `Débute dans ${jours(avantDebut)}` };
      if (avantFin < 0)
        return { tone: "late", p: 100, left: "100%", right: `Fin dépassée de ${jours(-avantFin)}` };
      return {
        tone: "live",
        p,
        live: true,
        left: `${Math.round(p)}%`,
        right: avantFin === 0 ? "Dernier jour" : `${jours(avantFin)} restant${avantFin > 1 ? "s" : ""}`,
      };
    case "EN_ATTENTE":
      if (avantDebut > 0)
        return {
          tone: "wait",
          p: 0,
          left: "À venir",
          right: avantDebut === 1 ? "Débute demain" : `Débute dans ${jours(avantDebut)}`,
        };
      if (avantDebut === 0) return { tone: "wait", p: 0, left: "À venir", right: "Débute aujourd'hui" };
      return { tone: "wait", p, left: "Non démarré", right: `Prévu depuis ${jours(-avantDebut)}` };
    case "VALIDE":
      return { tone: "review", p: 100, left: "Évalué", right: "En attente RH" };
    case "TERMINE":
      return { tone: "done", p: 100, left: "Terminé", right: duree };
    case "ANNULEE":
      return { tone: "cancel", p: 100, left: "Annulé", right: duree };
    default:
      return { tone: "ended", p, left: `${Math.round(p)}%`, right: duree };
  }
};

function Stages() {
  const { can, user } = useAuth();
  // Accès complet : création, modification, suppression (jamais pour un tuteur, qui ne fait que le suivi)
  const canEdit = can("stages", 2) && user?.role !== "TUTEUR";
  const estRH = user?.role === "RH" || user?.role === "ADMIN";
  const [suivi, setSuivi] = useState(null); // stage dont la fenêtre « Suivi » est ouverte
  const [stages, setStages] = useState([]);
  const [stagiaires, setStagiaires] = useState([]);
  const [tuteurs, setTuteurs] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statutFilter, setStatutFilter] = useState("ALL");

  const [editing, setEditing] = useState(null); // null = fermé, {} = création, {id,...} = édition
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(""); // confirmation après une affectation (encadrant prévenu)

  const loadData = () =>
    Promise.all([
      api.get("stages/"),
      api.get("stagiaires/"),
      api.get("utilisateurs/"),
      api.get("services/"),
    ])
      .then(([resStages, resStagiaires, resUsers, resServices]) => {
        setStages(resStages.data);
        setStagiaires(resStagiaires.data);
        setTuteurs(resUsers.data.filter((u) => u.role === "TUTEUR"));
        setServices(resServices.data);
        setError("");
      })
      .catch(() => setError("Impossible de charger les stages."))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadData();
  }, []);

  const byId = (list, id) => list.find((x) => x.id === id);
  const serviceNom = (id) => byId(services, id)?.nom || "—";

  const openCreate = () => {
    setFormData(emptyForm);
    setFormError("");
    setEditing({});
  };

  const openEdit = (stage) => {
    setFormData({
      ...emptyForm,
      ...stage,
      missions: stage.missions || "",
      gratification: isNoted(stage.gratification) ? String(Number(stage.gratification)) : "",
      tuteur: stage.tuteur ?? "",
    });
    setFormError("");
    setEditing(stage);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.date_fin < formData.date_debut) {
      setFormError("La date de fin doit être postérieure à la date de début.");
      return;
    }

    const payload = {
      intitule: formData.intitule,
      missions: formData.missions,
      date_debut: formData.date_debut,
      date_fin: formData.date_fin,
      gratification: formData.gratification === "" ? 0 : formData.gratification,
      statut: formData.statut,
      stagiaire: Number(formData.stagiaire),
      service: Number(formData.service),
      tuteur: formData.tuteur ? Number(formData.tuteur) : null,
    };

    // Nouvel encadrant (création, ou changement d'encadrant) : le serveur le prévient automatiquement
    const nouvelEncadrant =
      payload.tuteur && (!editing.id || Number(editing.tuteur) !== payload.tuteur)
        ? tuteurs.find((t) => t.id === payload.tuteur)
        : null;

    setSaving(true);
    try {
      if (editing.id) {
        await api.put(`stages/${editing.id}/`, payload);
      } else {
        await api.post("stages/", payload);
      }
      setEditing(null);
      setNotice(
        nouvelEncadrant
          ? `${fullName(nouvelEncadrant)} a été prévenu(e) de cette affectation par message et par e-mail.`
          : "",
      );
      loadData();
    } catch (err) {
      setFormError(apiErrorMessage(err, "Erreur lors de l'enregistrement du stage."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stage) => {
    if (
      !window.confirm(
        `Supprimer le stage « ${stage.intitule} » ?\nLes documents associés seront également supprimés.`,
      )
    )
      return;
    try {
      await api.delete(`stages/${stage.id}/`);
      setStages(stages.filter((s) => s.id !== stage.id));
    } catch (err) {
      alert(apiErrorMessage(err, "Erreur lors de la suppression."));
    }
  };

  const counts = stages.reduce((acc, s) => {
    acc[s.statut] = (acc[s.statut] || 0) + 1;
    return acc;
  }, {});

  const query = search.trim().toLowerCase();
  const filtered = stages.filter((s) => {
    if (statutFilter !== "ALL" && s.statut !== statutFilter) return false;
    if (!query) return true;
    return [
      s.intitule,
      fullName(byId(stagiaires, s.stagiaire)),
      fullName(byId(tuteurs, s.tuteur)),
      serviceNom(s.service),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Stages</div>
          <h2 className="page-title">Affectations & Stages</h2>
          <p className="page-subtitle">
            Affectez les stagiaires à un service et à un tuteur, et suivez l'avancement de chaque stage
          </p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn btn-primary">
            <Icon name="plus" size={18} />
            <span className="btn-label">Nouveau stage</span>
          </button>
        )}
      </div>

      {estRH && stages.some((s) => s.statut === "VALIDE") && (
        <div className="wf-banner">
          <span className="wf-banner-icon">
            <Icon name="shield" size={18} />
          </span>
          <div>
            <strong>
              {stages.filter((s) => s.statut === "VALIDE").length} dossier
              {stages.filter((s) => s.statut === "VALIDE").length > 1 ? "s attendent" : " attend"} votre validation
            </strong>
            <span>Évalués par leur encadrant : vérifiez puis validez pour clôturer le stage et établir la fiche de notes.</span>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setStatutFilter("VALIDE")}>
            Voir les dossiers
          </button>
        </div>
      )}

      {notice && (
        <div className="alert alert-success" role="status">
          <Icon name="check" size={18} />
          <span>{notice}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            style={{ marginLeft: "auto" }}
            onClick={() => setNotice("")}
            aria-label="Fermer"
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="card">
        <div className="toolbar toolbar-stack">
          <div className="toolbar-row">
            <div className="chips" role="tablist" aria-label="Filtrer par statut">
              <button
                className={`chip ${statutFilter === "ALL" ? "active" : ""}`}
                onClick={() => setStatutFilter("ALL")}
              >
                Tous <span className="chip-count">{stages.length}</span>
              </button>
              {Object.entries(STATUTS).map(([key, s]) => (
                <button
                  key={key}
                  className={`chip ${statutFilter === key ? "active" : ""}`}
                  onClick={() => setStatutFilter(key)}
                >
                  {s.label} <span className="chip-count">{counts[key] || 0}</span>
                </button>
              ))}
            </div>
            <div className="search">
              <Icon name="search" size={16} />
              <input
                className="input"
                placeholder="Rechercher un stage, un stagiaire…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={5} columns={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title={stages.length ? "Aucun résultat" : "Aucun stage enregistré"}
            description={
              stages.length
                ? "Aucun stage ne correspond à ces filtres."
                : "Créez une première affectation pour commencer le suivi."
            }
          >
            {!stages.length && canEdit && (
              <button className="btn btn-primary" style={{ marginTop: "1.25rem" }} onClick={openCreate}>
                <Icon name="plus" size={18} /> Nouveau stage
              </button>
            )}
          </EmptyState>
        ) : (
          <div className="table-wrap stages-wrap">
            <table className="table stages-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Stagiaire · Tuteur</th>
                  <th>Période</th>
                  <th>Statut · Note</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((stage, i) => {
                  const stagiaire = byId(stagiaires, stage.stagiaire);
                  const tuteur = byId(tuteurs, stage.tuteur);
                  const statut = STATUTS[stage.statut] || { label: stage.statut, badge: "" };
                  const bar = periodBar(stage);
                  return (
                    <tr key={stage.id} className={`st-${bar.tone}`} style={{ "--i": Math.min(i, 15) }}>
                      <td>
                        <div className="cell-strong cell-clamp" style={{ minWidth: 180, maxWidth: 250 }} title={stage.intitule}>
                          {stage.intitule}
                        </div>
                        <div className="cell-sub truncate" style={{ maxWidth: 250 }} title={serviceNom(stage.service)}>
                          <ServiceGlyph service={byId(services, stage.service)} size={12} />
                          {serviceNom(stage.service)}
                        </div>
                      </td>
                      <td>
                        <div className="person" style={{ minWidth: 190 }}>
                          {stagiaire ? (
                            <Avatar src={stagiaire.photo} prenom={stagiaire.prenom} nom={stagiaire.nom} size={32} />
                          ) : (
                            <Avatar prenom="?" size={32} />
                          )}
                          <div>
                            <div className="person-name truncate" style={{ maxWidth: 185 }} title={fullName(stagiaire)}>
                              {stagiaire ? fullName(stagiaire) : "Stagiaire introuvable"}
                            </div>
                            <div className="person-meta" style={{ maxWidth: 185 }} title={tuteur ? fullName(tuteur) : ""}>
                              <Icon name="userCheck" size={11} />
                              {tuteur ? fullName(tuteur) : "Tuteur non assigné"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="period">
                        <div>
                          <span className="nowrap">{formatDate(stage.date_debut, SHORT_DATE)}</span>{" "}
                          <span className="nowrap">→ {formatDate(stage.date_fin, SHORT_DATE)}</span>
                        </div>
                        <div className={`stage-progress tone-${bar.tone}`} title={`${bar.left} · ${bar.right}`}>
                          <div
                            className="stage-progress-track"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(bar.p)}
                            aria-label="Avancement du stage"
                          >
                            {bar.p > 0 && (
                              <span
                                className={`stage-progress-fill ${bar.live ? "is-live" : ""}`}
                                style={{ "--p": `${bar.p}%` }}
                              />
                            )}
                          </div>
                          <div className="stage-progress-info">
                            <strong>{bar.left}</strong>
                            <span>{bar.right}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="status-stack">
                          <span className={`badge badge-dot ${statut.badge}`}>{statut.label}</span>
                          {isNoted(stage.gratification) ? (
                            <span className={`badge ${noteBadge(stage.gratification)}`}>
                              {formatNote(stage.gratification)}
                            </span>
                          ) : (
                            <span className="status-stack-muted">Non notée</span>
                          )}
                        </div>
                      </td>
                      <td className="col-actions">
                        <div className="row-actions">
                          <button
                            className={`btn btn-sm wf-open ${actionAttendue(stage, user) ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => setSuivi(stage)}
                            title="Suivi du stage : documents, évaluation, validation RH, clôture"
                          >
                            <Icon name="clipboard" size={14} />
                            <span className="btn-label">{actionAttendue(stage, user) || "Suivi"}</span>
                          </button>
                          {canEdit && (
                            <>
                              <button
                                className="btn btn-ghost btn-sm btn-icon"
                                onClick={() => openEdit(stage)}
                                title="Modifier"
                                aria-label={`Modifier ${stage.intitule}`}
                              >
                                <Icon name="pencil" size={15} />
                              </button>
                              <button
                                className="btn btn-danger-ghost btn-sm btn-icon"
                                onClick={() => handleDelete(stage)}
                                title="Supprimer"
                                aria-label={`Supprimer ${stage.intitule}`}
                              >
                                <Icon name="trash" size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {suivi && (
        <StageWorkflow
          stage={suivi}
          stagiaire={byId(stagiaires, suivi.stagiaire)}
          tuteurNom={byId(tuteurs, suivi.tuteur) ? fullName(byId(tuteurs, suivi.tuteur)) : ""}
          serviceNom={serviceNom(suivi.service)}
          onClose={() => setSuivi(null)}
          onUpdated={(next) => setStages((list) => list.map((s) => (s.id === next.id ? next : s)))}
        />
      )}

      {editing && (
        <Modal
          title={editing.id ? "Modifier le stage" : "Nouveau stage"}
          subtitle="Affectation d'un stagiaire à un service et à un tuteur."
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
          size={680}
        >
          <div className="form-grid">
            <div className="field span-2">
              <label className="label" htmlFor="intitule">Intitulé du stage</label>
              <input id="intitule" name="intitule" className="input" value={formData.intitule} onChange={handleChange} required placeholder="ex. Assistant communication" />
            </div>

            <div className="field">
              <label className="label" htmlFor="stagiaire">Stagiaire</label>
              <select id="stagiaire" name="stagiaire" className="input" value={formData.stagiaire} onChange={handleChange} required>
                <option value="">Sélectionner…</option>
                {stagiaires.map((s) => (
                  <option key={s.id} value={s.id}>{fullName(s)}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="service">Service d'accueil</label>
              <select id="service" name="service" className="input" value={formData.service} onChange={handleChange} required>
                <option value="">Sélectionner…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="tuteur">
                Tuteur <span className="optional">(facultatif)</span>
              </label>
              <select id="tuteur" name="tuteur" className="input" value={formData.tuteur} onChange={handleChange}>
                <option value="">Non assigné</option>
                {tuteurs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {fullName(t)}
                    {t.service ? ` — ${serviceNom(t.service)}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="statut">Statut</label>
              <select id="statut" name="statut" className="input" value={formData.statut} onChange={handleChange}>
                {Object.entries(STATUTS)
                  .filter(([key]) => STATUTS_MANUELS.includes(key) || key === editing.statut)
                  .map(([key, s]) => (
                    <option key={key} value={key}>{s.label}</option>
                  ))}
              </select>
              <span className="field-hint">« À valider (RH) » et « Terminé » sont attribués par le suivi du stage.</span>
            </div>

            <div className="field">
              <label className="label" htmlFor="date_debut">Date de début</label>
              <input id="date_debut" type="date" name="date_debut" className="input" value={formData.date_debut} onChange={handleChange} required />
            </div>

            <div className="field">
              <label className="label" htmlFor="date_fin">Date de fin</label>
              <input id="date_fin" type="date" name="date_fin" className="input" value={formData.date_fin} min={formData.date_debut || undefined} onChange={handleChange} required />
            </div>

            <div className="field span-2">
              <label className="label" htmlFor="gratification">
                Note de stage (sur {NOTE_MAX}) <span className="optional">(facultatif)</span>
              </label>
              <input id="gratification" type="number" min="0" max={NOTE_MAX} step="0.25" name="gratification" className="input" value={formData.gratification} onChange={handleChange} placeholder={`ex. 15,5`} />
              <span className="field-hint">Laisser vide tant que le stage n'est pas évalué.</span>
            </div>

            <div className="field span-2">
              <label className="label" htmlFor="missions">
                Missions <span className="optional">(facultatif)</span>
              </label>
              <textarea id="missions" name="missions" className="input" value={formData.missions} onChange={handleChange} placeholder="Décrivez les missions confiées au stagiaire…" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Stages;

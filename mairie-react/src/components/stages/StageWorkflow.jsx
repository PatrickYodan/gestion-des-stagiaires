import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import Icon from "../ui/Icon";
import { apiErrorMessage, formatDate, fullName } from "../../utils/format";
import { DOCUMENTS_REQUIS, STATUTS, etapeCourante, finAtteinte, mentionOf } from "../../utils/workflow";

const TYPES_AJOUT = [
  ...DOCUMENTS_REQUIS,
  { type: "AUTRE", label: "Autre document" },
];

const LIBELLES_TYPES = {
  CONVENTIONS: "Convention",
  ATTESTATION: "Attestation",
  RAPPORT: "Rapport",
  FICHE_NOTES: "Fiche de notes",
  AUTRE: "Autre",
};

const formatDateHeure = (iso) =>
  iso ? formatDate(iso, { day: "numeric", month: "long", year: "numeric" }) : "";

// Une étape de la frise : pastille numérotée + contenu
function Step({ n, title, state, icon, children }) {
  return (
    <section className={`wf-step is-${state}`}>
      <div className="wf-step-marker" aria-hidden="true">
        {state === "done" ? <Icon name="check" size={16} strokeWidth={2.4} /> : <Icon name={icon} size={16} />}
      </div>
      <div className="wf-step-body">
        <header className="wf-step-head">
          <span className="wf-step-num">Étape {n}</span>
          <h4>{title}</h4>
          {state === "done" && <span className="wf-chip done">Fait</span>}
          {state === "current" && <span className="wf-chip current">En cours</span>}
          {state === "warn" && <span className="wf-chip warn">Incomplet</span>}
        </header>
        {children}
      </div>
    </section>
  );
}

// Fenêtre « Suivi du stage » : documents, évaluation de l'encadrant, validation RH, clôture
function StageWorkflow({ stage: initialStage, stagiaire, tuteurNom, serviceNom, onClose, onUpdated }) {
  const { user, can } = useAuth();
  const [stage, setStage] = useState(initialStage);
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  // Ajout de document
  const [showUpload, setShowUpload] = useState(false);
  const [upload, setUpload] = useState({ type_doc: "CONVENTIONS", type_precision: "", nom_fichier: "" });
  const [file, setFile] = useState(null);

  // Évaluation de l'encadrant
  const [note, setNote] = useState("");
  const [appreciation, setAppreciation] = useState("");

  // Renvoi par les RH
  const [showRetour, setShowRetour] = useState(false);
  const [motif, setMotif] = useState("");

  // Réouverture d'un stage terminé (agent RH)
  const [showReouverture, setShowReouverture] = useState(false);
  const [motifReouverture, setMotifReouverture] = useState("");

  const isAdmin = user?.role === "ADMIN";
  const estEncadrant = isAdmin || stage.tuteur === user?.id;
  const estRH = isAdmin || user?.role === "RH";
  const peutAjouter = can("documents", 2) && !["TERMINE", "ANNULEE"].includes(stage.statut);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadDocuments = () =>
    api
      .get("documents/")
      .then((res) => setDocuments(res.data.filter((d) => d.stage === stage.id)))
      .catch(() => setDocuments([]));

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.id]);

  const update = (next) => {
    setStage(next);
    onUpdated?.(next);
  };

  const run = async (key, fn) => {
    setBusy(key);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(apiErrorMessage(err, "L'action n'a pas pu être effectuée."));
    } finally {
      setBusy("");
    }
  };

  const envoyerDocument = (e) => {
    e.preventDefault();
    if (!file) {
      setError("Choisissez un fichier.");
      return;
    }
    run("upload", async () => {
      const data = new FormData();
      const libelle = TYPES_AJOUT.find((t) => t.type === upload.type_doc)?.label || "Document";
      data.append("nom_fichier", upload.nom_fichier.trim() || `${libelle} - ${fullName(stagiaire)}`);
      data.append("type_doc", upload.type_doc);
      data.append("type_precision", upload.type_doc === "AUTRE" ? upload.type_precision.trim() : "");
      data.append("stage", stage.id);
      data.append("chemin_fichier", file);
      await api.post("documents/", data, { headers: { "Content-Type": "multipart/form-data" } });
      setShowUpload(false);
      setFile(null);
      setUpload({ type_doc: "CONVENTIONS", type_precision: "", nom_fichier: "" });
      await loadDocuments();
    });
  };

  const validerEncadrant = (e) => {
    e.preventDefault();
    if (!finAtteinte(stage)) {
      const ok = window.confirm(
        `Le stage n'est pas encore terminé (fin prévue le ${formatDate(stage.date_fin)}).\n\nValider quand même l'évaluation ?`,
      );
      if (!ok) return;
    }
    run("evaluer", async () => {
      const res = await api.post(`stages/${stage.id}/valider-encadrant/`, { note, appreciation });
      update(res.data);
    });
  };

  const validerRH = () =>
    run("rh", async () => {
      const res = await api.post(`stages/${stage.id}/valider-rh/`);
      const { fiche, ...next } = res.data;
      update(next);
      if (fiche) setDocuments((docs) => [...(docs || []).filter((d) => d.type_doc !== "FICHE_NOTES"), fiche]);
    });

  const rouvrir = (e) => {
    e.preventDefault();
    run("rouvrir", async () => {
      const res = await api.post(`stages/${stage.id}/rouvrir/`, { motif: motifReouverture });
      update(res.data);
      // La fiche de notes est supprimée : elle sera établie de nouveau après les validations
      setDocuments((list) => (list || []).filter((d) => d.type_doc !== "FICHE_NOTES"));
      setShowReouverture(false);
      setMotifReouverture("");
      setNote("");
      setAppreciation("");
    });
  };

  const renvoyer = (e) => {
    e.preventDefault();
    run("retour", async () => {
      const res = await api.post(`stages/${stage.id}/renvoyer/`, { motif });
      update(res.data);
      setShowRetour(false);
      setMotif("");
    });
  };

  const docs = documents || [];
  const etape = etapeCourante(stage, docs);
  const stateOf = (n) => (etape > n ? "done" : etape === n ? "current" : "todo");
  // Les documents restent modifiables pendant l'évaluation : l'étape 1 est « faite » dès que le dossier est complet
  const manquants = DOCUMENTS_REQUIS.filter((d) => !docs.some((doc) => doc.type_doc === d.type));
  const fiche = docs.find((d) => d.type_doc === "FICHE_NOTES");
  const statut = STATUTS[stage.statut] || { label: stage.statut, badge: "" };
  const annule = stage.statut === "ANNULEE";
  const pasDemarre = stage.statut === "EN_ATTENTE";

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wf-modal" role="dialog" aria-modal="true" aria-label="Suivi du stage">
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h3 className="modal-title">Suivi du stage</h3>
            <p className="modal-subtitle">
              <strong>{fullName(stagiaire)}</strong> · {stage.intitule}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="wf-summary">
          <span className={`badge badge-dot ${statut.badge}`}>{statut.label}</span>
          <span><Icon name="building" size={13} /> {serviceNom || "—"}</span>
          <span><Icon name="userCheck" size={13} /> {tuteurNom || "Encadrant non assigné"}</span>
          <span><Icon name="calendar" size={13} /> {formatDate(stage.date_debut)} → {formatDate(stage.date_fin)}</span>
        </div>

        <div className="modal-body wf-body">
          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}

          {annule && (
            <div className="alert alert-warning">
              <Icon name="alert" size={18} />
              <span>Ce stage est annulé : le workflow de validation est interrompu.</span>
            </div>
          )}

          {pasDemarre && (
            <div className="alert alert-info wf-pending">
              <Icon name="clock" size={18} />
              <span>
                <strong>Stage en attente de démarrage</strong>
                {` — début prévu le ${formatDate(stage.date_debut, { day: "numeric", month: "long", year: "numeric" })}.`}
                <br />
                Le suivi (documents, évaluation, validation) s'ouvrira dès que le stage passera « En cours ».{" "}
                {estRH
                  ? "Pour le démarrer, modifiez le stage et choisissez le statut « En cours »."
                  : "Le service des ressources humaines le passera « En cours » au démarrage du stage."}
              </span>
            </div>
          )}

          {/* 1. Documents */}
          <Step
            n={1}
            title="Documents du dossier"
            icon="fileText"
            state={manquants.length === 0 ? "done" : stage.statut === "EN_COURS" ? "current" : etape > 1 ? "warn" : "todo"}
          >
            {documents === null ? (
              <div className="skeleton" style={{ height: 70 }} />
            ) : (
              <>
                <ul className="wf-checklist">
                  {DOCUMENTS_REQUIS.map((d) => {
                    const ok = docs.some((doc) => doc.type_doc === d.type);
                    return (
                      <li key={d.type} className={ok ? "ok" : ""}>
                        <Icon name={ok ? "check" : "clock"} size={14} />
                        {d.label}
                        <span>{ok ? "Ajouté" : "Manquant"}</span>
                      </li>
                    );
                  })}
                </ul>

                {docs.length > 0 && (
                  <ul className="wf-docs">
                    {docs.map((d) => (
                      <li key={d.id}>
                        <Icon name="fileText" size={14} />
                        <a href={d.chemin_fichier} target="_blank" rel="noreferrer" title={d.nom_fichier}>
                          {d.nom_fichier}
                        </a>
                        <span className="wf-doc-type">{d.type_precision || LIBELLES_TYPES[d.type_doc] || d.type_doc}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {peutAjouter && !showUpload && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowUpload(true)}>
                    <Icon name="upload" size={14} /> Ajouter un document
                  </button>
                )}

                {peutAjouter && showUpload && (
                  <form className="wf-form" onSubmit={envoyerDocument}>
                    <div className="wf-form-row">
                      <select
                        className="input"
                        value={upload.type_doc}
                        onChange={(e) => setUpload({ ...upload, type_doc: e.target.value })}
                        aria-label="Type de document"
                      >
                        {TYPES_AJOUT.map((t) => (
                          <option key={t.type} value={t.type}>{t.label}</option>
                        ))}
                      </select>
                      <input
                        className="input"
                        placeholder="Nom du document (facultatif)"
                        value={upload.nom_fichier}
                        onChange={(e) => setUpload({ ...upload, nom_fichier: e.target.value })}
                      />
                    </div>
                    {upload.type_doc === "AUTRE" && (
                      <input
                        className="input"
                        placeholder="Précisez le type (ex. Fiche d'évaluation)"
                        value={upload.type_precision}
                        onChange={(e) => setUpload({ ...upload, type_precision: e.target.value })}
                        required
                      />
                    )}
                    <label className="wf-file">
                      <Icon name="upload" size={16} />
                      <span>{file ? file.name : "Choisir un fichier (PDF, Word, image…)"}</span>
                      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    </label>
                    <div className="wf-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowUpload(false)}>
                        Annuler
                      </button>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={busy === "upload"}>
                        {busy === "upload" && <span className="spinner" />}
                        Ajouter au dossier
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </Step>

          {/* 2. Évaluation de l'encadrant */}
          <Step n={2} title="Évaluation par l'encadrant" icon="pencil" state={stateOf(2) === "todo" && etape === 1 ? "current" : stateOf(2)}>
            {stage.evalue_le && stage.statut !== "EN_COURS" ? (
              <div className="wf-result">
                <div className="wf-note">
                  <strong>{Number(stage.gratification).toLocaleString("fr-FR")}</strong>
                  <span>/ 20 · {mentionOf(stage.gratification)}</span>
                </div>
                <p className="wf-quote">{stage.appreciation}</p>
                <p className="wf-meta">
                  Évalué par {stage.evalue_par_nom || "l'encadrant"} le {formatDateHeure(stage.evalue_le)}
                </p>
              </div>
            ) : stage.statut === "EN_COURS" && estEncadrant ? (
              <form className="wf-form" onSubmit={validerEncadrant}>
                {stage.motif_retour && (
                  <div className="alert alert-warning">
                    <Icon name="alert" size={18} />
                    <span>
                      {stage.motif_retour.startsWith("Stage rouvert : ") ? (
                        <>
                          <strong>Stage rouvert par les RH :</strong>{" "}
                          {stage.motif_retour.replace("Stage rouvert : ", "")} La fiche de notes a été réinitialisée.
                        </>
                      ) : (
                        <>
                          <strong>Dossier renvoyé par les RH :</strong> {stage.motif_retour}
                        </>
                      )}
                    </span>
                  </div>
                )}
                {manquants.length > 0 && (
                  <p className="wf-hint">
                    <Icon name="alert" size={13} /> Documents manquants : {manquants.map((d) => d.label).join(", ")}.
                  </p>
                )}
                <div className="wf-form-row wf-form-row-note">
                  <label className="field">
                    <span className="label">Note sur 20</span>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="20"
                      step="0.25"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      required
                    />
                  </label>
                  {note !== "" && Number(note) >= 0 && Number(note) <= 20 && (
                    <span className="wf-mention">Mention : {mentionOf(note)}</span>
                  )}
                </div>
                <label className="field">
                  <span className="label">Appréciation</span>
                  <textarea
                    className="input"
                    rows={4}
                    value={appreciation}
                    onChange={(e) => setAppreciation(e.target.value)}
                    placeholder="Implication, compétences acquises, qualité du travail, axes de progrès…"
                    minLength={10}
                    required
                  />
                </label>
                <div className="wf-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy === "evaluer"}>
                    {busy === "evaluer" ? <span className="spinner" /> : <Icon name="check" size={16} />}
                    Valider le stage et transmettre aux RH
                  </button>
                </div>
              </form>
            ) : (
              <p className="wf-wait">
                {stage.statut === "EN_COURS"
                  ? "En attente de l'évaluation de l'encadrant (note et appréciation)."
                  : "L'évaluation sera possible quand le stage sera en cours."}
              </p>
            )}
          </Step>

          {/* 3. Validation RH */}
          <Step n={3} title="Validation par l'agent RH" icon="shield" state={stateOf(3)}>
            {stage.valide_rh_le ? (
              <p className="wf-meta">
                Validé par {stage.valide_rh_par_nom || "l'agent RH"} le {formatDateHeure(stage.valide_rh_le)}
              </p>
            ) : stage.statut === "VALIDE" && estRH ? (
              <>
                <p className="wf-text">
                  Vérifiez l'évaluation ci-dessus, puis validez pour clôturer le stage et établir la fiche de notes.
                </p>
                {!showRetour ? (
                  <div className="wf-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowRetour(true)}>
                      <Icon name="chevronLeft" size={16} /> Renvoyer à l'encadrant
                    </button>
                    <button type="button" className="btn btn-primary" onClick={validerRH} disabled={busy === "rh"}>
                      {busy === "rh" ? <span className="spinner" /> : <Icon name="shield" size={16} />}
                      Valider et clôturer le stage
                    </button>
                  </div>
                ) : (
                  <form className="wf-form" onSubmit={renvoyer}>
                    <label className="field">
                      <span className="label">Motif du renvoi</span>
                      <textarea
                        className="input"
                        rows={3}
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        placeholder="Ex. le rapport de stage est manquant, merci de préciser l'appréciation…"
                        required
                      />
                    </label>
                    <div className="wf-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setShowRetour(false)}>
                        Annuler
                      </button>
                      <button type="submit" className="btn btn-danger" disabled={busy === "retour"}>
                        {busy === "retour" && <span className="spinner" />}
                        Renvoyer le dossier
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <p className="wf-wait">
                {stage.statut === "VALIDE"
                  ? "Le dossier est transmis : en attente de la validation d'un agent RH."
                  : "Après l'évaluation de l'encadrant, le dossier sera transmis à l'agent RH."}
              </p>
            )}
          </Step>

          {/* 4. Clôture */}
          <Step n={4} title="Clôture et fiche de notes" icon="trophy" state={stage.statut === "TERMINE" ? "done" : "todo"}>
            {stage.statut === "TERMINE" ? (
              <>
                <div className="wf-closing">
                  <p className="wf-text">Le stage est terminé. La fiche de notes a été établie automatiquement.</p>
                  {fiche ? (
                    <a className="btn btn-primary" href={fiche.chemin_fichier} target="_blank" rel="noreferrer">
                      <Icon name="fileText" size={16} /> Ouvrir la fiche de notes
                    </a>
                  ) : (
                    <p className="wf-meta">La fiche de notes se trouve dans « Documents & Attestations ».</p>
                  )}
                </div>

                {estRH && !showReouverture && (
                  <div className="wf-actions wf-reopen-trigger">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowReouverture(true)}>
                      <Icon name="lock" size={14} /> Rouvrir le stage
                    </button>
                  </div>
                )}

                {estRH && showReouverture && (
                  <form className="wf-form wf-reopen" onSubmit={rouvrir}>
                    <div className="alert alert-warning">
                      <Icon name="alert" size={18} />
                      <span>
                        La réouverture <strong>réinitialise la fiche de notes</strong> : la note, l'appréciation et les
                        validations sont effacées, et la fiche n'est plus accessible. Le stage repasse « En cours » :
                        l'encadrant refait l'évaluation, puis l'agent RH valide de nouveau.
                      </span>
                    </div>
                    <label className="field">
                      <span className="label">Motif de la réouverture</span>
                      <textarea
                        className="input"
                        rows={3}
                        value={motifReouverture}
                        onChange={(e) => setMotifReouverture(e.target.value)}
                        placeholder="Ex. erreur sur la note, période de stage prolongée…"
                        required
                      />
                    </label>
                    <div className="wf-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setShowReouverture(false)}>
                        Annuler
                      </button>
                      <button type="submit" className="btn btn-danger" disabled={busy === "rouvrir"}>
                        {busy === "rouvrir" && <span className="spinner" />}
                        Rouvrir et réinitialiser la fiche
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <p className="wf-wait">
                La fiche de notes n'est pas encore disponible : elle est établie automatiquement quand toutes les
                validations sont faites (encadrant puis agent RH), et le statut passe alors à « Terminé ».
              </p>
            )}
          </Step>
        </div>
      </div>
    </div>
  );
}

export default StageWorkflow;

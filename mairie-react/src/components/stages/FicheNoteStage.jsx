import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Icon from "../ui/Icon";
import { formatDate, formatNote, fullName, isNoted, NOTE_MAX } from "../../utils/format";

const STATUTS = {
  EN_ATTENTE: "En attente de validation",
  EN_COURS: "En cours",
  VALIDE: "Validé",
  TERMINE: "Terminé",
  ANNULEE: "Annulé",
};

// Mention correspondant à la note sur 20
const mentionOf = (note) => {
  const n = Number(note);
  if (n >= 16) return "Très bien";
  if (n >= 14) return "Bien";
  if (n >= 12) return "Assez bien";
  if (n >= 10) return "Passable";
  return "Insuffisant";
};

const durationLabel = (debut, fin) => {
  const days = Math.round((new Date(fin) - new Date(debut)) / 86400000) + 1;
  if (!days || days < 1) return "—";
  if (days < 14) return `${days} jour${days > 1 ? "s" : ""}`;
  if (days < 60) return `${Math.round(days / 7)} semaines`;
  return `${Math.round(days / 30)} mois`;
};

// Ligne « libellé / valeur » des tableaux de la fiche
function Row({ label, children }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{children || "—"}</td>
    </tr>
  );
}

// Fiche de note de stage imprimable (impression ou « Enregistrer au format PDF » du navigateur)
function FicheNoteStage({ stagiaire, stages, services, utilisateurs, etablissements, onClose }) {
  // Par défaut : le stage le plus récent
  const sorted = [...stages].sort((a, b) => String(b.date_debut).localeCompare(String(a.date_debut)));
  const [stageId, setStageId] = useState(sorted[0]?.id ?? null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.classList.add("printing-fiche");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("printing-fiche");
    };
  }, [onClose]);

  const stage = sorted.find((s) => s.id === stageId);
  const service = services.find((s) => s.id === stage?.service);
  const tuteur = utilisateurs.find((u) => u.id === stage?.tuteur);
  const etab = etablissements.find((e) => e.id === stagiaire.etablissement);
  const noted = stage && isNoted(stage.gratification);
  const today = formatDate(new Date().toISOString(), { day: "numeric", month: "long", year: "numeric" });

  return createPortal(
    <div className="fiche-overlay" role="dialog" aria-modal="true" aria-label="Fiche de note de stage">
      <div className="fiche-toolbar">
        <div className="fiche-toolbar-title">
          <Icon name="fileText" size={18} />
          <strong>Fiche de note de stage</strong>
          <span>— {fullName(stagiaire)}</span>
        </div>
        <div className="fiche-toolbar-actions">
          {sorted.length > 1 && (
            <select
              className="input"
              value={stageId ?? ""}
              onChange={(e) => setStageId(Number(e.target.value))}
              aria-label="Stage"
            >
              {sorted.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.intitule} ({formatDate(s.date_debut, { month: "short", year: "numeric" })})
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!stage}>
            <Icon name="fileText" size={16} /> Imprimer / PDF
          </button>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>

      <div className="fiche-scroll">
        {!stage ? (
          <div className="fiche-sheet fiche-empty">
            <Icon name="clipboard" size={28} />
            <h3>Aucun stage enregistré</h3>
            <p>Affectez d'abord ce stagiaire à un stage (onglet Affectations & Stages) pour éditer sa fiche de note.</p>
          </div>
        ) : (
          <article className="fiche-sheet">
            <header className="fiche-head">
              <div className="fiche-org">
                <div className="fiche-logo">
                  <Icon name="landmark" size={22} />
                </div>
                <div>
                  <strong>MAIRIE</strong>
                  <span>Service des ressources humaines</span>
                  <span>Gestion des stagiaires</span>
                </div>
              </div>
              <div className="fiche-ref">
                <span>Réf. STG-{String(stage.id).padStart(4, "0")}</span>
                <span>Édité le {today}</span>
              </div>
            </header>

            <h1 className="fiche-title">Fiche de note de stage</h1>
            <p className="fiche-subtitle">{stage.intitule}</p>

            <section className="fiche-section">
              <h2>1. Identité du stagiaire</h2>
              <table className="fiche-table">
                <tbody>
                  <Row label="Nom">{stagiaire.nom?.toUpperCase()}</Row>
                  <Row label="Prénom">{stagiaire.prenom}</Row>
                  <Row label="Adresse e-mail">{stagiaire.email}</Row>
                  <Row label="Téléphone">{stagiaire.telephone}</Row>
                  <Row label="Adresse">{stagiaire.adresse}</Row>
                  <Row label="Niveau d'études">{stagiaire.niveau_etudes}</Row>
                  <Row label="Établissement">{etab ? `${etab.nom}${etab.ville ? ` — ${etab.ville}` : ""}` : ""}</Row>
                </tbody>
              </table>
            </section>

            <section className="fiche-section">
              <h2>2. Le stage</h2>
              <table className="fiche-table">
                <tbody>
                  <Row label="Intitulé">{stage.intitule}</Row>
                  <Row label="Service d'accueil">{service?.nom}</Row>
                  <Row label="Tuteur / encadrant">{tuteur ? fullName(tuteur) : "Non assigné"}</Row>
                  <Row label="Période">
                    Du {formatDate(stage.date_debut, { day: "numeric", month: "long", year: "numeric" })} au{" "}
                    {formatDate(stage.date_fin, { day: "numeric", month: "long", year: "numeric" })}
                  </Row>
                  <Row label="Durée">{durationLabel(stage.date_debut, stage.date_fin)}</Row>
                  <Row label="Statut">{STATUTS[stage.statut] || stage.statut}</Row>
                </tbody>
              </table>
              <div className="fiche-missions">
                <div className="fiche-label">Missions confiées</div>
                <p>{stage.missions || "—"}</p>
              </div>
            </section>

            <section className="fiche-section">
              <h2>3. Évaluation</h2>
              <div className="fiche-eval">
                <div className="fiche-note">
                  <span className="fiche-label">Note finale</span>
                  {noted ? (
                    <strong>{formatNote(stage.gratification)}</strong>
                  ) : (
                    <strong className="fiche-note-blank">
                      ______ / {NOTE_MAX}
                    </strong>
                  )}
                </div>
                <div className="fiche-note">
                  <span className="fiche-label">Mention</span>
                  <strong>{noted ? mentionOf(stage.gratification) : "____________"}</strong>
                </div>
              </div>
              <div className="fiche-missions">
                <div className="fiche-label">Appréciation du tuteur</div>
                <div className="fiche-lines">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </section>

            <section className="fiche-signatures">
              <div>
                <span className="fiche-label">Le stagiaire</span>
                <strong>{fullName(stagiaire)}</strong>
                <em>Date et signature</em>
              </div>
              <div>
                <span className="fiche-label">Le tuteur</span>
                <strong>{tuteur ? fullName(tuteur) : " "}</strong>
                <em>Date et signature</em>
              </div>
              <div>
                <span className="fiche-label">Le responsable RH</span>
                <strong>&nbsp;</strong>
                <em>Date, signature et cachet</em>
              </div>
            </section>

            <footer className="fiche-foot">
              Document généré le {today} par la plateforme de gestion des stagiaires de la Mairie.
            </footer>
          </article>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default FicheNoteStage;

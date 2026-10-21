import { useState, useEffect } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import Icon from "../ui/Icon";
import { apiErrorMessage } from "../../utils/format";

const LEVELS = [
  { value: 0, label: "Aucun", hint: "Onglet masqué" },
  { value: 1, label: "Lecture", hint: "Consultation uniquement" },
  { value: 2, label: "Complet", hint: "Création, modification, suppression" },
];

const ROLE_LABELS = { ADMIN: "Administrateur", RH: "Agent RH", TUTEUR: "Tuteur" };

const MODULE_INFO = {
  dashboard: { icon: "dashboard", desc: "Statistiques et graphique des stages" },
  stagiaires: { icon: "graduation", desc: "Liste, ajout et suppression des stagiaires" },
  tuteurs: { icon: "userCheck", desc: "Liste, ajout et modification des comptes tuteurs" },
  stages: { icon: "clipboard", desc: "Affectations, périodes, notes et statuts" },
  services: { icon: "building", desc: "Services municipaux et établissements" },
  documents: { icon: "folder", desc: "Conventions, attestations et rapports" },
};

const clone = (m) => JSON.parse(JSON.stringify(m || {}));

// Interface de gestion des droits d'accès par rôle (réservée à l'administrateur)
function AccessMatrix({ userCounts = {} }) {
  const { setAccess } = useAuth();
  const [config, setConfig] = useState(null); // réponse de l'API
  const [draft, setDraft] = useState({}); // matrice en cours d'édition
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api
      .get("acces/")
      .then((res) => {
        setConfig(res.data);
        setDraft(clone(res.data.matrice));
      })
      .catch((err) =>
        setMessage({ type: "error", text: apiErrorMessage(err, "Impossible de charger les droits d'accès.") }),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card-body">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 52, marginBottom: 10 }} />
        ))}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="card-body">
        <div className="alert alert-error">
          <Icon name="alert" size={18} />
          <span>{message?.text}</span>
        </div>
      </div>
    );
  }

  const editableRoles = config.roles.filter((r) => r !== "ADMIN");

  // Nom du rôle et nombre de comptes, affichés en tête de chaque ligne de rôle sur téléphone
  const countLabel = (role) => {
    const n = userCounts[role] || 0;
    return `${n} compte${n > 1 ? "s" : ""}`;
  };
  const roleTag = (role) => (
    <span className="access-cell-role">
      <span>{ROLE_LABELS[role] || role}</span>
      <span className="access-cell-count">{countLabel(role)}</span>
    </span>
  );

  const changes = [];
  editableRoles.forEach((role) =>
    config.modules.forEach((m) => {
      if (draft[role]?.[m.id] !== config.matrice[role]?.[m.id]) changes.push(`${role}.${m.id}`);
    }),
  );
  const isDirty = changes.length > 0;

  const isDefault = editableRoles.every((role) =>
    config.modules.every((m) => draft[role]?.[m.id] === config.defauts?.[role]?.[m.id]),
  );

  const setLevel = (role, module, value) => {
    setDraft({ ...draft, [role]: { ...draft[role], [module]: value } });
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.put("acces/", { matrice: draft });
      setConfig(res.data);
      setDraft(clone(res.data.matrice));
      setAccess(res.data);
      setMessage({
        type: "success",
        text: "Droits d'accès enregistrés. Ils s'appliquent dès la prochaine ouverture de l'application par les utilisateurs concernés.",
      });
    } catch (err) {
      setMessage({ type: "error", text: apiErrorMessage(err, "Impossible d'enregistrer les droits d'accès.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="access">
      <div className="access-legend">
        {LEVELS.map((l) => (
          <div key={l.value} className="access-legend-item">
            <span className={`level-dot level-${l.value}`} />
            <div>
              <strong>{l.label}</strong>
              <span>{l.hint}</span>
            </div>
          </div>
        ))}
      </div>

      {message && (
        <div className="access-message">
          <div className={`alert alert-${message.type}`} role="status">
            <Icon name={message.type === "success" ? "check" : "alert"} size={18} />
            <span>{message.text}</span>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="table access-table">
          <colgroup>
            <col className="access-col-module" />
            {config.roles.map((role) => (
              <col key={role} className={role === "ADMIN" ? "access-col-admin" : "access-col-role"} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>Module</th>
              {config.roles.map((role) => (
                <th key={role} className={`access-role ${role === "ADMIN" ? "is-admin" : ""}`}>
                  <div className="access-role-name">
                    {role === "ADMIN" && <Icon name="lock" size={12} />}
                    {ROLE_LABELS[role] || role}
                  </div>
                  <span className="access-role-count">{countLabel(role)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {config.modules.map((m) => {
              const info = MODULE_INFO[m.id] || { icon: "folder", desc: "" };
              const levels = m.lecture_seule ? LEVELS.slice(0, 2) : LEVELS;
              return (
                <tr key={m.id}>
                  <td>
                    <div className="person">
                      <div className="entity-icon" style={{ width: 36, height: 36 }}>
                        <Icon name={info.icon} size={17} />
                      </div>
                      <div>
                        <div className="person-name">{m.label}</div>
                        <div className="person-meta">
                          {info.desc}
                          {m.lecture_seule && " · consultation seule"}
                        </div>
                      </div>
                    </div>
                  </td>
                  {config.roles.map((role) =>
                    role === "ADMIN" ? (
                      <td key={role} className="access-cell is-admin" data-label={ROLE_LABELS[role]}>
                        {roleTag(role)}
                        <span
                          className={`lock-pill ${m.lecture_seule ? "level-1" : "level-2"}`}
                          title="L'administrateur a toujours un accès complet"
                        >
                          <Icon name="lock" size={12} /> {m.lecture_seule ? "Lecture" : "Complet"}
                        </span>
                      </td>
                    ) : (
                      <td key={role} className="access-cell" data-label={ROLE_LABELS[role] || role}>
                        {roleTag(role)}
                        <div
                          className={`level-control ${
                            draft[role]?.[m.id] !== config.matrice[role]?.[m.id] ? "changed" : ""
                          }`}
                          role="radiogroup"
                          aria-label={`${m.label} — ${ROLE_LABELS[role]}`}
                        >
                          {levels.map((l) => (
                            <button
                              key={l.value}
                              type="button"
                              role="radio"
                              aria-checked={draft[role]?.[m.id] === l.value}
                              className={`level-btn level-${l.value} ${
                                draft[role]?.[m.id] === l.value ? "active" : ""
                              }`}
                              onClick={() => setLevel(role, m.id, l.value)}
                              title={l.hint}
                            >
                              {l.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    ),
                  )}
                </tr>
              );
            })}

            {/* Modules non configurables, affichés pour information */}
            <tr className="access-group">
              <td colSpan={config.roles.length + 1}>
                <Icon name="lock" size={12} /> Accès fixes — non modifiables
              </td>
            </tr>
            <tr className="access-fixed">
              <td>
                <div className="person">
                  <div className="entity-icon tone-violet" style={{ width: 36, height: 36 }}>
                    <Icon name="users" size={17} />
                  </div>
                  <div>
                    <div className="person-name">Gestion des utilisateurs</div>
                    <div className="person-meta">Comptes et droits d'accès</div>
                  </div>
                </div>
              </td>
              {config.roles.map((role) => (
                <td key={role} className="access-cell" data-label={ROLE_LABELS[role] || role}>
                  {roleTag(role)}
                  <span className={`lock-pill ${role === "ADMIN" ? "level-2" : "level-0"}`}>
                    <Icon name="lock" size={12} /> {role === "ADMIN" ? "Complet" : "Aucun"}
                  </span>
                </td>
              ))}
            </tr>
            <tr className="access-fixed">
              <td>
                <div className="person">
                  <div className="entity-icon tone-teal" style={{ width: 36, height: 36 }}>
                    <Icon name="settings" size={17} />
                  </div>
                  <div>
                    <div className="person-name">Mon compte</div>
                    <div className="person-meta">Profil et mot de passe personnels</div>
                  </div>
                </div>
              </td>
              {config.roles.map((role) => (
                <td key={role} className="access-cell" data-label={ROLE_LABELS[role] || role}>
                  {roleTag(role)}
                  <span className="lock-pill level-2">
                    <Icon name="lock" size={12} /> Complet
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`access-savebar ${isDirty ? "dirty" : ""}`}>
        <div className="access-savebar-info">
          {isDirty ? (
            <>
              <span className="level-dot level-1" />
              {changes.length} modification{changes.length > 1 ? "s" : ""} non enregistrée
              {changes.length > 1 ? "s" : ""}
            </>
          ) : (
            "Toutes les modifications sont enregistrées."
          )}
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setDraft(clone(config.defauts));
              setMessage(null);
            }}
            disabled={isDefault || saving}
            title="Revenir aux droits d'origine de l'application"
          >
            Valeurs par défaut
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setDraft(clone(config.matrice))}
            disabled={!isDirty || saving}
          >
            Annuler
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!isDirty || saving}>
            {saving && <span className="spinner" />}
            Enregistrer les droits
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccessMatrix;

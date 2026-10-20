import { useState, useEffect } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/ui/Avatar";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import ServiceGlyph from "../components/services/ServiceGlyph";
import UserFormModal from "../components/utilisateurs/UserFormModal";
import InvitationNotice from "../components/utilisateurs/InvitationNotice";
import { apiErrorMessage, fullName } from "../utils/format";

function Tuteurs() {
  const { can } = useAuth();
  const canEdit = can("tuteurs", 2); // accès complet : ajout / modification des comptes tuteurs

  const [tuteurs, setTuteurs] = useState([]);
  const [services, setServices] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [editing, setEditing] = useState(null); // null = fermé, { item } = création / modification
  const [togglingId, setTogglingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [invitation, setInvitation] = useState(null); // résultat du dernier envoi d'identifiants

  const loadData = () =>
    Promise.all([api.get("utilisateurs/"), api.get("services/"), api.get("stages/")])
      .then(([resUtilisateurs, resServices, resStages]) => {
        // Filtrer uniquement les utilisateurs ayant le rôle TUTEUR
        setTuteurs(resUtilisateurs.data.filter((u) => u.role === "TUTEUR"));
        setServices(resServices.data);
        setStages(resStages.data);
        setError("");
      })
      .catch(() => setError("Impossible de charger la liste des tuteurs."))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadData();
  }, []);

  // Trouver le nom du service associé au tuteur
  const getServiceNom = (serviceId) => {
    if (!serviceId) return "Non assigné";
    const srv = services.find((s) => s.id === serviceId);
    return srv ? srv.nom : "Non assigné";
  };

  // Stages et stagiaires encadrés (un stagiaire ayant plusieurs stages n'est compté qu'une fois)
  const encadrements = (tuteurId) => {
    const own = stages.filter((s) => s.tuteur === tuteurId);
    const enCours = own.filter((s) => s.statut === "EN_COURS");
    return {
      total: own.length,
      stagiaires: new Set(own.map((s) => s.stagiaire)).size,
      stagiairesEnCours: new Set(enCours.map((s) => s.stagiaire)).size,
    };
  };

  const toggleStatut = async (t) => {
    const statut_compte = t.statut_compte === "ACTIF" ? "INACTIF" : "ACTIF";
    setTogglingId(t.id);
    try {
      await api.patch(`utilisateurs/${t.id}/`, { statut_compte });
      setTuteurs(tuteurs.map((x) => (x.id === t.id ? { ...x, statut_compte } : x)));
    } catch (err) {
      alert(apiErrorMessage(err, "Impossible de modifier le statut du compte."));
    } finally {
      setTogglingId(null);
    }
  };

  // Renvoie un nouveau mot de passe provisoire par e-mail (invitation ou réinitialisation)
  const resendCredentials = async (t) => {
    const message = t.doit_changer_mdp
      ? `Renvoyer l'e-mail d'invitation à ${t.email} ?

Un nouveau mot de passe provisoire sera généré.`
      : `Réinitialiser le mot de passe de ${fullName(t)} ?

Un mot de passe provisoire sera envoyé à ${t.email} et devra être changé à la prochaine connexion.`;
    if (!window.confirm(message)) return;
    setSendingId(t.id);
    try {
      const res = await api.post(`utilisateurs/${t.id}/renvoyer-identifiants/`);
      setInvitation(res.data.invitation);
      setTuteurs(tuteurs.map((x) => (x.id === t.id ? { ...x, doit_changer_mdp: true } : x)));
    } catch (err) {
      alert(apiErrorMessage(err, "Impossible d'envoyer les identifiants."));
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (t) => {
    const { total } = encadrements(t.id);
    const warning = total
      ? `\n\n${total} stage${total > 1 ? "s" : ""} n'aura${total > 1 ? "ont" : ""} plus de tuteur assigné.`
      : "";
    if (!window.confirm(`Supprimer le compte de ${fullName(t)} (@${t.username}) ?${warning}`)) return;
    try {
      await api.delete(`utilisateurs/${t.id}/`);
      setTuteurs(tuteurs.filter((x) => x.id !== t.id));
    } catch (err) {
      alert(apiErrorMessage(err, "Erreur lors de la suppression."));
    }
  };

  const query = search.trim().toLowerCase();
  const filtered = tuteurs.filter((t) => {
    if (serviceFilter && String(t.service) !== serviceFilter) return false;
    return [t.prenom, t.nom, t.username, t.email, getServiceNom(t.service)]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(query));
  });

  const actifs = tuteurs.filter((t) => t.statut_compte === "ACTIF").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Encadrement</div>
          <h2 className="page-title">Liste des Encadrants</h2>
          <p className="page-subtitle">
            Agents municipaux encadrant les stagiaires dans les différents services
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setEditing({ item: null })} className="btn btn-primary">
            <Icon name="plus" size={18} />
            <span className="btn-label">Nouvel encadrant</span>
          </button>
        )}
      </div>

      <InvitationNotice invitation={invitation} onClose={() => setInvitation(null)} />

      {error && (
        <div className="alert alert-error">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-count">
            <strong>{filtered.length}</strong> tuteur{filtered.length > 1 ? "s" : ""}
            {!loading && tuteurs.length > 0 && (
              <span className="muted"> · {actifs} actif{actifs > 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="toolbar-row" style={{ gap: "0.6rem" }}>
            <select
              className="input"
              style={{ width: "auto", minWidth: 190 }}
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              aria-label="Filtrer par service"
            >
              <option value="">Tous les services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.nom}</option>
              ))}
            </select>
            <div className="search">
              <Icon name="search" size={16} />
              <input
                className="input"
                placeholder="Rechercher un tuteur…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card-body">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 44, marginBottom: 10 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="userCheck"
            title={tuteurs.length ? "Aucun résultat" : "Aucun tuteur enregistré"}
            description={
              tuteurs.length
                ? "Aucun tuteur ne correspond à ces filtres."
                : "Ajoutez les agents qui encadreront les stagiaires."
            }
          >
            {!tuteurs.length && canEdit && (
              <button
                className="btn btn-primary"
                style={{ marginTop: "1.25rem" }}
                onClick={() => setEditing({ item: null })}
              >
                <Icon name="plus" size={18} /> Nouvel encadrant
              </button>
            )}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tuteur</th>
                  <th>Service rattaché</th>
                  <th>Stagiaires encadrés</th>
                  <th>Compte</th>
                  {canEdit && <th className="col-actions">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tuteur) => {
                  const { total, stagiaires, stagiairesEnCours } = encadrements(tuteur.id);
                  const actif = tuteur.statut_compte === "ACTIF";
                  return (
                    <tr key={tuteur.id}>
                      <td>
                        <div className="person">
                          <Avatar
                            src={tuteur.photo}
                            prenom={tuteur.prenom || tuteur.username}
                            nom={tuteur.nom}
                          />
                          <div>
                            <div className="person-name">
                              {tuteur.prenom || tuteur.nom
                                ? `${tuteur.prenom} ${tuteur.nom}`.trim()
                                : "Nouvel encadrant"}
                              {tuteur.doit_changer_mdp && (
                                <span
                                  className="badge badge-warning"
                                  style={{ marginLeft: 6 }}
                                  title="Le compte n'a pas encore été finalisé (première connexion)"
                                >
                                  Invitation en attente
                                </span>
                              )}
                            </div>
                            <div className="person-meta" title={tuteur.email}>
                              {tuteur.email || "Email non renseigné"}
                            </div>
                            {tuteur.telephone && (
                              <div className="person-meta">
                                <Icon name="phone" size={11} />
                                {tuteur.telephone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge truncate" title={getServiceNom(tuteur.service)}>
                          <ServiceGlyph service={services.find((s) => s.id === tuteur.service)} size={13} />{" "}
                          {getServiceNom(tuteur.service)}
                        </span>
                      </td>
                      <td>
                        {stagiaires ? (
                          <div className="encadrement">
                            <span className="encadrement-count" title={`${stagiaires} stagiaire${stagiaires > 1 ? "s" : ""} encadré${stagiaires > 1 ? "s" : ""}`}>
                              <Icon name="graduation" size={14} />
                              {stagiaires}
                            </span>
                            <div>
                              <div className="cell-title">
                                stagiaire{stagiaires > 1 ? "s" : ""}
                              </div>
                              <div className="cell-sub">
                                {stagiairesEnCours} en cours · {total} stage{total > 1 ? "s" : ""}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="muted">Aucun stagiaire</span>
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <button
                            className={`switch ${actif ? "on" : ""}`}
                            onClick={() => toggleStatut(tuteur)}
                            disabled={togglingId === tuteur.id}
                            role="switch"
                            aria-checked={actif}
                            aria-label={`Compte de ${fullName(tuteur)}`}
                          >
                            <span className="switch-track" />
                            {actif ? "Actif" : "Inactif"}
                          </button>
                        ) : (
                          <span className={`badge badge-dot ${actif ? "badge-success" : "badge-neutral"}`}>
                            {actif ? "Actif" : "Inactif"}
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="col-actions">
                          <div className="row-actions">
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => resendCredentials(tuteur)}
                              disabled={sendingId === tuteur.id}
                              title={
                                tuteur.doit_changer_mdp
                                  ? "Renvoyer l'e-mail d'invitation"
                                  : "Réinitialiser le mot de passe (envoi par e-mail)"
                              }
                              aria-label={`Envoyer les identifiants à ${tuteur.email}`}
                            >
                              {sendingId === tuteur.id ? (
                                <span className="spinner spinner-dark" />
                              ) : (
                                <Icon name="mail" size={15} />
                              )}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => setEditing({ item: tuteur })}
                              title="Modifier"
                              aria-label={`Modifier ${fullName(tuteur)}`}
                            >
                              <Icon name="pencil" size={15} />
                            </button>
                            <button
                              className="btn btn-danger-ghost btn-sm btn-icon"
                              onClick={() => handleDelete(tuteur)}
                              title="Supprimer"
                              aria-label={`Supprimer ${fullName(tuteur)}`}
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

      {editing && (
        <UserFormModal
          item={editing.item}
          services={services}
          fixedRole="TUTEUR"
          texts={{
            createTitle: "Nouvel encadrant",
            editTitle: "Modifier l'encadrant",
            createSubtitle: "Le compte sera créé et les identifiants envoyés par e-mail à l'encadrant.",
          }}
          onClose={() => setEditing(null)}
          onSaved={(data) => {
            setEditing(null);
            if (data?.invitation) setInvitation(data.invitation);
            loadData();
          }}
        />
      )}
    </div>
  );
}

export default Tuteurs;

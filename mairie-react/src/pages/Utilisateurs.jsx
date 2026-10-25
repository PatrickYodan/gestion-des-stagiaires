import { useState, useEffect } from "react";
import api from "../api/axios";
import { navigate, pathSegments, usePath } from "../utils/router";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/ui/Avatar";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import ServiceGlyph from "../components/services/ServiceGlyph";
import UserFormModal from "../components/utilisateurs/UserFormModal";
import InvitationNotice from "../components/utilisateurs/InvitationNotice";
import AccessMatrix from "../components/utilisateurs/AccessMatrix";
import { apiErrorMessage, fullName } from "../utils/format";
import { ROLES } from "../utils/roles";
import { SkeletonRows } from "../components/ui/Skeleton";

function Utilisateurs() {
  const { user: currentUser } = useAuth();
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  // Section lue dans l'adresse : /utilisateurs ou /utilisateurs/droits-acces
  const path = usePath();
  const view = pathSegments(path)[1] === "droits-acces" ? "acces" : "comptes";
  const setView = (v) => navigate(v === "acces" ? "/utilisateurs/droits-acces" : "/utilisateurs");
  const [togglingId, setTogglingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [invitation, setInvitation] = useState(null);

  const [editing, setEditing] = useState(null);

  const loadData = () =>
    Promise.all([api.get("utilisateurs/"), api.get("services/")])
      .then(([resUsers, resServices]) => {
        setUtilisateurs(resUsers.data);
        setServices(resServices.data);
        setError("");
      })
      .catch(() => setError("Impossible de charger les utilisateurs."))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadData();
  }, []);

  const serviceNom = (id) => services.find((s) => s.id === id)?.nom;

  const openForm = (item = null) => setEditing({ item });
  const closeForm = () => setEditing(null);

  const toggleStatut = async (u) => {
    const statut_compte = u.statut_compte === "ACTIF" ? "INACTIF" : "ACTIF";
    setTogglingId(u.id);
    try {
      await api.patch(`utilisateurs/${u.id}/`, { statut_compte });
      setUtilisateurs(utilisateurs.map((x) => (x.id === u.id ? { ...x, statut_compte } : x)));
    } catch (err) {
      alert(apiErrorMessage(err, "Impossible de modifier le statut."));
    } finally {
      setTogglingId(null);
    }
  };

  const resendCredentials = async (u) => {
    const message = u.doit_changer_mdp
      ? `Renvoyer l'e-mail d'invitation à ${u.email} ?

Un nouveau mot de passe provisoire sera généré.`
      : `Réinitialiser le mot de passe de ${fullName(u)} ?

Un mot de passe provisoire sera envoyé à ${u.email} et devra être changé à la prochaine connexion.`;
    if (!window.confirm(message)) return;
    setSendingId(u.id);
    try {
      const res = await api.post(`utilisateurs/${u.id}/renvoyer-identifiants/`);
      setInvitation(res.data.invitation);
      setUtilisateurs(utilisateurs.map((x) => (x.id === u.id ? { ...x, doit_changer_mdp: true } : x)));
    } catch (err) {
      alert(apiErrorMessage(err, "Impossible d'envoyer les identifiants."));
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Supprimer le compte de ${fullName(u)} (@${u.username}) ?`)) return;
    try {
      await api.delete(`utilisateurs/${u.id}/`);
      setUtilisateurs(utilisateurs.filter((x) => x.id !== u.id));
    } catch (err) {
      alert(apiErrorMessage(err, "Erreur lors de la suppression."));
    }
  };

  const counts = utilisateurs.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  const query = search.trim().toLowerCase();
  const filtered = utilisateurs.filter((u) => {
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
    return [u.prenom, u.nom, u.username, u.email, serviceNom(u.service)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });


  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Administration</div>
          <h2 className="page-title">Gestion des Utilisateurs</h2>
          <p className="page-subtitle">
            Comptes de la plateforme et droits d'accès de chaque rôle aux différents modules
          </p>
        </div>
        {view === "comptes" && (
          <button onClick={() => openForm()} className="btn btn-primary">
            <Icon name="plus" size={18} />
            <span className="btn-label">Nouvel utilisateur</span>
          </button>
        )}
      </div>

      <div className="segmented tabs-inline" role="tablist" aria-label="Section">
        <button
          role="tab"
          aria-selected={view === "comptes"}
          className={view === "comptes" ? "active" : ""}
          onClick={() => setView("comptes")}
        >
          <Icon name="users" size={14} /> Comptes ({utilisateurs.length})
        </button>
        <button
          role="tab"
          aria-selected={view === "acces"}
          className={view === "acces" ? "active" : ""}
          onClick={() => setView("acces")}
        >
          <Icon name="shield" size={14} /> Droits d'accès
        </button>
      </div>

      {view === "acces" && (
        <div className="card">
          <div className="card-header" style={{ paddingBottom: "1.25rem" }}>
            <div>
              <h3 className="card-title">Droits d'accès par rôle</h3>
              <p className="card-subtitle">
                Choisissez, pour chaque rôle, les onglets visibles et les actions autorisées.
                Ces droits sont aussi appliqués par le serveur.
              </p>
            </div>
          </div>
          <AccessMatrix userCounts={counts} />
        </div>
      )}

      <InvitationNotice invitation={invitation} onClose={() => setInvitation(null)} />

      {error && (
        <div className="alert alert-error">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      {view === "comptes" && (
      <div className="card">
        <div className="toolbar">
          <div className="chips" role="tablist" aria-label="Filtrer par rôle">
            <button
              className={`chip ${roleFilter === "ALL" ? "active" : ""}`}
              onClick={() => setRoleFilter("ALL")}
            >
              Tous <span className="chip-count">{utilisateurs.length}</span>
            </button>
            {Object.entries(ROLES).map(([key, r]) => (
              <button
                key={key}
                className={`chip ${roleFilter === key ? "active" : ""}`}
                onClick={() => setRoleFilter(key)}
              >
                {r.label} <span className="chip-count">{counts[key] || 0}</span>
              </button>
            ))}
          </div>
          <div className="search">
            <Icon name="search" size={16} />
            <input
              className="input"
              placeholder="Rechercher un nom, un identifiant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <SkeletonRows rows={5} columns={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="users"
            title="Aucun utilisateur"
            description="Aucun compte ne correspond à ces filtres."
          />
        ) : (
          <div className="table-wrap users-wrap">
            <table className="table users-table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Contact</th>
                  <th>Rôle · Service</th>
                  <th>Compte</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const role = ROLES[u.role] || { label: u.role, badge: "" };
                  const isSelf = u.id === currentUser?.id;
                  const actif = u.statut_compte === "ACTIF";
                  return (
                    <tr
                      key={u.id}
                      className={`role-${String(u.role).toLowerCase()} ${isSelf ? "is-self" : ""} ${actif ? "" : "is-inactive"}`}
                      style={{ "--i": Math.min(i, 15) }}
                    >
                      <td>
                        <div className="person">
                          <Avatar src={u.photo} prenom={u.prenom || u.username} nom={u.nom} />
                          <div>
                            <div className="person-name">
                              {fullName(u)}
                              {isSelf && <span className="badge" style={{ marginLeft: 6 }}>Vous</span>}
                              {u.doit_changer_mdp && (
                                <span className="badge badge-warning" style={{ marginLeft: 6 }}>
                                  Invitation en attente
                                </span>
                              )}
                            </div>
                            <div className="person-meta">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="contact" style={{ maxWidth: 220 }} title={u.email}>
                          <Icon name="mail" size={14} />
                          {u.email ? <span className="truncate">{u.email}</span> : <span className="muted">Non renseigné</span>}
                        </div>
                        {u.telephone && (
                          <div className="cell-sub">
                            <Icon name="phone" size={12} /> {u.telephone}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span className={`badge ${role.badge}`}>{role.label}</span>
                          {serviceNom(u.service) && (
                            <span className="cell-sub truncate" style={{ maxWidth: 180 }} title={serviceNom(u.service)}>
                              <ServiceGlyph service={services.find((s) => s.id === u.service)} size={12} />
                              {serviceNom(u.service)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          className={`switch ${actif ? "on" : ""}`}
                          onClick={() => toggleStatut(u)}
                          disabled={isSelf || togglingId === u.id}
                          role="switch"
                          aria-checked={actif}
                          title={isSelf ? "Vous ne pouvez pas désactiver votre propre compte" : ""}
                        >
                          <span className="switch-track" />
                          {actif ? "Actif" : "Inactif"}
                        </button>
                      </td>
                      <td className="col-actions">
                        <div className="row-actions">
                          {!isSelf && (
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => resendCredentials(u)}
                              disabled={sendingId === u.id}
                              title={
                                u.doit_changer_mdp
                                  ? "Renvoyer l'e-mail d'invitation"
                                  : "Réinitialiser le mot de passe (envoi par e-mail)"
                              }
                              aria-label={`Envoyer les identifiants à ${u.email}`}
                            >
                              {sendingId === u.id ? (
                                <span className="spinner spinner-dark" />
                              ) : (
                                <Icon name="mail" size={15} />
                              )}
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={() => openForm(u)}
                            title="Modifier"
                            aria-label={`Modifier ${fullName(u)}`}
                          >
                            <Icon name="pencil" size={15} />
                          </button>
                          <button
                            className="btn btn-danger-ghost btn-sm btn-icon"
                            onClick={() => handleDelete(u)}
                            disabled={isSelf}
                            title={isSelf ? "Vous ne pouvez pas supprimer votre propre compte" : "Supprimer"}
                            aria-label={`Supprimer ${fullName(u)}`}
                          >
                            <Icon name="trash" size={15} />
                          </button>
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
      )}

      {editing && (
        <UserFormModal
          item={editing.item}
          services={services}
          onClose={closeForm}
          onSaved={(data) => {
            closeForm();
            if (data?.invitation) setInvitation(data.invitation);
            loadData();
          }}
        />
      )}
    </div>
  );
}

export default Utilisateurs;

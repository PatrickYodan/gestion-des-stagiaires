import { useState, useEffect } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/ui/Avatar";
import Icon from "../components/ui/Icon";
import { apiErrorMessage, fullName } from "../utils/format";
import { passwordScore, scoreLabels } from "../utils/password";

const ROLES = {
  ADMIN: { label: "Administrateur", badge: "badge-violet" },
  RH: { label: "Agent RH", badge: "badge-teal" },
  TUTEUR: { label: "Tuteur", badge: "badge-blue" },
};

const emptyPasswords = { ancien: "", nouveau: "", confirmation: "" };


// Récupère les messages d'erreur DRF d'un champ donné
const fieldErrors = (err, field) => {
  const msgs = err?.response?.data?.[field];
  return Array.isArray(msgs) ? msgs.join(" ") : "";
};

function MonCompte() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Informations personnelles
  const [infos, setInfos] = useState({ prenom: "", nom: "", email: "", telephone: "" });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [savingInfos, setSavingInfos] = useState(false);
  const [infosMsg, setInfosMsg] = useState(null); // { type: "success" | "error", text }

  // Mot de passe
  const [pwd, setPwd] = useState(emptyPasswords);
  const [showPwd, setShowPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);
  const [pwdErrors, setPwdErrors] = useState({});

  const applyProfile = (data) => {
    setProfile(data);
    setInfos({
      prenom: data.prenom || "",
      nom: data.nom || "",
      email: data.email || "",
      telephone: data.telephone || "",
    });
  };

  useEffect(() => {
    Promise.all([api.get("mon-compte/"), api.get("services/")])
      .then(([resMe, resServices]) => {
        applyProfile(resMe.data);
        setServices(resServices.data);
      })
      .catch(() => setLoadError("Impossible de charger les informations de votre compte."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => photoPreview && URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const handleInfosChange = (e) => {
    setInfos({ ...infos, [e.target.name]: e.target.value });
    setInfosMsg(null);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
    setInfosMsg(null);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(true);
    setInfosMsg(null);
  };

  const resetInfos = () => {
    applyProfile(profile);
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(false);
    setInfosMsg(null);
  };

  const isDirty =
    profile &&
    (photoFile ||
      removePhoto ||
      infos.prenom !== (profile.prenom || "") ||
      infos.nom !== (profile.nom || "") ||
      infos.email !== (profile.email || "") ||
      infos.telephone !== (profile.telephone || ""));

  const handleInfosSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    Object.entries(infos).forEach(([k, v]) => data.append(k, v));
    if (photoFile) data.append("photo", photoFile);
    if (removePhoto) data.append("supprimer_photo", "1");

    setSavingInfos(true);
    try {
      const res = await api.patch("mon-compte/", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      applyProfile(res.data);
      // Met à jour la barre du haut (nom + photo)
      updateUser({ prenom: res.data.prenom, nom: res.data.nom, photo: res.data.photo });
      setPhotoFile(null);
      setPhotoPreview(null);
      setRemovePhoto(false);
      setInfosMsg({ type: "success", text: "Vos informations ont été mises à jour." });
    } catch (err) {
      setInfosMsg({ type: "error", text: apiErrorMessage(err, "Impossible d'enregistrer vos informations.") });
    } finally {
      setSavingInfos(false);
    }
  };

  const handlePwdChange = (e) => {
    setPwd({ ...pwd, [e.target.name]: e.target.value });
    setPwdErrors({ ...pwdErrors, [e.target.name]: "" });
    setPwdMsg(null);
  };

  const handlePwdSubmit = async (e) => {
    e.preventDefault();
    if (pwd.nouveau !== pwd.confirmation) {
      setPwdErrors({ confirmation: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    if (pwd.nouveau === pwd.ancien) {
      setPwdErrors({ nouveau: "Le nouveau mot de passe doit être différent de l'actuel." });
      return;
    }

    setSavingPwd(true);
    try {
      await api.post("mon-compte/mot-de-passe/", {
        ancien_mot_de_passe: pwd.ancien,
        nouveau_mot_de_passe: pwd.nouveau,
      });
      setPwd(emptyPasswords);
      setPwdErrors({});
      setPwdMsg({ type: "success", text: "Votre mot de passe a été modifié." });
    } catch (err) {
      const ancien = fieldErrors(err, "ancien_mot_de_passe");
      const nouveau = fieldErrors(err, "nouveau_mot_de_passe");
      setPwdErrors({ ancien, nouveau });
      if (!ancien && !nouveau) {
        setPwdMsg({ type: "error", text: apiErrorMessage(err, "Impossible de modifier le mot de passe.") });
      }
    } finally {
      setSavingPwd(false);
    }
  };

  if (loading) {
    return (
      <div className="account-grid">
        <div className="skeleton" style={{ height: 360 }} />
        <div className="skeleton" style={{ height: 360 }} />
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="alert alert-error">
        <Icon name="alert" size={18} />
        <span>{loadError || "Compte introuvable."}</span>
      </div>
    );
  }

  const role = ROLES[profile.role] || { label: profile.role, badge: "" };
  const serviceNom = services.find((s) => s.id === profile.service)?.nom;
  const shownPhoto = removePhoto ? null : photoPreview || profile.photo;
  const score = passwordScore(pwd.nouveau);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Paramètres</div>
          <h2 className="page-title">Mon compte</h2>
          <p className="page-subtitle">
            Gérez vos informations personnelles et la sécurité de votre accès
          </p>
        </div>
      </div>

      <div className="account-grid">
        {/* Carte profil */}
        <aside className="card profile-card">
          <div className="profile-cover" />
          <div className="profile-main">
            <div className="profile-avatar">
              <Avatar
                key={shownPhoto || "none"}
                src={shownPhoto}
                prenom={infos.prenom || profile.username}
                nom={infos.nom}
                size={88}
              />
            </div>
            <h3 className="profile-name">{fullName({ ...profile, ...infos }) || profile.username}</h3>
            <div className="profile-username">@{profile.username}</div>
            <span className={`badge ${role.badge}`}>{role.label}</span>
          </div>

          <dl className="profile-list">
            <div>
              <dt><Icon name="mail" size={15} /> Email</dt>
              <dd>{profile.email || <span className="muted">Non renseigné</span>}</dd>
            </div>
            <div>
              <dt><Icon name="phone" size={15} /> Téléphone</dt>
              <dd>{profile.telephone || <span className="muted">Non renseigné</span>}</dd>
            </div>
            <div>
              <dt><Icon name="building" size={15} /> Service</dt>
              <dd>{serviceNom || <span className="muted">Aucun</span>}</dd>
            </div>
            <div>
              <dt><Icon name="shield" size={15} /> Compte</dt>
              <dd>
                <span
                  className={`badge badge-dot ${
                    profile.statut_compte === "ACTIF" ? "badge-success" : "badge-neutral"
                  }`}
                >
                  {profile.statut_compte === "ACTIF" ? "Actif" : "Inactif"}
                </span>
              </dd>
            </div>
          </dl>
          <p className="profile-note">
            Le rôle, le service et le statut du compte sont gérés par un administrateur.
          </p>
        </aside>

        <div className="account-forms">
          {/* Informations personnelles */}
          <form className="card" onSubmit={handleInfosSubmit}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Informations personnelles</h3>
                <p className="card-subtitle">Ces informations sont visibles par les autres agents.</p>
              </div>
            </div>
            <div className="card-body">
              {infosMsg && (
                <div className={`alert alert-${infosMsg.type}`} role="status">
                  <Icon name={infosMsg.type === "success" ? "check" : "alert"} size={18} />
                  <span>{infosMsg.text}</span>
                </div>
              )}

              <div className="photo-row">
                <Avatar
                  key={shownPhoto || "none"}
                  src={shownPhoto}
                  prenom={infos.prenom || profile.username}
                  nom={infos.nom}
                  size={56}
                />
                <div className="photo-actions">
                  <label className="btn btn-secondary btn-sm">
                    <Icon name="upload" size={14} />
                    {shownPhoto ? "Changer la photo" : "Ajouter une photo"}
                    <input type="file" accept="image/*" onChange={handlePhotoChange} hidden />
                  </label>
                  {shownPhoto && (
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={handleRemovePhoto}>
                      <Icon name="trash" size={14} /> Retirer
                    </button>
                  )}
                  <span className="field-hint">JPG ou PNG, format carré conseillé.</span>
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="prenom">Prénom</label>
                  <input id="prenom" name="prenom" className="input" value={infos.prenom} onChange={handleInfosChange} required />
                </div>
                <div className="field">
                  <label className="label" htmlFor="nom">Nom</label>
                  <input id="nom" name="nom" className="input" value={infos.nom} onChange={handleInfosChange} required />
                </div>
                <div className="field">
                  <label className="label" htmlFor="email">Adresse e-mail</label>
                  <input id="email" type="email" name="email" className="input" value={infos.email} onChange={handleInfosChange} required />
                  <span className="field-hint">Utilisée pour vous connecter.</span>
                </div>
                <div className="field">
                  <label className="label" htmlFor="telephone">Téléphone</label>
                  <input id="telephone" type="tel" name="telephone" className="input" value={infos.telephone} onChange={handleInfosChange} />
                </div>
                <div className="field span-2">
                  <label className="label" htmlFor="username">Nom d'utilisateur</label>
                  <input id="username" className="input" value={profile.username} disabled />
                  <span className="field-hint">Identifiant interne, non modifiable. La connexion se fait avec l'adresse e-mail.</span>
                </div>
              </div>
            </div>
            <div className="card-footer">
              <button type="button" className="btn btn-secondary" onClick={resetInfos} disabled={!isDirty || savingInfos}>
                Annuler
              </button>
              <button type="submit" className="btn btn-primary" disabled={!isDirty || savingInfos}>
                {savingInfos && <span className="spinner" />}
                Enregistrer les modifications
              </button>
            </div>
          </form>

          {/* Sécurité */}
          <form className="card" onSubmit={handlePwdSubmit}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Sécurité</h3>
                <p className="card-subtitle">Modifiez le mot de passe utilisé pour vous connecter.</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowPwd(!showPwd)}
              >
                <Icon name={showPwd ? "eyeOff" : "eye"} size={15} />
                {showPwd ? "Masquer" : "Afficher"}
              </button>
            </div>
            <div className="card-body">
              {pwdMsg && (
                <div className={`alert alert-${pwdMsg.type}`} role="status">
                  <Icon name={pwdMsg.type === "success" ? "check" : "alert"} size={18} />
                  <span>{pwdMsg.text}</span>
                </div>
              )}

              <div className="form-grid">
                <div className="field span-2">
                  <label className="label" htmlFor="ancien">Mot de passe actuel</label>
                  <input
                    id="ancien"
                    name="ancien"
                    type={showPwd ? "text" : "password"}
                    className={`input ${pwdErrors.ancien ? "input-error" : ""}`}
                    value={pwd.ancien}
                    onChange={handlePwdChange}
                    autoComplete="current-password"
                    required
                  />
                  {pwdErrors.ancien && <span className="field-error">{pwdErrors.ancien}</span>}
                </div>

                <div className="field">
                  <label className="label" htmlFor="nouveau">Nouveau mot de passe</label>
                  <input
                    id="nouveau"
                    name="nouveau"
                    type={showPwd ? "text" : "password"}
                    className={`input ${pwdErrors.nouveau ? "input-error" : ""}`}
                    value={pwd.nouveau}
                    onChange={handlePwdChange}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  {pwd.nouveau && (
                    <div className={`strength strength-${score}`}>
                      <div className="strength-bars">
                        {[1, 2, 3, 4].map((i) => (
                          <span key={i} className={i <= score ? "on" : ""} />
                        ))}
                      </div>
                      <span>{scoreLabels[score]}</span>
                    </div>
                  )}
                  {pwdErrors.nouveau && <span className="field-error">{pwdErrors.nouveau}</span>}
                </div>

                <div className="field">
                  <label className="label" htmlFor="confirmation">Confirmer le mot de passe</label>
                  <input
                    id="confirmation"
                    name="confirmation"
                    type={showPwd ? "text" : "password"}
                    className={`input ${pwdErrors.confirmation ? "input-error" : ""}`}
                    value={pwd.confirmation}
                    onChange={handlePwdChange}
                    autoComplete="new-password"
                    required
                  />
                  {pwdErrors.confirmation && <span className="field-error">{pwdErrors.confirmation}</span>}
                </div>
              </div>

              <ul className="pwd-rules">
                <li className={pwd.nouveau.length >= 8 ? "ok" : ""}>Au moins 8 caractères</li>
                <li className={/\D/.test(pwd.nouveau) ? "ok" : ""}>Pas uniquement des chiffres</li>
                <li className={pwd.nouveau && pwd.nouveau === pwd.confirmation ? "ok" : ""}>
                  Confirmation identique
                </li>
              </ul>
            </div>
            <div className="card-footer">
              <button type="submit" className="btn btn-primary" disabled={savingPwd}>
                {savingPwd && <span className="spinner" />}
                Mettre à jour le mot de passe
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default MonCompte;

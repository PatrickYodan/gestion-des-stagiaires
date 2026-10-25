import { useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/ui/Icon";
import { apiErrorMessage } from "../utils/format";
import { passwordScore, scoreLabels } from "../utils/password";
import Logo from "../components/ui/Logo";

// Écran affiché à la première connexion d'un compte créé avec un mot de passe provisoire :
// l'utilisateur renseigne son identité et choisit son propre mot de passe avant d'accéder à l'application.
function PremiereConnexion() {
  const { user, updateUser, logout } = useAuth();
  const [form, setForm] = useState({
    prenom: user?.prenom || "",
    nom: user?.nom || "",
    nouveau: "",
    confirmation: "",
  });
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.nouveau !== form.confirmation) {
      setErrors({ confirmation: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("mon-compte/premiere-connexion/", {
        prenom: form.prenom,
        nom: form.nom,
        nouveau_mot_de_passe: form.nouveau,
      });
      // Le compte est finalisé : l'application s'ouvre normalement
      updateUser({ prenom: res.data.prenom, nom: res.data.nom, doit_changer_mdp: false });
    } catch (err) {
      const data = err?.response?.data || {};
      const pick = (k) => (Array.isArray(data[k]) ? data[k].join(" ") : "");
      const fieldErrors = { prenom: pick("prenom"), nom: pick("nom"), nouveau: pick("nouveau_mot_de_passe") };
      setErrors(fieldErrors);
      if (!Object.values(fieldErrors).some(Boolean)) {
        setError(apiErrorMessage(err, "Impossible de finaliser votre compte."));
      }
    } finally {
      setSaving(false);
    }
  };

  const score = passwordScore(form.nouveau);
  const type = showPwd ? "text" : "password";

  return (
    <div className="login">
      <aside className="login-aside">
        <div className="login-brand">
          <div className="brand-mark">
            <Logo size={40} />
          </div>
          <div>
            <div className="brand-name">Gestion des Stagiaires</div>
            <div className="brand-sub">Mairie</div>
          </div>
        </div>

        <div className="login-pitch">
          <h2>Bienvenue ! Finalisons votre compte.</h2>
          <p>
            Votre compte a été créé avec un mot de passe provisoire. Deux étapes rapides avant
            d'accéder à votre espace :
          </p>
          <ul className="login-features">
            <li>
              <span className="feature-icon">
                <Icon name="user" size={17} />
              </span>
              Renseignez votre prénom et votre nom
            </li>
            <li>
              <span className="feature-icon">
                <Icon name="lock" size={17} />
              </span>
              Choisissez votre propre mot de passe
            </li>
          </ul>
        </div>

        <div className="login-legal">Connecté en tant que {user?.email}</div>
      </aside>

      <main className="login-panel">
        <form onSubmit={handleSubmit} className="login-form" style={{ maxWidth: 420 }}>
          <div className="brand-mark">
            <Logo size={40} />
          </div>

          <div>
            <div className="page-eyebrow">Première connexion</div>
            <h1 className="login-title">Finalisez votre compte</h1>
            <p className="login-subtitle">
              Ces informations remplaceront le mot de passe provisoire reçu par e-mail.
            </p>
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="prenom">Prénom</label>
              <input id="prenom" name="prenom" className={`input ${errors.prenom ? "input-error" : ""}`} value={form.prenom} onChange={handleChange} required autoFocus autoComplete="given-name" />
              {errors.prenom && <span className="field-error">{errors.prenom}</span>}
            </div>
            <div className="field">
              <label className="label" htmlFor="nom">Nom</label>
              <input id="nom" name="nom" className={`input ${errors.nom ? "input-error" : ""}`} value={form.nom} onChange={handleChange} required autoComplete="family-name" />
              {errors.nom && <span className="field-error">{errors.nom}</span>}
            </div>

            <div className="field span-2">
              <label className="label" htmlFor="nouveau">Nouveau mot de passe</label>
              <div className="input-icon">
                <Icon name="lock" size={18} />
                <input id="nouveau" name="nouveau" type={type} className={`input ${errors.nouveau ? "input-error" : ""}`} value={form.nouveau} onChange={handleChange} required minLength={8} autoComplete="new-password" />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? "Masquer les mots de passe" : "Afficher les mots de passe"}
                >
                  <Icon name={showPwd ? "eyeOff" : "eye"} size={18} />
                </button>
              </div>
              {form.nouveau && (
                <div className={`strength strength-${score}`}>
                  <div className="strength-bars">
                    {[1, 2, 3, 4].map((i) => (
                      <span key={i} className={i <= score ? "on" : ""} />
                    ))}
                  </div>
                  <span>{scoreLabels[score]}</span>
                </div>
              )}
              {errors.nouveau && <span className="field-error">{errors.nouveau}</span>}
            </div>

            <div className="field span-2">
              <label className="label" htmlFor="confirmation">Confirmer le mot de passe</label>
              <div className="input-icon">
                <Icon name="lock" size={18} />
                <input id="confirmation" name="confirmation" type={type} className={`input ${errors.confirmation ? "input-error" : ""}`} value={form.confirmation} onChange={handleChange} required autoComplete="new-password" />
              </div>
              {errors.confirmation && <span className="field-error">{errors.confirmation}</span>}
            </div>
          </div>

          <ul className="pwd-rules" style={{ marginTop: 0 }}>
            <li className={form.nouveau.length >= 8 ? "ok" : ""}>Au moins 8 caractères</li>
            <li className={/\D/.test(form.nouveau) ? "ok" : ""}>Pas uniquement des chiffres</li>
            <li className={form.nouveau && form.nouveau === form.confirmation ? "ok" : ""}>
              Confirmation identique
            </li>
          </ul>

          <button type="submit" disabled={saving} className="btn btn-primary btn-block">
            {saving && <span className="spinner" />}
            Enregistrer et accéder à mon espace
          </button>

          <button type="button" className="btn btn-ghost" onClick={logout}>
            <Icon name="logout" size={16} /> Se déconnecter
          </button>
        </form>
      </main>
    </div>
  );
}

export default PremiereConnexion;

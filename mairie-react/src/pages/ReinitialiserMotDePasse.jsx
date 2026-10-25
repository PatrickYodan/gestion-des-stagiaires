import { useState } from "react";
import api from "../api/axios";
import AuthLayout from "../components/layout/AuthLayout";
import Icon from "../components/ui/Icon";
import { apiErrorMessage } from "../utils/format";
import { passwordScore, scoreLabels } from "../utils/password";
import { FORGOT_PATH, LOGIN_PATH, handleLinkClick, navigate } from "../utils/router";
import Logo from "../components/ui/Logo";

// Choix d'un nouveau mot de passe depuis le lien reçu par e-mail (/reinitialiser-mot-de-passe?uid=…&token=…)
function ReinitialiserMotDePasse() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const uid = params.get("uid");
  const token = params.get("token");

  const [form, setForm] = useState({ nouveau: "", confirmation: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

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
      await api.post("mot-de-passe-oublie/confirmer/", { uid, token, nouveau_mot_de_passe: form.nouveau });
      setDone(true);
    } catch (err) {
      const fieldMsgs = err?.response?.data?.nouveau_mot_de_passe;
      if (Array.isArray(fieldMsgs)) setErrors({ nouveau: fieldMsgs.join(" ") });
      else if (err?.response?.status === 429) setError("Trop de tentatives. Réessayez dans un moment.");
      else setError(apiErrorMessage(err, "Impossible de modifier le mot de passe."));
    } finally {
      setSaving(false);
    }
  };

  const linkTo = (path, label, icon) => (
    <a href={path} className="link link-back" onClick={(e) => handleLinkClick(e, path)}>
      {icon && <Icon name={icon} size={16} />} {label}
    </a>
  );

  // Lien incomplet (copié partiellement…)
  if (!uid || !token) {
    return (
      <AuthLayout>
        <div className="login-form">
          <div className="auth-result-icon auth-result-error">
            <Icon name="alert" size={26} />
          </div>
          <div>
            <h1 className="login-title">Lien incomplet</h1>
            <p className="login-subtitle">
              Ce lien de réinitialisation est incomplet. Ouvrez le lien directement depuis l'e-mail reçu, ou faites
              une nouvelle demande.
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(FORGOT_PATH)}>
            Faire une nouvelle demande
          </button>
          <div className="login-links">{linkTo(LOGIN_PATH, "Retour à la connexion", "chevronLeft")}</div>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="login-form">
          <div className="auth-result-icon auth-result-success">
            <Icon name="check" size={26} />
          </div>
          <div>
            <h1 className="login-title">Mot de passe modifié</h1>
            <p className="login-subtitle">
              Votre nouveau mot de passe est enregistré. Vous pouvez maintenant vous connecter avec votre adresse
              e-mail.
            </p>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(LOGIN_PATH)}>
            Se connecter
          </button>
        </div>
      </AuthLayout>
    );
  }

  const score = passwordScore(form.nouveau);
  const type = showPwd ? "text" : "password";
  const linkExpired = /invalide ou a expiré/.test(error);

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="login-form">
        <div className="brand-mark">
            <Logo size={40} />
          </div>

        <div>
          <h1 className="login-title">Nouveau mot de passe</h1>
          <p className="login-subtitle">Choisissez le mot de passe que vous utiliserez pour vous connecter.</p>
        </div>

        {error && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={18} />
            <span>
              {error}
              {linkExpired && (
                <>
                  {" "}
                  {linkTo(FORGOT_PATH, "Nouvelle demande")}
                </>
              )}
            </span>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="nouveau">Nouveau mot de passe</label>
          <div className="input-icon">
            <Icon name="lock" size={18} />
            <input
              id="nouveau"
              name="nouveau"
              type={type}
              className={`input ${errors.nouveau ? "input-error" : ""}`}
              value={form.nouveau}
              onChange={handleChange}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
            />
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

        <div className="field">
          <label className="label" htmlFor="confirmation">Confirmer le mot de passe</label>
          <div className="input-icon">
            <Icon name="lock" size={18} />
            <input
              id="confirmation"
              name="confirmation"
              type={type}
              className={`input ${errors.confirmation ? "input-error" : ""}`}
              value={form.confirmation}
              onChange={handleChange}
              required
              autoComplete="new-password"
            />
          </div>
          {errors.confirmation && <span className="field-error">{errors.confirmation}</span>}
        </div>

        <ul className="pwd-rules" style={{ marginTop: 0 }}>
          <li className={form.nouveau.length >= 8 ? "ok" : ""}>Au moins 8 caractères</li>
          <li className={/\D/.test(form.nouveau) ? "ok" : ""}>Pas uniquement des chiffres</li>
          <li className={form.nouveau && form.nouveau === form.confirmation ? "ok" : ""}>Confirmation identique</li>
        </ul>

        <button type="submit" disabled={saving} className="btn btn-primary btn-block">
          {saving && <span className="spinner" />}
          Enregistrer le nouveau mot de passe
        </button>

        <div className="login-links">{linkTo(LOGIN_PATH, "Retour à la connexion", "chevronLeft")}</div>
      </form>
    </AuthLayout>
  );
}

export default ReinitialiserMotDePasse;

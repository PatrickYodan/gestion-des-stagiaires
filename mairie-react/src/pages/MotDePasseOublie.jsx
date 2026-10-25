import { useState } from "react";
import api from "../api/axios";
import AuthLayout from "../components/layout/AuthLayout";
import Icon from "../components/ui/Icon";
import { apiErrorMessage } from "../utils/format";
import { LOGIN_PATH, handleLinkClick } from "../utils/router";
import Logo from "../components/ui/Logo";

// Demande d'un lien de réinitialisation du mot de passe, envoyé par e-mail
function MotDePasseOublie() {
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // réponse du serveur une fois la demande envoyée

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      const res = await api.post("mot-de-passe-oublie/", { email: email.trim() });
      setResult(res.data);
    } catch (err) {
      setError(
        err?.response?.status === 429
          ? "Trop de demandes. Réessayez dans un moment."
          : apiErrorMessage(err, "Impossible d'envoyer la demande."),
      );
    } finally {
      setSending(false);
    }
  };

  const backToLogin = (
    <a href={LOGIN_PATH} className="link link-back" onClick={(e) => handleLinkClick(e, LOGIN_PATH)}>
      <Icon name="chevronLeft" size={16} /> Retour à la connexion
    </a>
  );

  return (
    <AuthLayout>
      {result ? (
        <div className="login-form">
          <div className="auth-result-icon">
            <Icon name="mail" size={26} />
          </div>
          <div>
            <h1 className="login-title">Vérifiez vos e-mails</h1>
            <p className="login-subtitle">{result.detail}</p>
          </div>
          <p className="auth-hint">
            Le lien est valable <strong>1 heure</strong> et ne fonctionne qu'une seule fois. Pensez à regarder dans
            les courriers indésirables (spams).
          </p>
          {result.mode_console && (
            <div className="alert alert-warning">
              <Icon name="alert" size={18} />
              <span>
                Mode développement : l'e-mail est affiché dans la console du serveur Django au lieu d'être envoyé.
              </span>
            </div>
          )}
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setResult(null)}>
            Renvoyer un lien
          </button>
          <div className="login-links">{backToLogin}</div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="login-form">
          <div className="brand-mark">
            <Logo size={40} />
          </div>

          <div>
            <h1 className="login-title">Mot de passe oublié</h1>
            <p className="login-subtitle">
              Saisissez l'adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot
              de passe.
            </p>
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="field">
            <label htmlFor="email" className="label">
              Adresse e-mail
            </label>
            <div className="input-icon">
              <Icon name="mail" size={18} />
              <input
                type="email"
                id="email"
                className="input"
                placeholder="prenom.nom@exemple.com"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <button type="submit" disabled={sending} className="btn btn-primary btn-block">
            {sending ? (
              <>
                <span className="spinner" /> Envoi…
              </>
            ) : (
              "Envoyer le lien"
            )}
          </button>

          <div className="login-links">{backToLogin}</div>
        </form>
      )}
    </AuthLayout>
  );
}

export default MotDePasseOublie;

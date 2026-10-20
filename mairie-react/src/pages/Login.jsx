import { useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/layout/AuthLayout";
import Icon from "../components/ui/Icon";
import { FORGOT_PATH, handleLinkClick } from "../utils/router";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("token/", { email: email.trim(), password });
      login(response.data);
    } catch (err) {
      if (err.response && err.response.data) {
        // Intercepte le message renvoyé par Django (ex: "Votre compte est inactif...")
        if (err.response.data.detail) {
          setError(err.response.data.detail);
        } else if (err.response.status === 401) {
          setError("Adresse e-mail ou mot de passe incorrect.");
        } else {
          setError("Erreur lors de la tentative de connexion.");
        }
      } else {
        setError("Erreur de connexion au serveur backend.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="brand-mark">
            <Icon name="landmark" size={20} />
          </div>

          <div>
            <h1 className="login-title">Connexion</h1>
            <p className="login-subtitle">
              Entrez votre adresse e-mail et votre mot de passe pour accéder à votre espace.
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

          <div className="field">
            <label htmlFor="password" className="label">
              Mot de passe
            </label>
            <div className="input-icon">
              <Icon name="lock" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword
                    ? "Masquer le mot de passe"
                    : "Afficher le mot de passe"
                }
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={18} />
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-block"
          >
            {loading ? (
              <>
                <span className="spinner" /> Connexion...
              </>
            ) : (
              "Se connecter"
            )}
          </button>

          {/* Lien vers la réinitialisation du mot de passe (l'adresse saisie est reprise) */}
          <div className="login-links">
            <a
              href={FORGOT_PATH}
              className="link"
              onClick={(e) =>
                handleLinkClick(e, email.trim() ? `${FORGOT_PATH}?email=${encodeURIComponent(email.trim())}` : FORGOT_PATH)
              }
            >
              Mot de passe oublié ?
            </a>
          </div>
        </form>
    </AuthLayout>
  );
}

export default Login;

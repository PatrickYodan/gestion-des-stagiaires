import { useState } from "react";
import Icon from "../ui/Icon";

// Résultat de l'envoi des identifiants (création de compte ou renvoi)
function InvitationNotice({ invitation, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!invitation) return null;

  const { email, email_envoye, mode_console, mot_de_passe_provisoire } = invitation;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mot_de_passe_provisoire);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  let tone = "success";
  let content = (
    <>
      Les identifiants de connexion ont été envoyés à <strong>{email}</strong>.
    </>
  );

  if (email_envoye && mode_console) {
    tone = "warning";
    content = (
      <>
        Mode développement : l'e-mail destiné à <strong>{email}</strong> a été affiché dans la console du serveur
        Django, il n'a pas été réellement envoyé. Configurez le serveur SMTP pour l'envoi réel.
      </>
    );
  } else if (!email_envoye) {
    tone = "error";
    content = (
      <>
        Le compte a été créé, mais l'e-mail n'a pas pu être envoyé à <strong>{email}</strong>. Communiquez-lui ce mot
        de passe provisoire : <code className="temp-password">{mot_de_passe_provisoire}</code>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy} style={{ marginLeft: 8 }}>
          {copied ? "Copié" : "Copier"}
        </button>
      </>
    );
  }

  return (
    <div className={`alert alert-${tone} alert-dismissible`} role="status">
      <Icon name={tone === "success" ? "check" : tone === "warning" ? "mail" : "alert"} size={18} />
      <span>{content}</span>
      <button type="button" className="alert-close" onClick={onClose} aria-label="Fermer">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export default InvitationNotice;

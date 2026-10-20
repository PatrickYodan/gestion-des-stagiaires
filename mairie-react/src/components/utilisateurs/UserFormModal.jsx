import { useState, useEffect } from "react";
import api from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import Icon from "../ui/Icon";
import Modal from "../ui/Modal";
import { apiErrorMessage } from "../../utils/format";
import { ROLES } from "../../utils/roles";

const emptyForm = {
  username: "",
  password: "",
  prenom: "",
  nom: "",
  email: "",
  telephone: "",
  role: "TUTEUR",
  service: "",
  statut_compte: "ACTIF",
};

// Formulaire de création / modification d'un compte utilisateur.
// « fixedRole » : rôle imposé (ex. "TUTEUR" depuis la liste des encadrants), le sélecteur de rôle est alors masqué.
// Invitation (création) : un mot de passe provisoire est généré par le serveur et envoyé par e-mail ;
// la personne renseigne elle-même son nom, son prénom et son mot de passe à la première connexion.
function UserFormModal({
  item = null,
  services = [],
  fixedRole,
  onClose,
  onSaved,
  texts = {},
}) {
  const { user: currentUser } = useAuth();
  const isEdit = Boolean(item);
  const [sendInvite, setSendInvite] = useState(true);
  // Depuis la liste des encadrants, la création passe toujours par une invitation
  const invite = !isEdit && (fixedRole === "TUTEUR" || sendInvite);

  const [formData, setFormData] = useState(() => {
    const base = item
      ? {
          ...emptyForm,
          ...Object.fromEntries(
            Object.keys(emptyForm).map((k) => [k, item[k] ?? ""]),
          ),
          password: "",
        }
      : emptyForm;
    return fixedRole ? { ...base, role: fixedRole } : base;
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => photoPreview && URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      // Invitation : identité et mot de passe seront saisis par la personne elle-même
      if (
        invite &&
        ["password", "prenom", "nom", "username", "statut_compte"].includes(key)
      )
        return;
      // Mot de passe vide en modification = inchangé ; champs vides ignorés à la création
      // Email vide non envoyé : le champ est unique côté base
      if ((key === "password" || key === "email") && !value) return;
      if (!isEdit && value === "") return;
      data.append(key, value);
    });
    if (photoFile) data.append("photo", photoFile);

    setSaving(true);
    try {
      const config = { headers: { "Content-Type": "multipart/form-data" } };
      const res = isEdit
        ? await api.patch(`utilisateurs/${item.id}/`, data, config)
        : await api.post("utilisateurs/", data, config);
      onSaved(res.data);
    } catch (err) {
      setFormError(
        apiErrorMessage(err, "Erreur lors de l'enregistrement du compte."),
      );
    } finally {
      setSaving(false);
    }
  };

  const isTuteur = formData.role === "TUTEUR";

  return (
    <Modal
      title={
        isEdit
          ? texts.editTitle || "Modifier l'utilisateur"
          : texts.createTitle || "Nouvel utilisateur"
      }
      subtitle={
        isEdit
          ? item.email
          : texts.createSubtitle || "Créez un accès à la plateforme."
      }
      submitLabel={invite ? "Créer et envoyer les identifiants" : "Enregistrer"}
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      error={formError}
      size={640}
    >
      <div className="form-grid">
        {!isEdit && !fixedRole && (
          <label className="checkbox-row span-2">
            <input
              type="checkbox"
              checked={sendInvite}
              onChange={(e) => setSendInvite(e.target.checked)}
            />
            <span>
              <strong>Envoyer les identifiants par e-mail</strong>
              <span>
                Mot de passe provisoire généré automatiquement ; la personne
                complétera son profil à la première connexion.
              </span>
            </span>
          </label>
        )}

        {invite && (
          <div className="invite-note span-2">
            <Icon name="mail" size={18} />
            <div>
              Un e-mail contenant l'<strong>adresse de connexion</strong> et un{" "}
              <strong>mot de passe provisoire</strong> sera envoyé à l'adresse
              ci-dessous. À sa première connexion, la personne renseignera son
              nom et son prénom, puis choisira son propre mot de passe.
            </div>
          </div>
        )}

        {!invite && (
          <label className="upload span-2">
            <div className="upload-preview">
              {photoPreview || item?.photo ? (
                <img src={photoPreview || item.photo} alt="Aperçu" />
              ) : (
                <Icon name="user" size={22} />
              )}
            </div>
            <div className="upload-text">
              <strong>{photoFile ? photoFile.name : "Photo de profil"}</strong>
              <span>Facultatif — cliquez pour choisir une image</span>
            </div>
            <input type="file" accept="image/*" onChange={handleFileChange} />
          </label>
        )}

        {!invite && (
          <>
            <div className="field">
              <label className="label" htmlFor="prenom">
                Prénom
              </label>
              <input
                id="prenom"
                name="prenom"
                className="input"
                value={formData.prenom}
                onChange={handleChange}
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="nom">
                Nom
              </label>
              <input
                id="nom"
                name="nom"
                className="input"
                value={formData.nom}
                onChange={handleChange}
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="username">
                Nom d'utilisateur
              </label>
              <input
                id="username"
                name="username"
                className="input"
                value={formData.username}
                onChange={handleChange}
                required
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">
                Mot de passe{" "}
                {isEdit && (
                  <span className="optional">
                    (laisser vide pour ne pas changer)
                  </span>
                )}
              </label>
              <input
                id="password"
                type="password"
                name="password"
                className="input"
                value={formData.password}
                onChange={handleChange}
                required={!isEdit}
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          </>
        )}

        <div className="field">
          <label className="label" htmlFor="email">
            Adresse e-mail
          </label>
          <input
            id="email"
            type="email"
            name="email"
            className="input"
            value={formData.email}
            onChange={handleChange}
            required
            autoComplete="off"
          />
          <span className="field-hint">Sert d'identifiant de connexion.</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="telephone">
            Téléphone <span className="optional">(facultatif)</span>
          </label>
          <input
            id="telephone"
            type="tel"
            name="telephone"
            className="input"
            value={formData.telephone}
            onChange={handleChange}
          />
        </div>

        {!fixedRole && (
          <div className="field">
            <label className="label" htmlFor="role">
              Rôle
            </label>
            <select
              id="role"
              name="role"
              className="input"
              value={formData.role}
              onChange={handleChange}
            >
              {Object.entries(ROLES).map(([key, r]) => (
                <option key={key} value={key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={`field ${fixedRole ? "span-2" : ""}`}>
          <label className="label" htmlFor="service">
            Service{" "}
            {isTuteur ? (
              "de rattachement"
            ) : (
              <span className="optional">(facultatif)</span>
            )}
          </label>
          <select
            id="service"
            name="service"
            className="input"
            value={formData.service}
            onChange={handleChange}
            required={isTuteur}
          >
            <option value="">{isTuteur ? "Sélectionner…" : "Aucun"}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </div>

        {!invite && (
          <div className="field span-2">
            <label className="label" htmlFor="statut_compte">
              Statut du compte
            </label>
            <select
              id="statut_compte"
              name="statut_compte"
              className="input"
              value={formData.statut_compte}
              onChange={handleChange}
              disabled={item?.id === currentUser?.id}
            >
              <option value="ACTIF">Actif — peut se connecter</option>
              <option value="INACTIF">Inactif — connexion bloquée</option>
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default UserFormModal;

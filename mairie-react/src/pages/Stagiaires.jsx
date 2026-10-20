import { useState, useEffect } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/ui/Avatar";
import EmptyState from "../components/ui/EmptyState";
import FicheNoteStage from "../components/stages/FicheNoteStage";
import Icon from "../components/ui/Icon";
import ServiceGlyph from "../components/services/ServiceGlyph";
import Modal from "../components/ui/Modal";
import { apiErrorMessage, formatNote, fullName, isNoted, noteBadge } from "../utils/format";

const emptyForm = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  adresse: "",
  niveau_etudes: "",
  etablissement: "",
};

function Stagiaires() {
  const { user, can } = useAuth();
  const [stagiaires, setStagiaires] = useState([]);
  const [etablissements, setEtablissements] = useState([]);
  const [stages, setStages] = useState([]);
  const [services, setServices] = useState([]);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Formulaire : null = fermé, { item: null } = création, { item } = modification
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [photoFile, setPhotoFile] = useState(null); // Fichier image à envoyer
  const [photoPreview, setPhotoPreview] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Stagiaire dont la fiche de note est affichée
  const [fiche, setFiche] = useState(null);

  // Stagiaires, établissements, et données utiles à la fiche de note (stages, services, tuteurs)
  const loadData = () =>
    Promise.all([
      api.get("stagiaires/"),
      api.get("etablissements/"),
      api.get("stages/"),
      api.get("services/"),
      api.get("utilisateurs/"),
    ])
      .then(([resStagiaires, resEtablissements, resStages, resServices, resUsers]) => {
        setStagiaires(resStagiaires.data);
        setEtablissements(resEtablissements.data);
        setStages(resStages.data);
        setServices(resServices.data);
        setUtilisateurs(resUsers.data);
        setError("");
      })
      .catch(() => setError("Impossible de charger les données des stagiaires."))
      .finally(() => setLoading(false));

  useEffect(() => {
    loadData();
  }, []);

  // Libère l'URL de l'aperçu photo quand elle change
  useEffect(() => {
    return () => photoPreview && URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const openForm = (item = null) => {
    setFormData(
      item
        ? Object.fromEntries(Object.keys(emptyForm).map((k) => [k, item[k] ?? ""]))
        : emptyForm,
    );
    setPhotoFile(null);
    setPhotoPreview(null);
    setFormError("");
    setEditing({ item });
  };

  const closeForm = () => {
    setEditing(null);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  // Gestion des changements de saisie de texte
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Gestion du changement de la photo de profil
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoFile(e.target.files[0]);
      setPhotoPreview(URL.createObjectURL(e.target.files[0]));
    }
  };

  // Soumission du formulaire (FormData pour pouvoir envoyer la photo)
  const handleSubmit = async (e) => {
    e.preventDefault();

    const dataToSend = new FormData();
    Object.entries(formData).forEach(([key, value]) => dataToSend.append(key, value));
    // Ajout du fichier photo s'il a été sélectionné (sinon la photo actuelle est conservée)
    if (photoFile) dataToSend.append("photo", photoFile);

    setSaving(true);
    try {
      const config = { headers: { "Content-Type": "multipart/form-data" } };
      if (editing.item) {
        await api.patch(`stagiaires/${editing.item.id}/`, dataToSend, config);
      } else {
        await api.post("stagiaires/", dataToSend, config);
      }
      closeForm();
      loadData(); // Rafraîchir la liste
    } catch (err) {
      setFormError(apiErrorMessage(err, "Erreur lors de l'enregistrement du stagiaire. Vérifiez les données."));
    } finally {
      setSaving(false);
    }
  };

  // Suppression d'un stagiaire
  const handleDelete = async (item) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer ${fullName(item)} ?`)) return;
    try {
      await api.delete(`stagiaires/${item.id}/`);
      // Retire le stagiaire de la liste affichée
      setStagiaires(stagiaires.filter((stagiaire) => stagiaire.id !== item.id));
    } catch (err) {
      alert(apiErrorMessage(err, "Erreur lors de la suppression."));
    }
  };

  // Obtenir le nom de l'établissement par ID
  const getEtablissementNom = (id) => {
    const etab = etablissements.find((e) => e.id === id);
    return etab ? etab.nom : "Non spécifié";
  };

  const serviceNom = (id) => services.find((s) => s.id === id)?.nom || "Service non précisé";

  // Stages d'un stagiaire, du plus récent au plus ancien
  const stagesOf = (stagiaireId) =>
    stages
      .filter((s) => s.stagiaire === stagiaireId)
      .sort((a, b) => String(b.date_debut).localeCompare(String(a.date_debut)));

  // Accès complet au module : ajout, modification et suppression de stagiaires
  const isGestionnaire = can("stagiaires", 2);
  // Encadrant : l'API ne renvoie que les stagiaires dont il est le tuteur
  const isTuteur = user?.role === "TUTEUR";
  const isEdit = Boolean(editing?.item);

  const query = search.trim().toLowerCase();
  const filtered = stagiaires.filter((s) =>
    [s.prenom, s.nom, s.email, s.telephone, s.niveau_etudes, getEtablissementNom(s.etablissement)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(query)),
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Stagiaires</div>
          <h2 className="page-title">
            {user?.role === "TUTEUR" ? "Mes Stagiaires" : "Gestion des Stagiaires"}
          </h2>
          <p className="page-subtitle">
            {isTuteur
              ? "Stagiaires dont vous êtes le tuteur sur au moins un stage"
              : "Liste globale des stagiaires enregistrés dans la mairie"}
          </p>
        </div>

        {isGestionnaire && (
          <button onClick={() => openForm()} className="btn btn-primary">
            <Icon name="plus" size={18} />
            <span className="btn-label">Nouveau stagiaire</span>
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-count">
            <strong>{filtered.length}</strong> stagiaire
            {filtered.length > 1 ? "s" : ""}
          </div>
          <div className="search">
            <Icon name="search" size={16} />
            <input
              className="input"
              placeholder="Rechercher par nom, email, établissement…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
            icon="graduation"
            title={query ? "Aucun résultat" : isTuteur ? "Aucun stagiaire assigné" : "Aucun stagiaire trouvé"}
            description={
              query
                ? "Aucun stagiaire ne correspond à votre recherche."
                : isTuteur
                  ? "Les stagiaires apparaîtront ici dès qu'un stage vous sera confié comme tuteur."
                  : "Les stagiaires enregistrés apparaîtront ici."
            }
          >
            {!query && isGestionnaire && (
              <button
                className="btn btn-primary"
                style={{ marginTop: "1.25rem" }}
                onClick={() => openForm()}
              >
                <Icon name="plus" size={18} /> Ajouter un stagiaire
              </button>
            )}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Stagiaire</th>
                  <th>Établissement</th>
                  <th>Stage</th>
                  <th className="col-center">Note</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const own = stagesOf(item.id);
                  const last = own[0];
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="person">
                          <Avatar src={item.photo} prenom={item.prenom} nom={item.nom} />
                          <div>
                            <div className="person-name">
                              {item.prenom} {item.nom}
                            </div>
                            <div className="person-meta" style={{ maxWidth: 205 }} title={item.email}>{item.email}</div>
                            {item.telephone && (
                              <div className="person-meta">
                                <Icon name="phone" size={11} />
                                {item.telephone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {item.etablissement ? (
                          <div className="cell-strong cell-clamp" style={{ minWidth: 150, maxWidth: 190 }} title={getEtablissementNom(item.etablissement)}>
                            {getEtablissementNom(item.etablissement)}
                          </div>
                        ) : (
                          <div className="muted">Non spécifié</div>
                        )}
                        {item.niveau_etudes && (
                          <div className="cell-sub truncate" style={{ maxWidth: 190 }} title={item.niveau_etudes}>
                            <Icon name="graduation" size={12} />
                            {item.niveau_etudes}
                          </div>
                        )}
                      </td>
                      <td>
                        {last ? (
                          <>
                            <div className="cell-strong cell-clamp" style={{ minWidth: 170, maxWidth: 230 }} title={last.intitule}>
                              {last.intitule}
                            </div>
                            <div className="cell-sub truncate" style={{ maxWidth: 230 }}>
                              <ServiceGlyph service={services.find((s) => s.id === last.service)} size={12} />
                              {serviceNom(last.service)}
                              {own.length > 1 && ` · +${own.length - 1} autre${own.length > 2 ? "s" : ""}`}
                            </div>
                          </>
                        ) : (
                          <span className="muted">Aucun stage</span>
                        )}
                      </td>
                      <td className="col-center">
                        {last && isNoted(last.gratification) ? (
                          <span className={`badge ${noteBadge(last.gratification)}`}>
                            {formatNote(last.gratification)}
                          </span>
                        ) : (
                          <span className="muted">{last ? "Non notée" : "—"}</span>
                        )}
                      </td>
                      <td className="col-actions">
                        <div className="row-actions">
                          <button
                            onClick={() => setFiche(item)}
                            className="btn btn-secondary btn-sm"
                            title={last ? "Afficher et imprimer la fiche de note de stage" : "Aucun stage enregistré"}
                            disabled={!last}
                          >
                            <Icon name="fileText" size={14} />
                            <span className="btn-label">Fiche</span>
                          </button>
                          {isGestionnaire && (
                            <>
                              <button
                                onClick={() => openForm(item)}
                                className="btn btn-ghost btn-sm btn-icon"
                                title="Modifier"
                                aria-label={`Modifier ${item.prenom} ${item.nom}`}
                              >
                                <Icon name="pencil" size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(item)}
                                className="btn btn-danger-ghost btn-sm btn-icon"
                                title="Supprimer"
                                aria-label={`Supprimer ${item.prenom} ${item.nom}`}
                              >
                                <Icon name="trash" size={15} />
                              </button>
                            </>
                          )}
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

      {/* Formulaire de création / modification */}
      {editing && (
        <Modal
          title={isEdit ? "Modifier le stagiaire" : "Ajouter un stagiaire"}
          subtitle={isEdit ? fullName(editing.item) : "Renseignez les informations du nouveau stagiaire."}
          onClose={closeForm}
          onSubmit={handleSubmit}
          saving={saving}
          error={formError}
        >
          <div className="form-grid">
            {/* Champ d'upload de la photo */}
            <label className="upload span-2">
              <div className="upload-preview">
                {photoPreview || editing.item?.photo ? (
                  <img src={photoPreview || editing.item.photo} alt="Aperçu" />
                ) : (
                  <Icon name="user" size={22} />
                )}
              </div>
              <div className="upload-text">
                <strong>{photoFile ? photoFile.name : "Photo de profil"}</strong>
                <span>
                  {photoFile || editing.item?.photo
                    ? "Cliquez pour changer l'image"
                    : "Cliquez pour choisir une image (JPG, PNG)"}
                </span>
              </div>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>

            <div className="field">
              <label className="label" htmlFor="nom">Nom</label>
              <input id="nom" type="text" name="nom" value={formData.nom} onChange={handleChange} required className="input" />
            </div>

            <div className="field">
              <label className="label" htmlFor="prenom">Prénom</label>
              <input id="prenom" type="text" name="prenom" value={formData.prenom} onChange={handleChange} required className="input" />
            </div>

            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" name="email" value={formData.email} onChange={handleChange} required className="input" placeholder="nom@exemple.com" />
            </div>

            <div className="field">
              <label className="label" htmlFor="telephone">Téléphone</label>
              <input id="telephone" type="tel" name="telephone" value={formData.telephone} onChange={handleChange} required className="input" />
            </div>

            <div className="field span-2">
              <label className="label" htmlFor="adresse">Adresse</label>
              <input id="adresse" type="text" name="adresse" value={formData.adresse} onChange={handleChange} required className="input" />
            </div>

            <div className="field">
              <label className="label" htmlFor="niveau_etudes">Niveau d'études</label>
              <input id="niveau_etudes" type="text" name="niveau_etudes" value={formData.niveau_etudes} onChange={handleChange} required className="input" placeholder="ex. Licence 3" />
            </div>

            <div className="field">
              <label className="label" htmlFor="etablissement">Établissement</label>
              <select id="etablissement" name="etablissement" value={formData.etablissement} onChange={handleChange} required className="input">
                <option value="">Sélectionner…</option>
                {etablissements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Fiche de note de stage imprimable */}
      {fiche && (
        <FicheNoteStage
          stagiaire={fiche}
          stages={stagesOf(fiche.id)}
          services={services}
          utilisateurs={utilisateurs}
          etablissements={etablissements}
          onClose={() => setFiche(null)}
        />
      )}
    </div>
  );
}

export default Stagiaires;

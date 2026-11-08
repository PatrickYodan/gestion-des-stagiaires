import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import Icon from "../ui/Icon";
import EmptyState from "../ui/EmptyState";
import { apiErrorMessage } from "../../utils/format";
import LoadingState from "../ui/LoadingState";
import { SkeletonTimeline } from "../ui/Skeleton";

// Journal d'audit (administrateur) : qui a fait quoi, quand, depuis quelle adresse IP.
// Filtres par catégorie, auteur, période et texte ; détail des champs modifiés ; export CSV.

const TAILLE = 30;

// Icône et couleur par catégorie
const CATEGORIES = {
  connexion: { icon: "lock", tone: "tone-blue" },
  compte: { icon: "users", tone: "tone-violet" },
  stagiaire: { icon: "graduation", tone: "tone-orange" },
  stage: { icon: "clipboard", tone: "tone-rose" },
  document: { icon: "fileText", tone: "tone-amber" },
  service: { icon: "building", tone: "tone-cyan" },
  etablissement: { icon: "mapPin", tone: "tone-teal" },
  droits: { icon: "shield", tone: "tone-violet" },
  securite: { icon: "lock", tone: "tone-green" },
};

const ROLES = { ADMIN: "Administrateur", RH: "Agent RH", TUTEUR: "Tuteur" };

// Noms lisibles des champs modifiés
const CHAMPS = {
  nom: "Nom",
  prenom: "Prénom",
  email: "E-mail",
  telephone: "Téléphone",
  adresse: "Adresse",
  niveau_etudes: "Niveau d'études",
  etablissement: "Établissement",
  intitule: "Intitulé",
  missions: "Missions",
  date_debut: "Date de début",
  date_fin: "Date de fin",
  gratification: "Note",
  statut: "Statut",
  stagiaire: "Stagiaire",
  tuteur: "Encadrant",
  service: "Service",
  role: "Rôle",
  statut_compte: "Statut du compte",
  is_active: "Actif",
  description: "Description",
  ville: "Ville",
  localisation: "Localisation",
  email_contact: "E-mail de contact",
  nom_fichier: "Nom du fichier",
  type_doc: "Type",
  chemin_fichier: "Fichier",
  photo: "Photo",
  appreciation: "Appréciation",
  motif_retour: "Motif de renvoi",
  est_supprime: "Supprimé",
  is_deleted: "Supprimé",
  doit_changer_mdp: "Première connexion à finaliser",
};

const NIVEAUX = { 0: "Aucun", 1: "Lecture", 2: "Complet" };

const formatDateHeure = (iso) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const valeur = (v, droits) => {
  if (droits && v in NIVEAUX) return NIVEAUX[v];
  if (v === null || v === undefined || v === "") return "—";
  if (v === true) return "Oui";
  if (v === false) return "Non";
  return String(v).length > 80 ? `${String(v).slice(0, 80)}…` : String(v);
};

// Détail d'une entrée : champs modifiés, note, motif…
function Details({ entree }) {
  const d = entree.details || {};
  const modifs = d.modifications || {};
  const lignes = Object.entries(modifs);
  const droits = entree.categorie === "droits";
  return (
    <div className="journal-details">
      {lignes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{droits ? "Rôle · module" : "Champ"}</th>
              <th>Avant</th>
              <th>Après</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(([champ, [avant, apres]]) => (
              <tr key={champ}>
                <td>{CHAMPS[champ] || champ}</td>
                <td className="journal-old">{valeur(avant, droits)}</td>
                <td className="journal-new">{valeur(apres, droits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.note !== undefined && <p>Note attribuée : <strong>{d.note} / 20</strong></p>}
      {d.motif && <p>Motif : <strong>{d.motif}</strong></p>}
      {d.email && <p>Adresse saisie : <strong>{d.email}</strong></p>}
      {d.champs && d.champs.length > 0 && <p>Champs : {d.champs.map((c) => CHAMPS[c] || c).join(", ")}</p>}
      <p className="journal-meta">
        Adresse IP : {entree.ip || "inconnue"} · Réf. #{entree.id}
      </p>
    </div>
  );
}

function JournalAudit() {
  const [data, setData] = useState(null);
  const [entrees, setEntrees] = useState([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [chargementPlus, setChargementPlus] = useState(false);
  const [ouvert, setOuvert] = useState(null);
  const [filtres, setFiltres] = useState({ q: "", categorie: "", utilisateur: "", du: "", au: "", echecs: false });
  const [recherche, setRecherche] = useState(""); // texte saisi (appliqué après une courte pause)

  // La recherche texte est appliquée 350 ms après la dernière frappe
  useEffect(() => {
    const t = setTimeout(() => setFiltres((f) => (f.q === recherche ? f : { ...f, q: recherche })), 350);
    return () => clearTimeout(t);
  }, [recherche]);

  const params = useCallback(
    (extra = {}) => {
      const p = new URLSearchParams();
      Object.entries(filtres).forEach(([k, v]) => {
        if (v === true) p.set(k, "1");
        else if (v) p.set(k, v);
      });
      Object.entries(extra).forEach(([k, v]) => p.set(k, v));
      return p.toString();
    },
    [filtres],
  );

  // Chargement de la première page à chaque changement de filtre ;
  // le chargement est en cours tant que la page affichée ne correspond pas aux filtres actuels.
  const cle = params({ page: 1, taille: TAILLE });
  const [cleChargee, setCleChargee] = useState(null);
  useEffect(() => {
    let annule = false;
    api
      .get(`journal/?${cle}`)
      .then((res) => {
        if (annule) return;
        setData(res.data);
        setEntrees(res.data.resultats);
        setPage(1);
        setError("");
      })
      .catch((err) => !annule && setError(apiErrorMessage(err, "Impossible de charger le journal d'audit.")))
      .finally(() => !annule && setCleChargee(cle));
    return () => {
      annule = true;
    };
  }, [cle]);
  const chargementFiltres = cleChargee !== cle;

  const chargerPlus = () => {
    const suivante = page + 1;
    setChargementPlus(true);
    api
      .get(`journal/?${params({ page: suivante, taille: TAILLE })}`)
      .then((res) => {
        setEntrees((list) => [...list, ...res.data.resultats]);
        setPage(suivante);
      })
      .catch((err) => setError(apiErrorMessage(err, "Impossible de charger la suite du journal.")))
      .finally(() => setChargementPlus(false));
  };

  const exporter = async () => {
    try {
      const res = await api.get(`journal/?${params({ export: "csv" })}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err, "L'export a échoué."));
    }
  };

  const changer = (champ, v) => setFiltres((f) => ({ ...f, [champ]: v }));
  const filtresActifs = Object.entries(filtres).some(([, v]) => v) || recherche;
  const reinitialiser = () => {
    setRecherche("");
    setFiltres({ q: "", categorie: "", utilisateur: "", du: "", au: "", echecs: false });
  };

  return (
    <div className="card journal">
      <div className="card-header journal-head">
        <div>
          <h3 className="card-title">Journal d'audit</h3>
          <p className="card-subtitle">
            Toutes les actions des utilisateurs : connexions, créations, modifications, suppressions et validations.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={exporter}>
          <Icon name="upload" size={14} /> Exporter (CSV)
        </button>
      </div>

      {data?.echecs_connexion_24h > 0 && (
        <button type="button" className="journal-alerte" onClick={() => changer("echecs", true)}>
          <Icon name="alert" size={16} />
          <span>
            <strong>{data.echecs_connexion_24h} échec{data.echecs_connexion_24h > 1 ? "s" : ""} de connexion</strong> ces
            dernières 24 heures
          </span>
          <span className="journal-alerte-lien">Voir</span>
        </button>
      )}

      <div className="journal-filtres">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            className="input"
            placeholder="Rechercher (action, utilisateur, adresse IP)…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <select className="input" value={filtres.categorie} onChange={(e) => changer("categorie", e.target.value)} aria-label="Catégorie">
          <option value="">Toutes les catégories</option>
          {(data?.categories || []).map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <select className="input" value={filtres.utilisateur} onChange={(e) => changer("utilisateur", e.target.value)} aria-label="Utilisateur">
          <option value="">Tous les utilisateurs</option>
          {(data?.auteurs || []).map((a) => (
            <option key={a.id} value={a.id}>{a.nom}</option>
          ))}
        </select>
        <label className="journal-date">
          <span>Du</span>
          <input type="date" className="input" value={filtres.du} onChange={(e) => changer("du", e.target.value)} />
        </label>
        <label className="journal-date">
          <span>Au</span>
          <input type="date" className="input" value={filtres.au} onChange={(e) => changer("au", e.target.value)} />
        </label>
        <label className="journal-check">
          <input type="checkbox" checked={filtres.echecs} onChange={(e) => changer("echecs", e.target.checked)} />
          Échecs uniquement
        </label>
        {filtresActifs && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={reinitialiser}>
            <Icon name="x" size={14} /> Effacer
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error" style={{ margin: "0 1.25rem 1rem" }}>
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </div>
      )}

      {chargementFiltres && !entrees.length ? (
        <LoadingState contexte="journal">
          <SkeletonTimeline rows={5} />
        </LoadingState>
      ) : entrees.length === 0 ? (
        <EmptyState
          icon="archive"
          title="Aucune action enregistrée"
          description={filtresActifs ? "Aucune action ne correspond à ces filtres." : "Les actions des utilisateurs apparaîtront ici."}
        />
      ) : (
        <>
          <p className="journal-total">
            {data.total} action{data.total > 1 ? "s" : ""}
            {filtresActifs ? " correspondant aux filtres" : " enregistrée" + (data.total > 1 ? "s" : "")}
          </p>
          <ul className="journal-list">
            {entrees.map((e) => {
              const cat = CATEGORIES[e.categorie] || { icon: "clock", tone: "" };
              const aDetails =
                Object.keys(e.details?.modifications || {}).length > 0 ||
                e.details?.motif ||
                e.details?.note !== undefined ||
                e.details?.email ||
                e.details?.champs?.length;
              return (
                <li key={e.id} className={`journal-item ${e.succes ? "" : "is-echec"} ${ouvert === e.id ? "is-open" : ""}`}>
                  <button type="button" className="journal-row" onClick={() => setOuvert(ouvert === e.id ? null : e.id)}>
                    <span className={`journal-icon ${cat.tone}`}>
                      <Icon name={e.succes ? cat.icon : "alert"} size={16} />
                    </span>
                    <span className="journal-main">
                      <strong>{e.libelle}</strong>
                      <span>
                        {e.utilisateur_nom || "Visiteur non connecté"}
                        {e.role && <em> · {ROLES[e.role] || e.role}</em>}
                      </span>
                    </span>
                    <span className="journal-side">
                      {!e.succes && <span className="badge badge-danger">Échec</span>}
                      <time>{formatDateHeure(e.date)}</time>
                      <Icon name="chevronRight" size={14} className="journal-chevron" />
                    </span>
                  </button>
                  {ouvert === e.id && (aDetails ? <Details entree={e} /> : (
                    <div className="journal-details">
                      <p className="journal-meta">Adresse IP : {e.ip || "inconnue"} · Réf. #{e.id}</p>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
          {entrees.length < data.total && (
            <div className="journal-more">
              <button type="button" className="btn btn-secondary btn-sm" onClick={chargerPlus} disabled={chargementPlus}>
                {chargementPlus && <span className="spinner spinner-dark" />}
                Afficher plus ({data.total - entrees.length} restante{data.total - entrees.length > 1 ? "s" : ""})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default JournalAudit;

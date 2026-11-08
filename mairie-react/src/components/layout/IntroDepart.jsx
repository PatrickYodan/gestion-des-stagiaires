import { useEffect, useRef, useState } from "react";
import Logo from "../ui/Logo";
import Particles from "./Particles";

// Animation d'accueil affichée avant la page de connexion (à chaque chargement de la page).
// Un stagiaire, sac au dos, quitte sa maison et marche jusqu'à la mairie. Sous ses pas, une
// frise reprend les étapes du stage gérées par l'application : elle se remplit à son passage
// et la légende raconte l'étape en cours.
//
// Expérience :
//   • légère parallaxe qui suit la souris (mêmes variables --px / --py que le panneau de connexion)
//   • « Passer » (ou Entrée / Échap / Espace) avec un anneau qui montre le temps restant
//   • sortie en continuité : la scène se replie sur le panneau bleu de la connexion
//     (écran large) ou s'efface en fondu (téléphone, où ce panneau est masqué)
// Styles : section « INTRO : départ du stagiaire » d'index.css.
export const INTRO_MS = 5600; // durée de la scène (doit suivre les délais CSS)
const SORTIE_MS = 750; // repli / fondu vers la page de connexion

// Marche à vitesse constante : de la porte de la maison (x 150) à celle de la mairie (x 660)
const DEPART_X = 150;
const ARRIVEE_X = 660;
const DEBUT_MARCHE = 1.3; // s
const DUREE_MARCHE = 3; // s
const passage = (x) => DEBUT_MARCHE + (DUREE_MARCHE * (x - DEPART_X)) / (ARRIVEE_X - DEPART_X);

// Étapes du stage (mêmes libellés que l'animation du panneau de connexion)
const ETAPES = [
  { x: 252, label: "Affectation", texte: "Un service et un encadrant l'attendent." },
  { x: 354, label: "Documents", texte: "Sa convention et ses pièces rejoignent le dossier." },
  { x: 456, label: "Évaluation", texte: "Son encadrant suit et note son travail." },
  { x: 558, label: "Attestation", texte: "Le stage est validé et l'attestation délivrée." },
].map((e) => ({ ...e, delai: passage(e.x) }));

const LEGENDE_DEPART = { titre: "Premier jour de stage", texte: "Sac au dos, le stagiaire quitte la maison." };
const LEGENDE_ARRIVEE = { titre: "Bienvenue à la mairie", texte: "Suivez chaque stage, du premier jour à l'attestation." };
const ARRIVEE_S = DEBUT_MARCHE + DUREE_MARCHE;

// Fenêtres des deux ailes de la mairie : elles s'allument en désordre à l'arrivée
const FENETRES = [596, 610, 702, 716].flatMap((x, i) =>
  [150, 172].map((y, j) => ({ x, y, delai: ARRIVEE_S - 0.05 + (((i * 2 + j) * 5) % 8) * 0.06 })),
);

function IntroDepart({ onSortie, onDone }) {
  const racine = useRef(null);
  const termine = useRef(false);
  const [sortie, setSortie] = useState(""); // "" | "vers-panneau" | "fondu"
  const [etape, setEtape] = useState(-1); // -1 : départ, 0..3 : étapes, 4 : arrivée

  // Fin de l'intro : la connexion est affichée dessous, puis la scène se replie dessus
  const terminer = () => {
    if (termine.current) return;
    termine.current = true;
    onSortie?.();
    // Image suivante : le panneau de la connexion est en place, on mesure sa largeur
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const panneau = document.querySelector(".login-aside");
        const largeur = panneau?.getBoundingClientRect().width || 0;
        if (largeur > 0 && racine.current) {
          racine.current.style.setProperty("--panneau", `${largeur}px`);
          setSortie("vers-panneau");
        } else {
          setSortie("fondu");
        }
        setTimeout(onDone, SORTIE_MS);
      }),
    );
  };

  useEffect(() => {
    // Mouvements réduits demandés par le système : connexion directe
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onSortie?.();
      onDone();
      return undefined;
    }
    // Légende synchronisée sur le passage du stagiaire
    const minuteurs = [
      ...ETAPES.map((e, i) => setTimeout(() => setEtape(i), e.delai * 1000)),
      setTimeout(() => setEtape(4), ARRIVEE_S * 1000),
      setTimeout(terminer, INTRO_MS),
    ];
    const clavier = (e) => {
      if (["Escape", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        terminer();
      }
    };
    window.addEventListener("keydown", clavier);
    return () => {
      minuteurs.forEach(clearTimeout);
      window.removeEventListener("keydown", clavier);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parallaxe : position de la souris de -1 à 1 depuis le centre (sans re-rendu React)
  const suivreSouris = (e) => {
    if (e.pointerType !== "mouse" || !racine.current) return;
    const el = racine.current;
    el.style.setProperty("--px", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
    el.style.setProperty("--py", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
  };

  const legende = etape < 0 ? LEGENDE_DEPART : etape > 3 ? LEGENDE_ARRIVEE : { titre: ETAPES[etape].label, texte: ETAPES[etape].texte };

  return (
    <div
      ref={racine}
      className={`intro-depart ${sortie ? `is-leaving ${sortie}` : ""}`}
      onPointerMove={suivreSouris}
      role="region"
      aria-label="Animation d'accueil"
    >
      <Particles />

      {/* Même place que la marque du panneau de connexion : elle y reste lors du repli */}
      <div className="intro-marque">
        <Logo size={40} />
        <div>
          <div className="intro-marque-nom">Gestion des Stagiaires</div>
          <div className="intro-marque-sous">Mairie</div>
        </div>
      </div>

      <button type="button" className="intro-passer" onClick={terminer}>
        <svg className="intro-passer-anneau" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="10" pathLength="1" style={{ animationDuration: `${INTRO_MS}ms` }} />
        </svg>
        Passer
        <kbd>Entrée</kbd>
      </button>

      <div className="intro-stage">
        <svg className="intro-scene" viewBox="0 0 800 280" aria-hidden="true">
          <defs>
            <linearGradient id="intro-facade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#dbeafe" />
            </linearGradient>
            <linearGradient id="intro-sol" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.18" stopColor="#fff" stopOpacity="1" />
              <stop offset="0.82" stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="intro-trace" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7dd3fc" />
              <stop offset="1" stopColor="#ffffff" />
            </linearGradient>
            <radialGradient id="intro-halo">
              <stop offset="0" stopColor="#fde68a" stopOpacity="0.55" />
              <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Ciel : halo du soleil et nuages (plan lointain de la parallaxe) */}
          <g className="intro-ciel">
            <g className="intro-soleil">
              <circle cx="400" cy="78" r="80" fill="url(#intro-halo)" />
              <circle cx="400" cy="78" r="24" fill="#fde68a" />
            </g>
            <g className="intro-nuage n1" fill="#fff" opacity="0.4">
              <rect x="196" y="56" width="74" height="18" rx="9" />
              <rect x="218" y="45" width="34" height="18" rx="9" />
            </g>
            <g className="intro-nuage n2" fill="#fff" opacity="0.28">
              <rect x="508" y="34" width="58" height="14" rx="7" />
              <rect x="524" y="26" width="26" height="14" rx="7" />
            </g>
          </g>

          {/* Sol */}
          <rect x="0" y="230" width="800" height="1.5" fill="url(#intro-sol)" opacity="0.45" />

          {/* Frise du stage : rail, tracé parcouru (rempli au rythme de la marche) et étapes */}
          <rect x={DEPART_X} y="243" width={ARRIVEE_X - DEPART_X} height="4" rx="2" fill="#fff" opacity="0.16" />
          <rect
            className="intro-parcouru"
            x={DEPART_X}
            y="243"
            width={ARRIVEE_X - DEPART_X}
            height="4"
            rx="2"
            fill="url(#intro-trace)"
          />
          {ETAPES.map((e, i) => (
            <g
              key={e.label}
              className={`intro-etape ${etape === i ? "is-active" : ""} ${etape > i ? "is-passee" : ""}`}
              style={{ "--passage": `${e.delai}s`, "--i": i }}
            >
              <circle cx={e.x} cy="245" r="9" className="intro-etape-pastille" />
              <text x={e.x} y="248.5" textAnchor="middle" className="intro-etape-numero">
                {i + 1}
              </text>
              <g className="intro-etape-valide">
                <circle cx={e.x} cy="245" r="9" fill="#34d399" />
                <path
                  d={`M${e.x - 3.8} 245.2l2.6 2.6 5 -5.4`}
                  stroke="#fff"
                  strokeWidth="1.9"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <text x={e.x} y="271" textAnchor="middle" className="intro-etape-label">
                {e.label}
              </text>
            </g>
          ))}

          {/* Maison du stagiaire */}
          <g className="intro-maison">
            <rect x="74" y="164" width="104" height="66" rx="5" fill="url(#intro-facade)" />
            <path d="M64 168 126 118 188 168z" fill="#fbbf24" />
            <path d="M64 168 126 118 188 168" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" />
            <rect x="150" y="128" width="11" height="22" rx="1.5" fill="#f59e0b" />
            <rect x="88" y="180" width="26" height="22" rx="4" fill="#fde68a" />
            <path d="M101 180v22M88 191h26" stroke="#fff" strokeWidth="2" />
            <rect x="136" y="188" width="28" height="42" rx="4" fill="#1e3a8a" />
            <rect className="intro-porte" x="136" y="188" width="28" height="42" rx="4" fill="#3b82f6" />
            <circle className="intro-porte" cx="158" cy="210" r="1.6" fill="#dbeafe" />
          </g>

          {/* Mairie : fronton, horloge, colonnes et ailes, comme sur le logo de l'application */}
          <g className="intro-mairie">
            <line x1="660" y1="92" x2="660" y2="52" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
            <path className="intro-drapeau" d="M661 54h20l-4 6 4 6h-20z" fill="#7dd3fc" />
            <rect x="588" y="142" width="36" height="88" rx="2" fill="url(#intro-facade)" />
            <rect x="696" y="142" width="36" height="88" rx="2" fill="url(#intro-facade)" />
            <rect x="584" y="137" width="44" height="6" rx="3" fill="#1d4ed8" />
            <rect x="692" y="137" width="44" height="6" rx="3" fill="#1d4ed8" />
            {FENETRES.map((f, i) => (
              <g key={i}>
                <rect x={f.x} y={f.y} width="10" height="14" rx="2.5" fill="#93c5fd" opacity="0.55" />
                <rect
                  className="intro-fenetre"
                  x={f.x}
                  y={f.y}
                  width="10"
                  height="14"
                  rx="2.5"
                  style={{ animationDelay: `${f.delai}s` }}
                />
              </g>
            ))}
            <rect x="620" y="132" width="80" height="98" fill="url(#intro-facade)" />
            <path d="M612 121 660 92 708 121z" fill="#fff" />
            <circle cx="660" cy="109" r="6.5" fill="#1d4ed8" />
            <path d="M660 105.5v3.5l2.5 1.5" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <rect x="616" y="120" width="88" height="13" rx="2.5" fill="#1d4ed8" />
            <text x="660" y="129.8" textAnchor="middle" className="intro-enseigne">
              MAIRIE
            </text>
            {[626, 640, 672, 686].map((x) => (
              <rect key={x} x={x} y="136" width="8" height="82" rx="2" fill="#fff" stroke="#dbeafe" />
            ))}
            <rect x="650" y="190" width="20" height="28" rx="3" fill="#1e3a8a" />
            <rect className="intro-porte-lumiere" x="650" y="190" width="20" height="28" rx="3" />
            <rect x="614" y="218" width="92" height="6" rx="2" fill="#eff6ff" />
            <rect x="606" y="224" width="108" height="6" rx="2" fill="#dbeafe" />
          </g>

          {/* Le stagiaire : de la porte de la maison à celle de la mairie */}
          <g transform={`translate(${DEPART_X} 230)`}>
            <g className="intro-marcheur">
              <g className="intro-rebond">
                <ellipse cx="0" cy="1" rx="11" ry="2.5" fill="#0b1533" opacity="0.22" />
                <rect className="intro-jambe arriere" x="-3" y="-26" width="6" height="26" rx="3" fill="#1e293b" />
                <rect className="intro-bras arriere" x="-2.5" y="-47" width="5" height="21" rx="2.5" fill="#c08457" />
                {/* Sac à dos */}
                <rect x="-15" y="-49" width="11" height="22" rx="4" fill="#f59e0b" />
                <rect x="-14" y="-38" width="9" height="7" rx="2" fill="#d97706" />
                <path d="M-6 -49q4 -3 8 0" stroke="#b45309" strokeWidth="2" fill="none" />
                {/* Corps et tête */}
                <rect x="-6" y="-51" width="13" height="27" rx="5" fill="#ffffff" />
                <path d="M-6 -46h13" stroke="#b45309" strokeWidth="2" />
                <circle cx="1" cy="-59" r="8" fill="#e0a370" />
                <path d="M-7 -60a8 8 0 0 1 16 -2q-6 -1 -9 3z" fill="#1e293b" />
                <circle cx="5" cy="-59" r="1" fill="#1e293b" />
                <rect className="intro-jambe avant" x="-3" y="-26" width="6" height="26" rx="3" fill="#334155" />
                <rect className="intro-bras avant" x="-2.5" y="-47" width="5" height="21" rx="2.5" fill="#e0a370" />
              </g>
            </g>
          </g>
        </svg>

        {/* Légende de l'étape en cours (la clé relance son animation d'entrée) */}
        <div className="intro-legende" aria-live="polite">
          <div className="intro-legende-contenu" key={etape}>
            <span className="intro-legende-etape">
              {etape >= 0 && etape <= 3 ? `Étape ${etape + 1} sur 4` : etape > 3 ? "Stage terminé" : "Départ"}
            </span>
            <h1>{legende.titre}</h1>
            <p>{legende.texte}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IntroDepart;

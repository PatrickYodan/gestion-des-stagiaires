import { useEffect, useRef, useState } from "react";
import Logo from "../ui/Logo";
import Particles from "./Particles";

// Animation d'accueil affichée avant la page de connexion (à chaque chargement de la page) :
// un stagiaire, sac au dos, sort de sa maison et marche jusqu'à la mairie qui l'accueille.
// Sur le chemin, il franchit les étapes du parcours d'un stage géré par l'application
// (les mêmes que l'animation du panneau de connexion) : chacune se valide à son passage.
// Tout est en SVG + CSS (styles « INTRO : départ du stagiaire » dans index.css) ;
// le composant ne gère que la durée, le fondu de sortie et le bouton « Passer ».
export const INTRO_MS = 5600; // durée de la scène (doit suivre les délais CSS)
const SORTIE_MS = 600; // fondu de sortie vers la page de connexion

// Marche : de la porte de la maison (x 147) à celle de la mairie (x 660), de 1,3 s à 4,3 s
const DEPART_X = 147;
const ARRIVEE_X = 660;
const DEBUT_MARCHE = 1.3;
const DUREE_MARCHE = 3;
// Instant (s) où le stagiaire passe à l'abscisse x (marche à vitesse constante)
const passage = (x) => DEBUT_MARCHE + (DUREE_MARCHE * (x - DEPART_X)) / (ARRIVEE_X - DEPART_X);

// Étapes du stage posées sur le chemin
const ETAPES = [
  { x: 250, label: "Affectation" },
  { x: 352, label: "Documents" },
  { x: 454, label: "Évaluation" },
  { x: 556, label: "Attestation" },
].map((e) => ({ ...e, delai: passage(e.x) }));

// Fenêtres des deux ailes de la mairie : elles s'allument en désordre à l'arrivée
const FENETRES = [594, 608, 702, 716].flatMap((x, i) =>
  [158, 182].map((y, j) => ({ x, y, delai: 4.25 + ((i * 2 + j) * 5 % 8) * 0.06 })),
);

function IntroDepart({ onDone }) {
  const [sortie, setSortie] = useState(false);
  const termine = useRef(false);

  // Fin de l'intro : fondu puis affichage de la connexion (une seule fois)
  const terminer = () => {
    if (termine.current) return;
    termine.current = true;
    setSortie(true);
    setTimeout(onDone, SORTIE_MS);
  };

  useEffect(() => {
    // Mouvements réduits demandés par le système : on passe directement à la connexion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return undefined;
    }
    const timer = setTimeout(terminer, INTRO_MS);
    // Échap, Entrée ou Espace : passer l'animation
    const clavier = (e) => {
      if (["Escape", "Enter", " "].includes(e.key)) terminer();
    };
    window.addEventListener("keydown", clavier);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", clavier);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`intro-depart ${sortie ? "is-leaving" : ""}`} role="presentation">
      <Particles />

      <div className="intro-stage">
        <svg className="intro-scene" viewBox="0 0 800 300" aria-hidden="true">
          <defs>
            <linearGradient id="intro-facade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#eff6ff" />
              <stop offset="1" stopColor="#bfdbfe" />
            </linearGradient>
            {/* Sol qui s'estompe sur les bords (pas de coupure nette) */}
            <linearGradient id="intro-sol" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.15" stopColor="#fff" stopOpacity="1" />
              <stop offset="0.85" stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="intro-route" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0.05" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.22" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Soleil qui se lève et nuages qui dérivent */}
          <g className="intro-soleil">
            <circle cx="400" cy="70" r="46" fill="#fde68a" opacity="0.12" />
            <circle cx="400" cy="70" r="26" fill="#fde68a" />
          </g>
          <g className="intro-nuage n1" fill="#fff" opacity="0.5">
            <ellipse cx="230" cy="62" rx="34" ry="11" />
            <ellipse cx="248" cy="54" rx="20" ry="11" />
          </g>
          <g className="intro-nuage n2" fill="#fff" opacity="0.35">
            <ellipse cx="520" cy="40" rx="28" ry="9" />
            <ellipse cx="534" cy="33" rx="16" ry="9" />
          </g>

          {/* Sol et chemin entre la maison et la mairie */}
          <rect x="0" y="240" width="800" height="60" fill="url(#intro-sol)" opacity="0.06" />
          <rect x="0" y="239" width="800" height="2" fill="url(#intro-sol)" opacity="0.4" />
          <rect x="150" y="244" width="510" height="8" rx="4" fill="url(#intro-route)" />
          <line className="intro-pointilles" x1="160" y1="248" x2="650" y2="248" />

          {/* Étapes du stage sur le chemin : grises, puis validées au passage du stagiaire */}
          {ETAPES.map((e, i) => (
            <g key={e.label} className="intro-etape" style={{ "--passage": `${e.delai}s` }}>
              <circle cx={e.x} cy="248" r="8" className="intro-etape-pastille" />
              <text x={e.x} y="251.5" textAnchor="middle" className="intro-etape-numero">
                {i + 1}
              </text>
              <g className="intro-etape-valide">
                <circle cx={e.x} cy="248" r="8" fill="#34d399" />
                <path
                  d={`M${e.x - 3.5} 248l2.5 2.5 4.5 -5`}
                  stroke="#fff"
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <text x={e.x} y="274" textAnchor="middle" className="intro-etape-label">
                {e.label}
              </text>
            </g>
          ))}

          {/* Maison du stagiaire */}
          <g className="intro-maison">
            <rect x="70" y="170" width="110" height="70" rx="4" fill="#fef3c7" />
            <path d="M58 174 125 120 192 174z" fill="#f97316" />
            <rect x="152" y="128" width="12" height="26" fill="#c2410c" />
            {/* Fenêtre allumée */}
            <rect x="86" y="186" width="26" height="22" rx="3" fill="#fbbf24" />
            <path d="M99 186v22M86 197h26" stroke="#fef3c7" strokeWidth="2" />
            {/* Porte qui s'ouvre */}
            <rect x="134" y="196" width="26" height="44" rx="3" fill="#7c2d12" />
            <rect className="intro-porte" x="134" y="196" width="26" height="44" rx="3" fill="#ea580c" />
          </g>

          {/* Mairie : fronton, colonnes et ailes, comme sur le logo de l'application */}
          <g className="intro-mairie">
            {/* Drapeau hissé à l'arrivée du stagiaire */}
            <line x1="660" y1="101" x2="660" y2="58" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
            <path className="intro-drapeau" d="M661 60h20l-4 6 4 6h-20z" fill="#7dd3fc" />
            {/* Ailes */}
            <rect x="588" y="150" width="36" height="90" fill="url(#intro-facade)" />
            <rect x="696" y="150" width="36" height="90" fill="url(#intro-facade)" />
            <rect x="584" y="145" width="44" height="6" rx="2" fill="#1d4ed8" />
            <rect x="692" y="145" width="44" height="6" rx="2" fill="#1d4ed8" />
            {FENETRES.map((f, i) => (
              <g key={i}>
                <rect x={f.x} y={f.y} width="10" height="14" rx="2" fill="#1e40af" opacity="0.5" />
                <rect
                  className="intro-fenetre"
                  x={f.x}
                  y={f.y}
                  width="10"
                  height="14"
                  rx="2"
                  style={{ animationDelay: `${f.delai}s` }}
                />
              </g>
            ))}
            {/* Corps central, fronton et horloge */}
            <rect x="620" y="140" width="80" height="100" fill="url(#intro-facade)" />
            <path d="M612 129 660 100 708 129z" fill="#eff6ff" />
            <circle cx="660" cy="117" r="6.5" fill="#1d4ed8" />
            <path d="M660 113.5v3.5l2.5 1.5" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <rect x="616" y="128" width="88" height="13" rx="2" fill="#1d4ed8" />
            <text x="660" y="137.8" textAnchor="middle" className="intro-enseigne">
              MAIRIE
            </text>
            {/* Colonnes */}
            {[626, 640, 672, 686].map((x) => (
              <rect key={x} x={x} y="144" width="8" height="82" rx="2" fill="#fff" />
            ))}
            {/* Porte, qui s'éclaire quand le stagiaire arrive */}
            <rect x="650" y="198" width="20" height="28" rx="3" fill="#1e3a8a" />
            <rect className="intro-porte-lumiere" x="650" y="198" width="20" height="28" rx="3" />
            {/* Marches */}
            <rect x="614" y="226" width="92" height="6" rx="1.5" fill="#dbeafe" />
            <rect x="606" y="232" width="108" height="8" rx="1.5" fill="#bfdbfe" />
          </g>

          {/* Bulle d'accueil à l'arrivée */}
          <g className="intro-bulle">
            <rect x="606" y="16" width="108" height="26" rx="13" fill="#fff" />
            <path d="M652 41l8 8 8 -8z" fill="#fff" />
            <text x="660" y="33.5" textAnchor="middle" className="intro-bulle-texte">
              Bienvenue !
            </text>
          </g>

          {/* Le stagiaire : il avance de la porte de la maison à celle de la mairie */}
          <g transform={`translate(${DEPART_X} 240)`}>
            <g className="intro-marcheur">
              <g className="intro-rebond">
                {/* Ombre au sol */}
                <ellipse cx="0" cy="1" rx="11" ry="2.5" fill="#0b1533" opacity="0.25" />
                {/* Jambe et bras du côté éloigné (plus sombres) */}
                <rect className="intro-jambe arriere" x="-3" y="-26" width="6" height="26" rx="3" fill="#1e293b" />
                <rect className="intro-bras arriere" x="-2.5" y="-47" width="5" height="21" rx="2.5" fill="#c08457" />
                {/* Sac à dos */}
                <rect x="-15" y="-49" width="11" height="22" rx="4" fill="#f59e0b" />
                <rect x="-14" y="-38" width="9" height="7" rx="2" fill="#d97706" />
                <path d="M-6 -49q4 -3 8 0" stroke="#b45309" strokeWidth="2" fill="none" />
                {/* Corps */}
                <rect x="-6" y="-51" width="13" height="27" rx="5" fill="#ffffff" />
                <path d="M-6 -46h13" stroke="#b45309" strokeWidth="2" />
                {/* Tête */}
                <circle cx="1" cy="-59" r="8" fill="#e0a370" />
                <path d="M-7 -60a8 8 0 0 1 16 -2q-6 -1 -9 3z" fill="#1e293b" />
                <circle cx="5" cy="-59" r="1" fill="#1e293b" />
                {/* Jambe et bras du côté proche */}
                <rect className="intro-jambe avant" x="-3" y="-26" width="6" height="26" rx="3" fill="#334155" />
                <rect className="intro-bras avant" x="-2.5" y="-47" width="5" height="21" rx="2.5" fill="#e0a370" />
              </g>
            </g>
          </g>
        </svg>

        <div className="intro-texte">
          <div className="intro-marque">
            <Logo size={34} />
            <span>
              Gestion des Stagiaires
              <small>Mairie</small>
            </span>
          </div>
          <p>Du premier jour à l'attestation, chaque stage commence par un premier pas.</p>
          <div className="intro-progress" aria-hidden="true">
            <span style={{ animationDuration: `${INTRO_MS}ms` }} />
          </div>
        </div>
      </div>

      <button type="button" className="intro-passer" onClick={terminer}>
        Passer
      </button>
    </div>
  );
}

export default IntroDepart;

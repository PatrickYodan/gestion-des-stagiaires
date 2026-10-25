import { useId } from "react";

// Logo de l'application : une toque de diplômé posée sur les colonnes d'une mairie
// (les stagiaires accueillis par l'institution municipale). Aplat en dégradé bleu, sans ombre.
function Logo({ size = 38, className = "", title = "Gestion des Stagiaires" }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`logo ${className}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`logo-bg-${id}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#logo-bg-${id})`} />
      {/* Reflet discret en haut à gauche */}
      <path d="M0 13C0 5.8 5.8 0 13 0h22c-14 4-25 12-35 26z" fill="#fff" opacity="0.08" />
      {/* Toque */}
      <path d="M24 9.5 39.5 16 24 22.5 8.5 16z" fill="#fff" />
      <path d="M16 19.3v3.2c0 1.6 3.6 3 8 3s8-1.4 8-3v-3.2L24 22.6z" fill="#fff" opacity="0.85" />
      {/* Gland */}
      <path d="M37.2 17v7.2" stroke="#7dd3fc" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="37.2" cy="25.6" r="1.7" fill="#7dd3fc" />
      {/* Colonnes et socle de la mairie */}
      <rect x="13" y="27.5" width="4" height="8" rx="1.2" fill="#fff" />
      <rect x="22" y="27.5" width="4" height="8" rx="1.2" fill="#fff" />
      <rect x="31" y="27.5" width="4" height="8" rx="1.2" fill="#fff" />
      <rect x="10" y="36.5" width="28" height="3" rx="1.5" fill="#fff" />
    </svg>
  );
}

export default Logo;

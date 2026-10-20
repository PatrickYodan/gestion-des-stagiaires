import { useState } from "react";

// Couleurs de fond des initiales, choisies de façon stable à partir du nom
const palette = ["#1d4ed8", "#0f766e", "#6d28d9", "#be185d", "#b45309", "#0369a1", "#4d7c0f"];

function Avatar({ src, prenom = "", nom = "", size = 36, online = false }) {
  const [imageError, setImageError] = useState(false);

  const initials =
    `${prenom?.[0] || ""}${nom?.[0] || ""}`.toUpperCase() || "?";
  const seed = `${prenom}${nom}`
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = palette[seed % palette.length];

  return (
    <div className="avatar" style={{ "--size": `${size}px` }}>
      {src && !imageError ? (
        <img
          src={src}
          alt={`${prenom} ${nom}`}
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="avatar-fallback" style={{ backgroundColor: color }}>
          {initials}
        </div>
      )}
      {online && <span className="avatar-status" title="En ligne" />}
    </div>
  );
}

export default Avatar;

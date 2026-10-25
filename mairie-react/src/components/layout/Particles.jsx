// Particules lumineuses du panneau de connexion, réparties sur trois plans de profondeur.
// Elles dérivent et scintillent doucement ; chaque plan suit la souris à sa propre vitesse
// (effet de parallaxe piloté par les variables CSS --px / --py posées par AuthLayout).

// Générateur pseudo-aléatoire déterministe : mêmes positions à chaque affichage
const aleatoire = (graine) => {
  let s = graine;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

const PLANS = [1, 2, 3].map((plan) => {
  const r = aleatoire(plan * 97);
  return Array.from({ length: 9 }, () => ({
    x: r() * 100,
    y: r() * 100,
    taille: 1.5 + r() * (plan + 1),
    duree: 6 + r() * 8,
    delai: -r() * 10,
  }));
});

function Particles() {
  return (
    <div className="particles" aria-hidden="true">
      {PLANS.map((points, i) => (
        <div key={i} className={`particles-plan plan-${i + 1}`}>
          {points.map((p, j) => (
            <span
              key={j}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.taille,
                height: p.taille,
                animationDuration: `${p.duree}s`,
                animationDelay: `${p.delai}s`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Particles;

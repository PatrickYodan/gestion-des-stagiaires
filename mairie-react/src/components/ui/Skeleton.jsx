// Silhouettes de chargement : elles reprennent la forme du contenu attendu
// (lignes de tableau, cartes, graphique, discussion) pour que l'attente paraisse plus courte.

const Bone = ({ w = "100%", h = 12, r, className = "" }) => (
  <span className={`skeleton sk-bone ${className}`} style={{ width: w, height: h, borderRadius: r }} />
);

// Lignes de tableau : photo ronde, deux lignes de texte, colonnes et pastille
export function SkeletonRows({ rows = 5, avatar = true, columns = 3 }) {
  return (
    <div className="sk-rows" role="status" aria-label="Chargement des données">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-row" key={i} style={{ "--i": i, "--cols": columns }}>
          <div className="sk-row-main">
            {avatar && <Bone w={38} h={38} r="50%" />}
            <div className="sk-lines">
              <Bone w={`${62 - (i % 3) * 10}%`} h={12} />
              <Bone w={`${40 - (i % 2) * 8}%`} h={10} />
            </div>
          </div>
          {Array.from({ length: columns }, (_, c) => (
            <div className="sk-col" key={c}>
              <Bone w={`${70 - ((i + c) % 3) * 15}%`} h={11} />
            </div>
          ))}
          <Bone className="sk-pill" w={64} h={22} r={999} />
        </div>
      ))}
    </div>
  );
}

// Grille de cartes : icône, titre, texte et pied
export function SkeletonCards({ count = 6 }) {
  return (
    <div className="sk-cards" role="status" aria-label="Chargement des données">
      {Array.from({ length: count }, (_, i) => (
        <div className="sk-card" key={i} style={{ "--i": i }}>
          <div className="sk-card-head">
            <Bone w={46} h={46} r={13} />
            <div className="sk-lines">
              <Bone w="70%" h={13} />
              <Bone w="45%" h={10} />
            </div>
          </div>
          <Bone w="100%" h={10} />
          <Bone w="82%" h={10} />
          <div className="sk-card-foot">
            <Bone w="38%" h={26} r={8} />
            <Bone w="26%" h={26} r={8} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Graphique en barres qui « respirent »
export function SkeletonChart({ height = 300, bars = 12 }) {
  return (
    <div className="sk-chart" style={{ height }} role="status" aria-label="Chargement du graphique">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="sk-bar"
          style={{ "--h": `${25 + ((i * 37) % 60)}%`, "--i": i }}
        />
      ))}
    </div>
  );
}

// Liste de conversations (messagerie)
export function SkeletonChatList({ rows = 5 }) {
  return (
    <div className="sk-chatlist" role="status" aria-label="Chargement des conversations">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-chat-item" key={i} style={{ "--i": i }}>
          <Bone w={42} h={42} r="50%" />
          <div className="sk-lines">
            <Bone w={`${55 - (i % 3) * 8}%`} h={11} />
            <Bone w={`${80 - (i % 2) * 20}%`} h={9} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Discussion : bulles alternées
export function SkeletonThread() {
  const widths = ["46%", "30%", "58%", "38%"];
  return (
    <div className="sk-thread" role="status" aria-label="Chargement de la conversation">
      {widths.map((w, i) => (
        <div key={i} className={`sk-bubble-row ${i % 2 ? "mine" : ""}`} style={{ "--i": i }}>
          <Bone w={w} h={i === 2 ? 52 : 36} r={16} />
        </div>
      ))}
    </div>
  );
}

// Mon compte : carte de profil (bandeau, photo, identité) et carte de formulaire
export function SkeletonProfile() {
  return (
    <div className="account-grid sk-profile" role="status" aria-label="Chargement du profil">
      <div className="sk-card sk-profile-card" style={{ "--i": 0 }}>
        <span className="skeleton sk-profile-cover" />
        <Bone className="sk-profile-avatar" w={84} h={84} r="50%" />
        <div className="sk-lines sk-center">
          <Bone w="48%" h={15} />
          <Bone w="32%" h={10} />
        </div>
        {[0, 1, 2].map((i) => (
          <div className="sk-field-row" key={i}>
            <Bone w={34} h={34} r={10} />
            <div className="sk-lines">
              <Bone w="30%" h={9} />
              <Bone w={`${66 - i * 12}%`} h={11} />
            </div>
          </div>
        ))}
      </div>
      <div className="sk-card" style={{ "--i": 1 }}>
        <Bone w="42%" h={14} />
        <Bone w="70%" h={10} />
        {[0, 1, 2].map((i) => (
          <div className="sk-field" key={i}>
            <Bone w="28%" h={9} />
            <Bone w="100%" h={40} r={10} />
          </div>
        ))}
        <Bone w={150} h={40} r={10} />
      </div>
    </div>
  );
}

// Journal d'activité : pastille d'action, description et date
export function SkeletonTimeline({ rows = 5 }) {
  return (
    <div className="sk-timeline" role="status" aria-label="Chargement du journal">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-timeline-item" key={i} style={{ "--i": i }}>
          <Bone w={34} h={34} r="50%" />
          <div className="sk-lines">
            <Bone w={`${58 - (i % 3) * 9}%`} h={11} />
            <Bone w={`${34 - (i % 2) * 8}%`} h={9} />
          </div>
          <Bone w={72} h={10} />
        </div>
      ))}
    </div>
  );
}

export default Bone;

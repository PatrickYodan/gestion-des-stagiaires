import { useEffect, useState } from "react";
import { subscribeProgress } from "../../api/axios";

// Fine barre animée en haut de l'écran pendant les échanges avec le serveur.
// Elle n'apparaît qu'après un court délai, pour ne pas clignoter sur les réponses rapides.
function TopProgress() {
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeProgress((n) => setActive(n > 0)), []);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(active), active ? 180 : 250);
    return () => clearTimeout(timer);
  }, [active]);

  return (
    <div className={`top-progress ${visible ? "is-visible" : ""}`} role="progressbar" aria-hidden={!visible}>
      <span />
    </div>
  );
}

export default TopProgress;

// --- Son de notification à la réception d'un message ----------------------------------
// Généré avec l'API Web Audio (aucun fichier audio à charger). Les navigateurs bloquent le son
// tant que l'utilisateur n'a pas interagi avec la page : le contexte audio est donc débloqué
// au premier clic ou à la première touche.

const STORAGE_KEY = "messagerie_son";
const MIN_INTERVAL_MS = 2500; // évite deux « ding » rapprochés (compteur + conversation ouverte)

let ctx = null;
let lastPlayed = 0;

const getContext = () => {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  return ctx;
};

const unlock = () => {
  const c = getContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
};

if (typeof window !== "undefined") {
  ["pointerdown", "keydown", "touchstart"].forEach((evt) =>
    window.addEventListener(evt, unlock, { passive: true }),
  );
}

export const isSoundEnabled = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

export const setSoundEnabled = (enabled) => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // stockage indisponible : le réglage ne sera simplement pas mémorisé
  }
};

// Une note douce : attaque rapide puis extinction progressive
const tone = (c, freq, start, duration, volume) => {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
};

// « Ding-ding » montant de deux notes
export const playMessageSound = ({ force = false } = {}) => {
  if (!force && !isSoundEnabled()) return;
  const now = Date.now();
  if (!force && now - lastPlayed < MIN_INTERVAL_MS) return;
  const c = getContext();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  if (c.state !== "running" && !force) return; // pas encore débloqué par une interaction
  lastPlayed = now;
  const t = c.currentTime + 0.02;
  tone(c, 880, t, 0.35, 0.18); // la
  tone(c, 1318.5, t + 0.12, 0.5, 0.15); // mi
};

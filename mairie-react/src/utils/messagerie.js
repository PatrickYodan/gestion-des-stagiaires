import { useEffect, useState } from "react";
import api from "../api/axios";
import { playMessageSound } from "./notificationSound";

// --- Compteur de messages non lus, partagé par le menu et la barre du haut -------------
// Un seul appel périodique au serveur, quel que soit le nombre de composants qui l'affichent.

const POLL_MS = 20000;
let unread = 0;
let loaded = false; // le premier chargement ne déclenche pas de son
let timer = null;
const listeners = new Set();

const publish = (value) => {
  // Nouveau message reçu depuis la dernière vérification : son de notification
  if (loaded && value > unread) playMessageSound();
  loaded = true;
  unread = value;
  listeners.forEach((fn) => fn(value));
};

export const refreshUnread = () => {
  if (!localStorage.getItem("access_token")) return;
  api
    .get("messagerie/non-lus/")
    .then((res) => publish(res.data.non_lus || 0))
    .catch(() => {});
};

export const useUnreadCount = () => {
  const [value, setValue] = useState(unread);
  useEffect(() => {
    listeners.add(setValue);
    if (listeners.size === 1) {
      refreshUnread();
      timer = setInterval(() => !document.hidden && refreshUnread(), POLL_MS);
    }
    return () => {
      listeners.delete(setValue);
      if (listeners.size === 0) clearInterval(timer);
    };
  }, []);
  return value;
};

// --- Formatage des dates de la messagerie ---------------------------------------------

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const formatHeure = (iso) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Heure si aujourd'hui, « Hier », sinon date courte
export const formatQuand = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return formatHeure(iso);
  const hier = new Date(now);
  hier.setDate(now.getDate() - 1);
  if (sameDay(d, hier)) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

// Libellé d'un séparateur de journée dans une conversation
export const formatJour = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return "Aujourd'hui";
  const hier = new Date(now);
  hier.setDate(now.getDate() - 1);
  if (sameDay(d, hier)) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

export const memeJour = (a, b) => sameDay(new Date(a), new Date(b));

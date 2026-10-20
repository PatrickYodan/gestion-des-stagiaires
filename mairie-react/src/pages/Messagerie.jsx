import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/ui/Avatar";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import { apiErrorMessage } from "../utils/format";
import { formatHeure, formatJour, formatQuand, memeJour, refreshUnread } from "../utils/messagerie";
import { ROLES } from "../utils/roles";
import { navigate, pathSegments, usePath } from "../utils/router";
import { isSoundEnabled, playMessageSound, setSoundEnabled } from "../utils/notificationSound";

const LIST_POLL_MS = 8000; // rafraîchissement de la liste des conversations
const THREAD_POLL_MS = 4000; // rafraîchissement de la conversation ouverte
const MAX_LENGTH = 2000;

const roleLabel = (person) =>
  [ROLES[person?.role]?.label, person?.service].filter(Boolean).join(" · ");

// --- Fenêtre « Nouveau message » : choix du destinataire ------------------------------
function ContactPicker({ onClose, onPick }) {
  const [contacts, setContacts] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  // Contacts chargés une seule fois à l'ouverture de la fenêtre
  useEffect(() => {
    api
      .get("messagerie/contacts/")
      .then((res) => setContacts(res.data))
      .catch((err) => setError(apiErrorMessage(err, "Impossible de charger les contacts.")));
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = search.trim().toLowerCase();
  const filtered = (contacts || []).filter((c) =>
    [c.nom_affiche, c.email, ROLES[c.role]?.label, c.service].filter(Boolean).join(" ").toLowerCase().includes(q),
  );

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }} role="dialog" aria-modal="true" aria-label="Nouveau message">
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Nouveau message</h3>
            <p className="modal-subtitle">Choisissez la personne à qui écrire.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body" style={{ paddingTop: "1rem" }}>
          <div className="search" style={{ width: "100%", marginBottom: "0.75rem" }}>
            <Icon name="search" size={16} />
            <input
              className="input"
              placeholder="Rechercher un nom, un rôle, un service…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          {error && (
            <div className="alert alert-error">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}
          {!contacts && !error ? (
            [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 52, marginBottom: 8 }} />)
          ) : filtered.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", padding: "1.5rem 0" }}>
              Aucun contact ne correspond.
            </p>
          ) : (
            <ul className="contact-list">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button type="button" className="contact-item" onClick={() => onPick(c)}>
                    <Avatar src={c.photo} prenom={c.prenom || c.email} nom={c.nom} size={38} />
                    <span className="contact-item-text">
                      <strong>{c.nom_affiche}</strong>
                      <span>{roleLabel(c) || c.email}</span>
                    </span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Page Messagerie -------------------------------------------------------------------
function Messagerie() {
  const { user } = useAuth();
  const path = usePath();
  const selectedId = Number(pathSegments(path)[1]) || null; // /messagerie/<id>

  const [conversations, setConversations] = useState(null);
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState(false);
  // Dossier affiché : boîte de réception, brouillons ou archives
  const [dossier, setDossier] = useState("boite");
  const [compteurs, setCompteurs] = useState({ boite: 0, brouillons: 0, archives: 0, boite_non_lus: 0 });
  const dossierRef = useRef("boite");

  const [thread, setThread] = useState(null); // { conversation, interlocuteur, messages, dernier_lu }
  const [threadError, setThreadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sound, setSound] = useState(isSoundEnabled);
  // Brouillon enregistré automatiquement sur le serveur pendant la saisie
  const [draftStatus, setDraftStatus] = useState(""); // "" | "saving" | "saved" | "error"
  const savedDraftRef = useRef(""); // dernier brouillon enregistré
  const draftRef = useRef(""); // texte en cours (enregistré en quittant la conversation)

  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const lastIdRef = useRef(null);

  // Liste des conversations (rafraîchie régulièrement)
  const loadConversations = () =>
    api
      .get(`messagerie/conversations/?dossier=${dossierRef.current}`)
      .then((res) => {
        if (res.data.dossier !== dossierRef.current) return; // réponse d'un dossier quitté entre-temps
        setConversations(res.data.conversations);
        setCompteurs(res.data.compteurs);
        setListError("");
      })
      .catch((err) => setListError(apiErrorMessage(err, "Impossible de charger les conversations.")));

  useEffect(() => {
    loadConversations();
    const t = setInterval(() => !document.hidden && loadConversations(), LIST_POLL_MS);
    return () => clearInterval(t);
  }, []);

  const changeDossier = (nom) => {
    dossierRef.current = nom;
    setDossier(nom);
    setConversations(null);
    loadConversations();
  };

  // Enregistre le brouillon d'une conversation sur le serveur
  const saveDraft = (id, text) => {
    setDraftStatus("saving");
    return api
      .patch(`messagerie/conversations/${id}/`, { brouillon: text })
      .then(() => {
        savedDraftRef.current = text;
        setDraftStatus(text.trim() ? "saved" : "");
        loadConversations();
      })
      .catch(() => setDraftStatus("error"));
  };

  // Conversation ouverte : chargement complet, puis nouveaux messages uniquement
  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    stickToBottom.current = true;
    lastIdRef.current = null;

    api
      .get(`messagerie/conversations/${selectedId}/messages/`)
      .then((res) => {
        if (cancelled) return;
        setThread(res.data);
        setThreadError("");
        // Brouillon enregistré pour cette conversation
        const brouillon = res.data.brouillon || "";
        setDraft(brouillon);
        savedDraftRef.current = brouillon;
        draftRef.current = brouillon;
        setDraftStatus(brouillon ? "saved" : "");
        lastIdRef.current = res.data.messages.at(-1)?.id ?? 0;
        refreshUnread();
        loadConversations();
      })
      .catch((err) => {
        if (cancelled) return;
        setThread(null);
        setThreadError(
          err?.response?.status === 404
            ? "Cette conversation n'existe pas ou ne vous concerne pas."
            : apiErrorMessage(err, "Impossible de charger la conversation."),
        );
      });

    const poll = setInterval(() => {
      if (document.hidden || lastIdRef.current === null) return;
      api
        .get(`messagerie/conversations/${selectedId}/messages/?apres=${lastIdRef.current}`)
        .then((res) => {
          if (cancelled) return;
          const fresh = res.data.messages;
          if (fresh.length) {
            lastIdRef.current = fresh.at(-1).id;
            // Message de l'interlocuteur arrivé dans la conversation ouverte
            if (fresh.some((m) => m.auteur !== user.id)) playMessageSound();
            refreshUnread();
          }
          setThread((prev) =>
            prev && prev.conversation === selectedId
              ? {
                  ...prev,
                  messages: fresh.length
                    ? [...prev.messages, ...fresh.filter((m) => !prev.messages.some((p) => p.id === m.id))]
                    : prev.messages,
                  dernier_lu: res.data.dernier_lu,
                  archivee: res.data.archivee,
                }
              : prev,
          );
        })
        .catch(() => {});
    }, THREAD_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
      // En quittant la conversation : le texte non enregistré est gardé en brouillon
      if (draftRef.current !== savedDraftRef.current) {
        const text = draftRef.current;
        savedDraftRef.current = text;
        api.patch(`messagerie/conversations/${selectedId}/`, { brouillon: text }).catch(() => {});
      }
    };
  }, [selectedId, user.id]);

  // Enregistrement automatique du brouillon, 1 seconde après la dernière frappe
  const threadReady = Boolean(thread);
  useEffect(() => {
    draftRef.current = draft;
    if (!selectedId || !threadReady || draft === savedDraftRef.current) return undefined;
    const timer = setTimeout(() => saveDraft(selectedId, draft), 1000);
    return () => clearTimeout(timer);
    // saveDraft est recréée à chaque affichage : seule la saisie doit relancer le minuteur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, selectedId, threadReady]);

  // Défilement automatique vers le dernier message (sauf si l'utilisateur remonte l'historique)
  const messageCount = thread?.messages.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messageCount, selectedId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const openConversation = (id) => {
    setThread(null);
    setThreadError("");
    setDraft("");
    setSendError("");
    navigate(`/messagerie/${id}`);
  };

  const startWith = async (contact) => {
    setPicker(false);
    try {
      const res = await api.post("messagerie/conversations/", { destinataire: contact.id });
      openConversation(res.data.id);
    } catch (err) {
      setListError(apiErrorMessage(err, "Impossible d'ouvrir la conversation."));
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const contenu = draft.trim();
    if (!contenu || sending || !selectedId) return;
    setSending(true);
    setSendError("");
    try {
      const res = await api.post(`messagerie/conversations/${selectedId}/messages/`, { contenu });
      stickToBottom.current = true;
      lastIdRef.current = Math.max(lastIdRef.current ?? 0, res.data.id);
      setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, res.data] } : prev));
      // Le serveur vide le brouillon à l'envoi
      savedDraftRef.current = "";
      draftRef.current = "";
      setDraft("");
      setDraftStatus("");
      loadConversations();
    } catch (err) {
      setSendError(apiErrorMessage(err, "Le message n'a pas pu être envoyé."));
    } finally {
      setSending(false);
    }
  };

  const toggleArchive = async () => {
    const next = !thread?.archivee;
    try {
      await api.patch(`messagerie/conversations/${selectedId}/`, { archivee: next });
      setThread((prev) => (prev ? { ...prev, archivee: next } : prev));
      loadConversations();
    } catch (err) {
      setSendError(apiErrorMessage(err, "Impossible d'archiver la conversation."));
    }
  };

  const deleteConversation = async () => {
    const qui = thread?.interlocuteur;
    const ok = window.confirm(
      `Supprimer la conversation avec ${qui?.nom_affiche || "ce contact"} ?\n\n` +
        `Elle sera effacée de votre messagerie uniquement : ${qui?.prenom || "votre interlocuteur"} la conservera. ` +
        "Le brouillon éventuel sera aussi effacé.",
    );
    if (!ok) return;
    try {
      savedDraftRef.current = draftRef.current; // rien à enregistrer en quittant
      await api.delete(`messagerie/conversations/${selectedId}/`);
      setDraft("");
      navigate("/messagerie");
      loadConversations();
      refreshUnread();
    } catch (err) {
      setSendError(apiErrorMessage(err, "Impossible de supprimer la conversation."));
    }
  };

  // Entrée : envoyer ; Maj + Entrée : nouvelle ligne
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const q = search.trim().toLowerCase();
  const visibleConversations = (conversations || []).filter((c) =>
    [c.interlocuteur?.nom_affiche, c.interlocuteur?.email, c.dernier_message?.contenu, c.brouillon]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q),
  );

  const interlocuteur = thread?.interlocuteur;

  // Son à la réception d'un message (réglage mémorisé dans le navigateur)
  const toggleSound = () => {
    const next = !sound;
    setSoundEnabled(next);
    setSound(next);
    if (next) playMessageSound({ force: true }); // aperçu du son
  };
  const myLastId = [...(thread?.messages || [])].reverse().find((m) => m.auteur === user.id)?.id;

  return (
    <div className={`messagerie-page ${selectedId ? "has-selection" : ""}`}>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Communication</div>
          <h2 className="page-title">Messagerie</h2>
          <p className="page-subtitle">Échangez directement avec les agents RH, les encadrants et l'administration</p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className={`sound-toggle ${sound ? "on" : "off"}`}
            onClick={toggleSound}
            title={sound ? "Cliquez pour couper le son des nouveaux messages" : "Cliquez pour activer le son des nouveaux messages"}
            aria-label="Son des nouveaux messages"
            aria-pressed={sound}
          >
            <span className="sound-toggle-icon">
              <Icon name={sound ? "volume" : "volumeOff"} size={16} />
            </span>
            <span className="sound-toggle-label">{sound ? "Son activé" : "Son coupé"}</span>
          </button>
          <button className="btn btn-primary" onClick={() => setPicker(true)}>
            <Icon name="plus" size={18} />
            <span className="btn-label">Nouveau message</span>
          </button>
        </div>
      </div>

      <div className={`card chat ${selectedId ? "has-selection" : ""}`}>
        {/* Liste des conversations */}
        <aside className="chat-list">
          <div className="chat-list-head">
            <div className="chat-folders" role="tablist" aria-label="Dossiers">
              {[
                ["boite", "Réception", compteurs.boite_non_lus, "messages"],
                ["brouillons", "Brouillons", compteurs.brouillons, "pencil"],
                ["archives", "Archives", compteurs.archives, "archive"],
              ].map(([id, label, count, icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={dossier === id}
                  className={`chat-folder ${dossier === id ? "active" : ""}`}
                  onClick={() => changeDossier(id)}
                >
                  <Icon name={icon} size={14} />
                  {label}
                  {count > 0 && <span className={`chat-folder-count ${id === "boite" ? "alert" : ""}`}>{count}</span>}
                </button>
              ))}
            </div>
            <div className="search" style={{ width: "100%" }}>
              <Icon name="search" size={16} />
              <input
                className="input"
                placeholder="Rechercher une conversation…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {listError && (
            <div className="alert alert-error" style={{ margin: "0.75rem" }}>
              <Icon name="alert" size={18} />
              <span>{listError}</span>
            </div>
          )}

          <div className="chat-list-items">
            {conversations === null ? (
              [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 56, margin: "0.6rem 0.75rem" }} />)
            ) : visibleConversations.length === 0 ? (
              <EmptyState
                icon={dossier === "archives" ? "archive" : dossier === "brouillons" ? "pencil" : "mail"}
                title={
                  conversations.length
                    ? "Aucun résultat"
                    : { boite: "Aucune conversation", brouillons: "Aucun brouillon", archives: "Aucune archive" }[dossier]
                }
                description={
                  conversations.length
                    ? "Aucune conversation ne correspond à votre recherche."
                    : {
                        boite: "Cliquez sur « Nouveau message » pour écrire à un collègue.",
                        brouillons: "Les messages commencés mais non envoyés sont enregistrés ici automatiquement.",
                        archives: "Les conversations archivées apparaissent ici. Elles reviennent dans la réception dès qu'un nouveau message arrive.",
                      }[dossier]
                }
              />
            ) : (
              visibleConversations.map((c) => {
                const p = c.interlocuteur || {};
                const mine = c.dernier_message?.auteur === user.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`chat-item ${c.id === selectedId ? "active" : ""} ${c.non_lus ? "unread" : ""}`}
                    onClick={() => openConversation(c.id)}
                  >
                    <Avatar src={p.photo} prenom={p.prenom || p.email} nom={p.nom} size={42} />
                    <span className="chat-item-body">
                      <span className="chat-item-top">
                        <strong className="truncate">{p.nom_affiche || "Utilisateur supprimé"}</strong>
                        <time>{formatQuand(c.dernier_message?.envoye_le || c.mis_a_jour_le)}</time>
                      </span>
                      <span className="chat-item-bottom">
                        <span className="truncate">
                          {c.brouillon ? (
                            <>
                              <span className="draft-label">Brouillon : </span>
                              {c.brouillon}
                            </>
                          ) : (
                            <>
                              {mine && "Vous : "}
                              {c.dernier_message?.contenu}
                            </>
                          )}
                        </span>
                        {c.non_lus > 0 && <span className="unread-badge">{c.non_lus}</span>}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Conversation ouverte */}
        <section className="chat-thread">
          {!selectedId ? (
            <div className="chat-placeholder">
              <EmptyState
                icon="mail"
                title="Sélectionnez une conversation"
                description="Choisissez une conversation dans la liste, ou commencez-en une nouvelle."
              >
                <button className="btn btn-primary" style={{ marginTop: "1.25rem" }} onClick={() => setPicker(true)}>
                  <Icon name="plus" size={18} /> Nouveau message
                </button>
              </EmptyState>
            </div>
          ) : threadError ? (
            <div className="chat-placeholder">
              <EmptyState icon="alert" title="Conversation indisponible" description={threadError}>
                <button className="btn btn-secondary" style={{ marginTop: "1.25rem" }} onClick={() => navigate("/messagerie")}>
                  Retour aux conversations
                </button>
              </EmptyState>
            </div>
          ) : (
            <>
              <header className="chat-thread-head">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon chat-back"
                  onClick={() => navigate("/messagerie")}
                  aria-label="Retour aux conversations"
                >
                  <Icon name="chevronLeft" size={20} />
                </button>
                {interlocuteur ? (
                  <div className="chat-peer">
                    <div className="chat-peer-avatar">
                      <Avatar
                        src={interlocuteur.photo}
                        prenom={interlocuteur.prenom || interlocuteur.email}
                        nom={interlocuteur.nom}
                        size={44}
                      />
                    </div>
                    <div className="chat-peer-text">
                      <div className="chat-peer-name" title={interlocuteur.nom_affiche}>
                        {interlocuteur.nom_affiche}
                      </div>
                      <div className="chat-peer-meta">
                        {ROLES[interlocuteur.role] && (
                          <span className={`badge ${ROLES[interlocuteur.role].badge}`}>
                            {ROLES[interlocuteur.role].label}
                          </span>
                        )}
                        {interlocuteur.service && (
                          <span className="chat-peer-service truncate" title={interlocuteur.service}>
                            {interlocuteur.service}
                          </span>
                        )}
                        {!ROLES[interlocuteur.role] && !interlocuteur.service && (
                          <span className="chat-peer-service truncate">{interlocuteur.email}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="skeleton" style={{ height: 40, width: 200 }} />
                )}
                {thread && (
                  <div className="chat-thread-actions">
                    {thread.archivee && <span className="badge badge-neutral">Archivée</span>}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={toggleArchive}
                      title={thread.archivee ? "Désarchiver (remettre dans la réception)" : "Archiver la conversation"}
                      aria-label={thread.archivee ? "Désarchiver" : "Archiver"}
                    >
                      <Icon name="archive" size={17} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger-ghost btn-sm btn-icon"
                      onClick={deleteConversation}
                      title="Supprimer la conversation (de votre messagerie uniquement)"
                      aria-label="Supprimer la conversation"
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </div>
                )}
              </header>

              <div className="chat-messages" ref={scrollRef} onScroll={onScroll}>
                {!thread ? (
                  <div className="skeleton" style={{ height: 120, margin: "1rem" }} />
                ) : thread.messages.length === 0 ? (
                  <div className="chat-start">
                    <Icon name="mail" size={22} />
                    <p>
                      Début de votre conversation avec <strong>{interlocuteur?.nom_affiche}</strong>.
                      <br />
                      Écrivez votre premier message ci-dessous.
                    </p>
                  </div>
                ) : (
                  thread.messages.map((m, i) => {
                    const prev = thread.messages[i - 1];
                    const mine = m.auteur === user.id;
                    const newDay = !prev || !memeJour(prev.envoye_le, m.envoye_le);
                    const grouped = prev && !newDay && prev.auteur === m.auteur;
                    return (
                      <div key={m.id}>
                        {newDay && (
                          <div className="chat-day">
                            <span>{formatJour(m.envoye_le)}</span>
                          </div>
                        )}
                        <div className={`bubble-row ${mine ? "mine" : "theirs"} ${grouped ? "grouped" : ""}`}>
                          <div className="bubble">
                            <p>{m.contenu}</p>
                            <time>{formatHeure(m.envoye_le)}</time>
                          </div>
                        </div>
                        {mine && m.id === myLastId && (
                          <div className="bubble-status">
                            {thread.dernier_lu && thread.dernier_lu >= m.id ? (
                              <>
                                <Icon name="check" size={12} /> Lu
                              </>
                            ) : (
                              "Envoyé"
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <form className="chat-composer" onSubmit={send}>
                {sendError && (
                  <div className="alert alert-error" style={{ marginBottom: "0.5rem" }}>
                    <Icon name="alert" size={18} />
                    <span>{sendError}</span>
                  </div>
                )}
                <div className="chat-composer-row">
                  <textarea
                    className="input chat-input"
                    placeholder="Écrire un message…"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      // Texte modifié : l'indication « Brouillon enregistré » n'est plus valable
                      if (e.target.value !== savedDraftRef.current && draftStatus === "saved") setDraftStatus("");
                    }}
                    onKeyDown={onKeyDown}
                    maxLength={MAX_LENGTH}
                    rows={1}
                    aria-label="Message"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon chat-draft"
                    onClick={() => saveDraft(selectedId, draft)}
                    disabled={!draft.trim() || draftStatus === "saved" || draftStatus === "saving"}
                    title="Enregistrer en brouillon"
                    aria-label="Enregistrer en brouillon"
                  >
                    <Icon name="pencil" size={16} />
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-icon chat-send"
                    disabled={!draft.trim() || sending}
                    aria-label="Envoyer"
                    title="Envoyer (Entrée)"
                  >
                    {sending ? <span className="spinner" /> : <Icon name="send" size={18} />}
                  </button>
                </div>
                <div className="chat-hint">
                  <span className="chat-hint-keys">Entrée pour envoyer · Maj + Entrée pour aller à la ligne</span>
                  <span className={`chat-draft-status ${draftStatus}`}>
                    {draftStatus === "saving" && "Enregistrement du brouillon…"}
                    {draftStatus === "saved" && (
                      <>
                        <Icon name="check" size={12} /> Brouillon enregistré
                      </>
                    )}
                    {draftStatus === "error" && "Brouillon non enregistré"}
                  </span>
                  {draft.length > MAX_LENGTH - 200 && (
                    <span>
                      {draft.length} / {MAX_LENGTH}
                    </span>
                  )}
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      {picker && <ContactPicker onClose={() => setPicker(false)} onPick={startWith} />}
    </div>
  );
}

export default Messagerie;

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";

// Animation du panneau de connexion : le parcours d'un stage, du premier jour à l'attestation.
// Le tracé s'adapte à la place réellement libre autour des textes du panneau (logo, accroche,
// sous-titre, atouts, mention de bas de page) : il ne passe jamais dessus.
//   • « L »  : bande sous les textes puis colonne à droite (assez de place à droite du texte)
//   • vague : bande horizontale seule (écran étroit, ou bandeau compact sur téléphone)
// Les tailles sont en pixels réels : elles ne grossissent pas avec l'écran.
//
// Rythme : le point avance d'une étape à l'autre (accélération puis décélération douces),
// marque une pause sur chaque étape, puis un temps d'arrêt sur « Stage terminé » avant de recommencer.
// Une seule horloge (requestAnimationFrame) pilote le point, le tracé, les étapes et les cartes.
const DEPLACEMENT = 1100; // ms entre deux étapes
const PAUSE = 1000; // ms d'arrêt sur chaque étape
const FIN = 1900; // ms d'arrêt sur « Stage terminé »
const FONDU = 700; // ms de fondu avant de recommencer
const CYCLE = 5 * (DEPLACEMENT + PAUSE) + FIN + FONDU;
const LABELS = ["Affectation", "Documents", "Évaluation", "Validation RH", "Attestation"];
const ICONES = ["userCheck", "fileText", "pencil", "shield", "trophy"];
// Explication affichée au survol de chaque étape
const DESCRIPTIONS = [
  "Le stagiaire est affecté à un service et à un encadrant.",
  "Convention, attestation et rapport rejoignent son dossier.",
  "L'encadrant note le stage et rédige son appréciation.",
  "L'agent RH vérifie le dossier et valide le stage.",
  "Le stage est clôturé : la fiche de notes est établie.",
];
const CARTES = [
  { icon: "check", titre: "Convention signée", texte: "Service informatique", etape: 1 },
  { icon: "trending", titre: "Évaluation · 16/20", texte: "Mention Très bien", etape: 2 },
  { icon: "trophy", titre: "Attestation délivrée", texte: "Stage terminé", etape: 4 },
];
const MARGE = 24; // distance minimale entre le tracé et un texte

// Courbe lisse (Catmull-Rom) passant par tous les points ; renvoie aussi chaque segment
const lisser = (pts) => {
  const segments = [];
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const courbe = `C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
    segments.push(`M ${p1[0]} ${p1[1]} ${courbe}`);
    d += ` ${courbe}`;
  }
  return { d, segments };
};

// Rectangle occupé par le TEXTE d'un élément (union des morceaux de texte, et non de son bloc,
// souvent bien plus large), relatif au conteneur ; null s'il est absent ou masqué
const rectDe = (el, origine) => {
  if (!el) return null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const ajouter = (r) => {
    if (!r.width || !r.height) return;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  };
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent.trim()) continue;
    range.selectNodeContents(walker.currentNode);
    ajouter(range.getBoundingClientRect());
  }
  // Icônes (ex. pastilles des atouts) : elles comptent aussi comme obstacles
  el.querySelectorAll("svg").forEach((svg) => ajouter(svg.getBoundingClientRect()));
  if (left === Infinity) return null;
  return { left: left - origine.left, top: top - origine.top, right: right - origine.left, bottom: bottom - origine.top };
};

// Calcule le tracé dans les zones libres du panneau
function calculerTrace(conteneur) {
  const box = conteneur.getBoundingClientRect();
  const W = Math.round(box.width);
  const H = Math.round(box.height);
  if (W < 200 || H < 80) return null;

  const panneau = conteneur.parentElement;
  const enFlux = getComputedStyle(conteneur).position !== "absolute"; // bandeau compact (téléphone)
  const compact = W < 560;

  let pts;
  let nodes;
  let layoutL = false;
  let hautLibre = MARGE;
  let basLibre = H - MARGE;
  let texteHaut = 0;
  let obstacles = [];

  if (enFlux) {
    // Bandeau compact : l'animation a sa propre zone, sans texte à éviter
    const yc = H * 0.5;
    const amp = Math.min(12, H * 0.08);
    nodes = [0.1, 0.3, 0.5, 0.7, 0.9].map((f, i) => [W * f, yc + (i % 2 ? -amp : amp)]);
    pts = [[-30, yc + amp], ...nodes, [W + 30, yc - amp]];
  } else {
    // Textes à éviter : logo, accroche, sous-titre, atouts, mention de bas de page
    const brand = rectDe(panneau.querySelector(".login-brand"), box);
    const legal = rectDe(panneau.querySelector(".login-legal"), box);
    const corps = [".login-pitch h2", ".login-pitch p", ".login-features"]
      .map((s) => rectDe(panneau.querySelector(s), box))
      .filter(Boolean);
    obstacles = [brand, legal, ...corps].filter(Boolean);

    const texteDroite = corps.length ? Math.max(...corps.map((r) => r.right)) : 0;
    texteHaut = corps.length ? Math.min(...corps.map((r) => r.top)) : H / 3;
    const texteBas = corps.length ? Math.max(...corps.map((r) => r.bottom)) : H / 2;
    hautLibre = brand ? brand.bottom + MARGE : MARGE;
    basLibre = legal ? legal.top - MARGE : H - MARGE;

    const bandeHaut = texteBas + MARGE; // bande libre sous les atouts
    const bandeH = basLibre - bandeHaut;
    const colonneL = W - texteDroite - MARGE; // colonne libre à droite des textes

    if (bandeH < 64) return { W, H, cache: true }; // pas assez de place : on n'affiche rien plutôt que gêner

    layoutL = colonneL >= 190 && bandeH >= 110;
    if (layoutL) {
      // Bande du bas (Affectation, Documents) puis colonne de droite (Évaluation, Validation RH, Attestation)
      const yBande = bandeHaut + Math.min(bandeH * 0.38, 80);
      const xCol = Math.min(W - 64, texteDroite + MARGE + colonneL * 0.58);
      const yHautCol = Math.max(hautLibre + 26, 64);
      const yBasCol = Math.max(yHautCol + 160, Math.min(yBande - 70, texteBas));
      nodes = [
        [Math.max(44, W * 0.1), yBande + 4],
        [Math.min(W * 0.42, xCol - 170), yBande - 4],
        [xCol, yBasCol],
        [xCol - 16, (yBasCol + yHautCol) / 2],
        [Math.min(W - 44, xCol + 18), yHautCol],
      ];
      pts = [[-30, yBande + 10], ...nodes, [W + 40, yHautCol - 70]];
    } else {
      // Vague horizontale dans la bande sous les textes
      const yc = bandeHaut + Math.min(bandeH * 0.4, 46);
      const amp = Math.min(14, bandeH * 0.1);
      nodes = [0.1, 0.3, 0.5, 0.7, 0.9].map((f, i) => [W * f, yc + (i % 2 ? -amp : amp)]);
      pts = [[-30, yc + amp], ...nodes, [W + 30, yc - amp]];
    }
  }

  // Cartes : uniquement dans le tracé en « L », et seulement là où la place est mesurée libre
  // Une seule carte est visible à la fois : si un seul emplacement est libre, elles le partagent.
  const cartes = [];
  if (layoutL && W >= 560) {
    const yBande = nodes[0][1];
    const emplacements = [];
    if (basLibre - (yBande + 40) >= 56) {
      emplacements.push({ x: Math.min(nodes[1][0] + 50, W - 250), y: yBande + 42 });
    }
    const espaceHaut = texteHaut - MARGE - hautLibre;
    if (espaceHaut >= 56) {
      emplacements.push({
        x: Math.max(24, Math.min(nodes[4][0] - 270, W - 280)),
        y: hautLibre + (espaceHaut - 50) / 2,
      });
    }
    if (emplacements.length) {
      cartes.push({ ...CARTES[0], ...emplacements[0] });
      const autre = emplacements[1] || emplacements[0];
      cartes.push({ ...CARTES[1], ...autre }, { ...CARTES[2], ...autre });
    }
  }

  return { W, H, nodes, cartes, compact, layoutL, obstacles, ...lisser(pts) };
}

// Position de l'étiquette de l'étape i, relative à son point
const positionEtiquette = (trace, i, x) => {
  const cw = trace.compact ? 6.2 : 6.9; // largeur moyenne d'un caractère
  const largeur = LABELS[i].length * cw + (trace.compact ? 34 : 40); // libellé + numéro « 01 »
  const r = trace.compact ? 13 : 16; // rayon du point
  let lx = -largeur / 2;
  let ly = r + 7;
  if (!trace.layoutL && i % 2) ly = -r - 7 - 24;
  if (trace.layoutL && i >= 2) {
    lx = -largeur - r - 10;
    ly = -12;
  }
  lx = Math.max(-x + 6, Math.min(lx, trace.W - x - largeur - 6)); // reste dans le panneau
  return { lx, ly, largeur };
};

// Zones des étapes (point + étiquette), à éviter si possible par l'info-bulle
const zonesEtapes = (trace) =>
  trace.nodes.map(([x, y], i) => {
    const { lx, ly, largeur } = positionEtiquette(trace, i, x);
    return {
      left: Math.min(x - 18, x + lx),
      right: Math.max(x + 18, x + lx + largeur),
      top: Math.min(y - 18, y + ly),
      bottom: Math.max(y + 18, y + ly + 24),
    };
  });

// Position de l'info-bulle (taille l × h) près du point (x, y) : la première qui reste dans le
// panneau et ne recouvre aucun texte. Les étiquettes sont sous les points : « dessous » les évite.
const placerInfoBulle = (trace, [x, y], l, h) => {
  const ecart = 6;
  const candidats = [
    { left: x - l / 2, top: y - 24 - h }, // au-dessus
    { left: x - l / 2, top: y + 52 }, // en dessous (après l'étiquette)
    { left: x + 30, top: y - h / 2 }, // à droite
    { left: x - 30 - l, top: y - h / 2 }, // à gauche
  ];
  const borner = (c) => ({
    left: Math.max(ecart, Math.min(c.left, trace.W - l - ecart)),
    top: Math.max(ecart, Math.min(c.top, trace.H - h - ecart)),
  });
  const chevauchement = (c, o, marge) =>
    Math.max(0, Math.min(c.left + l, o.right + marge) - Math.max(c.left, o.left - marge)) *
    Math.max(0, Math.min(c.top + h, o.bottom + marge) - Math.max(c.top, o.top - marge));
  const etapes = zonesEtapes(trace);
  // Règle stricte : ne jamais couvrir un texte du panneau. Ensuite : couvrir le moins possible les étapes.
  let meilleure = null;
  for (const c of candidats) {
    const b = borner(c);
    if (Math.abs(b.top - c.top) > 4) continue; // recadrée verticalement : elle cacherait le point
    if (trace.obstacles.some((o) => chevauchement(b, o, ecart) > 0)) continue;
    const gene = etapes.reduce((somme, o) => somme + chevauchement(b, o, 4), 0);
    if (!meilleure || gene < meilleure.gene) meilleure = { ...b, gene };
    if (gene === 0) break;
  }
  return meilleure ? { left: meilleure.left, top: meilleure.top } : borner(candidats[1]);
};

// Douceur du mouvement entre deux étapes
const adoucir = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// État de l'animation au temps e (ms) : longueur parcourue, étapes faites, étape en cours…
const etatA = (e, cumul) => {
  const t = e % CYCLE;
  let debut = 0;
  for (let i = 0; i < 5; i++) {
    const depart = i ? cumul[i - 1] : 0;
    if (t < debut + DEPLACEMENT) {
      const f = adoucir((t - debut) / DEPLACEMENT);
      return { L: depart + (cumul[i] - depart) * f, faites: i, courante: -1, derniere: i - 1, fondu: 0 };
    }
    debut += DEPLACEMENT;
    if (t < debut + PAUSE) return { L: cumul[i], faites: i, courante: i, derniere: i, fondu: 0 };
    debut += PAUSE;
  }
  const fin = cumul[4];
  if (t < debut + FIN) return { L: fin, faites: 5, courante: -1, derniere: 4, fondu: 0, termine: true };
  return { L: fin, faites: 5, courante: -1, derniere: 4, fondu: (t - debut - FIN) / FONDU, termine: true };
};

function StageJourney() {
  const ref = useRef(null);
  const mesureRef = useRef(null);
  const cheminRef = useRef(null);
  const traceProgresRef = useRef(null);
  const pointRef = useRef(null);
  const groupeRef = useRef(null);
  const [trace, setTrace] = useState(null);
  const [longueurs, setLongueurs] = useState(null); // { cumul: [5 étapes], total }
  const [etat, setEtat] = useState({ faites: 0, courante: -1, derniere: -1, termine: false });
  const [survol, setSurvol] = useState(null); // étape survolée (info-bulle)
  const survolRef = useRef(null);
  const tipRef = useRef(null);
  const [tipPos, setTipPos] = useState(null);

  // L'info-bulle est d'abord rendue invisible, mesurée, puis placée dans une zone libre
  useLayoutEffect(() => {
    survolRef.current = survol;
    if (survol === null || !trace?.nodes?.[survol] || !tipRef.current) {
      setTipPos(null);
      return;
    }
    const { offsetWidth: l, offsetHeight: h } = tipRef.current;
    setTipPos(placerInfoBulle(trace, trace.nodes[survol], l, h));
  }, [survol, trace]);

  const recalculer = useCallback(() => {
    if (ref.current) setTrace(calculerTrace(ref.current));
  }, []);

  // Recalcul à l'affichage et à chaque changement de taille (fenêtre, polices chargées…)
  useLayoutEffect(() => {
    const el = ref.current;
    recalculer();
    const ro = new ResizeObserver(recalculer);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    document.fonts?.ready?.then(recalculer);
    return () => ro.disconnect();
  }, [recalculer]);

  // Longueur du tracé jusqu'à chaque étape (fin du segment i = étape i)
  useEffect(() => {
    const p = mesureRef.current;
    if (!trace?.segments || !p) return;
    let somme = 0;
    const cumul = trace.segments.map((d) => {
      p.setAttribute("d", d);
      somme += p.getTotalLength();
      return somme;
    });
    setLongueurs({ cumul: cumul.slice(0, 5), total: somme });
  }, [trace]);

  // Horloge unique : point, tracé lumineux, étapes et cartes. Pause pendant le survol d'une étape.
  useEffect(() => {
    if (!longueurs || !cheminRef.current) return undefined;
    const chemin = cheminRef.current;
    const appliquer = (st) => {
      const pt = chemin.getPointAtLength(st.L);
      pointRef.current?.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
      if (traceProgresRef.current) traceProgresRef.current.style.strokeDasharray = `${st.L} ${longueurs.total + 10}`;
      if (groupeRef.current) groupeRef.current.style.opacity = String(1 - st.fondu);
      setEtat((avant) =>
        avant.faites === st.faites &&
        avant.courante === st.courante &&
        avant.derniere === st.derniere &&
        !!avant.termine === !!st.termine
          ? avant
          : { faites: st.faites, courante: st.courante, derniere: st.derniere, termine: !!st.termine },
      );
    };

    // Mouvements réduits : le parcours est affiché complet, sans animation
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      appliquer({ L: longueurs.cumul[4], faites: 5, courante: -1, derniere: 4, fondu: 0, termine: true });
      return undefined;
    }

    let ecoule = 0;
    let precedent = null;
    let id;
    const tic = (ts) => {
      if (precedent !== null && survolRef.current === null) ecoule += Math.min(ts - precedent, 100);
      precedent = ts;
      appliquer(etatA(ecoule, longueurs.cumul));
      id = requestAnimationFrame(tic);
    };
    id = requestAnimationFrame(tic);
    return () => cancelAnimationFrame(id);
  }, [longueurs]);

  const visible = trace && !trace.cache;
  const pret = visible && longueurs;
  const fs = trace?.compact ? 10.5 : 11.5;
  const r = trace?.compact ? 13 : 16;

  return (
    <div ref={ref} className={`journey jy ${trace?.compact ? "is-compact" : ""}`} aria-hidden="true">
      {visible && (
        <svg className="journey-svg" viewBox={`0 0 ${trace.W} ${trace.H}`} width={trace.W} height={trace.H}>
          <defs>
            <linearGradient id="jy-trait" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.35" />
              <stop offset="0.55" stopColor="#bfdbfe" />
              <stop offset="1" stopColor="#ffffff" />
            </linearGradient>
            <radialGradient id="jy-halo">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="0.4" stopColor="#93c5fd" stopOpacity="0.35" />
              <stop offset="1" stopColor="#93c5fd" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Tracé invisible servant à mesurer chaque segment */}
          <path ref={mesureRef} d="M0 0" fill="none" stroke="none" />

          {/* Rail : le chemin complet, fin et discret */}
          <path ref={cheminRef} d={trace.d} className="jy-rail" />

          {pret && (
            <>
              <g ref={groupeRef}>
                {/* Progression : trait lumineux jusqu'au point */}
                <path
                  ref={traceProgresRef}
                  d={trace.d}
                  className="jy-progress"
                  style={{ strokeDasharray: `0 ${longueurs.total + 10}` }}
                />
              </g>

              {/* Point qui avance sur le parcours (sous les pastilles : il ne cache pas leurs icônes) */}
              <g ref={pointRef} className="jy-point">
                <circle r={r + 8} fill="url(#jy-halo)" />
                <circle r={trace.compact ? 3.5 : 4} fill="#fff" />
              </g>

              {trace.nodes.map(([x, y], i) => {
                const { lx, ly, largeur } = positionEtiquette(trace, i, x);
                const statut = i < etat.faites ? "done" : i === etat.courante ? "current" : "todo";
                return (
                  <g
                    key={`${trace.d}-${LABELS[i]}`}
                    className={`jy-node is-${statut} ${survol === i ? "is-hover" : ""}`}
                    transform={`translate(${x} ${y})`}
                    onMouseEnter={() => setSurvol(i)}
                    onMouseLeave={() => setSurvol(null)}
                  >
                    <circle className="jy-hit" r={r + 12} />
                    <circle className="jy-pulse" r={r} />
                    <circle className="jy-disc" r={r} />
                    <g className="jy-icon" transform={`translate(${-r * 0.5} ${-r * 0.5})`}>
                      <Icon name={statut === "done" ? "check" : ICONES[i]} size={r} strokeWidth={2} duotone={false} />
                    </g>
                    <g className="jy-label" transform={`translate(${lx} ${ly})`}>
                      <rect width={largeur} height="24" rx="12" />
                      <text x="10" y="16" style={{ fontSize: fs }}>
                        <tspan className="jy-num">{`0${i + 1}`}</tspan>
                        <tspan dx="6">{LABELS[i]}</tspan>
                      </text>
                    </g>
                  </g>
                );
              })}

            </>
          )}
        </svg>
      )}

      {/* Info-bulle de l'étape survolée (l'animation est en pause pendant le survol) */}
      {pret && survol !== null && trace.nodes[survol] && (
        <div
          ref={tipRef}
          className={`journey-tip ${tipPos ? "is-placed" : ""}`}
          style={tipPos ? { left: tipPos.left, top: tipPos.top } : { left: 0, top: 0 }}
        >
          <strong>
            {`0${survol + 1}`} · {LABELS[survol]}
          </strong>
          <span>{DESCRIPTIONS[survol]}</span>
        </div>
      )}

      {/* Une seule carte à la fois : celle de la dernière étape atteinte */}
      {pret &&
        trace.cartes.map((c) => (
          <div
            key={`${trace.d}-${c.titre}`}
            className={`jy-card ${etat.derniere === c.etape ? "is-active" : ""}`}
            style={{ left: c.x, top: c.y }}
          >
            <span className="jy-card-icon">
              <Icon name={c.icon} size={15} />
            </span>
            <span className="jy-card-text">
              <strong>{c.titre}</strong>
              <small>{c.texte}</small>
            </span>
            {c.etape === 4 && etat.termine && <span className="jy-card-badge">Terminé</span>}
          </div>
        ))}
    </div>
  );
}

export default StageJourney;

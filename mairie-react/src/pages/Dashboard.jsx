import { useState, useEffect } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/ui/Icon";
import EmptyState from "../components/ui/EmptyState";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

const monthsShort = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const monthsInitial = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MOBILE_QUERY = "(max-width: 640px)";

// Vrai quand l'écran est celui d'un téléphone (mis à jour si la fenêtre change de taille)
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

const monthsFull = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// Une couleur par mois (palette qui suit les saisons : hiver bleu, printemps vert, été chaud, automne)
const monthColors = [
  "#2563eb", // Janvier
  "#0891b2", // Février
  "#0d9488", // Mars
  "#16a34a", // Avril
  "#65a30d", // Mai
  "#ca8a04", // Juin
  "#ea580c", // Juillet
  "#dc2626", // Août
  "#db2777", // Septembre
  "#9333ea", // Octobre
  "#7c3aed", // Novembre
  "#4f46e5", // Décembre
];

// Infobulle personnalisée du graphique
function ChartTooltip({ active, payload, total, year }) {
  if (!active || !payload?.length) return null;
  const { index, stagiaires } = payload[0].payload;
  const share = total ? Math.round((stagiaires / total) * 100) : 0;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">
        {monthsFull[index]} {year}
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-swatch" style={{ background: monthColors[index] }} />
        <span>Stages démarrés</span>
        <strong>{stagiaires}</strong>
      </div>
      <div className="chart-tooltip-foot">{share}% du total</div>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ stagiaires: 0, encadrants: 0, services: 0 });
  const [stageDates, setStageDates] = useState([]); // [{ year, month }]
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("chart");
  const [hovered, setHovered] = useState(null);
  const isMobile = useIsMobile(); // graphique resserré sur téléphone

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);

    let totalStagiaires = 0;
    let totalEncadrants = 0;
    let totalServices = 0;
    let dates = [];

    // 1. Récupération des Stagiaires
    try {
      const resStagiaires = await api.get("stagiaires/");
      totalStagiaires = resStagiaires.data ? resStagiaires.data.length : 0;
    } catch (err) {
      console.error("Erreur stagiaires:", err);
    }

    // 2. Récupération des Utilisateurs / Encadrants
    try {
      const resUsers = await api.get("utilisateurs/");
      if (Array.isArray(resUsers.data)) {
        totalEncadrants = resUsers.data.filter(
          (u) => u.role === "TUTEUR" || u.role === "ENCADRANT"
        ).length;
      }
    } catch (err) {
      console.error("Erreur utilisateurs:", err);
    }

    // 3. Récupération des services
    try {
      const resServices = await api.get("services/");
      totalServices = resServices.data ? resServices.data.length : 0;
    } catch (err) {
      console.error("Erreur services:", err);
    }

    // 4. Récupération des Stages pour construire le graphique
    try {
      const resStages = await api.get("stages/");
      if (Array.isArray(resStages.data)) {
        // Lecture directe de "AAAA-MM-JJ" pour éviter les décalages de fuseau horaire
        dates = resStages.data
          .filter((stage) => stage.date_debut)
          .map((stage) => ({
            year: Number(String(stage.date_debut).slice(0, 4)),
            month: Number(String(stage.date_debut).slice(5, 7)) - 1,
          }))
          .filter((d) => !Number.isNaN(d.year) && d.month >= 0 && d.month < 12);
      }
    } catch (err) {
      console.error("Erreur stages:", err);
    }

    setStats({ stagiaires: totalStagiaires, encadrants: totalEncadrants, services: totalServices });
    setStageDates(dates);
    // Année par défaut : l'année en cours si elle a des stages, sinon la plus récente
    const thisYear = new Date().getFullYear();
    if (dates.length && !dates.some((d) => d.year === thisYear)) {
      setSelectedYear(Math.max(...dates.map((d) => d.year)));
    }
    setLoading(false);
  };

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const cards = [
    { label: "Stagiaires", value: stats.stagiaires, icon: "graduation", tone: "tone-blue" },
    { label: "Tuteurs / Encadrants", value: stats.encadrants, icon: "userCheck", tone: "tone-teal" },
    { label: "Services", value: stats.services, icon: "building", tone: "tone-violet" },
  ];

  // Années disponibles (l'année en cours est toujours proposée), de la plus récente à la plus ancienne
  const thisYear = new Date().getFullYear();
  const years = [...new Set([thisYear, ...stageDates.map((d) => d.year)])].sort((a, b) => b - a);
  const yearIdx = years.indexOf(selectedYear);

  const countsFor = (year) => {
    const counts = Array(12).fill(0);
    stageDates.forEach((d) => {
      if (d.year === year) counts[d.month] += 1;
    });
    return counts;
  };

  const chartData = countsFor(selectedYear).map((count, index) => ({
    month: monthsShort[index],
    index,
    stagiaires: count,
  }));

  const totalStages = chartData.reduce((sum, d) => sum + d.stagiaires, 0);
  const previousTotal = countsFor(selectedYear - 1).reduce((a, b) => a + b, 0);
  const hasPrevious = stageDates.some((d) => d.year === selectedYear - 1);
  const delta = hasPrevious && previousTotal
    ? Math.round(((totalStages - previousTotal) / previousTotal) * 100)
    : null;
  const average = totalStages / 12;
  const peak = chartData.reduce(
    (best, d) => (d.stagiaires > (best?.stagiaires ?? -1) ? d : best),
    null,
  );
  // Le mois en cours n'est mis en avant que pour l'année en cours
  const currentMonth = selectedYear === thisYear ? new Date().getMonth() : -1;
  const formatNumber = (n) =>
    n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

  return (
    <div>
      {/* Carte d'accueil */}
      <section className="welcome-card">
        <div className="welcome-text">
          <span className="welcome-date">
            <Icon name="calendar" size={14} />
            {today}
          </span>
          <h2 className="welcome-title">Bonjour, {user?.prenom || user?.username}{" "}
            <span className="wave" role="img" aria-label="Salut">
              👋
            </span>
          </h2>
          <p className="welcome-subtitle">Aperçu global de l'activité de gestion des stages</p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-art-ring">
            <Icon name="landmark" size={38} strokeWidth={1.6} />
          </div>
        </div>
      </section>

      <div className="stats-grid">
        {cards.map((card) => (
          <div key={card.label} className={`card stat-card ${card.tone}`}>
            <div className="stat-icon">
              <Icon name={card.icon} size={22} />
            </div>
            <div>
              <div className="stat-label">{card.label}</div>
              {loading ? (
                <div className="skeleton" style={{ width: 56, height: 30, marginTop: 4 }} />
              ) : (
                <div className="stat-value">{card.value}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card chart-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Stages démarrés par mois en {selectedYear}</h3>
            <p className="card-subtitle">
              Répartition mensuelle selon la date de début de stage
            </p>
          </div>
          <div className="chart-controls">
          <div className="year-picker" aria-label="Choisir l'année">
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => setSelectedYear(years[yearIdx + 1])}
              disabled={yearIdx >= years.length - 1}
              aria-label="Année précédente"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <select
              className="year-select"
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
                setHovered(null);
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => setSelectedYear(years[yearIdx - 1])}
              disabled={yearIdx <= 0}
              aria-label="Année suivante"
            >
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
          <div className="segmented" role="tablist" aria-label="Mode d'affichage">
            <button
              role="tab"
              aria-selected={view === "chart"}
              className={view === "chart" ? "active" : ""}
              onClick={() => setView("chart")}
            >
              Graphique
            </button>
            <button
              role="tab"
              aria-selected={view === "table"}
              className={view === "table" ? "active" : ""}
              onClick={() => setView("table")}
            >
              Tableau
            </button>
          </div>
          </div>
        </div>

        <div className="chart-metrics">
          <div className="chart-metric">
            <span className="chart-metric-label">Total des stages en {selectedYear}</span>
            {loading ? (
              <div className="skeleton" style={{ width: 48, height: 26 }} />
            ) : (
              <strong className="chart-metric-value">
                {totalStages}
                {delta !== null && (
                  <span className={`delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
                    {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta)}% vs {selectedYear - 1}
                  </span>
                )}
              </strong>
            )}
          </div>
          <div className="chart-metric">
            <span className="chart-metric-label">Mois le plus actif</span>
            {loading ? (
              <div className="skeleton" style={{ width: 90, height: 26 }} />
            ) : (
              <strong className="chart-metric-value">
                {totalStages ? monthsFull[peak.index] : "—"}
                {totalStages > 0 && (
                  <small> · {peak.stagiaires}</small>
                )}
              </strong>
            )}
          </div>
          <div className="chart-metric">
            <span className="chart-metric-label">Moyenne mensuelle</span>
            {loading ? (
              <div className="skeleton" style={{ width: 48, height: 26 }} />
            ) : (
              <strong className="chart-metric-value">{formatNumber(average)}</strong>
            )}
          </div>
        </div>

        <div className="card-body">
          {loading ? (
            <div className="skeleton" style={{ height: 300 }} />
          ) : totalStages === 0 ? (
            <EmptyState
              icon="clipboard"
              title={`Aucun stage en ${selectedYear}`}
              description="Aucun stage n'a de date de début sur cette année. Choisissez une autre année ci-dessus."
            />
          ) : view === "chart" ? (
            <div style={{ width: "100%", height: isMobile ? 240 : 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={isMobile ? { top: 18, right: 4, left: -30, bottom: 0 } : { top: 16, right: 8, left: -20, bottom: 0 }}
                  barCategoryGap={isMobile ? "16%" : "22%"}
                  onMouseLeave={() => setHovered(null)}
                >
                  <CartesianGrid stroke="#eef1f6" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={{ stroke: "#e6e9f0" }}
                    tick={{ fill: "#64748b", fontSize: isMobile ? 11 : 12 }}
                    interval={0}
                    tickFormatter={(m, i) => (isMobile ? monthsInitial[i] : m)}
                    dy={6}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#94a3b8", fontSize: isMobile ? 10 : 12 }}
                    width={isMobile ? 40 : 60}
                  />
                  <Tooltip
                    cursor={{ fill: "#f1f5f9", radius: 6 }}
                    content={<ChartTooltip total={totalStages} year={selectedYear} />}
                  />
                  <ReferenceLine
                    y={average}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    label={{
                      value: `Moy. ${formatNumber(average)}`,
                      position: "insideTopRight",
                      fill: "#64748b",
                      fontSize: isMobile ? 10 : 11,
                      fontWeight: 600,
                    }}
                  />
                  {/* Dégradé vertical propre à chaque mois */}
                  <defs>
                    {monthColors.map((c, i) => (
                      <linearGradient key={c} id={`month-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={1} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.65} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Bar
                    dataKey="stagiaires"
                    name="Stages démarrés"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={isMobile ? 22 : 38}
                    onMouseEnter={(_, index) => setHovered(index)}
                  >
                    {chartData.map((d) => {
                      // Mois survolé (ou mois en cours) en couleur vive, les autres légèrement atténués
                      const focus = hovered ?? (currentMonth >= 0 ? currentMonth : null);
                      const dimmed = focus !== null && focus !== d.index;
                      return (
                        <Cell
                          key={d.month}
                          fill={`url(#month-grad-${d.index})`}
                          fillOpacity={dimmed ? 0.45 : 1}
                          stroke={dimmed ? "none" : monthColors[d.index]}
                          strokeWidth={dimmed ? 0 : 1}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="table-wrap month-table-wrap">
              <table className="table table-compact month-table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th className="num">Stages</th>
                    <th className="num">Part</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((d) => (
                    <tr
                      key={d.month}
                      className={`${d.stagiaires === 0 ? "is-zero" : ""} ${d.index === currentMonth ? "is-current" : ""}`}
                    >
                      <td className="month-name" style={{ "--month-color": monthColors[d.index] }}>
                        <span className="month-dot" />
                        {monthsFull[d.index]}
                        {d.index === currentMonth && (
                          <span className="badge badge-blue current-month-badge">
                            {isMobile ? "En cours" : "Mois en cours"}
                          </span>
                        )}
                      </td>
                      <td className="num month-count">
                        {d.stagiaires}
                        <span className="month-count-unit"> stage{d.stagiaires > 1 ? "s" : ""}</span>
                      </td>
                      <td className="num month-share">
                        <div className="share">
                          <span className="share-bar">
                            <span
                              style={{
                                width: `${(d.stagiaires / peak.stagiaires) * 100}%`,
                                background: monthColors[d.index],
                              }}
                            />
                          </span>
                          {Math.round((d.stagiaires / totalStages) * 100)}%
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && totalStages > 0 && view === "chart" && (
          <div className="chart-legend">
            <span className="legend-months" aria-label="Une couleur par mois">
              {monthColors.map((c, i) => (
                <i key={c} style={{ background: c }} title={monthsFull[i]} />
              ))}
              Une couleur par mois
            </span>
            <span>
              <i style={{ background: "#94a3b8", opacity: 0.45 }} />
              {currentMonth >= 0 ? "Atténué : autres que le mois en cours / survolé" : "Atténué : autres que le mois survolé"}
            </span>
            <span><i className="dash" /> Moyenne mensuelle</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;

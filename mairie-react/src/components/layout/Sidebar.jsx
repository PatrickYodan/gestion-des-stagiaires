import { useAuth } from "../../context/AuthContext";
import Icon from "../ui/Icon";
import { ROUTES, handleLinkClick } from "../../utils/router";
import { useUnreadCount } from "../../utils/messagerie";
import Logo from "../ui/Logo";

function Sidebar({ activeTab, open, collapsed, onClose }) {
  const { user, can } = useAuth();
  const unread = useUnreadCount();

  if (!user) return null;

  const menuItems = [
    {
      id: "dashboard",
      label: "Tableau de bord",
      icon: "dashboard",
    },
    {
      id: "stagiaires",
      label: user.role === "TUTEUR" ? "Mes Stagiaires" : "Gestion Stagiaires",
      icon: "graduation",
    },
    {
      id: "tuteurs",
      label: "Liste des Encadrants",
      icon: "userCheck",
    },
    {
      id: "stages",
      label: "Affectations & Stages",
      icon: "clipboard",
    },
    {
      id: "services",
      label: "Services & Établissements",
      icon: "building",
    },
    {
      id: "utilisateurs",
      label: "Gestion Utilisateurs",
      icon: "users",
    },
    {
      id: "documents",
      label: "Documents & Attestations",
      icon: "folder",
    },
  ];

  // Visibilité des onglets selon les droits d'accès configurés par l'administrateur
  const filteredMenu = menuItems.filter((item) => can(item.id));

  // Section « Compte », accessible à tous les rôles
  const accountItems = [
    { id: "messagerie", label: "Messagerie", icon: "messages", badge: unread },
    { id: "compte", label: "Mon compte", icon: "settings" },
  ];

  const renderItem = (item) => (
    <li key={item.id}>
      {/* Vrai lien : l'adresse change, et Ctrl+clic / clic molette ouvre la page dans un nouvel onglet */}
      <a
        href={ROUTES[item.id]}
        onClick={(e) => handleLinkClick(e, ROUTES[item.id], onClose)}
        className={`sidebar-link ${activeTab === item.id ? "active" : ""}`}
        aria-current={activeTab === item.id ? "page" : undefined}
        title={collapsed ? item.label : undefined}
      >
        <Icon name={item.icon} size={18} />
        <span className="sidebar-label">{item.label}</span>
        {item.badge > 0 && (
          <span className="sidebar-badge" aria-label={`${item.badge} non lu${item.badge > 1 ? "s" : ""}`}>
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </a>
    </li>
  );

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside className={`sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <Logo size={40} />
          </div>
          <div className="sidebar-label">
            <div className="brand-name">Gestion des Stagiaires</div>
            <div className="brand-sub">Mairie</div>
          </div>
          <button
            className="sidebar-close"
            onClick={onClose}
            aria-label="Fermer le menu"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">Navigation</div>
          <ul className="sidebar-list">{filteredMenu.map(renderItem)}</ul>

          <div className="sidebar-section" style={{ marginTop: "1.5rem" }}>Compte</div>
          <ul className="sidebar-list">{accountItems.map(renderItem)}</ul>
        </nav>

        <div className="sidebar-footer">
          <strong>Espace {user.role}</strong>
          Plateforme de suivi des stages municipaux
        </div>
      </aside>
    </>
  );
}

export default Sidebar;

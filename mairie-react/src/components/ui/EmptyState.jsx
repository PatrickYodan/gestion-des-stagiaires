import Icon from "./Icon";

// État vide (aucune donnée, aucun résultat) : icône dans un médaillon à anneaux, titre et explication.
function EmptyState({ icon = "folder", title, description, children }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        <span className="empty-icon-ring" />
        <Icon name={icon} size={26} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}

export default EmptyState;

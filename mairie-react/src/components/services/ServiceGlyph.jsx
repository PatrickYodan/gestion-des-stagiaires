import Icon from "../ui/Icon";
import { serviceVisual } from "../../utils/serviceIcons";

// Petite icône colorée représentant le type d'un service (informatique, RH, courrier…)
function ServiceGlyph({ service, size = 14 }) {
  const { icon, tone } = serviceVisual(service);
  return <Icon name={icon} size={size} className={`service-glyph ${tone}`} />;
}

export default ServiceGlyph;

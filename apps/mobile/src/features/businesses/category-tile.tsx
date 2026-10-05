import type { Category } from "@vado/contracts";

import type { AccentName } from "@/theme/tokens";
import { type IconName, IconTile } from "@/ui/icon";

const CATEGORY_ICONS: Record<Category, { icon: IconName; accent: AccentName }> = {
  food: { icon: "restaurant", accent: "brick" },
  shopping: { icon: "bag-handle", accent: "plum" },
  beauty: { icon: "cut", accent: "cobalt" },
  health: { icon: "medkit", accent: "emerald" },
  transport: { icon: "bus", accent: "turquoise" },
  education: { icon: "school", accent: "ochre" },
  entertainment: { icon: "film", accent: "plum" },
  finance: { icon: "card", accent: "teal" },
  public: { icon: "business", accent: "cobalt" },
  other: { icon: "ellipsis-horizontal", accent: "teal" },
};

/** İşletmenin kategorisini gösteren simge kutusu. */
export function CategoryTile({ category, size = 44 }: { category: Category; size?: number }) {
  const { icon, accent } = CATEGORY_ICONS[category];
  return <IconTile name={icon} accent={accent} size={size} />;
}

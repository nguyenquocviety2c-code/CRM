import {
  Users,
  UserPlus,
  Star,
  Heart,
  Award,
  Gift,
  Crown,
  Sparkles,
  Tag,
  Smile,
  Trophy,
  Medal,
  Flame,
  Zap,
  Target,
  Bookmark,
} from "lucide-react";

/**
 * Predefined logo set for customer sets — a curated palette of lucide icons
 * rendered as SVG glyphs. Stored in the `logo` column as a short string id
 * (e.g. "users", "star") so any UI can re-render the glyph without hosting
 * image files. Shared between the create/edit dialog (picker), the list
 * (badge), and the members-view (header) so all three stay in sync.
 */
export const LOGO_OPTIONS: Array<{
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "users", label: "Nhóm người", Icon: Users },
  { id: "user-plus", label: "Thêm khách", Icon: UserPlus },
  { id: "star", label: "Sao", Icon: Star },
  { id: "heart", label: "Trái tim", Icon: Heart },
  { id: "award", label: "Bằng khen", Icon: Award },
  { id: "gift", label: "Quà tặng", Icon: Gift },
  { id: "crown", label: "Vương miện", Icon: Crown },
  { id: "sparkles", label: "Lấp lánh", Icon: Sparkles },
  { id: "tag", label: "Nhãn", Icon: Tag },
  { id: "smile", label: "Cười", Icon: Smile },
  { id: "trophy", label: "Cúp", Icon: Trophy },
  { id: "medal", label: "Huy chương", Icon: Medal },
  { id: "flame", label: "Ngọn lửa", Icon: Flame },
  { id: "zap", label: "Tia chớp", Icon: Zap },
  { id: "target", label: "Đích", Icon: Target },
  { id: "bookmark", label: "Dấu trang", Icon: Bookmark },
];

/**
 * Resolve a logo value to a renderable React element.
 *  - Predefined id (e.g. "users") → renders the matching lucide glyph.
 *  - Legacy image URL (http/base64) → renders an <img>.
 *  - null/undefined → returns null.
 *
 * `className` is applied to the rendered element (Icon or img).
 */
export function renderLogo(
  logo: string | null | undefined,
  className: string
): React.ReactElement | null {
  if (!logo) return null;
  const preset = LOGO_OPTIONS.find((o) => o.id === logo);
  if (preset) {
    const { Icon } = preset;
    return <Icon className={className} />;
  }
  // Legacy: image URL — render an <img>.
  return <img src={logo} alt="" className={className} />;
}

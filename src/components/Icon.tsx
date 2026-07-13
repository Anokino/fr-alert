import {
  Activity,
  Building2,
  CloudLightning,
  Droplets,
  Flame,
  GlassWater,
  Landmark,
  ShieldAlert,
  Waves,
  Wind,
  MapPin,
  type LucideIcon,
} from "lucide-react";

/** Mapping nom kebab (déclaré dans les modules) → composant lucide. */
const MAP: Record<string, LucideIcon> = {
  flame: Flame,
  waves: Waves,
  "glass-water": GlassWater,
  wind: Wind,
  activity: Activity,
  "cloud-lightning": CloudLightning,
  "shield-alert": ShieldAlert,
  droplets: Droplets,
  "building-2": Building2,
  landmark: Landmark,
  "map-pin": MapPin,
};

export function Icon({
  name,
  className,
  size = 18,
  strokeWidth = 2,
}: {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const Cmp = MAP[name] ?? MapPin;
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} aria-hidden />;
}

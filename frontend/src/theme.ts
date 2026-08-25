// Design tokens from design_guidelines.json — "5 Brutalist Mobile (Light)".
// Sharp corners (radius 0), thick borders over shadows, high contrast, glove-friendly targets.

export const colors = {
  surface: "#FFFFFF",
  onSurface: "#09090B",
  surfaceSecondary: "#F4F4F5",
  onSurfaceSecondary: "#18181B",
  surfaceTertiary: "#E4E4E7",
  onSurfaceTertiary: "#27272A",
  surfaceInverse: "#18181B",
  onSurfaceInverse: "#FFFFFF",
  brand: "#18181B",
  brandSecondary: "#52525B",
  success: "#16A34A",
  onSuccess: "#FFFFFF",
  warning: "#D97706",
  onWarning: "#FFFFFF",
  error: "#DC2626",
  onError: "#FFFFFF",
  info: "#2563EB",
  onInfo: "#FFFFFF",
  border: "#E4E4E7",
  borderStrong: "#18181B",
  muted: "#71717A",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const radius = { sm: 0, md: 0, lg: 0, pill: 0 };

export const font = {
  display: "SpaceGrotesk",
  text: "SpaceGrotesk",
  mono: "JetBrainsMono",
};

export const type = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
};

export function resultColor(result?: string | null) {
  if (result === "PASS") return colors.success;
  if (result === "FAIL") return colors.error;
  if (result === "PENDING") return colors.warning;
  return colors.muted;
}

export const SHIFTS = ["Morning", "Afternoon", "Night"];
export const CA_STATUS = ["Open", "Under Investigation", "Corrected", "Verified", "Closed"];

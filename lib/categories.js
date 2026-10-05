export const ORANGE = "#E2611B";
export const SLATE = "#1F2B30";
export const GREEN = "#4F7A5B";
export const PURPLE = "#5C5470";
export const CREAM = "#F7F3EC";
export const INK = "#1C1A17";

export const CATEGORY_STYLES = {
  repos: { bg: "#E8F0E6", border: "#4F7A5B", text: "#2F4A37", label: "Repos" },
  syndical: { bg: "#FBE9DF", border: ORANGE, text: "#7A3210", label: "Activité syndicale" },
  travail: { bg: "#E7ECEF", border: SLATE, text: "#1C242A", label: "Travail terrain" },
  greve: { bg: "#F7E2DF", border: "#B23A2E", text: "#7A2419", label: "Grève / retenue" },
  compteur: { bg: "#EDEAF2", border: PURPLE, text: "#382F4D", label: "Compteur" },
  none: { bg: "#F1EEE7", border: "#C9C2B4", text: "#9A9384", label: "Hors export" },
};

export function guessCategory(code) {
  if (!code) return "none";
  const c = code.toUpperCase();
  // Repos et congés — ne comptent PAS comme jours de travail dans la GPT
  if (["RP", "RH", "RD", "RA", "C", "VC", "VT"].includes(c)) return "repos";
  // Grève / retenue
  if (["DC", "GR"].includes(c)) return "greve";
  // Compteurs
  if (["TQ", "TC", "TY", "CT"].includes(c)) return "compteur";
  // Non utilisé — présent mais non affecté
  if (c === "NU") return "none";
  // Activité syndicale
  if (c.startsWith("D") || ["AP", "PVARPSV", "FDPX"].includes(c)) return "syndical";
  // Travail terrain (codes roulement B..., Z..., P..., ZPSVVRA...)
  if (c.startsWith("B") || c.startsWith("Z") || c.startsWith("P")) return "travail";
  // Défaut : syndical
  return "syndical";
}

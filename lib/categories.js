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

// Devine une catégorie à partir d'un code d'utilisation.
// À AFFINER avec le dictionnaire de codes complet par site (cf. conversation).
export function guessCategory(code) {
  if (!code) return "none";
  const c = code.toUpperCase();
  if (["RP", "RH", "RD", "RA"].includes(c)) return "repos";
  if (["DC", "GR"].includes(c)) return "greve";
  if (["TQ", "TC", "TY", "CT"].includes(c)) return "compteur";
  if (c.startsWith("D") || c === "AP" || c === "PVARPSV") return "syndical";
  if (c.startsWith("B") || c.startsWith("Z") || c.startsWith("P")) return "travail";
  return "syndical";
}

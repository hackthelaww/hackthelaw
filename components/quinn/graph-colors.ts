/**
 * Pure neutral grayscale — no hue, matching app/globals.css's black/white
 * design system. Node type is distinguished by fill shade + size, urgency
 * (partial/non-compliant findings) by going darkest, same weight-not-color
 * convention as status-dot.tsx.
 */
const LIGHT = {
  black: "#060606",
  dark: "#333333",
  mid: "#717171",
  light: "#d1d1d1",
  edge: "#cecece",
};

const DARK = {
  black: "#e8e8e8",
  dark: "#9e9e9e",
  mid: "#636363",
  light: "#484848",
  edge: "#484848",
};

type Palette = typeof LIGHT;

const ATTENTION_STATUSES = new Set(["partially_compliant", "non_compliant"]);

export function colorForNode(palette: Palette, label: string, status?: string | null): string {
  switch (label) {
    case "Matter":
      return palette.black;
    case "Finding":
      return status && ATTENTION_STATUSES.has(status) ? palette.black : palette.mid;
    case "PlaybookRule":
      return palette.mid;
    case "Review":
    case "SignOff":
      return palette.dark;
    default:
      return palette.light;
  }
}

export function graphPalette(resolvedTheme: string | undefined): Palette {
  return resolvedTheme === "dark" ? DARK : LIGHT;
}

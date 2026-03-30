/**
 * Bidirectional color resolver: maps between Figma RGB values and
 * theme token names or Tailwind color names.
 */

import type { FigmaNativeConfig } from "./config";

type RGB = { r: number; g: number; b: number };

/**
 * Parse a hex color string to RGB (0-1 range).
 */
export function hexToRgb(hex: string): RGB {
  hex = hex.replace("#", "");
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255,
  };
}

/**
 * Convert RGB (0-1) to hex string.
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => {
    const h = Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
    return h;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Euclidean distance between two RGB colors (0-1 range).
 */
function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Default tolerance for color matching (in 0-1 RGB space, ~5/255) */
const DEFAULT_TOLERANCE = 0.025;

export type ColorMatch = {
  token: string;
  exact: boolean;
} | {
  hex: string;
  exact: false;
};

/**
 * Build a reverse lookup from config theme colors: hex → token name.
 */
export function buildColorLookup(
  config: FigmaNativeConfig
): Map<string, { token: string; rgb: RGB }> {
  const lookup = new Map<string, { token: string; rgb: RGB }>();

  const colors = config.theme?.colors;
  if (!colors) return lookup;

  for (const [token, hex] of Object.entries(colors)) {
    const rgb = hexToRgb(hex);
    lookup.set(token, { token, rgb });
  }

  return lookup;
}

/**
 * Resolve a Figma RGB color to the closest theme token.
 * Returns a token match if within tolerance, otherwise returns the hex value.
 */
export function resolveToToken(
  r: number,
  g: number,
  b: number,
  config: FigmaNativeConfig,
  tolerance = DEFAULT_TOLERANCE
): ColorMatch {
  const colors = config.theme?.colors;
  if (!colors) {
    return { hex: rgbToHex(r, g, b), exact: false };
  }

  let bestToken: string | null = null;
  let bestDist = Infinity;
  const input: RGB = { r, g, b };

  for (const [token, hex] of Object.entries(colors)) {
    const tokenRgb = hexToRgb(hex);
    const dist = colorDistance(input, tokenRgb);
    if (dist < bestDist) {
      bestDist = dist;
      bestToken = token;
    }
  }

  if (bestToken && bestDist <= tolerance) {
    return { token: bestToken, exact: bestDist < 0.001 };
  }

  return { hex: rgbToHex(r, g, b), exact: false };
}

/**
 * Resolve a theme token name back to RGB values (for Code→Figma).
 */
export function resolveFromToken(
  tokenName: string,
  config: FigmaNativeConfig
): RGB | null {
  const hex = config.theme?.colors?.[tokenName];
  if (!hex) return null;
  return hexToRgb(hex);
}

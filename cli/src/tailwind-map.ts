/**
 * Maps Figma numeric values to Tailwind classes.
 * This is the bridge between Figma's pixel values and NativeWind classes.
 */

// Spacing scale: Figma px → Tailwind class
const SPACING: Record<number, string> = {
  0: "0",
  1: "px",
  2: "0.5",
  4: "1",
  6: "1.5",
  8: "2",
  10: "2.5",
  12: "3",
  14: "3.5",
  16: "4",
  20: "5",
  24: "6",
  28: "7",
  32: "8",
  36: "9",
  40: "10",
  44: "11",
  48: "12",
  56: "14",
  64: "16",
  80: "20",
  96: "24",
};

function closestSpacing(px: number): string {
  const keys = Object.keys(SPACING).map(Number);
  const closest = keys.reduce((prev, curr) =>
    Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev
  );
  return SPACING[closest];
}

// Corner radius → Tailwind
const RADIUS: Record<number, string> = {
  0: "rounded-none",
  2: "rounded-sm",
  4: "rounded",
  6: "rounded-md",
  8: "rounded-lg",
  12: "rounded-xl",
  16: "rounded-2xl",
  24: "rounded-3xl",
  9999: "rounded-full",
};

function closestRadius(px: number): string {
  if (px >= 9999) return "rounded-full";
  const keys = Object.keys(RADIUS).map(Number);
  const closest = keys.reduce((prev, curr) =>
    Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev
  );
  return RADIUS[closest];
}

// RGB (0-1) → closest Tailwind color
// Simplified palette — covers the most common Figma design tokens
export const COLORS: Array<{
  name: string;
  r: number;
  g: number;
  b: number;
}> = [
  // Gray scale
  { name: "white", r: 1, g: 1, b: 1 },
  { name: "gray-50", r: 0.98, g: 0.98, b: 0.98 },
  { name: "gray-100", r: 0.96, g: 0.96, b: 0.96 },
  { name: "gray-200", r: 0.9, g: 0.91, b: 0.92 },
  { name: "gray-300", r: 0.82, g: 0.84, b: 0.86 },
  { name: "gray-400", r: 0.63, g: 0.66, b: 0.7 },
  { name: "gray-500", r: 0.42, g: 0.45, b: 0.49 },
  { name: "gray-600", r: 0.29, g: 0.33, b: 0.39 },
  { name: "gray-700", r: 0.22, g: 0.25, b: 0.32 },
  { name: "gray-800", r: 0.12, g: 0.16, b: 0.22 },
  { name: "gray-900", r: 0.07, g: 0.09, b: 0.15 },
  { name: "black", r: 0, g: 0, b: 0 },
  // Blue
  { name: "blue-50", r: 0.94, g: 0.95, b: 1 },
  { name: "blue-100", r: 0.86, g: 0.9, b: 0.99 },
  { name: "blue-500", r: 0.23, g: 0.51, b: 0.96 },
  { name: "blue-600", r: 0.15, g: 0.39, b: 0.92 },
  { name: "blue-700", r: 0.11, g: 0.31, b: 0.85 },
  // Green
  { name: "green-100", r: 0.82, g: 0.95, b: 0.87 },
  { name: "green-500", r: 0.13, g: 0.77, b: 0.37 },
  { name: "green-700", r: 0.08, g: 0.47, b: 0.22 },
  // Red
  { name: "red-100", r: 0.99, g: 0.89, b: 0.88 },
  { name: "red-500", r: 0.94, g: 0.27, b: 0.27 },
  { name: "red-700", r: 0.73, g: 0.15, b: 0.15 },
  // Yellow
  { name: "yellow-100", r: 0.99, g: 0.96, b: 0.81 },
  { name: "yellow-500", r: 0.92, g: 0.76, b: 0.04 },
  { name: "yellow-700", r: 0.63, g: 0.49, b: 0.05 },
];

export function closestColor(r: number, g: number, b: number): string {
  let best = "white";
  let bestDist = Infinity;
  for (const c of COLORS) {
    const dist = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = c.name;
    }
  }
  return best;
}

export function spacingToClass(
  prefix: string,
  px: number | undefined
): string {
  if (px === undefined || px === 0) return "";
  return `${prefix}-${closestSpacing(px)}`;
}

export function gapToClass(px: number | undefined): string {
  if (px === undefined || px === 0) return "";
  return `gap-${closestSpacing(px)}`;
}

export function radiusToClass(px: number | undefined): string {
  if (px === undefined || px === 0) return "";
  return closestRadius(px);
}

export function bgColorToClass(
  r: number,
  g: number,
  b: number
): string {
  return `bg-${closestColor(r, g, b)}`;
}

export function textColorToClass(
  r: number,
  g: number,
  b: number
): string {
  return `text-${closestColor(r, g, b)}`;
}

// Font size: Figma px → Tailwind text-xx class
const FONT_SIZES: Array<[number, string]> = [
  [12, "text-xs"],
  [14, "text-sm"],
  [16, "text-base"],
  [18, "text-lg"],
  [20, "text-xl"],
  [24, "text-2xl"],
  [30, "text-3xl"],
  [36, "text-4xl"],
  [48, "text-5xl"],
  [60, "text-6xl"],
  [72, "text-7xl"],
  [96, "text-8xl"],
  [128, "text-9xl"],
];

export function fontSizeToClass(px: number): string {
  let best = "text-base";
  let bestDist = Infinity;
  for (const [size, cls] of FONT_SIZES) {
    const dist = Math.abs(size - px);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return best;
}

// Font weight: numeric → Tailwind font-xx class
const FONT_WEIGHTS: Array<[number, string]> = [
  [100, "font-thin"],
  [200, "font-extralight"],
  [300, "font-light"],
  [400, "font-normal"],
  [500, "font-medium"],
  [600, "font-semibold"],
  [700, "font-bold"],
  [800, "font-extrabold"],
  [900, "font-black"],
];

export function fontWeightToClass(weight: number | string): string {
  const w = typeof weight === "string" ? parseInt(weight) : weight;
  if (isNaN(w)) return "font-normal";
  let best = "font-normal";
  let bestDist = Infinity;
  for (const [val, cls] of FONT_WEIGHTS) {
    const dist = Math.abs(val - w);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return best;
}

// Line height: ratio of lineHeight/fontSize → Tailwind leading-xx class
const LINE_HEIGHT_RATIOS: Array<[number, string]> = [
  [1.0, "leading-none"],
  [1.25, "leading-tight"],
  [1.375, "leading-snug"],
  [1.5, "leading-normal"],
  [1.625, "leading-relaxed"],
  [2.0, "leading-loose"],
];

export function lineHeightToClass(lineHeight: number, fontSize: number): string {
  if (!fontSize || fontSize === 0) return "leading-normal";
  const ratio = lineHeight / fontSize;
  let best = "leading-normal";
  let bestDist = Infinity;
  for (const [r, cls] of LINE_HEIGHT_RATIOS) {
    const dist = Math.abs(r - ratio);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return best;
}

// Letter spacing: px → Tailwind tracking-xx class
const LETTER_SPACINGS: Array<[number, string]> = [
  [-0.8, "tracking-tighter"],
  [-0.4, "tracking-tight"],
  [0, "tracking-normal"],
  [0.4, "tracking-wide"],
  [0.8, "tracking-wider"],
  [1.6, "tracking-widest"],
];

export function letterSpacingToClass(px: number): string {
  let best = "tracking-normal";
  let bestDist = Infinity;
  for (const [val, cls] of LETTER_SPACINGS) {
    const dist = Math.abs(val - px);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return best;
}

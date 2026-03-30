/**
 * Style backend interface — the abstraction that makes FigmaNative
 * work with different styling approaches (NativeWind, StyleSheet, etc.).
 *
 * Both Figma→Code and Code→Figma directions go through this interface.
 */

import type { FigmaNode } from "../figma-api";

// ─── Intermediate representations ─────────────────────────────

export type LayoutProps = {
  direction?: "HORIZONTAL" | "VERTICAL";
  gap?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  cornerRadius?: number;
  cornerRadii?: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  alignItems?: string; // counterAxisAlignItems
  justifyContent?: string; // primaryAxisAlignItems
  flex?: boolean; // layoutSizingHorizontal/Vertical === "FILL"
  bgColor?: { r: number; g: number; b: number };
  opacity?: number;
  // Dimensions (for fixed-size elements)
  width?: number;
  height?: number;
  // Borders
  borderWidth?: number;
  borderColor?: { r: number; g: number; b: number };
  // Shadows
  shadowColor?: { r: number; g: number; b: number; a: number };
  shadowOffset?: { x: number; y: number };
  shadowRadius?: number;
  elevation?: number;
  // Gradient (first linear gradient fill)
  gradient?: {
    colors: Array<{ r: number; g: number; b: number; a: number; position: number }>;
  };
};

export type TextStyleProps = {
  color?: { r: number; g: number; b: number };
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: string;
};

// ─── Output types ─────────────────────────────────────────────

export type StyleOutput = {
  /** The JSX attribute string, e.g. `className="flex-row gap-4"` or `style={styles.container}` */
  jsxAttr: string;
  /** Style name reference (for StyleSheet backend), e.g. "container" */
  styleName?: string;
  /** If set, this node needs a LinearGradient wrapper with these props */
  gradientProps?: {
    colors: string[]; // e.g. ["'#FF0000'", "'#0000FF'"] or ["Colors.brand", "'#000'"]
    locations?: number[];
  };
};

export type ComponentDescription = {
  name: string;
  props: Array<{ name: string; type: string; default?: string }>;
  variants: Array<string>;
  layout: {
    direction: string;
    gap: number;
    padding: number;
    cornerRadius: number;
  };
  fills: Array<{
    type: string;
    color?: { r: number; g: number; b: number };
  }>;
};

// ─── Generation context ───────────────────────────────────────

export type GenContext = {
  /** Counter for generating unique style names */
  styleCounter: number;
  /** Collected style entries (StyleSheet backend accumulates these) */
  styleEntries: Map<string, Record<string, unknown>>;
};

// ─── The backend interface ────────────────────────────────────

export interface StyleBackend {
  /** Create a fresh generation context for a new file */
  createContext(): GenContext;

  /** Figma→Code: produce the style JSX attribute for a View/container */
  emitContainerStyle(props: LayoutProps, name: string, ctx: GenContext): StyleOutput;

  /** Figma→Code: produce the style JSX attribute for a Text node */
  emitTextStyle(props: TextStyleProps, name: string, ctx: GenContext): StyleOutput;

  /** Figma→Code: produce variant map code (e.g. const variantClasses = {...}) */
  emitVariantMap(
    variantName: string,
    values: Record<string, LayoutProps>,
    type: "container" | "text"
  ): string;

  /** Figma→Code: wrap the component body with appropriate imports/boilerplate */
  wrapScreen(
    screenName: string,
    body: string,
    ctx: GenContext,
    options: { hasText: boolean; hasScrollView: boolean; componentImports: string[] }
  ): string;

  /** Figma→Code: generate a full component file */
  generateComponentFile(
    componentName: string,
    node: FigmaNode
  ): string;

  /** Code→Figma: parse a .tsx component file and extract design metadata */
  parseComponentFile(name: string, source: string): ComponentDescription;
}

// ─── Helpers to extract intermediate props from Figma nodes ───

export function extractLayoutProps(node: FigmaNode): LayoutProps {
  const props: LayoutProps = {};

  if (node.layoutMode === "HORIZONTAL") props.direction = "HORIZONTAL";
  if (node.itemSpacing && node.itemSpacing > 0) props.gap = node.itemSpacing;

  const pl = node.paddingLeft ?? 0;
  const pr = node.paddingRight ?? 0;
  const pt = node.paddingTop ?? 0;
  const pb = node.paddingBottom ?? 0;
  if (pl > 0) props.paddingLeft = pl;
  if (pr > 0) props.paddingRight = pr;
  if (pt > 0) props.paddingTop = pt;
  if (pb > 0) props.paddingBottom = pb;

  // Corner radius — handle both uniform and per-corner
  if (node.cornerRadius != null) {
    if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      props.cornerRadius = node.cornerRadius;
    } else if (typeof node.cornerRadius === "object") {
      props.cornerRadii = node.cornerRadius;
    }
  }

  // Alignment
  if (node.counterAxisAlignItems === "CENTER") props.alignItems = "CENTER";
  if (node.counterAxisAlignItems === "MIN") props.alignItems = "FLEX_START";
  if (node.counterAxisAlignItems === "MAX") props.alignItems = "FLEX_END";
  if (node.primaryAxisAlignItems === "CENTER") props.justifyContent = "CENTER";
  if (node.primaryAxisAlignItems === "SPACE_BETWEEN") props.justifyContent = "SPACE_BETWEEN";
  if (node.primaryAxisAlignItems === "MIN") props.justifyContent = "FLEX_START";
  if (node.primaryAxisAlignItems === "MAX") props.justifyContent = "FLEX_END";

  // Flex sizing
  if (node.layoutSizingHorizontal === "FILL" || node.layoutSizingVertical === "FILL") {
    props.flex = true;
  }

  // Fixed dimensions (when not in auto-layout or sizing is FIXED)
  if (node.width && node.layoutSizingHorizontal === "FIXED") {
    props.width = Math.round(node.width);
  }
  if (node.height && node.layoutSizingVertical === "FIXED") {
    props.height = Math.round(node.height);
  }

  // Background color or gradient (first visible fill)
  if (node.fills?.length) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color) {
      props.bgColor = { r: fill.color.r, g: fill.color.g, b: fill.color.b };
    } else if (
      (fill.type === "GRADIENT_LINEAR" || fill.type === "GRADIENT_RADIAL") &&
      fill.gradientStops?.length
    ) {
      props.gradient = {
        colors: fill.gradientStops.map((s) => ({
          r: s.color.r,
          g: s.color.g,
          b: s.color.b,
          a: s.color.a ?? 1,
          position: s.position,
        })),
      };
    }
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity !== 1) {
    props.opacity = node.opacity;
  }

  // Strokes → borders
  if (node.strokes?.length && node.strokeWeight) {
    const stroke = node.strokes[0];
    if (stroke.type === "SOLID" && stroke.color) {
      props.borderWidth = node.strokeWeight;
      props.borderColor = { r: stroke.color.r, g: stroke.color.g, b: stroke.color.b };
    }
  }

  // Effects → shadows (first DROP_SHADOW)
  if (node.effects?.length) {
    const shadow = node.effects.find(
      (e) => e.type === "DROP_SHADOW" && e.visible !== false
    );
    if (shadow) {
      if (shadow.color) {
        props.shadowColor = {
          r: shadow.color.r,
          g: shadow.color.g,
          b: shadow.color.b,
          a: shadow.color.a ?? 0.25,
        };
      }
      props.shadowOffset = shadow.offset ?? { x: 0, y: 4 };
      props.shadowRadius = shadow.radius ?? 4;
      // Android elevation: approximate from shadow radius
      props.elevation = Math.round((shadow.radius ?? 4) / 2);
    }
  }

  return props;
}

export function extractTextStyleProps(node: FigmaNode): TextStyleProps {
  const props: TextStyleProps = {};

  // Color from first solid fill
  if (node.fills?.length) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color) {
      props.color = { r: fill.color.r, g: fill.color.g, b: fill.color.b };
    }
  }

  // Font size
  if (node.fontSize !== undefined && node.fontSize !== "MIXED") {
    props.fontSize = node.fontSize as number;
  }

  // Font weight
  if (node.fontWeight !== undefined && node.fontWeight !== "MIXED") {
    props.fontWeight = node.fontWeight as number;
  }

  // Font family
  if (node.fontFamily !== undefined && node.fontFamily !== "MIXED") {
    props.fontFamily = node.fontFamily as string;
  }

  // Line height
  if (node.lineHeight !== undefined && node.lineHeight !== "MIXED" && typeof node.lineHeight === "object") {
    if (node.lineHeight.unit === "PIXELS") {
      props.lineHeight = node.lineHeight.value;
    }
    // Percentage line heights could be converted but require fontSize context
  }

  // Letter spacing
  if (node.letterSpacing !== undefined && node.letterSpacing !== "MIXED" && typeof node.letterSpacing === "object") {
    if (node.letterSpacing.unit === "PIXELS") {
      props.letterSpacing = node.letterSpacing.value;
    }
  }

  // Text alignment
  if (node.textAlignHorizontal) {
    const align = node.textAlignHorizontal.toLowerCase();
    if (align !== "left") { // left is default, skip it
      props.textAlign = align;
    }
  }

  return props;
}

/**
 * StyleSheet backend — generates StyleSheet.create() code with
 * theme-aware colors via a configurable hook (e.g. useColors).
 *
 * This backend matches the patterns used in projects like rurio-informational:
 *   const Colors = useColors();
 *   const styles = React.useMemo(() => StyleSheet.create({...}), [Colors]);
 */

import type { FigmaNode } from "../figma-api";
import type { FigmaNativeConfig } from "../config";
import type {
  StyleBackend,
  StyleOutput,
  LayoutProps,
  TextStyleProps,
  GenContext,
  ComponentDescription,
} from "./types";
import { extractLayoutProps, extractTextStyleProps } from "./types";
import { resolveToToken, resolveFromToken, rgbToHex, hexToRgb } from "../color-resolver";
import { parseComponentAST } from "../ast-parser";

export class StyleSheetBackend implements StyleBackend {
  constructor(private config: FigmaNativeConfig) {}

  createContext(): GenContext {
    return { styleCounter: 0, styleEntries: new Map() };
  }

  emitContainerStyle(props: LayoutProps, name: string, ctx: GenContext): StyleOutput {
    const style = this.layoutPropsToStyleObject(props);
    if (Object.keys(style).length === 0 && !props.gradient) return { jsxAttr: "", styleName: name };

    const styleName = toCamelCase(name) || `container${ctx.styleCounter++}`;
    ctx.styleEntries.set(styleName, style);

    const output: StyleOutput = { jsxAttr: `style={styles.${styleName}}`, styleName };

    // Add gradient wrapper info if applicable
    if (props.gradient) {
      output.gradientProps = {
        colors: props.gradient.colors.map((c) =>
          this.resolveColor(c.r, c.g, c.b)
        ),
        locations: props.gradient.colors.map((c) => c.position),
      };
    }

    return output;
  }

  emitTextStyle(props: TextStyleProps, name: string, ctx: GenContext): StyleOutput {
    const style = this.textPropsToStyleObject(props);
    if (Object.keys(style).length === 0) return { jsxAttr: "", styleName: name };

    const styleName = toCamelCase(name) + "Text" || `text${ctx.styleCounter++}`;
    ctx.styleEntries.set(styleName, style);
    return { jsxAttr: `style={styles.${styleName}}`, styleName };
  }

  emitVariantMap(
    variantName: string,
    values: Record<string, LayoutProps>,
    type: "container" | "text"
  ): string {
    const prefix = type === "text" ? `text${capitalize(variantName)}` : variantName;
    const lines: string[] = [];
    lines.push(`const ${prefix}Styles = {`);
    for (const [val, props] of Object.entries(values)) {
      // For text variants, bgColor carries the text color
      // (extracted from text child fills, not from background)
      if (type === "text" && props.bgColor) {
        const colorVal = this.resolveColor(props.bgColor.r, props.bgColor.g, props.bgColor.b);
        lines.push(`  ${val}: { color: ${colorVal} },`);
      } else {
        const style = this.layoutPropsToStyleObject(props);
        const entries = Object.entries(style)
          .map(([k, v]) => `${k}: ${this.formatValue(v)}`)
          .join(", ");
        lines.push(`  ${val}: { ${entries} },`);
      }
    }
    lines.push(`} as const;`);
    return lines.join("\n");
  }

  wrapScreen(
    screenName: string,
    body: string,
    ctx: GenContext,
    options: { hasText: boolean; hasScrollView: boolean; componentImports: string[] }
  ): string {
    const rnImports = ["View", "StyleSheet"];
    if (options.hasText) rnImports.push("Text");
    if (options.hasScrollView) rnImports.push("ScrollView");

    const lines: string[] = [];

    // React import (needed for useMemo)
    const hasTheme = this.usesThemeColors(ctx);
    if (hasTheme) {
      lines.push(`import React from "react";`);
    }

    lines.push(`import { ${rnImports.join(", ")} } from "react-native";`);

    // Theme hook import
    if (hasTheme && this.config.theme?.hook && this.config.theme?.import) {
      lines.push(`import { ${this.config.theme.hook} } from "${this.config.theme.import}";`);
    }

    if (options.componentImports.length > 0) {
      lines.push(
        `import { ${options.componentImports.join(", ")} } from "../components";`
      );
    }

    lines.push("");
    lines.push(`export function ${screenName}() {`);

    // Theme hook call
    if (hasTheme && this.config.theme?.hook) {
      lines.push(`  const Colors = ${this.config.theme.hook}();`);
      lines.push("");
    }

    // StyleSheet.create with useMemo if theme-dependent
    if (ctx.styleEntries.size > 0) {
      if (hasTheme) {
        lines.push(`  const styles = React.useMemo(() => StyleSheet.create({`);
      } else {
        lines.push(`  const styles = StyleSheet.create({`);
      }
      for (const [name, style] of ctx.styleEntries) {
        lines.push(`    ${name}: {`);
        for (const [key, val] of Object.entries(style)) {
          lines.push(`      ${key}: ${this.formatValue(val)},`);
        }
        lines.push(`    },`);
      }
      if (hasTheme) {
        lines.push(`  }), [Colors]);`);
      } else {
        lines.push(`  });`);
      }
      lines.push("");
    }

    lines.push(`  return (`);
    lines.push(body);
    lines.push(`  );`);
    lines.push(`}`);
    lines.push("");

    return lines.join("\n");
  }

  generateComponentFile(componentName: string, node: FigmaNode): string {
    const name = toPascalCase(componentName);
    const props = extractComponentProps(node);
    const variants = extractVariantsStyleSheet(node, this);

    // Base layout
    const baseLayout = extractLayoutProps(node);
    const baseStyle = this.layoutPropsToStyleObject(baseLayout);

    const hasText = !!findFirstTextChild(node);
    const isButton =
      node.name.toLowerCase().includes("button") ||
      node.name.toLowerCase().includes("pressable");

    const rnImports: string[] = ["StyleSheet"];
    if (isButton) rnImports.push("Pressable");
    else rnImports.push("View");
    if (hasText) rnImports.push("Text");

    const hasTheme = this.hasThemeRefs(baseStyle) ||
      variants.some((v) => Object.values(v.values).some((s) => this.hasThemeRefs(s)));

    const lines: string[] = [];

    // Imports
    if (hasTheme) lines.push(`import React from "react";`);
    lines.push(`import { ${rnImports.join(", ")} } from "react-native";`);
    if (hasTheme && this.config.theme?.hook && this.config.theme?.import) {
      lines.push(`import { ${this.config.theme.hook} } from "${this.config.theme.import}";`);
    }
    lines.push("");

    // Variant style maps
    for (const variant of variants) {
      lines.push(`const ${variant.name}Styles = {`);
      for (const [val, style] of Object.entries(variant.values)) {
        const entries = Object.entries(style)
          .map(([k, v]) => `${k}: ${this.formatValue(v)}`)
          .join(", ");
        lines.push(`  ${val}: { ${entries} },`);
      }
      lines.push(`} as const;`);
      lines.push("");
    }

    // Text variant maps
    const textVariants = extractTextVariantsStyleSheet(node, this);
    for (const variant of textVariants) {
      lines.push(`const text${capitalize(variant.name)}Styles = {`);
      for (const [val, style] of Object.entries(variant.values)) {
        const entries = Object.entries(style)
          .map(([k, v]) => `${k}: ${this.formatValue(v)}`)
          .join(", ");
        lines.push(`  ${val}: { ${entries} },`);
      }
      lines.push(`} as const;`);
      lines.push("");
    }

    // Props type
    const propsTypeName = `${name}Props`;
    lines.push(`type ${propsTypeName} = {`);

    for (const prop of props) {
      const matchingVariant = variants.find((v) => v.name === prop.name);
      if (matchingVariant) {
        const unionVals = Object.keys(matchingVariant.values)
          .map((v) => `"${v}"`)
          .join(" | ");
        const optional = prop.default !== undefined ? "?" : "";
        lines.push(`  ${prop.name}${optional}: ${unionVals};`);
      } else if (prop.type === "boolean") {
        lines.push(`  ${prop.name}?: ${prop.type};`);
      } else {
        const optional = prop.default !== undefined ? "?" : "";
        lines.push(`  ${prop.name}${optional}: ${prop.type};`);
      }
    }

    if (isButton) lines.push(`  onPress?: () => void;`);
    if (!isButton && !hasText) lines.push(`  children?: React.ReactNode;`);
    lines.push(`};`);
    lines.push("");

    // Component function
    const destructuredProps: string[] = [];
    for (const prop of props) {
      if (prop.default !== undefined) {
        if (prop.type === "boolean") {
          destructuredProps.push(`${prop.name} = ${prop.default}`);
        } else {
          destructuredProps.push(`${prop.name} = "${prop.default}"`);
        }
      } else {
        destructuredProps.push(prop.name);
      }
    }
    if (isButton) destructuredProps.push("onPress");
    if (!isButton && !hasText) destructuredProps.push("children");

    lines.push(`export function ${name}({`);
    for (const dp of destructuredProps) {
      lines.push(`  ${dp},`);
    }
    lines.push(`}: ${propsTypeName}) {`);

    // Theme hook
    if (hasTheme && this.config.theme?.hook) {
      lines.push(`  const Colors = ${this.config.theme.hook}();`);
      lines.push("");
    }

    // Styles
    if (hasTheme) {
      lines.push(`  const styles = React.useMemo(() => StyleSheet.create({`);
    } else {
      lines.push(`  const styles = StyleSheet.create({`);
    }
    lines.push(`    container: {`);
    for (const [key, val] of Object.entries(baseStyle)) {
      lines.push(`      ${key}: ${this.formatValue(val)},`);
    }
    lines.push(`    },`);

    // Text style if has text
    if (hasText) {
      const textChild = findFirstTextChild(node);
      if (textChild) {
        const textProps = extractTextStyleProps(textChild);
        const textStyle = this.textPropsToStyleObject(textProps);
        if (Object.keys(textStyle).length > 0) {
          lines.push(`    label: {`);
          for (const [key, val] of Object.entries(textStyle)) {
            lines.push(`      ${key}: ${this.formatValue(val)},`);
          }
          lines.push(`    },`);
        }
      }
    }

    if (hasTheme) {
      lines.push(`  }), [Colors]);`);
    } else {
      lines.push(`  });`);
    }
    lines.push("");

    // Build style array for wrapper
    const wrapperTag = isButton ? "Pressable" : "View";
    const extraAttrs: string[] = [];
    if (isButton) {
      const hasDisabled = props.some((p) => p.name === "disabled");
      if (hasDisabled) extraAttrs.push("disabled={disabled}");
      extraAttrs.push("onPress={onPress}");
    }
    const attrsStr = extraAttrs.length > 0 ? "\n      " + extraAttrs.join("\n      ") : "";

    const hasVariantStyles = variants.length > 0;
    const hasDisabled = props.some((p) => p.name === "disabled");

    let styleAttr: string;
    if (hasVariantStyles || hasDisabled) {
      const parts = ["styles.container"];
      for (const variant of variants) {
        parts.push(`${variant.name}Styles[${variant.name}]`);
      }
      if (hasDisabled) parts.push('disabled && { opacity: 0.5 }');
      styleAttr = `style={[${parts.join(", ")}]}`;
    } else {
      styleAttr = "style={styles.container}";
    }

    lines.push(`  return (`);
    lines.push(`    <${wrapperTag}\n      ${styleAttr}${attrsStr}>`);

    if (hasText) {
      const labelProp = props.find((p) => p.name === "label" || p.name === "text");
      const labelRef = labelProp ? labelProp.name : '"..."';

      const textStyleParts = ["styles.label"];
      for (const tv of textVariants) {
        textStyleParts.push(`text${capitalize(tv.name)}Styles[${tv.name}]`);
      }

      const textStyleAttr =
        textStyleParts.length > 1
          ? `style={[${textStyleParts.join(", ")}]}`
          : `style={${textStyleParts[0]}}`;

      lines.push(`      <Text ${textStyleAttr}>`);
      lines.push(`        {${labelRef}}`);
      lines.push(`      </Text>`);
    } else {
      lines.push(`      {children}`);
    }

    lines.push(`    </${wrapperTag}>`);
    lines.push(`  );`);
    lines.push(`}`);
    lines.push("");

    return lines.join("\n");
  }

  parseComponentFile(name: string, source: string): ComponentDescription {
    const parsed = parseComponentAST(source);

    // Resolve color tokens to RGB using config
    const fills: ComponentDescription["fills"] = [];
    for (const fill of parsed.fills) {
      if (fill.color) {
        fills.push({ type: "SOLID", color: fill.color });
      } else if (fill.token) {
        const rgb = resolveFromToken(fill.token, this.config);
        if (rgb) fills.push({ type: "SOLID", color: rgb });
      }
    }

    return {
      name,
      props: parsed.props,
      variants: parsed.variants,
      layout: parsed.layout,
      fills,
    };
  }

  // ─── Internal helpers ─────────────────────────────────────

  layoutPropsToStyleObject(props: LayoutProps): Record<string, unknown> {
    const style: Record<string, unknown> = {};

    if (props.direction === "HORIZONTAL") style.flexDirection = "'row'";

    if (props.gap && props.gap > 0) style.gap = props.gap;

    // Padding
    const pl = props.paddingLeft ?? 0;
    const pr = props.paddingRight ?? 0;
    const pt = props.paddingTop ?? 0;
    const pb = props.paddingBottom ?? 0;

    if (pl === pr && pt === pb && pl === pt && pl > 0) {
      style.padding = pl;
    } else {
      if (pl === pr && pl > 0) style.paddingHorizontal = pl;
      else {
        if (pl > 0) style.paddingLeft = pl;
        if (pr > 0) style.paddingRight = pr;
      }
      if (pt === pb && pt > 0) style.paddingVertical = pt;
      else {
        if (pt > 0) style.paddingTop = pt;
        if (pb > 0) style.paddingBottom = pb;
      }
    }

    // Corner radius — uniform or per-corner
    if (props.cornerRadius && props.cornerRadius > 0) {
      style.borderRadius = props.cornerRadius;
    } else if (props.cornerRadii) {
      const { topLeft, topRight, bottomRight, bottomLeft } = props.cornerRadii;
      if (topLeft > 0) style.borderTopLeftRadius = topLeft;
      if (topRight > 0) style.borderTopRightRadius = topRight;
      if (bottomRight > 0) style.borderBottomRightRadius = bottomRight;
      if (bottomLeft > 0) style.borderBottomLeftRadius = bottomLeft;
    }

    // Background color
    if (props.bgColor) {
      style.backgroundColor = this.resolveColor(props.bgColor.r, props.bgColor.g, props.bgColor.b);
    }

    // Alignment
    if (props.alignItems === "CENTER") style.alignItems = "'center'";
    if (props.alignItems === "FLEX_START") style.alignItems = "'flex-start'";
    if (props.alignItems === "FLEX_END") style.alignItems = "'flex-end'";
    if (props.justifyContent === "CENTER") style.justifyContent = "'center'";
    if (props.justifyContent === "SPACE_BETWEEN") style.justifyContent = "'space-between'";
    if (props.justifyContent === "FLEX_START") style.justifyContent = "'flex-start'";
    if (props.justifyContent === "FLEX_END") style.justifyContent = "'flex-end'";

    if (props.flex) style.flex = 1;

    // Dimensions
    if (props.width) style.width = props.width;
    if (props.height) style.height = props.height;

    // Opacity
    if (props.opacity !== undefined) style.opacity = props.opacity;

    // Borders
    if (props.borderWidth) {
      style.borderWidth = props.borderWidth;
      if (props.borderColor) {
        style.borderColor = this.resolveColor(props.borderColor.r, props.borderColor.g, props.borderColor.b);
      }
    }

    // Shadows
    if (props.shadowColor) {
      style.shadowColor = this.resolveColor(props.shadowColor.r, props.shadowColor.g, props.shadowColor.b);
      style.shadowOpacity = props.shadowColor.a;
    }
    if (props.shadowOffset) {
      style.shadowOffset = `{ width: ${props.shadowOffset.x}, height: ${props.shadowOffset.y} }`;
    }
    if (props.shadowRadius) style.shadowRadius = props.shadowRadius;
    if (props.elevation) style.elevation = props.elevation;

    return style;
  }

  private textPropsToStyleObject(props: TextStyleProps): Record<string, unknown> {
    const style: Record<string, unknown> = {};

    if (props.color) {
      style.color = this.resolveColor(props.color.r, props.color.g, props.color.b);
    }

    if (props.fontSize) style.fontSize = props.fontSize;
    if (props.fontWeight) style.fontWeight = `'${props.fontWeight}'`;
    if (props.lineHeight) style.lineHeight = props.lineHeight;
    if (props.letterSpacing) style.letterSpacing = props.letterSpacing;
    if (props.textAlign) style.textAlign = `'${props.textAlign.toLowerCase()}'`;

    return style;
  }

  resolveColor(r: number, g: number, b: number): string {
    const match = resolveToToken(r, g, b, this.config);
    if ("token" in match) {
      return `Colors.${match.token}`;
    }
    return `'${match.hex}'`;
  }

  formatValue(val: unknown): string {
    if (typeof val === "string") {
      // Already formatted (Colors.xxx or 'hex' or 'row')
      return val;
    }
    return String(val);
  }

  private usesThemeColors(ctx: GenContext): boolean {
    for (const style of ctx.styleEntries.values()) {
      for (const val of Object.values(style)) {
        if (typeof val === "string" && val.startsWith("Colors.")) return true;
      }
    }
    return false;
  }

  private hasThemeRefs(style: Record<string, unknown>): boolean {
    for (const val of Object.values(style)) {
      if (typeof val === "string" && val.startsWith("Colors.")) return true;
    }
    return false;
  }
}

// ─── Shared helpers ─────────────────────────────────────────

import { toPascalCase, toCamelCase, capitalize } from "../utils";

function findFirstTextChild(node: FigmaNode): FigmaNode | undefined {
  if (node.type === "TEXT") return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findFirstTextChild(child);
      if (found) return found;
    }
  }
  return undefined;
}

type ComponentProp = { name: string; type: string; default?: string };
type VariantStyleSheet = { name: string; values: Record<string, Record<string, unknown>> };

function extractComponentProps(node: FigmaNode): ComponentProp[] {
  const props: ComponentProp[] = [];
  const seen = new Set<string>();

  if (node.componentProperties) {
    for (const [rawKey, val] of Object.entries(node.componentProperties)) {
      const name = toCamelCase(rawKey.replace(/#.*$/, ""));
      if (seen.has(name)) continue;
      seen.add(name);

      if (val.type === "BOOLEAN") {
        props.push({ name, type: "boolean", default: String(val.value) });
      } else if (val.type === "TEXT") {
        props.push({ name, type: "string", default: String(val.value) });
      } else {
        props.push({ name, type: "string", default: String(val.value) });
      }
    }
  }

  if (!seen.has("label") && !seen.has("text")) {
    const textChild = findFirstTextChild(node);
    if (textChild?.characters) {
      props.push({ name: "label", type: "string", default: undefined });
    }
  }

  return props;
}

function extractVariantsStyleSheet(
  node: FigmaNode,
  backend: StyleSheetBackend
): VariantStyleSheet[] {
  const variants: VariantStyleSheet[] = [];
  if (!node.children || node.children.length === 0) return variants;

  const variantMap = new Map<string, Map<string, Record<string, unknown>>>();

  for (const child of node.children) {
    const parts = child.name.split(",").map((s) => s.trim());
    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (!key || !value) continue;

      const propName = toCamelCase(key);
      if (!variantMap.has(propName)) variantMap.set(propName, new Map());

      const layoutProps = extractLayoutProps(child);
      const style = backend.layoutPropsToStyleObject(layoutProps);

      if (Object.keys(style).length > 0) {
        variantMap.get(propName)!.set(value, style);
      }
    }
  }

  for (const [name, values] of variantMap) {
    if (values.size > 0) {
      variants.push({ name, values: Object.fromEntries(values) });
    }
  }

  return variants;
}

function extractTextVariantsStyleSheet(
  node: FigmaNode,
  backend: StyleSheetBackend
): VariantStyleSheet[] {
  const variants: VariantStyleSheet[] = [];
  if (!node.children || node.children.length === 0) return variants;

  const variantMap = new Map<string, Map<string, Record<string, unknown>>>();

  for (const child of node.children) {
    const parts = child.name.split(",").map((s) => s.trim());
    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (!key || !value) continue;

      const propName = toCamelCase(key);
      if (!variantMap.has(propName)) variantMap.set(propName, new Map());

      const textChild = findFirstTextChild(child);
      if (textChild?.fills?.length) {
        const fill = textChild.fills[0];
        if (fill.type === "SOLID" && fill.color) {
          const colorVal = backend.resolveColor(fill.color.r, fill.color.g, fill.color.b);
          variantMap.get(propName)!.set(value, { color: colorVal });
        }
      }
    }
  }

  for (const [name, values] of variantMap) {
    if (values.size > 0) {
      variants.push({ name, values: Object.fromEntries(values) });
    }
  }

  return variants;
}

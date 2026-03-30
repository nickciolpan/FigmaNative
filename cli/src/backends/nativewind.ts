/**
 * NativeWind backend — generates className="..." strings using Tailwind classes.
 * This is a refactoring of the existing codegen logic into the StyleBackend interface.
 */

import type { FigmaNode } from "../figma-api";
import type {
  StyleBackend,
  StyleOutput,
  LayoutProps,
  TextStyleProps,
  GenContext,
  ComponentDescription,
} from "./types";
import { extractLayoutProps, extractTextStyleProps } from "./types";
import { rgbToHex } from "../color-resolver";
import { parseComponentAST } from "../ast-parser";
import {
  spacingToClass,
  gapToClass,
  radiusToClass,
  bgColorToClass,
  textColorToClass,
  closestColor,
  fontSizeToClass,
  fontWeightToClass,
  lineHeightToClass,
  letterSpacingToClass,
  COLORS as TW_COLORS,
} from "../tailwind-map";

export class NativeWindBackend implements StyleBackend {
  createContext(): GenContext {
    return { styleCounter: 0, styleEntries: new Map() };
  }

  emitContainerStyle(props: LayoutProps, _name: string, _ctx: GenContext): StyleOutput {
    const classes = this.layoutPropsToClasses(props);
    const output: StyleOutput = {
      jsxAttr: classes.length > 0 ? `className="${classes.join(" ")}"` : "",
    };

    // Add gradient wrapper info if applicable
    if (props.gradient) {
      output.gradientProps = {
        colors: props.gradient.colors.map((c) => {
          const hex = rgbToHex(c.r, c.g, c.b);
          return `'${hex}'`;
        }),
        locations: props.gradient.colors.map((c) => c.position),
      };
    }

    return output;
  }

  emitTextStyle(props: TextStyleProps, _name: string, _ctx: GenContext): StyleOutput {
    const classes: string[] = [];
    if (props.color) {
      classes.push(textColorToClass(props.color.r, props.color.g, props.color.b));
    }
    // Font size → text-xs/sm/base/lg/xl/2xl/3xl/4xl
    if (props.fontSize) {
      classes.push(fontSizeToClass(props.fontSize));
    }
    // Font weight → font-normal/medium/semibold/bold
    if (props.fontWeight) {
      classes.push(fontWeightToClass(props.fontWeight));
    }
    // Text alignment
    if (props.textAlign) {
      classes.push(`text-${props.textAlign}`);
    }
    // Line height → leading-none/tight/snug/normal/relaxed/loose
    if (props.lineHeight && props.fontSize) {
      classes.push(lineHeightToClass(props.lineHeight, props.fontSize));
    }
    // Letter spacing → tracking-tighter/tight/normal/wide/wider/widest
    if (props.letterSpacing) {
      classes.push(letterSpacingToClass(props.letterSpacing));
    }
    if (classes.length === 0) return { jsxAttr: "" };
    return { jsxAttr: `className="${classes.join(" ")}"` };
  }

  emitVariantMap(
    variantName: string,
    values: Record<string, LayoutProps>,
    type: "container" | "text"
  ): string {
    const prefix = type === "text" ? `text${capitalize(variantName)}` : variantName;
    const lines: string[] = [];
    lines.push(`const ${prefix}Classes = {`);
    for (const [val, props] of Object.entries(values)) {
      // For text variants, bgColor is repurposed to carry the text color
      // (extracted from text child fills, not from background)
      const classes =
        type === "text"
          ? props.bgColor
            ? textColorToClass(props.bgColor.r, props.bgColor.g, props.bgColor.b)
            : ""
          : this.layoutPropsToClasses(props).join(" ");
      lines.push(`  ${val}: "${classes}",`);
    }
    lines.push(`} as const;`);
    return lines.join("\n");
  }

  wrapScreen(
    screenName: string,
    body: string,
    _ctx: GenContext,
    options: { hasText: boolean; hasScrollView: boolean; componentImports: string[] }
  ): string {
    const rnImports = ["View"];
    if (options.hasText) rnImports.push("Text");
    if (options.hasScrollView) rnImports.push("ScrollView");

    const lines: string[] = [
      `import { ${rnImports.join(", ")} } from "react-native";`,
    ];

    if (options.componentImports.length > 0) {
      lines.push(
        `import { ${options.componentImports.join(", ")} } from "../components";`
      );
    }

    lines.push("");
    lines.push(`export function ${screenName}() {`);
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
    const variants = extractVariants(node);

    // Base layout classes
    const baseLayout = extractLayoutProps(node);
    const baseClasses = this.layoutPropsToClasses(baseLayout);
    const baseBg = extractBgClass(node.fills);
    if (baseBg) baseClasses.push(baseBg);

    // Determine RN imports
    const hasText = !!findFirstTextChild(node);
    const isButton =
      node.name.toLowerCase().includes("button") ||
      node.name.toLowerCase().includes("pressable");

    const rnImports: string[] = [];
    if (isButton) rnImports.push("Pressable");
    else rnImports.push("View");
    if (hasText) rnImports.push("Text");

    const lines: string[] = [];

    // Imports
    lines.push(`import { ${rnImports.join(", ")} } from "react-native";`);
    lines.push("");

    // Variant class maps
    for (const variant of variants) {
      lines.push(`const ${variant.name}Classes = {`);
      for (const [val, cls] of Object.entries(variant.values)) {
        lines.push(`  ${val}: "${cls}",`);
      }
      lines.push(`} as const;`);
      lines.push("");
    }

    // Text variant maps
    const textVariants = extractTextVariants(node);
    for (const variant of textVariants) {
      lines.push(`const text${toPascalCase(variant.name)}Classes = {`);
      for (const [val, cls] of Object.entries(variant.values)) {
        lines.push(`  ${val}: "${cls}",`);
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

    // Build className
    const classNameParts: string[] = [];
    if (baseClasses.length > 0) classNameParts.push(baseClasses.join(" "));
    for (const variant of variants) {
      classNameParts.push(`\${${variant.name}Classes[${variant.name}]}`);
    }

    const hasDisabled = props.some((p) => p.name === "disabled");
    if (hasDisabled) classNameParts.push('${disabled ? "opacity-50" : ""}');

    const classNameStr = classNameParts.join(" ");
    const wrapperTag = isButton ? "Pressable" : "View";
    const extraAttrs: string[] = [];
    if (isButton) {
      if (hasDisabled) extraAttrs.push("disabled={disabled}");
      extraAttrs.push("onPress={onPress}");
    }
    const attrsStr = extraAttrs.length > 0 ? "\n      " + extraAttrs.join("\n      ") : "";

    lines.push(`  return (`);
    lines.push(
      `    <${wrapperTag}` +
        (classNameStr ? `\n      className={\`${classNameStr}\`}` : "") +
        attrsStr +
        `>`
    );

    if (hasText) {
      const labelProp = props.find((p) => p.name === "label" || p.name === "text");
      const labelRef = labelProp ? labelProp.name : '"..."';

      const textClassParts: string[] = [];
      const textChild = findFirstTextChild(node);
      if (textChild) {
        const tc = extractTextClass(textChild.fills);
        if (tc) textClassParts.push(tc);
      }
      for (const tv of textVariants) {
        textClassParts.push(`\${text${toPascalCase(tv.name)}Classes[${tv.name}]}`);
      }

      const textClassName =
        textClassParts.length > 0
          ? ` className={\`${textClassParts.join(" ")}\`}`
          : "";

      lines.push(`      <Text${textClassName}>`);
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

    // Resolve Tailwind color tokens to RGB
    const fills: ComponentDescription["fills"] = [];
    for (const fill of parsed.fills) {
      if (fill.color) {
        fills.push({ type: "SOLID", color: fill.color });
      } else if (fill.token) {
        const color = tailwindColorToRgb(fill.token);
        if (color) fills.push({ type: "SOLID", color });
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

  // ─── Helpers ───────────────────────────────────────────────

  layoutPropsToClasses(props: LayoutProps): string[] {
    const classes: string[] = [];

    if (props.direction === "HORIZONTAL") classes.push("flex-row");

    if (props.gap && props.gap > 0) classes.push(gapToClass(props.gap));

    // Padding
    const pl = props.paddingLeft ?? 0;
    const pr = props.paddingRight ?? 0;
    const pt = props.paddingTop ?? 0;
    const pb = props.paddingBottom ?? 0;

    if (pl === pr && pt === pb && pl === pt && pl > 0) {
      classes.push(spacingToClass("p", pl));
    } else {
      if (pl === pr && pl > 0) classes.push(spacingToClass("px", pl));
      else {
        if (pl > 0) classes.push(spacingToClass("pl", pl));
        if (pr > 0) classes.push(spacingToClass("pr", pr));
      }
      if (pt === pb && pt > 0) classes.push(spacingToClass("py", pt));
      else {
        if (pt > 0) classes.push(spacingToClass("pt", pt));
        if (pb > 0) classes.push(spacingToClass("pb", pb));
      }
    }

    // Corner radius — uniform or per-corner
    if (props.cornerRadius) {
      const r = radiusToClass(props.cornerRadius);
      if (r) classes.push(r);
    } else if (props.cornerRadii) {
      const { topLeft, topRight, bottomRight, bottomLeft } = props.cornerRadii;
      if (topLeft > 0) classes.push(`rounded-tl-[${topLeft}px]`);
      if (topRight > 0) classes.push(`rounded-tr-[${topRight}px]`);
      if (bottomRight > 0) classes.push(`rounded-br-[${bottomRight}px]`);
      if (bottomLeft > 0) classes.push(`rounded-bl-[${bottomLeft}px]`);
    }

    // Background color
    if (props.bgColor) {
      classes.push(bgColorToClass(props.bgColor.r, props.bgColor.g, props.bgColor.b));
    }

    // Alignment
    if (props.alignItems === "CENTER") classes.push("items-center");
    if (props.alignItems === "FLEX_START") classes.push("items-start");
    if (props.alignItems === "FLEX_END") classes.push("items-end");
    if (props.justifyContent === "CENTER") classes.push("justify-center");
    if (props.justifyContent === "SPACE_BETWEEN") classes.push("justify-between");
    if (props.justifyContent === "FLEX_START") classes.push("justify-start");
    if (props.justifyContent === "FLEX_END") classes.push("justify-end");

    if (props.flex) classes.push("flex-1");

    // Dimensions
    if (props.width) classes.push(`w-[${props.width}px]`);
    if (props.height) classes.push(`h-[${props.height}px]`);

    // Opacity
    if (props.opacity !== undefined) {
      const pct = Math.round(props.opacity * 100);
      classes.push(`opacity-${pct}`);
    }

    // Borders
    if (props.borderWidth) {
      classes.push(props.borderWidth === 1 ? "border" : `border-[${props.borderWidth}px]`);
      if (props.borderColor) {
        classes.push(`border-${closestColor(props.borderColor.r, props.borderColor.g, props.borderColor.b)}`);
      }
    }

    // Shadows (NativeWind supports shadow-sm/md/lg/xl/2xl)
    if (props.shadowRadius) {
      if (props.shadowRadius <= 2) classes.push("shadow-sm");
      else if (props.shadowRadius <= 4) classes.push("shadow");
      else if (props.shadowRadius <= 8) classes.push("shadow-md");
      else if (props.shadowRadius <= 12) classes.push("shadow-lg");
      else if (props.shadowRadius <= 20) classes.push("shadow-xl");
      else classes.push("shadow-2xl");
    }

    return classes;
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

function extractBgClass(fills?: FigmaNode["fills"]): string | null {
  if (!fills?.length) return null;
  const fill = fills[0];
  if (fill.type === "SOLID" && fill.color) {
    const bg = bgColorToClass(fill.color.r, fill.color.g, fill.color.b);
    if (bg !== "bg-white") return bg;
  }
  return null;
}

function extractTextClass(fills?: FigmaNode["fills"]): string | null {
  if (!fills?.length) return null;
  const fill = fills[0];
  if (fill.type === "SOLID" && fill.color) {
    return textColorToClass(fill.color.r, fill.color.g, fill.color.b);
  }
  return null;
}

type ComponentProp = { name: string; type: string; default?: string };
type VariantStyle = { name: string; values: Record<string, string> };

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

function extractVariants(node: FigmaNode): VariantStyle[] {
  const variants: VariantStyle[] = [];
  if (!node.children || node.children.length === 0) return variants;

  const variantMap = new Map<string, Map<string, string>>();

  for (const child of node.children) {
    const parts = child.name.split(",").map((s) => s.trim());
    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (!key || !value) continue;

      const propName = toCamelCase(key);
      if (!variantMap.has(propName)) variantMap.set(propName, new Map());

      const classes: string[] = [];
      const bg = extractBgClass(child.fills);
      if (bg) classes.push(bg);
      const layoutProps = extractLayoutProps(child);
      const layoutClasses = new NativeWindBackend().layoutPropsToClasses(layoutProps);
      classes.push(...layoutClasses);

      if (classes.length > 0) {
        variantMap.get(propName)!.set(value, classes.join(" "));
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

function extractTextVariants(node: FigmaNode): VariantStyle[] {
  const variants: VariantStyle[] = [];
  if (!node.children || node.children.length === 0) return variants;

  const variantMap = new Map<string, Map<string, string>>();

  for (const child of node.children) {
    const parts = child.name.split(",").map((s) => s.trim());
    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (!key || !value) continue;

      const propName = toCamelCase(key);
      if (!variantMap.has(propName)) variantMap.set(propName, new Map());

      const textChild = findFirstTextChild(child);
      if (textChild) {
        const tc = extractTextClass(textChild.fills);
        if (tc) variantMap.get(propName)!.set(value, tc);
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

function tailwindColorToRgb(colorName: string): { r: number; g: number; b: number } | null {
  const map: Record<string, { r: number; g: number; b: number }> = {};
  for (const c of TW_COLORS) {
    map[c.name] = { r: c.r, g: c.g, b: c.b };
  }
  return map[colorName] ?? null;
}

// Re-export extractLayoutProps for use by extractVariants
export { extractLayoutProps } from "./types";

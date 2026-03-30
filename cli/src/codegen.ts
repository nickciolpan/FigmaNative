/**
 * Code generator: walks a Figma node tree and emits React Native JSX.
 *
 * Strategy:
 * 1. If a node matches a known component -> emit <Component ...props />
 * 2. If a node is a TEXT -> emit <Text>content</Text>
 * 3. If a node is a FRAME/GROUP with auto-layout -> emit <View> with styles
 * 4. Recurse into children
 *
 * Now delegates all styling to the active StyleBackend.
 */

import type { FigmaNode } from "./figma-api";
import { matchComponent } from "./component-matcher";
import type { StyleBackend, GenContext } from "./backends";
import { extractLayoutProps, extractTextStyleProps } from "./backends";
import type { FigmaNativeConfig } from "./config";

type CodegenContext = {
  componentNames: Record<string, string>; // componentId -> name
  imports: Set<string>; // track which components are used
  indent: number;
  backend: StyleBackend;
  genCtx: GenContext;
  config?: FigmaNativeConfig;
};

function pad(ctx: CodegenContext): string {
  return "  ".repeat(ctx.indent);
}

function propsToJsx(props: Record<string, string | boolean>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== "" && v !== false && v !== undefined)
    .map(([k, v]) => {
      if (v === true) return k;
      return `${k}="${v}"`;
    })
    .join(" ");
}

export function generateNode(node: FigmaNode, ctx: CodegenContext): string {
  const lines: string[] = [];
  const p = pad(ctx);

  // Skip invisible nodes
  if (node.visible === false) return "";

  // 1. Try to match a known component (or custom component from config)
  const match = matchComponent(node, ctx.componentNames, ctx.config);
  if (match.matched) {
    ctx.imports.add(match.importName);
    const propsStr = propsToJsx(match.props);
    const propsPart = propsStr ? ` ${propsStr}` : "";

    if (match.hasChildren && node.children) {
      lines.push(`${p}<${match.componentName}${propsPart}>`);
      ctx.indent++;
      for (const child of node.children) {
        const childCode = generateNode(child, ctx);
        if (childCode) lines.push(childCode);
      }
      ctx.indent--;
      lines.push(`${p}</${match.componentName}>`);
    } else {
      lines.push(`${p}<${match.componentName}${propsPart} />`);
    }
    return lines.join("\n");
  }

  // 2. TEXT node -> <Text>
  if (node.type === "TEXT" && node.characters) {
    const textProps = extractTextStyleProps(node);
    const styleName = sanitizeName(node.name || "text");
    const output = ctx.backend.emitTextStyle(textProps, styleName, ctx.genCtx);
    const attrStr = output.jsxAttr ? ` ${output.jsxAttr}` : "";
    lines.push(`${p}<Text${attrStr}>${node.characters}</Text>`);
    return lines.join("\n");
  }

  // 3. FRAME / GROUP / COMPONENT -> <View> with styles
  if (node.children && node.children.length > 0) {
    const layoutProps = extractLayoutProps(node);
    const styleName = sanitizeName(node.name || "container");
    const output = ctx.backend.emitContainerStyle(layoutProps, styleName, ctx.genCtx);
    const attrStr = output.jsxAttr ? ` ${output.jsxAttr}` : "";

    // Gradient wrapper
    if (output.gradientProps) {
      ctx.imports.add("LinearGradient");
      const colorsArr = `[${output.gradientProps.colors.join(", ")}]`;
      const locationsAttr = output.gradientProps.locations
        ? ` locations={[${output.gradientProps.locations.join(", ")}]}`
        : "";
      lines.push(`${p}<LinearGradient colors={${colorsArr}}${locationsAttr}${attrStr}>`);
    } else {
      lines.push(`${p}<View${attrStr}>`);
    }

    ctx.indent++;
    for (const child of node.children) {
      const childCode = generateNode(child, ctx);
      if (childCode) lines.push(childCode);
    }
    ctx.indent--;

    if (output.gradientProps) {
      lines.push(`${p}</LinearGradient>`);
    } else {
      lines.push(`${p}</View>`);
    }
    return lines.join("\n");
  }

  return "";
}

export function generateScreen(
  screenName: string,
  rootNode: FigmaNode,
  componentNames: Record<string, string>,
  backend: StyleBackend,
  config?: FigmaNativeConfig
): string {
  const genCtx = backend.createContext();
  const ctx: CodegenContext = {
    componentNames,
    imports: new Set(),
    indent: 2,
    backend,
    genCtx,
    config,
  };

  const body = generateNode(rootNode, ctx);

  const componentImports = Array.from(ctx.imports).sort();

  return backend.wrapScreen(screenName, body, genCtx, {
    hasText: body.includes("<Text"),
    hasScrollView: body.includes("<ScrollView"),
    componentImports,
  });
}

function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w, i) =>
      i === 0
        ? w.charAt(0).toLowerCase() + w.slice(1)
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join("");
}

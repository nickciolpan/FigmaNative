/**
 * JSX-to-Figma node tree parser.
 *
 * Reads a .tsx component file, walks the JSX tree, resolves
 * style={styles.xxx} against StyleSheet.create({...}), and produces
 * a full Figma-compatible node definition tree.
 */

import * as ts from "typescript";
import type { FigmaNativeConfig } from "./config";

// ─── Output types (Figma-compatible node definitions) ────────────

export type FigmaNodeDef = {
  name: string;
  figmaId?: string; // Unique path-based ID for Figma↔RN traceability
  type: "COMPONENT" | "FRAME" | "TEXT" | "RECTANGLE";
  width?: number;
  height?: number;
  layoutMode?: "HORIZONTAL" | "VERTICAL";
  itemSpacing?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  cornerRadius?: number;
  opacity?: number;
  fills?: Array<{ type: string; hex?: string; r?: number; g?: number; b?: number; opacity?: number }>;
  strokes?: Array<{ type: string; hex?: string; r?: number; g?: number; b?: number; opacity?: number }>;
  strokeWeight?: number;
  characters?: string;
  fontSize?: number;
  fontWeight?: string;
  lineHeight?: any;
  letterSpacing?: any;
  textAlignHorizontal?: string;
  textAutoResize?: string;
  children?: FigmaNodeDef[];
};

type StyleMap = Record<string, Record<string, any>>;

// ─── Main entry ──────────────────────────────────────────────────

export function parseComponentToFigmaTree(
  name: string,
  source: string,
  config?: FigmaNativeConfig
): FigmaNodeDef {
  const sourceFile = ts.createSourceFile(
    "component.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  // 1. Extract all StyleSheet.create({...}) entries
  const styles = extractAllStyles(sourceFile, source, config);

  // 2. Find the return statement's JSX
  const jsxRoot = findReturnJsx(sourceFile);

  // 3. Walk JSX tree and build Figma node defs
  const rootDef: FigmaNodeDef = {
    name,
    type: "COMPONENT",
    layoutMode: "VERTICAL",
    primaryAxisSizingMode: "AUTO",
    counterAxisSizingMode: "FIXED",
    width: 375, // iPhone width as default
    children: [],
  };

  if (jsxRoot) {
    const children = jsxElementToFigmaNodes(jsxRoot, styles, source, name);
    rootDef.children = children;

    // If there's only one child frame, hoist its properties to root
    if (children.length === 1 && children[0].type !== "TEXT") {
      const only = children[0];
      rootDef.layoutMode = only.layoutMode || "VERTICAL";
      rootDef.width = only.width || 375;
      rootDef.height = only.height;
      rootDef.itemSpacing = only.itemSpacing;
      rootDef.padding = only.padding;
      rootDef.fills = only.fills;
      rootDef.cornerRadius = only.cornerRadius;
      rootDef.primaryAxisAlignItems = only.primaryAxisAlignItems;
      rootDef.counterAxisAlignItems = only.counterAxisAlignItems;
      rootDef.counterAxisSizingMode = "FIXED";
      rootDef.children = only.children || [];
    }
  }

  return rootDef;
}

// ─── Style extraction ────────────────────────────────────────────

function extractAllStyles(
  sourceFile: ts.SourceFile,
  source: string,
  config?: FigmaNativeConfig
): StyleMap {
  const styles: StyleMap = {};
  const colorMap = buildColorMap(config);

  walkTree(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return;
    const expr = node.expression;
    if (!ts.isPropertyAccessExpression(expr)) return;

    // Match StyleSheet.create(...)
    if (ts.isIdentifier(expr.expression) && expr.expression.text === "StyleSheet" &&
        ts.isIdentifier(expr.name) && expr.name.text === "create") {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const prop of arg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          if (!ts.isIdentifier(prop.name)) continue;
          const styleName = prop.name.text;
          if (ts.isObjectLiteralExpression(prop.initializer)) {
            styles[styleName] = parseStyleObject(prop.initializer, source, colorMap);
          }
        }
      }
    }
  });

  return styles;
}

function parseStyleObject(
  obj: ts.ObjectLiteralExpression,
  source: string,
  colorMap: Record<string, string>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (!ts.isIdentifier(prop.name)) continue;

    const key = prop.name.text;
    const raw = source.substring(prop.initializer.pos, prop.initializer.end).trim();

    // Resolve Colors.xxx tokens to hex
    const colorTokenMatch = raw.match(/Colors\.(\w+)/);
    if (colorTokenMatch && colorMap[colorTokenMatch[1]]) {
      result[key] = colorMap[colorTokenMatch[1]];
      continue;
    }

    // Numeric
    const num = parseFloat(raw);
    if (!isNaN(num) && /^[\d.]+$/.test(raw)) {
      result[key] = num;
      continue;
    }

    // String literal
    const strMatch = raw.match(/^['"](.+)['"]$/);
    if (strMatch) {
      result[key] = strMatch[1];
      continue;
    }

    result[key] = raw;
  }

  return result;
}

function buildColorMap(config?: FigmaNativeConfig): Record<string, string> {
  const map: Record<string, string> = {};
  if (config?.theme?.colors) {
    for (const [name, hex] of Object.entries(config.theme.colors)) {
      map[name] = hex;
    }
  }
  return map;
}

// ─── JSX traversal ───────────────────────────────────────────────

function findReturnJsx(sourceFile: ts.SourceFile): ts.JsxChild | null {
  let result: ts.JsxChild | null = null;

  walkTree(sourceFile, (node) => {
    if (result) return;
    if (ts.isReturnStatement(node) && node.expression) {
      // Check if it's a parenthesized expression wrapping JSX
      let expr = node.expression;
      if (ts.isParenthesizedExpression(expr)) {
        expr = expr.expression;
      }
      if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
        result = expr;
      }
    }
  });

  return result;
}

function jsxElementToFigmaNodes(
  node: ts.Node,
  styles: StyleMap,
  source: string,
  parentPath: string = ""
): FigmaNodeDef[] {
  const results: FigmaNodeDef[] = [];

  if (ts.isJsxElement(node)) {
    const tagName = getJsxTagName(node.openingElement);
    const attrs = getJsxAttributes(node.openingElement, source);
    const resolvedStyle = resolveStyleAttr(attrs.style, styles);

    // Derive ID segment from style name (styles.bar → "bar") or nativeID attr or tag name
    const idSegment = attrs.nativeID?.replace(/['"{}]/g, "")
      || extractStyleName(attrs.style)
      || tagName.toLowerCase();
    const nodePath = parentPath ? `${parentPath}/${idSegment}` : idSegment;

    if (tagName === "Text") {
      const textContent = extractTextContent(node, source);
      const def = buildTextNode(tagName, resolvedStyle, textContent);
      def.figmaId = nodePath;
      def.name = idSegment;
      results.push(def);
    } else if (isContainerTag(tagName)) {
      const def = buildFrameNode(tagName, resolvedStyle);
      def.figmaId = nodePath;
      def.name = idSegment;
      for (const child of node.children) {
        const childNodes = jsxElementToFigmaNodes(child, styles, source, nodePath);
        def.children!.push(...childNodes);
      }
      if (def.children!.length > 0 || Object.keys(resolvedStyle).length > 0) {
        results.push(def);
      }
    } else if (tagName === "Image") {
      const def: FigmaNodeDef = {
        name: idSegment,
        figmaId: nodePath,
        type: "RECTANGLE",
        width: resolvedStyle.width || 100,
        height: resolvedStyle.height || 100,
        fills: [{ type: "SOLID", hex: "#CCCCCC", r: 0.8, g: 0.8, b: 0.8, opacity: 1 }],
        cornerRadius: resolvedStyle.borderRadius,
      };
      results.push(def);
    } else if (tagName === "StatusBar") {
      // Skip non-visual elements
    } else {
      // Any other component (Pressable, custom components, etc.) — treat as frame and always recurse
      const def = buildFrameNode(tagName, resolvedStyle);
      def.figmaId = nodePath;
      def.name = idSegment;
      for (const child of node.children) {
        const childNodes = jsxElementToFigmaNodes(child, styles, source, nodePath);
        def.children!.push(...childNodes);
      }
      if (def.children!.length > 0 || Object.keys(resolvedStyle).length > 0) {
        results.push(def);
      }
    }
  } else if (ts.isJsxSelfClosingElement(node)) {
    const tagName = getJsxSelfClosingTagName(node);
    const attrs = getJsxSelfClosingAttributes(node, source);
    const resolvedStyle = resolveStyleAttr(attrs.style, styles);

    const scIdSegment = attrs.nativeID?.replace(/['"{}]/g, "")
      || extractStyleName(attrs.style)
      || tagName.toLowerCase();
    const scNodePath = parentPath ? `${parentPath}/${scIdSegment}` : scIdSegment;

    if (tagName === "Image") {
      const def: FigmaNodeDef = {
        name: scIdSegment,
        figmaId: scNodePath,
        type: "RECTANGLE",
        width: resolvedStyle.width || 100,
        height: resolvedStyle.height || 100,
        fills: [{ type: "SOLID", hex: "#CCCCCC", r: 0.8, g: 0.8, b: 0.8, opacity: 1 }],
        cornerRadius: resolvedStyle.borderRadius,
      };
      results.push(def);
    } else if (tagName === "StatusBar") {
      // Skip
    } else {
      // Any self-closing element — create as frame with its styles
      const def = buildFrameNode(tagName, resolvedStyle);
      def.figmaId = scNodePath;
      def.name = scIdSegment;
      if (Object.keys(resolvedStyle).length > 0) {
        results.push(def);
      }
    }
  } else if (ts.isJsxFragment(node)) {
    for (const child of node.children) {
      results.push(...jsxElementToFigmaNodes(child, styles, source, parentPath));
    }
  } else if (ts.isJsxExpression(node)) {
    // Handle JSX expressions: ternaries, variables, logical &&, etc.
    if (node.expression) {
      const jsxNodes = extractJsxFromExpression(node.expression, styles, source, parentPath);
      results.push(...jsxNodes);
    }
  } else if (ts.isJsxText(node)) {
    const text = node.text.trim();
    if (text && !text.startsWith("{")) {
      results.push({
        name: "text",
        type: "TEXT",
        characters: text,
        fontSize: 14,
      });
    }
  }

  return results;
}

/**
 * Recursively extract JSX from any expression: ternaries, parens, &&, variables, etc.
 * Takes the "truthy" branch of ternaries for preview purposes.
 */
function extractJsxFromExpression(
  expr: ts.Expression,
  styles: StyleMap,
  source: string,
  parentPath: string = ""
): FigmaNodeDef[] {
  // Unwrap parenthesized: (expr)
  if (ts.isParenthesizedExpression(expr)) {
    return extractJsxFromExpression(expr.expression, styles, source, parentPath);
  }

  // JSX elements directly
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
    return jsxElementToFigmaNodes(expr, styles, source, parentPath);
  }

  // Ternary: condition ? whenTrue : whenFalse — take true branch
  if (ts.isConditionalExpression(expr)) {
    const fromTrue = extractJsxFromExpression(expr.whenTrue, styles, source, parentPath);
    if (fromTrue.length > 0) return fromTrue;
    // Fall back to false branch if true branch is null/empty
    return extractJsxFromExpression(expr.whenFalse, styles, source, parentPath);
  }

  // Logical &&: condition && <Element /> — take the right side
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return extractJsxFromExpression(expr.right, styles, source, parentPath);
  }

  // Handle .map() calls: array.map((item) => <JSX />) or array.map((item) => { return <JSX /> })
  if (ts.isCallExpression(expr)) {
    const callExpr = expr.expression;
    if (ts.isPropertyAccessExpression(callExpr) &&
        ts.isIdentifier(callExpr.name) && callExpr.name.text === "map") {
      const callback = expr.arguments[0];
      if (callback) {
        // Arrow with expression body: .map(x => <JSX />)
        if (ts.isArrowFunction(callback) && !ts.isBlock(callback.body)) {
          return extractJsxFromExpression(callback.body as ts.Expression, styles, source, parentPath);
        }
        // Arrow/function with block body: .map(x => { return <JSX /> })
        if ((ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body)) {
          for (const stmt of callback.body.statements) {
            if (ts.isReturnStatement(stmt) && stmt.expression) {
              const result = extractJsxFromExpression(stmt.expression, styles, source, parentPath);
              if (result.length > 0) return result;
            }
          }
        }
      }
    }
  }

  // General fallback — try to find JSX anywhere inside
  const found: FigmaNodeDef[] = [];
  walkTree(expr, (child) => {
    if (child === expr) return; // skip self
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      found.push(...jsxElementToFigmaNodes(child, styles, source, parentPath));
    }
  });

  return found;
}

// ─── Node builders ───────────────────────────────────────────────

function buildFrameNode(tagName: string, style: Record<string, any>): FigmaNodeDef {
  const def: FigmaNodeDef = {
    name: tagName,
    type: "FRAME",
    children: [],
  };

  // Layout direction
  if (style.flexDirection === "row") {
    def.layoutMode = "HORIZONTAL";
  } else {
    def.layoutMode = "VERTICAL";
  }

  // Auto-layout sizing
  def.primaryAxisSizingMode = "AUTO";
  def.counterAxisSizingMode = "AUTO";

  // Dimensions
  if (style.width && typeof style.width === "number") def.width = style.width;
  if (style.height && typeof style.height === "number") def.height = style.height;

  // Flex or full-width: In RN, Views default to stretching to parent width.
  // Mirror this in Figma by setting FILL on horizontal axis for vertical layouts.
  if (style.flex === 1) {
    def.layoutSizingHorizontal = "FILL";
    def.layoutSizingVertical = "FILL";
  } else if (!style.width && style.flexDirection !== "row") {
    // Vertical frame without explicit width — stretch to parent
    def.layoutSizingHorizontal = "FILL";
  } else if (style.width === "100%") {
    def.layoutSizingHorizontal = "FILL";
  }

  // Gap
  if (style.gap) def.itemSpacing = style.gap;

  // Padding
  const pt = style.paddingTop || style.paddingVertical || style.padding || 0;
  const pb = style.paddingBottom || style.paddingVertical || style.padding || 0;
  const pl = style.paddingLeft || style.paddingHorizontal || style.padding || 0;
  const pr = style.paddingRight || style.paddingHorizontal || style.padding || 0;
  if (pt || pb || pl || pr) {
    def.padding = { top: pt, right: pr, bottom: pb, left: pl };
  }

  // Margin as itemSpacing hint (top margin)
  if (style.marginTop && !def.itemSpacing) {
    // We can't directly set margin in Figma, but we note it
  }

  // Corner radius
  if (style.borderRadius) def.cornerRadius = style.borderRadius;

  // Background color
  if (style.backgroundColor) {
    const fill = hexToFill(style.backgroundColor);
    if (fill) def.fills = [fill];
  }

  // Border
  if (style.borderWidth && style.borderColor) {
    const stroke = hexToFill(style.borderColor);
    if (stroke) {
      def.strokes = [stroke];
      def.strokeWeight = style.borderWidth;
    }
  }

  // Opacity
  if (style.opacity !== undefined && style.opacity !== 1) {
    def.opacity = style.opacity;
  }

  // Alignment
  const alignMap: Record<string, string> = {
    "center": "CENTER",
    "flex-start": "MIN",
    "flex-end": "MAX",
    "space-between": "SPACE_BETWEEN",
  };
  if (style.alignItems) def.counterAxisAlignItems = alignMap[style.alignItems] || undefined;
  if (style.justifyContent) def.primaryAxisAlignItems = alignMap[style.justifyContent] || undefined;

  return def;
}

function buildTextNode(tagName: string, style: Record<string, any>, text: string): FigmaNodeDef {
  const def: FigmaNodeDef = {
    name: tagName,
    type: "TEXT",
    characters: text || "...",
  };

  if (style.fontSize) def.fontSize = style.fontSize;
  if (style.fontWeight) def.fontWeight = String(style.fontWeight);
  if (style.lineHeight) {
    def.lineHeight = { unit: "PIXELS", value: style.lineHeight };
  }
  if (style.letterSpacing) {
    def.letterSpacing = { unit: "PIXELS", value: style.letterSpacing };
  }
  if (style.textAlign) {
    const map: Record<string, string> = { left: "LEFT", center: "CENTER", right: "RIGHT" };
    def.textAlignHorizontal = map[style.textAlign] || "LEFT";
  }

  // Text color
  if (style.color) {
    const fill = hexToFill(style.color);
    if (fill) def.fills = [fill];
  }

  // Text should fill parent width by default (matches RN behavior)
  def.layoutSizingHorizontal = "FILL";
  def.textAutoResize = "HEIGHT";

  return def;
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Extract the style name from a style attribute string.
 * e.g. "{styles.bar}" → "bar", "{[styles.foo, styles.bar]}" → "foo"
 */
function extractStyleName(styleAttr: string | undefined): string | null {
  if (!styleAttr) return null;
  const match = styleAttr.match(/styles\.(\w+)/);
  return match ? match[1] : null;
}

function isContainerTag(tag: string): boolean {
  return ["View", "SafeAreaView", "ScrollView", "Pressable", "TouchableOpacity", "KeyboardAvoidingView"].includes(tag);
}

function getJsxTagName(opening: ts.JsxOpeningElement): string {
  if (ts.isIdentifier(opening.tagName)) return opening.tagName.text;
  if (ts.isPropertyAccessExpression(opening.tagName)) {
    return opening.tagName.name.text;
  }
  return "Unknown";
}

function getJsxSelfClosingTagName(node: ts.JsxSelfClosingElement): string {
  if (ts.isIdentifier(node.tagName)) return node.tagName.text;
  if (ts.isPropertyAccessExpression(node.tagName)) {
    return node.tagName.name.text;
  }
  return "Unknown";
}

function getJsxAttributes(opening: ts.JsxOpeningElement, source: string): Record<string, string> {
  return extractAttrsFromJsxAttrs(opening.attributes, source);
}

function getJsxSelfClosingAttributes(node: ts.JsxSelfClosingElement, source: string): Record<string, string> {
  return extractAttrsFromJsxAttrs(node.attributes, source);
}

function extractAttrsFromJsxAttrs(attributes: ts.JsxAttributes, source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const attr of attributes.properties) {
    if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) {
      const name = attr.name.text;
      if (attr.initializer) {
        result[name] = source.substring(attr.initializer.pos, attr.initializer.end).trim();
      } else {
        result[name] = "true";
      }
    }
  }
  return result;
}

function resolveStyleAttr(styleExpr: string | undefined, styles: StyleMap): Record<string, any> {
  if (!styleExpr) return {};

  // style={styles.xxx}
  const singleMatch = styleExpr.match(/\{styles\.(\w+)\}/);
  if (singleMatch && styles[singleMatch[1]]) {
    return { ...styles[singleMatch[1]] };
  }

  // style={[styles.xxx, styles.yyy]} or style={[styles.xxx, condition ? styles.yyy : null]}
  const arrayMatches = styleExpr.match(/styles\.(\w+)/g);
  if (arrayMatches) {
    let merged: Record<string, any> = {};
    for (const m of arrayMatches) {
      const name = m.replace("styles.", "");
      if (styles[name]) {
        merged = { ...merged, ...styles[name] };
      }
    }
    return merged;
  }

  return {};
}

function extractTextContent(element: ts.JsxElement, source: string): string {
  const parts: string[] = [];
  for (const child of element.children) {
    if (ts.isJsxText(child)) {
      const t = child.text.trim();
      if (t) parts.push(t);
    } else if (ts.isJsxExpression(child) && child.expression) {
      // {backButtonTitle} or {"literal"} or {index + 1}
      const text = source.substring(child.expression.pos, child.expression.end).trim();
      if (text.startsWith('"') || text.startsWith("'")) {
        parts.push(text.replace(/['"]/g, ""));
      } else {
        parts.push("{" + text + "}");
      }
    }
  }
  return parts.join(" ") || "...";
}

function hexToFill(value: string): FigmaNodeDef["fills"] extends (infer T)[] | undefined ? T : never {
  if (!value) return null as any;

  // Normalize hex
  let hex = value.trim();
  if (!hex.startsWith("#")) return null as any;

  // Expand shorthand: #F60 → #FF6600
  if (hex.length === 4) {
    hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }

  hex = hex.toUpperCase();
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;

  if (isNaN(r) || isNaN(g) || isNaN(b)) return null as any;

  return { type: "SOLID", hex, r, g, b, opacity: 1 };
}

function walkTree(node: ts.Node, visitor: (n: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => walkTree(child, visitor));
}

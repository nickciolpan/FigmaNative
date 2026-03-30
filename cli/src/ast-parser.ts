/**
 * AST-based component parser using the TypeScript compiler API.
 *
 * Replaces the brittle regex-based parseComponentFile() with proper
 * AST traversal for extracting component metadata from .tsx files.
 */

import * as ts from "typescript";

export type ParsedComponent = {
  props: Array<{ name: string; type: string; default?: string }>;
  variants: string[];
  layout: {
    direction: string;
    gap: number;
    padding: number;
    cornerRadius: number;
    width?: number;
    height?: number;
    borderWidth?: number;
  };
  fills: Array<{
    type: string;
    color?: { r: number; g: number; b: number };
    token?: string;
  }>;
};

/**
 * Parse a TypeScript/TSX component file and extract design metadata.
 */
export function parseComponentAST(source: string): ParsedComponent {
  const sourceFile = ts.createSourceFile(
    "component.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const result: ParsedComponent = {
    props: [],
    variants: [],
    layout: { direction: "VERTICAL", gap: 0, padding: 0, cornerRadius: 0 },
    fills: [],
  };

  // Walk the AST
  ts.forEachChild(sourceFile, (node) => {
    // 1. Extract props from type alias: type FooProps = { ... }
    if (ts.isTypeAliasDeclaration(node) && node.name.text.endsWith("Props")) {
      extractPropsFromType(node, result, source);
    }

    // 2. Extract variant maps: const xxxClasses/xxxStyles = { ... } as const
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const name = decl.name.text;
          if (
            (name.endsWith("Classes") || name.endsWith("Styles")) &&
            name !== "styles"
          ) {
            const variantName = name
              .replace(/Classes$/, "")
              .replace(/Styles$/, "");
            // Skip text-prefixed variants (text style helpers)
            if (!variantName.startsWith("text")) {
              result.variants.push(variantName);
            }
          }
        }
      }
    }

  });

  // Full-tree walk for StyleSheet.create calls and className attributes
  walkTree(sourceFile, (node) => {
    if (ts.isCallExpression(node)) {
      extractFromStyleSheetCreate(node, result, source);
    }
    // Find className in JSX attributes
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === "className") {
        extractLayoutFromClassName(node, result, source);
      }
    }
  });

  return result;
}

function walkTree(node: ts.Node, visitor: (n: ts.Node) => void): void {
  visitor(node);
  ts.forEachChild(node, (child) => walkTree(child, visitor));
}

function extractPropsFromType(
  node: ts.TypeAliasDeclaration,
  result: ParsedComponent,
  source: string
): void {
  if (!ts.isTypeLiteralNode(node.type)) return;

  for (const member of node.type.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (!ts.isIdentifier(member.name!)) continue;

    const propName = member.name.text;
    const optional = !!member.questionToken;
    const typeText = member.type ? source.substring(member.type.pos, member.type.end).trim() : "string";

    // Skip callback and ReactNode props
    if (typeText.includes("=>")) continue;
    if (typeText === "React.ReactNode") continue;

    let figmaType = "TEXT";
    if (typeText === "boolean") figmaType = "BOOLEAN";
    else if (typeText.includes("|")) figmaType = "VARIANT";

    const prop: (typeof result.props)[0] = { name: propName, type: figmaType };

    // Find default in function params
    const defaultMatch = source.match(
      new RegExp(`${propName}\\s*=\\s*"([^"]*)"`)
    );
    if (defaultMatch) prop.default = defaultMatch[1];
    const boolDefault = source.match(
      new RegExp(`${propName}\\s*=\\s*(true|false)`)
    );
    if (boolDefault) prop.default = boolDefault[1];

    result.props.push(prop);
  }
}

function extractFromStyleSheetCreate(
  node: ts.CallExpression,
  result: ParsedComponent,
  source: string
): void {
  // Check if this is StyleSheet.create(...)
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) return;
  if (!ts.isIdentifier(expr.expression) || expr.expression.text !== "StyleSheet") return;
  if (!ts.isIdentifier(expr.name) || expr.name.text !== "create") return;

  // Get the object literal argument
  const arg = node.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return;

  // Look for the first style entry (typically "container")
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (!ts.isIdentifier(prop.name)) continue;

    // Only parse the first meaningful style (container/wrapper)
    const styleName = prop.name.text;
    if (styleName === "container" || styleName === "wrapper" || arg.properties.indexOf(prop) === 0) {
      if (ts.isObjectLiteralExpression(prop.initializer)) {
        extractStyleProperties(prop.initializer, result, source);
      }
      break; // Only first style block
    }
  }
}

function extractStyleProperties(
  obj: ts.ObjectLiteralExpression,
  result: ParsedComponent,
  source: string
): void {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (!ts.isIdentifier(prop.name)) continue;

    const key = prop.name.text;
    const valueText = source.substring(prop.initializer.pos, prop.initializer.end).trim();

    switch (key) {
      case "flexDirection":
        if (valueText.includes("row")) result.layout.direction = "HORIZONTAL";
        break;
      case "gap":
        result.layout.gap = parseNumericValue(valueText);
        break;
      case "padding":
        result.layout.padding = parseNumericValue(valueText);
        break;
      case "paddingHorizontal":
      case "paddingVertical":
        if (!result.layout.padding) result.layout.padding = parseNumericValue(valueText);
        break;
      case "borderRadius":
        result.layout.cornerRadius = parseNumericValue(valueText);
        break;
      case "width":
        result.layout.width = parseNumericValue(valueText);
        break;
      case "height":
        result.layout.height = parseNumericValue(valueText);
        break;
      case "borderWidth":
        result.layout.borderWidth = parseNumericValue(valueText);
        break;
      case "backgroundColor": {
        const fill = resolveColorValue(valueText);
        if (fill) result.fills.push(fill);
        break;
      }
    }
  }
}

function extractLayoutFromClassName(
  attr: ts.JsxAttribute,
  result: ParsedComponent,
  source: string
): void {
  if (!attr.initializer) return;

  // Get the full text of the className value
  const text = source.substring(attr.initializer.pos, attr.initializer.end).trim();

  // Extract classes from string literal, template literal, or expression
  const classStr = extractClassString(text);
  if (!classStr) return;

  if (classStr.includes("flex-row")) result.layout.direction = "HORIZONTAL";

  const gapMatch = classStr.match(/gap-(\d+)/);
  if (gapMatch) result.layout.gap = parseInt(gapMatch[1]) * 4;

  const pMatch = classStr.match(/\bp-(\d+)/);
  if (pMatch) result.layout.padding = parseInt(pMatch[1]) * 4;
  const pxMatch = classStr.match(/px-(\d+)/);
  if (pxMatch && !result.layout.padding) result.layout.padding = parseInt(pxMatch[1]) * 4;

  if (classStr.includes("rounded-full")) result.layout.cornerRadius = 9999;
  else if (classStr.includes("rounded-3xl")) result.layout.cornerRadius = 24;
  else if (classStr.includes("rounded-2xl")) result.layout.cornerRadius = 16;
  else if (classStr.includes("rounded-xl")) result.layout.cornerRadius = 12;
  else if (classStr.includes("rounded-lg")) result.layout.cornerRadius = 8;
  else if (classStr.includes("rounded-md")) result.layout.cornerRadius = 6;
  else if (classStr.includes("rounded-sm")) result.layout.cornerRadius = 2;
  else if (classStr.includes("rounded")) result.layout.cornerRadius = 4;

  // Extract bg-xxx as fill
  const bgMatch = classStr.match(/bg-(\w+-\d+)/);
  if (bgMatch) {
    result.fills.push({ type: "SOLID", token: bgMatch[1] });
  }

  // Width / height
  const wMatch = classStr.match(/w-\[(\d+)px\]/);
  if (wMatch) result.layout.width = parseInt(wMatch[1]);
  const hMatch = classStr.match(/h-\[(\d+)px\]/);
  if (hMatch) result.layout.height = parseInt(hMatch[1]);
}

function extractClassString(text: string): string | null {
  // Handle: "classes here"
  const strMatch = text.match(/"([^"]+)"/);
  if (strMatch) return strMatch[1];

  // Handle: {`classes ${dynamic}`}
  const tmplMatch = text.match(/`([^`]+)`/);
  if (tmplMatch) return tmplMatch[1];

  // Handle: {'classes'}
  const exprMatch = text.match(/'([^']+)'/);
  if (exprMatch) return exprMatch[1];

  return text;
}

function parseNumericValue(text: string): number {
  const num = parseFloat(text);
  return isNaN(num) ? 0 : num;
}

function resolveColorValue(
  text: string
): { type: string; color?: { r: number; g: number; b: number }; token?: string } | null {
  // Check for Colors.xxx reference
  const tokenMatch = text.match(/Colors\.(\w+)/);
  if (tokenMatch) {
    return { type: "SOLID", token: tokenMatch[1] };
  }

  // Check for hex literal
  const hexMatch = text.match(/'#([0-9A-Fa-f]{6})'/);
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      type: "SOLID",
      color: {
        r: parseInt(hex.substring(0, 2), 16) / 255,
        g: parseInt(hex.substring(2, 4), 16) / 255,
        b: parseInt(hex.substring(4, 6), 16) / 255,
      },
    };
  }

  return null;
}

/**
 * E2E Roundtrip + Edge Case tests.
 *
 * Tests:
 * 1. StyleSheet roundtrip fidelity
 * 2. Edge cases: empty nodes, mixed radii, gradients, shadows, borders, typography
 */

import { generateScreen } from "./codegen";
import { generateComponent } from "./component-codegen";
import type { FigmaNode } from "./figma-api";
import { StyleSheetBackend } from "./backends/stylesheet";
import type { FigmaNativeConfig } from "./config";

const config: FigmaNativeConfig = {
  theme: {
    colors: {
      background: "#FFFFFF",
      text: "#27272A",
      brand: "#00686A",
      border: "#D4D4D8",
    },
    hook: "useColors",
    import: "../theme/colors",
  },
};

const ssBackend = new StyleSheetBackend(config);

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok ${name}`);
    passed++;
  } else {
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`);
    failed++;
  }
}

// ─── Test 1: StyleSheet Roundtrip ─────────────────────────────

console.log("\n=== Test 1: StyleSheet Roundtrip (Figma->Code->Figma) ===\n");

const ssButton: FigmaNode = {
  id: "ss1",
  name: "Card",
  type: "COMPONENT",
  layoutMode: "VERTICAL",
  itemSpacing: 12,
  paddingLeft: 16,
  paddingRight: 16,
  paddingTop: 16,
  paddingBottom: 16,
  cornerRadius: 8,
  fills: [
    { type: "SOLID", color: { r: 0, g: 0.408, b: 0.416, a: 1 } }, // brand
  ],
  children: [
    {
      id: "ss2",
      name: "Title",
      type: "TEXT",
      characters: "Title",
      fills: [{ type: "SOLID", color: { r: 0.153, g: 0.153, b: 0.165, a: 1 } }],
    },
  ],
};

const ssCode = ssBackend.generateComponentFile("Card", ssButton);
const ssParsed = ssBackend.parseComponentFile("Card", ssCode);

assert("SS roundtrip: name preserved", ssParsed.name === "Card");
assert("SS roundtrip: direction preserved", ssParsed.layout.direction === "VERTICAL");
assert("SS roundtrip: gap preserved", ssParsed.layout.gap === 12, `got ${ssParsed.layout.gap}`);
assert("SS roundtrip: padding preserved", ssParsed.layout.padding === 16, `got ${ssParsed.layout.padding}`);
assert("SS roundtrip: cornerRadius preserved", ssParsed.layout.cornerRadius === 8);
assert("SS roundtrip: has title prop", ssParsed.props.some((p) => p.name === "label"));
assert("SS roundtrip: has fill from Colors.brand", ssParsed.fills.length > 0);

// ─── Test 2: Edge Case — Empty Node ──────────────────────────

console.log("\n=== Test 2: Edge Case — Empty / Minimal Nodes ===\n");

const emptyFrame: FigmaNode = {
  id: "e1",
  name: "Empty",
  type: "FRAME",
  children: [],
};

const emptyCode = generateScreen("EmptyScreen", emptyFrame, {}, ssBackend);
assert("empty node: generates valid code", emptyCode.includes("export function EmptyScreen"));
assert("empty node: has return", emptyCode.includes("return ("));

// Invisible node
const invisibleNode: FigmaNode = {
  id: "inv1",
  name: "Hidden",
  type: "FRAME",
  visible: false,
  children: [
    { id: "inv2", name: "Child", type: "TEXT", characters: "should not appear" },
  ],
};

const invisibleScreen: FigmaNode = {
  id: "root",
  name: "Root",
  type: "FRAME",
  children: [invisibleNode],
};

const invisCode = generateScreen("InvisScreen", invisibleScreen, {}, ssBackend);
assert("invisible node: hidden content excluded", !invisCode.includes("should not appear"));

// ─── Test 3: Edge Case — Mixed Corner Radius ─────────────────

console.log("\n=== Test 3: Edge Case — Mixed Corner Radius ===\n");

const mixedRadiusNode: FigmaNode = {
  id: "mr1",
  name: "MixedRadius",
  type: "FRAME",
  cornerRadius: { topLeft: 12, topRight: 0, bottomRight: 8, bottomLeft: 0 } as any,
  children: [
    { id: "mr2", name: "Child", type: "TEXT", characters: "Hello" },
  ],
};

// StyleSheet
const ssMixed = generateScreen("MixedScreen", mixedRadiusNode, {}, ssBackend);
assert("SS mixed radius: has borderTopLeftRadius",
  ssMixed.includes("borderTopLeftRadius: 12"),
  `code: ${ssMixed.substring(0, 300)}`
);

// ─── Test 4: Edge Case — Borders ─────────────────────────────

console.log("\n=== Test 4: Edge Case — Borders (Strokes) ===\n");

const borderedNode: FigmaNode = {
  id: "b1",
  name: "Bordered",
  type: "FRAME",
  strokes: [{ type: "SOLID", color: { r: 0.831, g: 0.831, b: 0.847, a: 1 } }],
  strokeWeight: 1,
  children: [
    { id: "b2", name: "Inner", type: "TEXT", characters: "Bordered" },
  ],
};

const ssBorder = generateScreen("BorderScreen", borderedNode, {}, ssBackend);
assert("SS border: has borderWidth", ssBorder.includes("borderWidth: 1"));

// ─── Test 5: Edge Case — Shadow ──────────────────────────────

console.log("\n=== Test 5: Edge Case — Shadows ===\n");

const shadowNode: FigmaNode = {
  id: "sh1",
  name: "Shadow",
  type: "FRAME",
  effects: [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.15 },
      offset: { x: 0, y: 4 },
      radius: 8,
      visible: true,
    },
  ],
  children: [
    { id: "sh2", name: "Content", type: "TEXT", characters: "Shadowed" },
  ],
};

const ssShadow = generateScreen("ShadowScreen", shadowNode, {}, ssBackend);
assert("SS shadow: has shadowRadius", ssShadow.includes("shadowRadius: 8"));
assert("SS shadow: has elevation", ssShadow.includes("elevation: 4"));

// ─── Test 6: Edge Case — Typography ──────────────────────────

console.log("\n=== Test 6: Edge Case — Typography ===\n");

const typographyNode: FigmaNode = {
  id: "t1",
  name: "TypoScreen",
  type: "FRAME",
  children: [
    {
      id: "t2",
      name: "Heading",
      type: "TEXT",
      characters: "Big Title",
      fontSize: 24,
      fontWeight: 700,
      textAlignHorizontal: "CENTER",
      lineHeight: { value: 32, unit: "PIXELS" },
      letterSpacing: { value: -0.5, unit: "PIXELS" },
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    },
  ],
};

const ssTypo = generateScreen("TypoScreen", typographyNode, {}, ssBackend);
assert("SS typo: has fontSize: 24", ssTypo.includes("fontSize: 24"));
assert("SS typo: has fontWeight: '700'", ssTypo.includes("fontWeight: '700'"));
assert("SS typo: has textAlign: 'center'", ssTypo.includes("textAlign: 'center'"));
assert("SS typo: has lineHeight: 32", ssTypo.includes("lineHeight: 32"));
assert("SS typo: has letterSpacing: -0.5", ssTypo.includes("letterSpacing: -0.5"));

// ─── Test 7: Edge Case — Opacity ─────────────────────────────

console.log("\n=== Test 7: Edge Case — Opacity ===\n");

const opacityNode: FigmaNode = {
  id: "o1",
  name: "Faded",
  type: "FRAME",
  opacity: 0.5,
  children: [
    { id: "o2", name: "Label", type: "TEXT", characters: "50% opacity" },
  ],
};

const ssOp = generateScreen("OpacityScreen", opacityNode, {}, ssBackend);
assert("SS opacity: has opacity: 0.5", ssOp.includes("opacity: 0.5"));

// ─── Test 8: Edge Case — Fixed Dimensions ────────────────────

console.log("\n=== Test 8: Edge Case — Fixed Dimensions ===\n");

const fixedNode: FigmaNode = {
  id: "f1",
  name: "FixedBox",
  type: "FRAME",
  width: 200,
  height: 100,
  layoutSizingHorizontal: "FIXED",
  layoutSizingVertical: "FIXED",
  children: [
    { id: "f2", name: "Label", type: "TEXT", characters: "Fixed" },
  ],
};

const ssFixed = generateScreen("FixedScreen", fixedNode, {}, ssBackend);
assert("SS fixed: has width: 200", ssFixed.includes("width: 200"));
assert("SS fixed: has height: 100", ssFixed.includes("height: 100"));

// ─── Test 9: Edge Case — Gradient ───────────────────────────

console.log("\n=== Test 9: Edge Case — Gradient Fill ===\n");

const gradientNode: FigmaNode = {
  id: "g1",
  name: "GradientBox",
  type: "FRAME",
  fills: [
    {
      type: "GRADIENT_LINEAR",
      gradientStops: [
        { color: { r: 0, g: 0.408, b: 0.416, a: 1 }, position: 0 },
        { color: { r: 0, g: 0, b: 0, a: 1 }, position: 1 },
      ],
    },
  ],
  children: [
    { id: "g2", name: "Text", type: "TEXT", characters: "Gradient" },
  ],
};

const ssGrad = generateScreen("GradScreen", gradientNode, {}, ssBackend);
assert("SS gradient: uses LinearGradient", ssGrad.includes("LinearGradient"));
assert("SS gradient: has Colors.brand in gradient", ssGrad.includes("Colors.brand"));

// ─── Results ─────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);

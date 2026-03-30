/**
 * E2E test for the StyleSheet backend.
 * Verifies that the same Figma node tree produces valid
 * StyleSheet.create() code with theme tokens.
 */

import { generateScreen } from "./codegen";
import { generateComponent } from "./component-codegen";
import type { FigmaNode } from "./figma-api";
import { StyleSheetBackend } from "./backends/stylesheet";
import type { FigmaNativeConfig } from "./config";

// Rurio-like config
const config: FigmaNativeConfig = {
  theme: {
    colors: {
      background: "#FFFFFF",
      text: "#27272A",
      subtext: "#71717B",
      brand: "#00686A",
      border: "#D4D4D8",
      n_50: "#FAFAFA",
    },
    hook: "useColors",
    import: "../theme/colors",
  },
};

const backend = new StyleSheetBackend(config);

// ─── Fake Figma node tree ─────────────────────────────────────

const fakeScreen: FigmaNode = {
  id: "1",
  name: "Home",
  type: "FRAME",
  layoutMode: "VERTICAL",
  itemSpacing: 24,
  paddingLeft: 16,
  paddingRight: 16,
  paddingTop: 16,
  paddingBottom: 16,
  fills: [
    { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }, // white -> Colors.background
  ],
  children: [
    {
      id: "2",
      name: "Title",
      type: "TEXT",
      characters: "Welcome",
      fills: [
        { type: "SOLID", color: { r: 0.153, g: 0.153, b: 0.165, a: 1 } }, // #27272A -> Colors.text
      ],
    },
    {
      id: "3",
      name: "Card",
      type: "FRAME",
      layoutMode: "VERTICAL",
      itemSpacing: 12,
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 16,
      paddingBottom: 16,
      cornerRadius: 8,
      fills: [
        { type: "SOLID", color: { r: 0, g: 0.408, b: 0.416, a: 1 } }, // #00686A -> Colors.brand
      ],
      children: [
        {
          id: "4",
          name: "Subtitle",
          type: "TEXT",
          characters: "Your dashboard",
          fills: [
            { type: "SOLID", color: { r: 0.443, g: 0.443, b: 0.482, a: 1 } }, // #71717B -> Colors.subtext
          ],
        },
      ],
    },
  ],
};

// ─── Test runner ──────────────────────────────────────────────

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

console.log("=== E2E Test: StyleSheet Backend ===\n");

// ─── Test 1: Screen generation ───────────────────────────────
console.log("Test 1: Screen codegen with StyleSheet backend");
const output = generateScreen("HomeScreen", fakeScreen, {}, backend);
console.log("\nGenerated code:\n");
console.log(output);
console.log("---\n");

assert("imports StyleSheet", output.includes("StyleSheet"));
assert("imports React (for useMemo)", output.includes('import React from "react"'));
assert("imports useColors hook", output.includes('import { useColors } from "../theme/colors"'));
assert("calls useColors()", output.includes("const Colors = useColors()"));
assert("uses React.useMemo", output.includes("React.useMemo"));
assert("uses StyleSheet.create", output.includes("StyleSheet.create"));
assert("has style={styles.", output.includes("style={styles."));
assert("does NOT use className", !output.includes("className"));
assert("resolves background color to Colors.background", output.includes("Colors.background"));
assert("resolves text color to Colors.text", output.includes("Colors.text"));
assert("resolves subtext color to Colors.subtext", output.includes("Colors.subtext"));
assert("has gap: 24", output.includes("gap: 24"));
assert("has padding: 16", output.includes("padding: 16"));
// Card is matched as a known component, so its brand bg and borderRadius
// are handled by the Card component itself, not in the screen styles.
assert("Card matched as component (not raw View)", output.includes("<Card>"));
assert("exports HomeScreen function", output.includes("export function HomeScreen"));

// ─── Test 2: Component generation ────────────────────────────
console.log("\nTest 2: Component codegen with StyleSheet backend");

const fakeButton: FigmaNode = {
  id: "btn1",
  name: "Button",
  type: "COMPONENT",
  layoutMode: "HORIZONTAL",
  itemSpacing: 8,
  paddingLeft: 16,
  paddingRight: 16,
  paddingTop: 12,
  paddingBottom: 12,
  cornerRadius: 8,
  primaryAxisAlignItems: "CENTER",
  counterAxisAlignItems: "CENTER",
  fills: [
    { type: "SOLID", color: { r: 0, g: 0.408, b: 0.416, a: 1 } }, // brand
  ],
  componentProperties: {
    "label#1:0": { type: "TEXT", value: "Click me" },
    "disabled#2:0": { type: "BOOLEAN", value: false },
  },
  children: [
    {
      id: "btn2",
      name: "Label",
      type: "TEXT",
      characters: "Click me",
      fills: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }, // white
      ],
    },
  ],
};

const compOutput = generateComponent("Button", fakeButton, backend);
console.log("\nGenerated component:\n");
console.log(compOutput);
console.log("---\n");

assert("component imports StyleSheet", compOutput.includes("StyleSheet"));
assert("component has Pressable (button-like)", compOutput.includes("Pressable"));
assert("component has ButtonProps type", compOutput.includes("type ButtonProps"));
assert("component has onPress prop", compOutput.includes("onPress"));
assert("component uses StyleSheet.create", compOutput.includes("StyleSheet.create"));
assert("component does NOT use className", !compOutput.includes("className"));
assert("component has Colors.brand", compOutput.includes("Colors.brand"));

// ─── Test 3: Parse StyleSheet component ──────────────────────
console.log("\nTest 3: Parse StyleSheet component (Code -> Figma)");

const sampleSource = `
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "../theme/colors";

type CardProps = {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
};

export function Card({
  title = "Title",
  subtitle,
  children,
}: CardProps) {
  const Colors = useColors();

  const styles = React.useMemo(() => StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      borderRadius: 8,
      backgroundColor: Colors.brand,
    },
    title: {
      color: Colors.text,
      fontSize: 18,
      fontWeight: '600',
    },
  }), [Colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}
`;

const parsed = backend.parseComponentFile("Card", sampleSource);
console.log("Parsed:", JSON.stringify(parsed, null, 2));
console.log("");

assert("parsed name is Card", parsed.name === "Card");
assert("parsed has title prop", parsed.props.some(p => p.name === "title"));
assert("parsed has subtitle prop", parsed.props.some(p => p.name === "subtitle"));
assert("parsed direction is HORIZONTAL", parsed.layout.direction === "HORIZONTAL");
assert("parsed gap is 12", parsed.layout.gap === 12);
assert("parsed padding is 16", parsed.layout.padding === 16);
assert("parsed borderRadius is 8", parsed.layout.cornerRadius === 8);
assert("parsed has fill from Colors.brand", parsed.fills.length > 0);
assert("parsed fill color matches brand (#00686A)",
  parsed.fills[0]?.color !== undefined &&
  Math.abs(parsed.fills[0].color.r - 0) < 0.01 &&
  Math.abs(parsed.fills[0].color.g - 0.408) < 0.01
);

// ─── Results ─────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);

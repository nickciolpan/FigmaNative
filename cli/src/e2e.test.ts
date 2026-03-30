/**
 * End-to-end test: simulates a Figma API response and verifies
 * the full pipeline produces valid React Native JSX.
 */

import { generateScreen } from "./codegen";
import type { FigmaNode } from "./figma-api";
import { StyleSheetBackend } from "./backends/stylesheet";
import type { FigmaNativeConfig } from "./config";

// ─── Fake Figma node tree (mimics what the API returns) ────────

const fakeLoginScreen: FigmaNode = {
  id: "1:42",
  name: "LoginScreen",
  type: "FRAME",
  layoutMode: "VERTICAL",
  itemSpacing: 24,
  paddingLeft: 24,
  paddingRight: 24,
  paddingTop: 24,
  paddingBottom: 24,
  primaryAxisAlignItems: "CENTER",
  counterAxisAlignItems: "CENTER",
  layoutSizingVertical: "FILL",
  fills: [
    { type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98, a: 1 } }, // gray-50
  ],
  children: [
    // Text heading
    {
      id: "1:43",
      name: "Heading",
      type: "TEXT",
      characters: "Welcome back",
      fills: [
        { type: "SOLID", color: { r: 0.07, g: 0.09, b: 0.15, a: 1 } }, // gray-900
      ],
    },
    // Card containing inputs and button
    {
      id: "1:44",
      name: "Card",
      type: "INSTANCE",
      componentId: "comp:card",
      componentProperties: {
        "padding#1": { type: "TEXT", value: "lg" },
      },
      layoutMode: "VERTICAL",
      itemSpacing: 16,
      paddingLeft: 24,
      paddingRight: 24,
      paddingTop: 24,
      paddingBottom: 24,
      cornerRadius: 16,
      fills: [
        { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } },
      ],
      children: [
        // Email input
        {
          id: "1:45",
          name: "Input",
          type: "INSTANCE",
          componentId: "comp:input",
          componentProperties: {
            "label#1": { type: "TEXT", value: "Email" },
            "placeholder#1": { type: "TEXT", value: "you@example.com" },
          },
        },
        // Password input
        {
          id: "1:46",
          name: "Input",
          type: "INSTANCE",
          componentId: "comp:input",
          componentProperties: {
            "label#1": { type: "TEXT", value: "Password" },
            "placeholder#1": { type: "TEXT", value: "••••••••" },
          },
        },
        // Submit button
        {
          id: "1:47",
          name: "Button",
          type: "INSTANCE",
          componentId: "comp:button",
          componentProperties: {
            "label#1": { type: "TEXT", value: "Sign In" },
            "variant#1": { type: "TEXT", value: "primary" },
            "size#1": { type: "TEXT", value: "lg" },
          },
        },
      ],
    },
    // Forgot password ghost button
    {
      id: "1:48",
      name: "Button",
      type: "INSTANCE",
      componentId: "comp:button",
      componentProperties: {
        "label#1": { type: "TEXT", value: "Forgot your password?" },
        "variant#1": { type: "TEXT", value: "ghost" },
      },
    },
  ],
};

// Component name map (simulates file.components from the API)
const componentNames: Record<string, string> = {
  "comp:button": "Button",
  "comp:card": "Card",
  "comp:input": "Input",
  "comp:avatar": "Avatar",
  "comp:badge": "Badge",
  "comp:divider": "Divider",
};

// ─── Run the test ──────────────────────────────────────────────

console.log("═══ E2E Test: Figma → React Native Codegen ═══\n");

const config: FigmaNativeConfig = {
  theme: {
    colors: {
      background: "#FFFFFF",
      text: "#27272A",
      brand: "#00686A",
    },
    hook: "useColors",
    import: "../theme/colors",
  },
};

const backend = new StyleSheetBackend(config);
const output = generateScreen("LoginScreen", fakeLoginScreen, componentNames, backend);

console.log("Generated code:\n");
console.log(output);
console.log("───────────────────────────────────────────────\n");

// ─── Assertions ────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

// Imports
assert("imports View from react-native", output.includes('import { View, Text } from "react-native"'));
assert("imports components", output.includes('import { Button, Card, Input } from "../components"'));

// Component detection
assert("generates <Card> component", output.includes("<Card"));
assert("Card has padding prop", output.includes('padding="lg"'));
assert("generates <Input> for email", output.includes('label="Email"'));
assert("generates <Input> for password", output.includes('label="Password"'));
assert("generates <Button> for sign in", output.includes('label="Sign In"'));
assert("Button has variant=primary", output.includes('variant="primary"'));
assert("Button has size=lg", output.includes('size="lg"'));
assert("generates ghost button", output.includes('variant="ghost"'));
assert("ghost button has label", output.includes('label="Forgot your password?"'));

// Layout classes
assert("has gap class from itemSpacing", output.includes("gap-6"));
assert("has padding class", output.includes("p-6"));

// Text
assert("renders heading text", output.includes("Welcome back"));
assert("heading has text color class", output.includes("text-gray-900"));

// Structure
assert("exports function LoginScreen", output.includes("export function LoginScreen()"));
assert("has return statement", output.includes("return ("));

// No broken JSX
assert("no unclosed tags", !output.includes("</>") || output.split("<").length - 1 === output.split(">").length - 1);

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);

if (failed > 0) {
  process.exit(1);
}

/**
 * LLM-powered Figma→Code generator.
 *
 * Takes extracted Figma node JSON and uses Claude to generate
 * idiomatic React Native code that matches the project's patterns.
 */

import { callClaude } from "./llm-call";
import * as fs from "fs";
import * as path from "path";
import type { FigmaNativeConfig } from "./config";

const SYSTEM_PROMPT = `You are an expert React Native developer. You convert Figma design data into clean, production-ready React Native components.

You receive:
1. A Figma node tree (JSON) extracted from a designer's selection
2. The project's styling approach and configuration
3. A reference component from the same project showing the coding patterns to follow

Your job is to generate a .tsx component file that:

STYLING:
- If mode is "stylesheet": use StyleSheet.create inside useMemo with useColors() for theme tokens, exactly like the reference
- If mode is "nativewind": use className with NativeWind/Tailwind classes
- Match the reference component's import style, export style, and patterns exactly

STRUCTURE:
- Convert Figma auto-layout (HORIZONTAL/VERTICAL) to flexDirection row/column
- Map Figma padding, gap (itemSpacing), cornerRadius, fills directly to RN style props
- Convert Figma fills to backgroundColor using theme color tokens when they match
- Map Figma text properties (fontSize, fontWeight, lineHeight) directly

QUALITY:
- Use TypeScript with a proper Props type
- ALL props MUST have default values so the component renders without any props passed. Use realistic sample data from the Figma text content as defaults.
- Use meaningful prop names derived from the Figma layer structure
- Add nativeID props matching each layer's figmaId for two-way traceability
- Handle images as Image components with a placeholder require() comment
- Generate clean, readable code — no comments explaining obvious things

OUTPUT:
- Return ONLY the .tsx file content. No markdown fences, no explanation.
- The component must be immediately usable — valid TypeScript, correct imports.`;

export async function generateComponentWithLLM(
  componentName: string,
  figmaNode: any,
  config: FigmaNativeConfig,
  projectRoot: string,
  userPrompt?: string,
  savedAssets?: string[]
): Promise<string> {
  const reference = findReferenceComponent(projectRoot, config);

  const themeInfo = config.theme
    ? `Theme hook: ${config.theme.hook || "useColors"} from "${config.theme.import || "../theme/colors"}"
Color tokens: ${JSON.stringify(config.theme.colors || {}, null, 2)}
Dark colors: ${JSON.stringify(config.theme.darkColors || {}, null, 2)}`
    : "No theme configured — use inline hex colors.";

  // Read installed packages so the LLM only uses what's available
  let installedPackages = "";
  try {
    const pkgPath = path.join(projectRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps = Object.keys(pkg.dependencies || {}).sort();
    installedPackages = deps.join(", ");
  } catch {}

  const assetsInfo = savedAssets && savedAssets.length > 0
    ? `\n## Available Assets (saved to src/assets/)\n${savedAssets.map(a => `- ${a} → require('../assets/${a}')`).join("\n")}\nUse these require() paths for any Image sources in the component.`
    : "";

  const userInstructions = userPrompt
    ? `\n## Additional Instructions from Designer\n${userPrompt}`
    : "";

  const prompt = `${SYSTEM_PROMPT}

## Component Name
${componentName}

## Project Style Mode
${config.mode}

## Theme
${themeInfo}

## Installed Packages (ONLY use these — do NOT import packages not in this list)
${installedPackages}
${assetsInfo}
${userInstructions}

## Reference Component (follow this pattern exactly)
\`\`\`tsx
${reference}
\`\`\`

## Figma Node Tree
\`\`\`json
${JSON.stringify(figmaNode, null, 2)}
\`\`\`

Generate the ${componentName} component. Return ONLY the .tsx file content.`;

  console.log(`[llm-codegen] Generating ${componentName}...`);

  let code = await callClaude(prompt);

  // Extract just the code — strip any conversational text the LLM adds
  code = extractCode(code, componentName);

  console.log(`[llm-codegen] Generated ${componentName} (${code.length} chars)`);
  return code;
}

function findReferenceComponent(projectRoot: string, config: FigmaNativeConfig): string {
  const componentsDir = path.join(
    projectRoot,
    config.components?.dir || "src/components"
  );

  if (!fs.existsSync(componentsDir)) {
    return getDefaultReference(config.mode);
  }

  const files = fs
    .readdirSync(componentsDir)
    .filter((f) => f.endsWith(".tsx") && !f.startsWith("index"));

  if (files.length === 0) {
    return getDefaultReference(config.mode);
  }

  // Pick a file close to 1500 bytes (not too trivial, not too complex)
  let bestFile = files[0];
  let bestScore = Infinity;
  for (const f of files) {
    const size = fs.statSync(path.join(componentsDir, f)).size;
    const score = Math.abs(size - 1500);
    if (score < bestScore) {
      bestScore = score;
      bestFile = f;
    }
  }

  return fs.readFileSync(path.join(componentsDir, bestFile), "utf-8");
}

/**
 * Extract valid TSX code from LLM output, stripping any conversational text.
 */
function extractCode(raw: string, componentName: string): string {
  // 1. Try to extract from markdown code fence
  const fenceMatch = raw.match(/```(?:tsx|typescript|ts)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    const code = fenceMatch[1].trim();
    if (code.includes("import")) return code;
  }

  // 2. Find the first line starting with "import" and take everything from there
  const lines = raw.split("\n");
  const importIdx = lines.findIndex((l) => /^import\s/.test(l.trim()));
  if (importIdx >= 0) {
    let code = lines.slice(importIdx).join("\n");
    // Trim any trailing conversational text after the last closing brace/semicolon
    const lastExport = code.lastIndexOf("export default");
    const lastBrace = code.lastIndexOf("}");
    const lastSemicolon = code.lastIndexOf(";");
    const cutoff = Math.max(lastBrace, lastSemicolon);
    if (cutoff > 0 && cutoff > lastExport) {
      code = code.slice(0, cutoff + 1);
    }
    return code.trim();
  }

  // 3. Fallback — strip obvious non-code lines
  const cleaned = lines
    .filter((l) => {
      const t = l.trim();
      // Remove lines that look like conversational text
      if (t.startsWith("Here's") || t.startsWith("Here is")) return false;
      if (t.startsWith("This ") && t.includes("component")) return false;
      if (t.startsWith("I've ") || t.startsWith("I ")) return false;
      if (t.startsWith("```")) return false;
      if (t.startsWith("> ")) return false;
      return true;
    })
    .join("\n")
    .trim();

  if (!cleaned.includes("import")) {
    throw new Error(`LLM generated invalid component code for ${componentName}`);
  }

  return cleaned;
}

function getDefaultReference(mode: string): string {
  if (mode === "stylesheet") {
    return `import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../theme/colors';

type Props = { title: string };

export default function Example({ title }: Props) {
  const Colors = useColors();
  const styles = React.useMemo(
    () => StyleSheet.create({
      container: { padding: 16, backgroundColor: Colors.background },
      title: { fontSize: 16, fontWeight: '600', color: Colors.text },
    }),
    [Colors],
  );
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}`;
  }
  return `import { View, Text } from "react-native";
type Props = { title: string };
export function Example({ title }: Props) {
  return (
    <View className="p-4 bg-white">
      <Text className="text-base font-semibold text-gray-900">{title}</Text>
    </View>
  );
}`;
}

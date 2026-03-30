/**
 * LLM-powered enrichment layer for Code→Figma direction.
 *
 * Takes the mechanical parser output + source code and uses Claude
 * to produce a Figma-ready node tree with realistic dimensions,
 * sample data, and semantic layer names.
 */

import { callClaude } from "./llm-call";
import type { FigmaNodeDef } from "./jsx-to-figma";
import type { FigmaNativeConfig } from "./config";

const SYSTEM_PROMPT = `You are an expert at converting React Native components into Figma design specifications.

You receive:
1. The original React Native .tsx source code
2. A mechanically-parsed Figma node tree (JSON) extracted from that source
3. The project's color theme tokens

Your job is to ENRICH the parsed tree to make it visually complete and accurate in Figma. Specifically:

DIMENSIONS:
- Add realistic width/height to frames that lack them. Use 375 as screen width (iPhone).
- Frames with flexDirection:'row' and justifyContent:'space-between' should have width matching parent.
- Text nodes don't need explicit width (Figma auto-sizes text).
- Calculate heights from content: a row of 48px-tall items = 48px, etc.

SAMPLE DATA:
- Replace {variable} placeholders in text with realistic sample data matching the app context.
  e.g. {backButtonTitle} → "Back", {item.name} → "Agriculture", {themeLabel} → "Light"
- For .map() generated items, create 3-4 realistic entries instead of just one template.

LAYER NAMES:
- Use the figmaId-derived names when they're meaningful (e.g. "backBtn", "menuImg").
- Rename generic "view", "frame" names to semantic ones (e.g. "header", "divider", "tabBar").

VISUAL UNDERSTANDING:
- A View with height:1 or height:2 and a fill color is a DIVIDER — name it appropriately.
- A Pressable is interactive — keep its styling but don't add special Figma treatment.
- Image placeholders (gray rectangles) should keep their dimensions but can have a descriptive name.
- An element with opacity < 1 should keep that opacity value.

RULES:
- Return ONLY valid JSON — the enriched node tree. No markdown, no explanation.
- Preserve ALL existing properties (figmaId, fills, strokes, padding, cornerRadius, etc.)
- Do NOT remove any nodes. You may add children (e.g. expanding .map templates) or adjust properties.
- Keep the exact same structure/nesting. Only enrich, don't restructure.
- Dimensions should be numbers (pixels), not strings.`;

export async function enrichWithLLM(
  componentName: string,
  source: string,
  parsedTree: FigmaNodeDef,
  config?: FigmaNativeConfig
): Promise<FigmaNodeDef> {
  const themeColors = config?.theme?.colors
    ? JSON.stringify(config.theme.colors, null, 2)
    : "No theme colors configured";

  const prompt = `${SYSTEM_PROMPT}

Component: ${componentName}

## Source Code
\`\`\`tsx
${source}
\`\`\`

## Theme Colors
${themeColors}

## Parsed Node Tree
\`\`\`json
${JSON.stringify(parsedTree, null, 2)}
\`\`\`

Enrich this node tree. Return ONLY the complete enriched JSON.`;

  console.log(`[llm] Enriching ${componentName} (${countNodes(parsedTree)} nodes)...`);

  const text = await callClaude(prompt);

  // Extract JSON from response
  const jsonStr = text
    .replace(/^[\s\S]*?```json?\s*\n?/m, "")
    .replace(/\n?```[\s\S]*$/m, "")
    .trim();
  const toParse = jsonStr.startsWith("{") ? jsonStr : text.trim();

  try {
    const enriched = JSON.parse(toParse) as FigmaNodeDef;
    console.log(`[llm] Enriched ${componentName}: ${countNodes(enriched)} nodes`);
    return enriched;
  } catch (err) {
    console.error(`[llm] Failed to parse enriched JSON for ${componentName}, using original tree`);
    console.error(`[llm] Raw (first 500 chars): ${toParse.substring(0, 500)}`);
    return parsedTree;
  }
}

function countNodes(node: FigmaNodeDef): number {
  let count = 1;
  for (const child of node.children || []) {
    count += countNodes(child);
  }
  return count;
}

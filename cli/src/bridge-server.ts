/**
 * Bridge server: runs locally and connects the Figma plugin to the
 * React Native codebase.
 *
 * POST /export      — receives Figma component JSON, generates RN component
 * GET  /components  — returns component descriptions for the Figma plugin
 * GET  /config      — returns the active FigmaNative configuration
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { generateComponent } from "./component-codegen";
import type { FigmaNativeConfig } from "./config";
import type { StyleBackend } from "./backends";
import type { ComponentDescription } from "./backends";
import { toPascalCase, findProjectRoot } from "./utils";
import { parseComponentToFigmaTree } from "./jsx-to-figma";
import { enrichWithLLM } from "./llm-enricher";
import { generateComponentWithLLM } from "./llm-codegen";

let PROJECT_ROOT = "";
let MATCHER_PATH = "";

function initPaths(): void {
  if (!PROJECT_ROOT) {
    PROJECT_ROOT = findProjectRoot();
    MATCHER_PATH = path.join(PROJECT_ROOT, "cli", "src", "component-matcher.ts");
  }
}

function getComponentsDir(config: FigmaNativeConfig): string {
  const dir = config.components?.dir || path.join("src", "components");
  return path.join(PROJECT_ROOT, dir);
}

function getComponentsIndex(config: FigmaNativeConfig): string {
  const index = config.components?.index || path.join("src", "components", "index.ts");
  return path.join(PROJECT_ROOT, index);
}

// ─── CORS ────────────────────────────────────────────────────

function setCors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown
): void {
  setCors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

// ─── Code validation ─────────────────────────────────────────

function validateGeneratedCode(code: string, componentName: string): { valid: boolean; error?: string } {
  // Must contain an import statement
  if (!code.includes("import ")) {
    return { valid: false, error: "No import statements found — likely not valid TSX" };
  }

  // Must export something (default or named)
  if (!code.includes("export ")) {
    return { valid: false, error: "No export found" };
  }

  // Component name must be a valid JS identifier
  if (/^[0-9]/.test(componentName)) {
    return { valid: false, error: `Component name "${componentName}" starts with a number` };
  }

  // Check for obvious syntax issues
  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (Math.abs(openBraces - closeBraces) > 1) {
    return { valid: false, error: `Mismatched braces: ${openBraces} open vs ${closeBraces} close` };
  }

  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (Math.abs(openParens - closeParens) > 1) {
    return { valid: false, error: `Mismatched parentheses: ${openParens} open vs ${closeParens} close` };
  }

  // Must not contain markdown or conversational text
  if (code.includes("```") || code.includes("Here's the")) {
    return { valid: false, error: "Contains markdown or conversational text — LLM output not properly cleaned" };
  }

  return { valid: true };
}

// ─── Helpers ─────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ─── POST /export ────────────────────────────────────────────

async function handleExport(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  backend: StyleBackend,
  config: FigmaNativeConfig
): Promise<void> {
  const raw = await readBody(req);
  let payload: { name: string; node: any; enrich?: boolean; userPrompt?: string; assets?: Array<{ name: string; data: string; nodeId: string; format: string }> };

  try {
    payload = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
    return;
  }

  const { name, node } = payload;
  if (!name || !node) {
    sendJson(res, 400, { error: 'Missing "name" or "node" field' });
    return;
  }

  // Validate node structure
  if (!node.type || typeof node.type !== "string") {
    sendJson(res, 400, { error: 'Invalid node: missing or invalid "type" field' });
    return;
  }
  if (!node.name && !name) {
    sendJson(res, 400, { error: 'Invalid node: missing name' });
    return;
  }

  const componentName = toPascalCase(name);
  const useAI = payload.enrich === true;
  console.log(
    `[bridge] Received component "${componentName}" (type=${node.type}, children=${node.children?.length ?? 0}, mode=stylesheet, ai=${useAI})`
  );

  // 0. Save assets (images, vectors) to the project assets directory
  const savedAssets: string[] = [];
  if (payload.assets && payload.assets.length > 0) {
    const assetsDir = path.join(PROJECT_ROOT, "src", "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    for (const asset of payload.assets) {
      try {
        const ext = asset.format === "svg" ? ".svg" : ".png";
        const assetFileName = `${asset.name}${ext}`;
        const assetPath = path.join(assetsDir, assetFileName);
        const buffer = Buffer.from(asset.data, "base64");
        fs.writeFileSync(assetPath, buffer);
        savedAssets.push(assetFileName);
        console.log(`[bridge] Saved asset: ${assetPath} (${buffer.length} bytes)`);
      } catch (err: any) {
        console.warn(`[bridge] Failed to save asset ${asset.name}:`, err.message);
      }
    }
  }

  // 1. Generate code — via LLM or mechanical backend
  let code: string;
  try {
    if (useAI) {
      code = await generateComponentWithLLM(componentName, node, config, PROJECT_ROOT, payload.userPrompt, savedAssets);
    } else {
      code = generateComponent(componentName, node, backend);
    }
  } catch (err: any) {
    console.error(`[bridge] Code generation failed for ${componentName}:`, err);
    sendJson(res, 500, { error: `Code generation failed: ${err.message}` });
    return;
  }
  console.log(`[bridge] Generated ${componentName} (${code.length} chars, ai=${useAI}, assets=${savedAssets.length})`);

  // 1b. Validate generated code before writing
  const validation = validateGeneratedCode(code, componentName);
  if (!validation.valid) {
    console.error(`[bridge] Validation failed for ${componentName}: ${validation.error}`);
    sendJson(res, 500, { error: `Generated code is invalid: ${validation.error}` });
    return;
  }

  // 2. Write component file
  const componentsDir = getComponentsDir(config);
  fs.mkdirSync(componentsDir, { recursive: true });
  const filePath = path.join(componentsDir, `${componentName}.tsx`);
  fs.writeFileSync(filePath, code, "utf-8");
  console.log(`[bridge] Written to ${filePath}`);

  // 3. Update components index
  updateComponentsIndex(componentName, config);

  // 4. Update component matcher
  updateComponentMatcher(componentName);

  // 5. Track this as a Figma-exported component and update preview registry
  trackExportedComponent(componentName, config);
  updatePreviewRegistry(config);

  const relativePath = path.relative(PROJECT_ROOT, filePath);
  sendJson(res, 200, { success: true, path: relativePath, code, mode: "stylesheet" });
}

/**
 * Add `export { Foo } from "./Foo";` to the components index file
 * if it doesn't already exist.
 */
function updateComponentsIndex(name: string, config: FigmaNativeConfig): void {
  const indexPath = getComponentsIndex(config);
  const exportLine = `export { ${name} } from "./${name}";`;

  let content = "";
  if (fs.existsSync(indexPath)) {
    content = fs.readFileSync(indexPath, "utf-8");
  }

  if (content.includes(exportLine)) {
    console.log(`[bridge] index.ts already exports ${name}`);
    return;
  }

  // Ensure directory exists
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  const updated = content.trimEnd() + "\n" + exportLine + "\n";
  fs.writeFileSync(indexPath, updated, "utf-8");
  console.log(`[bridge] Added ${name} to index.ts`);
}

/**
 * Register a new component in cli/src/component-matcher.ts
 * by appending an entry to the KNOWN_COMPONENTS object.
 */
function updateComponentMatcher(name: string): void {
  if (!fs.existsSync(MATCHER_PATH)) {
    console.log(`[bridge] component-matcher.ts not found, skipping`);
    return;
  }

  let content = fs.readFileSync(MATCHER_PATH, "utf-8");

  // Check if already registered
  if (content.includes(`${name}: {`)) {
    console.log(`[bridge] component-matcher.ts already has ${name}`);
    return;
  }

  // Find the closing of KNOWN_COMPONENTS
  const marker = "  Divider:";
  const lastEntryIdx = content.lastIndexOf(marker);
  if (lastEntryIdx === -1) {
    const closingIdx = content.indexOf("\n};\n");
    if (closingIdx === -1) {
      console.log(`[bridge] Could not find insertion point in component-matcher.ts`);
      return;
    }
    const entry = generateMatcherEntry(name);
    content =
      content.slice(0, closingIdx) + "\n" + entry + content.slice(closingIdx);
  } else {
    const afterMarker = content.indexOf("  },\n", lastEntryIdx);
    if (afterMarker === -1) {
      console.log(`[bridge] Could not find Divider closing in component-matcher.ts`);
      return;
    }
    const insertPos = afterMarker + "  },\n".length;
    const entry = generateMatcherEntry(name);
    content = content.slice(0, insertPos) + entry + content.slice(insertPos);
  }

  fs.writeFileSync(MATCHER_PATH, content, "utf-8");
  console.log(`[bridge] Registered ${name} in component-matcher.ts`);
}

function generateMatcherEntry(name: string): string {
  return (
    `  ${name}: {\n` +
    `    import: "${name}",\n` +
    `    extractProps: (node) => {\n` +
    `      const props: Record<string, string | boolean> = {};\n` +
    `      const cp = node.componentProperties || {};\n` +
    `\n` +
    `      for (const [key, val] of Object.entries(cp)) {\n` +
    `        const k = key.toLowerCase().replace(/#.*$/, "");\n` +
    `        props[k] = val.type === "BOOLEAN" ? val.value === true || val.value === "true" : String(val.value);\n` +
    `      }\n` +
    `\n` +
    `      if (!props.label && node.children) {\n` +
    `        const textChild = node.children.find((c) => c.type === "TEXT");\n` +
    `        if (textChild?.characters) props.label = textChild.characters;\n` +
    `      }\n` +
    `\n` +
    `      return props;\n` +
    `    },\n` +
    `  },\n`
  );
}

/**
 * Track a component as exported from Figma (persisted to .figma-exports.json).
 */
function trackExportedComponent(name: string, config: FigmaNativeConfig): void {
  const manifestPath = path.join(getComponentsDir(config), ".figma-exports.json");
  let exported: string[] = [];
  if (fs.existsSync(manifestPath)) {
    try { exported = JSON.parse(fs.readFileSync(manifestPath, "utf-8")); } catch {}
  }
  if (!exported.includes(name)) {
    exported.push(name);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(exported, null, 2), "utf-8");
}

/**
 * Update the FigmaPreviewRegistry to only include Figma-exported components.
 */
function updatePreviewRegistry(config: FigmaNativeConfig): void {
  const componentsDir = getComponentsDir(config);
  if (!fs.existsSync(componentsDir)) return;

  // Only include components tracked as Figma exports
  const manifestPath = path.join(componentsDir, ".figma-exports.json");
  let exported: string[] = [];
  if (fs.existsSync(manifestPath)) {
    try { exported = JSON.parse(fs.readFileSync(manifestPath, "utf-8")); } catch {}
  }

  const names = exported.filter((n) =>
    fs.existsSync(path.join(componentsDir, `${n}.tsx`))
  );

  // Detect default vs named export for each component
  const importLines: string[] = [];
  for (const n of names) {
    const source = fs.readFileSync(path.join(componentsDir, `${n}.tsx`), "utf-8");
    const hasDefault = /export\s+default\s/.test(source);
    if (hasDefault) {
      importLines.push(`import ${n} from '../components/${n}';`);
    } else {
      importLines.push(`import { ${n} } from '../components/${n}';`);
    }
  }

  const entries = names
    .map((n) => `  { name: '${n}', component: ${n} },`)
    .join("\n");

  const content =
    `// Auto-generated by FigmaNative bridge server.\n` +
    `// Do not edit manually — this file is regenerated on each export.\n\n` +
    `import React from 'react';\n` +
    `${importLines.join("\n")}\n\n` +
    `export type RegistryEntry = {\n` +
    `  name: string;\n` +
    `  component: React.ComponentType<any>;\n` +
    `};\n\n` +
    `export const FIGMA_COMPONENTS: RegistryEntry[] = [\n` +
    `${entries}\n` +
    `];\n`;

  const registryPath = path.join(PROJECT_ROOT, "src", "screens", "FigmaPreviewRegistry.ts");
  fs.writeFileSync(registryPath, content, "utf-8");
  console.log(`[bridge] Updated preview registry (${names.length} components)`);
}

// ─── GET /components ─────────────────────────────────────────

async function handleGetComponents(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  backend: StyleBackend,
  config: FigmaNativeConfig
): Promise<void> {
  const componentsDir = getComponentsDir(config);

  if (!fs.existsSync(componentsDir)) {
    sendJson(res, 200, []);
    return;
  }

  // Check if LLM enrichment is requested: GET /components?enrich=true
  const urlObj = new URL(req.url || "/", `http://localhost`);
  const useEnrich = urlObj.searchParams.get("enrich") === "true";

  const files = fs
    .readdirSync(componentsDir)
    .filter((f) => f.endsWith(".tsx"));

  const components: any[] = [];

  for (const file of files) {
    const filePath = path.join(componentsDir, file);
    const source = fs.readFileSync(filePath, "utf-8");
    const name = file.replace(/\.tsx$/, "");

    try {
      const tree = parseComponentToFigmaTree(name, source, config);

      if (useEnrich && process.env.ANTHROPIC_API_KEY) {
        try {
          const enriched = await enrichWithLLM(name, source, tree, config);
          components.push(enriched);
        } catch (err: any) {
          console.warn(`[bridge] LLM enrichment failed for ${name}: ${err.message}, using parsed tree`);
          components.push(tree);
        }
      } else {
        components.push(tree);
      }
    } catch (err) {
      console.warn(`[bridge] Warning: could not parse ${file}: ${err}`);
    }
  }

  sendJson(res, 200, components);
}

// ─── GET /config ─────────────────────────────────────────────

function handleGetConfig(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  config: FigmaNativeConfig
): void {
  sendJson(res, 200, {
    mode: "stylesheet",
    hasTheme: !!config.theme,
    themeHook: config.theme?.hook || null,
  });
}

// ─── Server ──────────────────────────────────────────────────

export function startBridgeServer(
  port: number,
  backend: StyleBackend,
  config: FigmaNativeConfig
): void {
  initPaths();
  const server = http.createServer(async (req, res) => {
    setCors(res);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url?.split("?")[0];

    try {
      if (req.method === "POST" && url === "/export") {
        await handleExport(req, res, backend, config);
      } else if (req.method === "GET" && url === "/components") {
        handleGetComponents(req, res, backend, config);
      } else if (req.method === "GET" && url === "/config") {
        handleGetConfig(req, res, config);
      } else if (req.method === "GET" && url === "/health") {
        sendJson(res, 200, { status: "ok", mode: "stylesheet" });
      } else {
        sendJson(res, 404, { error: "Not found" });
      }
    } catch (err: any) {
      console.error("[bridge] Error:", err);
      sendJson(res, 500, { error: err.message || "Internal error" });
    }
  });

  server.listen(port, () => {
    console.log(`\nFigma <-> React Native bridge server`);
    console.log(`Mode: stylesheet`);
    if (config.theme?.hook) {
      console.log(`Theme hook: ${config.theme.hook} (from ${config.theme.import})`);
    }
    console.log(`Listening on http://localhost:${port}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /export      - receive Figma component, generate RN code`);
    console.log(`  GET  /components  - list RN components for the Figma plugin`);
    console.log(`  GET  /config      - current configuration`);
    console.log(`  GET  /health      - health check`);
    console.log(`\nPress Ctrl+C to stop.\n`);
  });
}

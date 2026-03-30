#!/usr/bin/env node

/**
 * figma2native CLI
 *
 * Usage:
 *   figma2native export <figma-url> [--screen <name>] [--out <path>]
 *   figma2native inspect <figma-url>
 *   figma2native serve [-p <port>]
 *
 * Environment:
 *   FIGMA_TOKEN — your Figma personal access token
 *
 * Configuration:
 *   Place a figmanative.config.js in your project root to configure
 *   the style backend. See docs for details.
 */

import { program } from "commander";
import { fetchFile, fetchNode, type FigmaNode } from "./figma-api";
import { generateScreen } from "./codegen";
import { startBridgeServer } from "./bridge-server";
import { loadConfig, type FigmaNativeConfig } from "./config";
import { createBackend } from "./backends";
import { toPascalCase } from "./utils";
import * as fs from "fs";
import * as path from "path";

function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } {
  const fileMatch = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!fileMatch) throw new Error(`Invalid Figma URL: ${url}`);

  const fileKey = fileMatch[1];
  const nodeMatch = url.match(/node-id=([^&]+)/);
  const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]) : undefined;

  return { fileKey, nodeId };
}

function getToken(): string {
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error(
      "Error: FIGMA_TOKEN environment variable is required.\n" +
        "Get one at: https://www.figma.com/developers/api#access-tokens\n" +
        "Then: export FIGMA_TOKEN=your-token-here"
    );
    process.exit(1);
  }
  return token;
}

function printTree(node: FigmaNode, indent = 0): void {
  const prefix = "  ".repeat(indent);
  const type = node.type;
  const name = node.name;
  const extra: string[] = [];

  if (node.type === "TEXT" && node.characters) {
    extra.push(`"${node.characters.slice(0, 40)}"`);
  }
  if (node.componentId) extra.push(`componentId=${node.componentId}`);
  if (node.layoutMode) extra.push(`layout=${node.layoutMode}`);
  if (node.componentProperties) {
    const props = Object.entries(node.componentProperties)
      .map(([k, v]) => `${k.replace(/#.*$/, "")}=${v.value}`)
      .join(", ");
    extra.push(`props={${props}}`);
  }

  const extraStr = extra.length > 0 ? ` (${extra.join(", ")})` : "";
  console.log(`${prefix}${type} "${name}"${extraStr}`);

  if (node.children) {
    for (const child of node.children) {
      printTree(child, indent + 1);
    }
  }
}

// ─── Commands ────────────────────────────────────────────────

program
  .name("figma2native")
  .description("Export Figma designs to React Native code")
  .version("0.1.0");

program
  .command("inspect")
  .description("Show the component tree of a Figma file or node")
  .argument("<url>", "Figma file or node URL")
  .action(async (url: string) => {
    const token = getToken();
    const { fileKey, nodeId } = parseFigmaUrl(url);

    console.log(`Fetching from Figma...`);

    if (nodeId) {
      const node = await fetchNode(fileKey, nodeId, token);
      console.log(`\nNode tree for "${node.name}":\n`);
      printTree(node);
    } else {
      const file = await fetchFile(fileKey, token);
      console.log(`\nFile: ${file.name}`);
      console.log(`Components found: ${Object.keys(file.components).length}\n`);

      for (const [id, comp] of Object.entries(file.components)) {
        console.log(`  ${comp.name} (${id})`);
        if (comp.description) console.log(`    -> ${comp.description}`);
      }

      console.log(`\nPages:`);
      for (const page of file.document.children || []) {
        console.log(`  ${page.name}`);
        for (const frame of page.children || []) {
          console.log(`    -- ${frame.type} "${frame.name}" (id: ${frame.id})`);
        }
      }
    }
  });

program
  .command("export")
  .description("Export a Figma node as a React Native screen component")
  .argument("<url>", "Figma URL with node-id parameter")
  .option("-s, --screen <name>", "Screen component name")
  .option("-o, --out <path>", "Output file path")
  .option("--dry-run", "Print generated code to stdout instead of writing")
  .action(
    async (
      url: string,
      opts: { screen?: string; out?: string; dryRun?: boolean }
    ) => {
      const token = getToken();
      const { fileKey, nodeId } = parseFigmaUrl(url);

      if (!nodeId) {
        console.error(
          "Error: URL must include a node-id. " +
            "Right-click a frame in Figma -> Copy link."
        );
        process.exit(1);
      }

      const config = loadConfig();
      const backend = createBackend(config);

      console.log(`Fetching from Figma...`);

      const [node, file] = await Promise.all([
        fetchNode(fileKey, nodeId, token),
        fetchFile(fileKey, token),
      ]);

      const componentNames: Record<string, string> = {};
      for (const [id, comp] of Object.entries(file.components)) {
        componentNames[id] = comp.name;
      }

      const screenName =
        opts.screen || toPascalCase(node.name) + "Screen";

      console.log(`Generating ${screenName}...`);

      const code = generateScreen(screenName, node, componentNames, backend, config);

      if (opts.dryRun) {
        console.log("\n" + code);
        return;
      }

      const outPath =
        opts.out || path.join("src", "screens", `${screenName}.tsx`);

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, code, "utf-8");

      console.log(`Done: ${outPath}`);
      console.log(
        `\nUsage:\n  import { ${screenName} } from "./${outPath.replace(/\.tsx$/, "")}";`
      );
    }
  );

program
  .command("list-components")
  .description("List all components available in the React Native library")
  .action(() => {
    console.log("Available components (Figma name -> React Native):\n");
    const components = [
      {
        name: "Button",
        props: 'variant="primary|secondary|ghost" size="sm|md|lg" label="..." disabled',
      },
      {
        name: "Card",
        props: 'title="..." subtitle="..." padding="none|sm|md|lg"',
      },
      {
        name: "Input",
        props: 'label="..." placeholder="..." error="..." disabled',
      },
      {
        name: "Avatar",
        props: 'size="sm|md|lg" src="..." initials="..."',
      },
      {
        name: "Badge",
        props: 'variant="default|success|warning|error" label="..."',
      },
      {
        name: "Divider",
        props: 'spacing="sm|md|lg"',
      },
    ];

    for (const c of components) {
      console.log(`  <${c.name} ${c.props} />`);
    }
    console.log(
      "\nName your Figma components to match these names for automatic mapping."
    );
  });

program
  .command("serve")
  .description("Start the Figma <-> React Native bridge server")
  .option("-p, --port <number>", "Port to listen on", "9100")
  .action((opts: { port: string }) => {
    const port = parseInt(opts.port, 10);

    const config = loadConfig();
    const backend = createBackend(config);

    startBridgeServer(port, backend, config);
  });

program.parse();

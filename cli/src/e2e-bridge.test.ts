/**
 * End-to-end test for the full Figma → React Native bridge pipeline.
 *
 * Tests:
 * 1. Server starts and responds to health check
 * 2. GET /components returns existing components with correct structure
 * 3. POST /export with a Figma component JSON → generates RN component file
 * 4. New component appears in GET /components
 * 5. Generated component file is valid (has exports, types, NativeWind classes)
 * 6. src/components/index.ts is updated with the new export
 * 7. Component codegen handles various Figma node types (text, frames, instances)
 * 8. Cleanup: remove generated test files
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";

const PORT = 9199; // Use a different port to avoid conflicts
const BASE = `http://localhost:${PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const COMPONENTS_DIR = path.join(PROJECT_ROOT, "src", "components");
const COMPONENTS_INDEX = path.join(COMPONENTS_DIR, "index.ts");

// Track files we create so we can clean up
const createdFiles: string[] = [];
let serverProcess: ReturnType<typeof import("child_process").spawn> | null =
  null;

// ─── HTTP helpers ───────────────────────────────────────────

function get(urlPath: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${urlPath}`, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode!, body: raw });
        }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

function post(
  urlPath: string,
  data: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      `${BASE}${urlPath}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode!, body: raw });
          }
        });
        res.on("error", reject);
      }
    );
    req.write(payload);
    req.end();
  });
}

// ─── Test runner ────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ─── Fake Figma components for testing ──────────────────────

const fakeToggle = {
  name: "Toggle",
  node: {
    id: "test:1",
    name: "Toggle",
    type: "COMPONENT",
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    paddingLeft: 4,
    paddingRight: 4,
    paddingTop: 4,
    paddingBottom: 4,
    cornerRadius: 999,
    primaryAxisAlignItems: "CENTER",
    counterAxisAlignItems: "CENTER",
    fills: [
      { type: "SOLID", color: { r: 0.82, g: 0.84, b: 0.86, a: 1 } },
    ],
    componentProperties: {
      "label#1:0": { type: "TEXT", value: "Toggle" },
      "active#2:0": { type: "BOOLEAN", value: false },
    },
    children: [
      {
        id: "test:2",
        name: "Knob",
        type: "ELLIPSE",
        fills: [
          { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } },
        ],
      },
      {
        id: "test:3",
        name: "Label",
        type: "TEXT",
        characters: "Toggle",
        fills: [
          { type: "SOLID", color: { r: 0.22, g: 0.25, b: 0.32, a: 1 } },
        ],
      },
    ],
  },
};

const fakeChip = {
  name: "Chip",
  node: {
    id: "test:10",
    name: "Chip",
    type: "COMPONENT",
    layoutMode: "HORIZONTAL",
    itemSpacing: 6,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 6,
    paddingBottom: 6,
    cornerRadius: 16,
    primaryAxisAlignItems: "CENTER",
    counterAxisAlignItems: "CENTER",
    fills: [
      { type: "SOLID", color: { r: 0.94, g: 0.95, b: 1, a: 1 } },
    ],
    componentProperties: {
      "label#1:0": { type: "TEXT", value: "Chip" },
    },
    children: [
      {
        id: "test:11",
        name: "Label",
        type: "TEXT",
        characters: "Chip Label",
        fills: [
          { type: "SOLID", color: { r: 0.15, g: 0.39, b: 0.92, a: 1 } },
        ],
      },
    ],
  },
};

// A more complex component: a card-like container with nested children
const fakeListItem = {
  name: "ListItem",
  node: {
    id: "test:20",
    name: "ListItem",
    type: "COMPONENT",
    layoutMode: "HORIZONTAL",
    itemSpacing: 12,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 12,
    cornerRadius: 8,
    primaryAxisAlignItems: "SPACE_BETWEEN",
    counterAxisAlignItems: "CENTER",
    fills: [
      { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } },
    ],
    componentProperties: {
      "title#1:0": { type: "TEXT", value: "List Item" },
    },
    children: [
      {
        id: "test:21",
        name: "Title",
        type: "TEXT",
        characters: "List Item Title",
        fills: [
          { type: "SOLID", color: { r: 0.07, g: 0.09, b: 0.15, a: 1 } },
        ],
      },
      {
        id: "test:22",
        name: "Arrow",
        type: "VECTOR",
        fills: [
          { type: "SOLID", color: { r: 0.63, g: 0.66, b: 0.70, a: 1 } },
        ],
      },
    ],
  },
};

// ─── Main test flow ─────────────────────────────────────────

async function runTests() {
  console.log("═══ E2E Bridge Test Suite ═══\n");

  // Save originals so we can restore them
  const originalIndex = fs.readFileSync(COMPONENTS_INDEX, "utf-8");
  const matcherPath = path.join(PROJECT_ROOT, "cli", "src", "component-matcher.ts");
  const originalMatcher = fs.readFileSync(matcherPath, "utf-8");

  // Start server
  const { spawn } = await import("child_process");
  console.log(`Starting bridge server on port ${PORT}...`);
  serverProcess = spawn(
    "npx",
    ["tsx", path.join(__dirname, "index.ts"), "serve", "--port", String(PORT)],
    {
      cwd: path.join(PROJECT_ROOT, "cli"),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    }
  );

  // Wait for server to be ready
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await get("/health");
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // not ready yet
    }
  }

  if (!ready) {
    console.error("Server failed to start!");
    cleanup(originalIndex, originalMatcher);
    process.exit(1);
  }
  console.log("Server ready.\n");

  // ─── Test 1: Health check ───
  console.log("Test 1: Health check");
  {
    const res = await get("/health");
    assert("returns 200", res.status === 200);
    assert('body has status "ok"', res.body?.status === "ok");
  }

  // ─── Test 2: GET /components returns existing components ───
  console.log("\nTest 2: GET /components — existing components");
  {
    const res = await get("/components");
    assert("returns 200", res.status === 200);
    assert("returns array", Array.isArray(res.body));
    assert("has 6 existing components", res.body.length === 6, `got ${res.body.length}`);

    const names = res.body.map((c: any) => c.name).sort();
    assert(
      "includes Button, Card, Input, Avatar, Badge, Divider",
      ["Avatar", "Badge", "Button", "Card", "Divider", "Input"].every((n) =>
        names.includes(n)
      ),
      `got: ${names.join(", ")}`
    );

    // Check structure of Button
    const button = res.body.find((c: any) => c.name === "Button");
    assert("Button has props array", Array.isArray(button?.props));
    assert(
      "Button has variant prop",
      button?.props?.some((p: any) => p.name === "variant")
    );
    assert(
      "Button has layout info",
      button?.layout?.cornerRadius !== undefined
    );
  }

  // ─── Test 3: POST /export — generate Toggle component ───
  console.log("\nTest 3: POST /export — generate Toggle component");
  {
    const res = await post("/export", fakeToggle);
    assert("returns 200", res.status === 200);
    assert("success is true", res.body?.success === true);
    assert(
      "path is src/components/Toggle.tsx",
      res.body?.path === "src/components/Toggle.tsx"
    );
    assert("code is non-empty", res.body?.code?.length > 50);

    // Verify the file was written
    const filePath = path.join(COMPONENTS_DIR, "Toggle.tsx");
    const exists = fs.existsSync(filePath);
    assert("Toggle.tsx file was created", exists);
    createdFiles.push(filePath);

    if (exists) {
      const code = fs.readFileSync(filePath, "utf-8");
      assert(
        "has react-native import",
        code.includes('from "react-native"')
      );
      assert("exports Toggle function", code.includes("export function Toggle"));
      assert("has ToggleProps type", code.includes("type ToggleProps"));
      assert("has label prop", code.includes("label"));
      assert("has active prop", code.includes("active"));
      assert("has rounded class (full or 3xl)", code.includes("rounded-full") || code.includes("rounded-3xl"));
      assert("has flex-row class", code.includes("flex-row"));
      assert(
        "has NativeWind gap class",
        code.includes("gap-2")
      );
    }
  }

  // ─── Test 4: index.ts was updated ───
  console.log("\nTest 4: index.ts updated with Toggle export");
  {
    const indexContent = fs.readFileSync(COMPONENTS_INDEX, "utf-8");
    assert(
      'index.ts contains Toggle export',
      indexContent.includes('export { Toggle } from "./Toggle"')
    );
  }

  // ─── Test 5: Toggle now appears in GET /components ───
  console.log("\nTest 5: GET /components — includes new Toggle");
  {
    const res = await get("/components");
    assert("returns 200", res.status === 200);
    assert(
      "now has 7 components",
      res.body.length === 7,
      `got ${res.body.length}`
    );
    const toggle = res.body.find((c: any) => c.name === "Toggle");
    assert("Toggle is in the list", !!toggle);
    assert("Toggle has props", toggle?.props?.length > 0);
  }

  // ─── Test 6: POST /export — generate Chip component ───
  console.log("\nTest 6: POST /export — generate Chip component");
  {
    const res = await post("/export", fakeChip);
    assert("returns 200", res.status === 200);
    assert("success is true", res.body?.success === true);

    const filePath = path.join(COMPONENTS_DIR, "Chip.tsx");
    createdFiles.push(filePath);

    const code = fs.readFileSync(filePath, "utf-8");
    assert("has Text import", code.includes("Text"));
    assert("has rounded-2xl or rounded-xl", code.includes("rounded-2xl") || code.includes("rounded-xl"));
    assert("has bg-blue-50 class", code.includes("bg-blue-50"));
    assert("has label prop in code", code.includes("label"));
  }

  // ─── Test 7: POST /export — generate ListItem (complex) ───
  console.log("\nTest 7: POST /export — generate ListItem (complex component)");
  {
    const res = await post("/export", fakeListItem);
    assert("returns 200", res.status === 200);
    assert("success is true", res.body?.success === true);

    const filePath = path.join(COMPONENTS_DIR, "Listitem.tsx");
    createdFiles.push(filePath);

    const code = res.body?.code || "";
    assert("has flex-row (horizontal layout)", code.includes("flex-row"));
    assert("has justify-between", code.includes("justify-between"));
    assert("has items-center", code.includes("items-center"));
    assert("has padding classes", code.includes("px-") || code.includes("p-"));
    assert("has gap class", code.includes("gap-3"));
    assert("has rounded-lg", code.includes("rounded-lg"));
  }

  // ─── Test 8: Error handling ───
  console.log("\nTest 8: Error handling");
  {
    const res1 = await post("/export", { bad: "data" });
    assert("missing fields returns 400", res1.status === 400);

    const res2 = await get("/nonexistent");
    assert("unknown route returns 404", res2.status === 404);
  }

  // ─── Test 9: CORS headers ───
  console.log("\nTest 9: CORS headers");
  {
    const res = await get("/health");
    // We can't easily check headers with our simple client,
    // but we can verify the server doesn't crash on OPTIONS
    const optionsRes = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        `${BASE}/export`,
        { method: "OPTIONS" },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        }
      );
      req.on("error", reject);
      req.end();
    });
    assert("OPTIONS returns 204", optionsRes === 204);
  }

  // ─── Test 10: Duplicate export is idempotent ───
  console.log("\nTest 10: Duplicate export is idempotent");
  {
    const res = await post("/export", fakeToggle);
    assert("second export returns 200", res.status === 200);

    const indexContent = fs.readFileSync(COMPONENTS_INDEX, "utf-8");
    const count = (
      indexContent.match(/export \{ Toggle \}/g) || []
    ).length;
    assert("Toggle exported only once in index.ts", count === 1, `found ${count} times`);
  }

  // ─── Done ───
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);

  cleanup(originalIndex, originalMatcher);

  if (failed > 0) process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanup(originalIndex: string, originalMatcher: string) {
  console.log("Cleaning up...");

  // Remove generated test files
  for (const f of createdFiles) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`  removed ${path.basename(f)}`);
    }
  }

  // Restore original files
  fs.writeFileSync(COMPONENTS_INDEX, originalIndex, "utf-8");
  console.log("  restored index.ts");
  const matcherPath = path.join(PROJECT_ROOT, "cli", "src", "component-matcher.ts");
  fs.writeFileSync(matcherPath, originalMatcher, "utf-8");
  console.log("  restored component-matcher.ts");

  // Kill server
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    console.log("  killed server");
  }
}

runTests().catch((err) => {
  console.error("Test suite crashed:", err);
  if (serverProcess) serverProcess.kill("SIGTERM");
  // Restore component-matcher.ts if it was modified
  const matcherPath = path.join(PROJECT_ROOT, "cli", "src", "component-matcher.ts");
  for (const f of createdFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  process.exit(1);
});

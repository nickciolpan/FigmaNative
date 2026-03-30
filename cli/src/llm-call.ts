/**
 * Shared LLM caller — uses Claude Code CLI with visible streaming output,
 * falls back to Anthropic API if ANTHROPIC_API_KEY is set.
 */

import { spawn } from "child_process";

type Mode = "api" | "cli";

function getMode(): Mode {
  if (process.env.ANTHROPIC_API_KEY) return "api";
  return "cli";
}

/**
 * Find the claude CLI binary — use system binary directly.
 */
function findClaudeBin(): string {
  return "/opt/homebrew/bin/claude";
}

export async function callClaude(prompt: string): Promise<string> {
  const mode = getMode();
  console.log(`[llm] Using ${mode} mode`);

  switch (mode) {
    case "api":
      return callViaAPI(prompt);
    case "cli":
      return callViaCLI(prompt);
  }
}

/**
 * Call via Anthropic API (needs ANTHROPIC_API_KEY).
 */
async function callViaAPI(prompt: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log("[llm] Calling Claude API...");
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("");
}

/**
 * Call via Claude Code CLI binary — streams output to terminal in real-time.
 */
async function callViaCLI(prompt: string): Promise<string> {
  const claudeBin = findClaudeBin();
  console.log(`[llm] Using claude binary: ${claudeBin}`);
  console.log(`[llm] Streaming generation...`);
  console.log(`[llm] ${"─".repeat(60)}`);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(claudeBin, [
      "-p", prompt,
      "--output-format", "text",
      "--model", "sonnet",
    ], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let charCount = 0;

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      charCount += text.length;

      // Stream to terminal in real-time
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      // Show progress/status from stderr
      process.stderr.write(`\x1b[2m${text}\x1b[0m`);
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Claude CLI timed out after 120s"));
    }, 120_000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      console.log(`\n[llm] ${"─".repeat(60)}`);
      console.log(`[llm] Done — ${charCount} chars, exit code ${code}`);

      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });

    child.on("error", (err: any) => {
      clearTimeout(timeout);
      if (err.code === "ENOENT") {
        reject(new Error(
          "No Claude access available. Either:\n" +
          "  1. Install @anthropic-ai/claude-code: npm install @anthropic-ai/claude-code\n" +
          "  2. Set ANTHROPIC_API_KEY environment variable\n" +
          "  3. Install Claude Code CLI globally"
        ));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Shared utility functions used across the CLI.
 */

import * as path from "path";
import * as fs from "fs";

export function toPascalCase(str: string): string {
  let result = str
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
  // Prefix with "Component" if name starts with a number or is empty
  if (!result || /^[0-9]/.test(result)) {
    result = "Component" + result;
  }
  return result;
}

export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Find the project root by walking up from `startDir` looking for package.json.
 * Falls back to startDir itself if not found.
 */
export function findProjectRoot(startDir?: string): string {
  let dir = path.resolve(startDir || process.cwd());
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  // Fallback: use CWD
  return process.cwd();
}

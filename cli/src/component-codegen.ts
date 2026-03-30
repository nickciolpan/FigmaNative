/**
 * Component code generator: given a Figma component JSON, generates a
 * React Native component file.
 *
 * Now delegates to the active StyleBackend for all styling decisions.
 */

import type { FigmaNode } from "./figma-api";
import type { StyleBackend } from "./backends";

/**
 * Generate a React Native component file from a Figma component JSON.
 * Delegates to the backend for style generation.
 */
export function generateComponent(
  componentName: string,
  node: FigmaNode,
  backend: StyleBackend
): string {
  return backend.generateComponentFile(componentName, node);
}

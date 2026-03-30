/**
 * Backend factory — creates the appropriate StyleBackend based on config.
 */

import type { FigmaNativeConfig } from "../config";
import type { StyleBackend } from "./types";
import { NativeWindBackend } from "./nativewind";
import { StyleSheetBackend } from "./stylesheet";

export function createBackend(config: FigmaNativeConfig): StyleBackend {
  if (config.mode === "stylesheet") {
    return new StyleSheetBackend(config);
  }
  return new NativeWindBackend();
}

export type { StyleBackend } from "./types";
export type { ComponentDescription, GenContext, LayoutProps, TextStyleProps } from "./types";
export { extractLayoutProps, extractTextStyleProps } from "./types";

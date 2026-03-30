/**
 * Configuration loader for FigmaNative.
 *
 * Loads figmanative.config.js from the project root to determine
 * the style backend mode and theme mappings.
 */

import * as fs from "fs";
import * as path from "path";

export type FigmaNativeConfig = {
  /** Style system to use for code generation */
  mode: "nativewind" | "stylesheet";
  /** Theme configuration (used by stylesheet backend) */
  theme?: {
    /** Light mode color tokens: token name → hex value */
    colors?: Record<string, string>;
    /** Dark mode color tokens: token name → hex value */
    darkColors?: Record<string, string>;
    /** Name of the hook that provides colors, e.g. "useColors" */
    hook?: string;
    /** Import path for the hook, e.g. "../theme/colors" */
    import?: string;
  };
  /** Component directory configuration */
  components?: {
    /** Directory containing components, default "src/components" */
    dir?: string;
    /** Index file for barrel exports, default "src/components/index.ts" */
    index?: string;
  };
  /** Custom component definitions for the matcher */
  customComponents?: Record<string, {
    /** Import name (defaults to the key) */
    import?: string;
    /** Map of Figma property names to component prop names */
    propMap?: Record<string, string>;
    /** Whether this component has children slots */
    hasChildren?: boolean;
  }>;
};

const DEFAULT_CONFIG: FigmaNativeConfig = {
  mode: "nativewind",
};

/**
 * Load config from figmanative.config.js, walking up from `startDir`.
 * Returns default config (nativewind mode) if no config file is found.
 */
export function loadConfig(startDir?: string): FigmaNativeConfig {
  const dir = startDir || process.cwd();
  const configPath = findConfigFile(dir);

  if (!configPath) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    // Clear require cache so changes are picked up
    delete require.cache[require.resolve(configPath)];
    const raw = require(configPath);
    const config = raw.default || raw;

    return validateConfig(config);
  } catch (err: any) {
    console.warn(`[config] Warning: could not load ${configPath}: ${err.message}`);
    return { ...DEFAULT_CONFIG };
  }
}

function findConfigFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidate = path.join(dir, "figmanative.config.js");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }

  return null;
}

function validateConfig(raw: any): FigmaNativeConfig {
  const config: FigmaNativeConfig = {
    mode: raw.mode === "stylesheet" ? "stylesheet" : "nativewind",
  };

  if (raw.theme && typeof raw.theme === "object") {
    config.theme = {};
    if (raw.theme.colors && typeof raw.theme.colors === "object") {
      config.theme.colors = raw.theme.colors;
    }
    if (raw.theme.darkColors && typeof raw.theme.darkColors === "object") {
      config.theme.darkColors = raw.theme.darkColors;
    }
    if (typeof raw.theme.hook === "string") {
      config.theme.hook = raw.theme.hook;
    }
    if (typeof raw.theme.import === "string") {
      config.theme.import = raw.theme.import;
    }
  }

  if (raw.components && typeof raw.components === "object") {
    config.components = {};
    if (typeof raw.components.dir === "string") {
      config.components.dir = raw.components.dir;
    }
    if (typeof raw.components.index === "string") {
      config.components.index = raw.components.index;
    }
  }

  if (raw.customComponents && typeof raw.customComponents === "object") {
    config.customComponents = {};
    for (const [name, def] of Object.entries(raw.customComponents)) {
      if (typeof def === "object" && def !== null) {
        const d = def as any;
        config.customComponents[name] = {
          import: typeof d.import === "string" ? d.import : name,
          propMap: d.propMap && typeof d.propMap === "object" ? d.propMap : undefined,
          hasChildren: typeof d.hasChildren === "boolean" ? d.hasChildren : false,
        };
      }
    }
  }

  // ─── Validation warnings ────────────────────────────────────
  if (config.mode === "stylesheet") {
    if (!config.theme?.colors || Object.keys(config.theme.colors).length === 0) {
      console.warn(
        "[config] Warning: mode is 'stylesheet' but no theme.colors defined.\n" +
        "  All colors will fall back to hex values instead of theme tokens.\n" +
        "  Add theme.colors to your figmanative.config.js for proper token mapping."
      );
    }
    if (config.theme?.colors && !config.theme.hook) {
      console.warn(
        "[config] Warning: theme.colors defined but no theme.hook specified.\n" +
        "  Generated code won't call a theme hook. Add theme.hook (e.g. 'useColors')."
      );
    }
    if (config.theme?.hook && !config.theme.import) {
      console.warn(
        "[config] Warning: theme.hook defined but no theme.import specified.\n" +
        "  Generated code can't import the hook. Add theme.import (e.g. '../theme/colors')."
      );
    }
  }

  // Validate color hex values
  if (config.theme?.colors) {
    for (const [token, hex] of Object.entries(config.theme.colors)) {
      if (!/^#[0-9A-Fa-f]{3,8}$/.test(hex)) {
        console.warn(`[config] Warning: theme.colors.${token} has invalid hex value: "${hex}"`);
      }
    }
  }

  return config;
}

/**
 * Matches Figma component instances to our React Native component library.
 *
 * When the Figma node is a COMPONENT or INSTANCE, we check if its name
 * matches one of our known components. If yes, we extract its props
 * from Figma's componentProperties and generate the JSX directly.
 */

import type { FigmaNode } from "./figma-api";
import type { FigmaNativeConfig } from "./config";

// Known components in our library and their prop mappings
const KNOWN_COMPONENTS: Record<
  string,
  {
    import: string;
    extractProps: (node: FigmaNode) => Record<string, string | boolean>;
  }
> = {
  Button: {
    import: "Button",
    extractProps: (node) => {
      const props: Record<string, string | boolean> = {};
      const cp = node.componentProperties || {};

      // Check component property names (case-insensitive matching)
      for (const [key, val] of Object.entries(cp)) {
        const k = key.toLowerCase().replace(/#.*$/, "");
        if (k === "label" || k === "text") props.label = String(val.value);
        if (k === "variant") props.variant = String(val.value).toLowerCase();
        if (k === "size") props.size = String(val.value).toLowerCase();
        if (k === "disabled") props.disabled = val.value === true || val.value === "true";
      }

      // Fallback: use the first text child as label
      if (!props.label && node.children) {
        const textChild = node.children.find((c) => c.type === "TEXT");
        if (textChild?.characters) props.label = textChild.characters;
      }

      return props;
    },
  },
  Card: {
    import: "Card",
    extractProps: (node) => {
      const props: Record<string, string | boolean> = {};
      const cp = node.componentProperties || {};

      for (const [key, val] of Object.entries(cp)) {
        const k = key.toLowerCase().replace(/#.*$/, "");
        if (k === "title") props.title = String(val.value);
        if (k === "subtitle") props.subtitle = String(val.value);
        if (k === "padding") props.padding = String(val.value).toLowerCase();
      }

      return props;
    },
  },
  Input: {
    import: "Input",
    extractProps: (node) => {
      const props: Record<string, string | boolean> = {};
      const cp = node.componentProperties || {};

      for (const [key, val] of Object.entries(cp)) {
        const k = key.toLowerCase().replace(/#.*$/, "");
        if (k === "label") props.label = String(val.value);
        if (k === "placeholder") props.placeholder = String(val.value);
        if (k === "error") props.error = String(val.value);
        if (k === "disabled") props.disabled = val.value === true || val.value === "true";
      }

      return props;
    },
  },
  Avatar: {
    import: "Avatar",
    extractProps: (node) => {
      const props: Record<string, string | boolean> = {};
      const cp = node.componentProperties || {};

      for (const [key, val] of Object.entries(cp)) {
        const k = key.toLowerCase().replace(/#.*$/, "");
        if (k === "size") props.size = String(val.value).toLowerCase();
        if (k === "initials") props.initials = String(val.value);
        if (k === "src" || k === "image") props.src = String(val.value);
      }

      return props;
    },
  },
  Badge: {
    import: "Badge",
    extractProps: (node) => {
      const props: Record<string, string | boolean> = {};
      const cp = node.componentProperties || {};

      for (const [key, val] of Object.entries(cp)) {
        const k = key.toLowerCase().replace(/#.*$/, "");
        if (k === "label" || k === "text") props.label = String(val.value);
        if (k === "variant") props.variant = String(val.value).toLowerCase();
      }

      if (!props.label && node.children) {
        const textChild = node.children.find((c) => c.type === "TEXT");
        if (textChild?.characters) props.label = textChild.characters;
      }

      return props;
    },
  },
  Divider: {
    import: "Divider",
    extractProps: (node) => {
      const props: Record<string, string | boolean> = {};
      const cp = node.componentProperties || {};

      for (const [key, val] of Object.entries(cp)) {
        const k = key.toLowerCase().replace(/#.*$/, "");
        if (k === "spacing") props.spacing = String(val.value).toLowerCase();
      }

      return props;
    },
  },
  Listitem: {
    import: "Listitem",
    extractProps: (node) => {
      const props: Record<string, string | boolean> = {};
      const cp = node.componentProperties || {};

      for (const [key, val] of Object.entries(cp)) {
        const k = key.toLowerCase().replace(/#.*$/, "");
        props[k] = val.type === "BOOLEAN" ? val.value === true || val.value === "true" : String(val.value);
      }

      if (!props.label && node.children) {
        const textChild = node.children.find((c) => c.type === "TEXT");
        if (textChild?.characters) props.label = textChild.characters;
      }

      return props;
    },
  },
  Chip: {
    import: "Chip",
    extractProps: (node) => {
      const props: Record<string, string | boolean> = {};
      const cp = node.componentProperties || {};

      for (const [key, val] of Object.entries(cp)) {
        const k = key.toLowerCase().replace(/#.*$/, "");
        props[k] = val.type === "BOOLEAN" ? val.value === true || val.value === "true" : String(val.value);
      }

      if (!props.label && node.children) {
        const textChild = node.children.find((c) => c.type === "TEXT");
        if (textChild?.characters) props.label = textChild.characters;
      }

      return props;
    },
  },
  Toggle: {
    import: "Toggle",
    extractProps: (node) => {
      const props: Record<string, string | boolean> = {};
      const cp = node.componentProperties || {};

      for (const [key, val] of Object.entries(cp)) {
        const k = key.toLowerCase().replace(/#.*$/, "");
        props[k] = val.type === "BOOLEAN" ? val.value === true || val.value === "true" : String(val.value);
      }

      if (!props.label && node.children) {
        const textChild = node.children.find((c) => c.type === "TEXT");
        if (textChild?.characters) props.label = textChild.characters;
      }

      return props;
    },
  },
};

export type MatchResult = {
  matched: true;
  componentName: string;
  importName: string;
  props: Record<string, string | boolean>;
  hasChildren: boolean;
} | {
  matched: false;
};

/**
 * Try to match a Figma node to a known component.
 * Matches by name (case-insensitive, ignoring suffixes like "Button/Primary").
 * Also checks custom components from figmanative.config.js.
 */
export function matchComponent(
  node: FigmaNode,
  componentNames: Record<string, string>,
  config?: FigmaNativeConfig
): MatchResult {
  // Resolve the component name
  let name = node.name;

  // If it's an instance, try to get the component name from the components map
  if (node.componentId && componentNames[node.componentId]) {
    name = componentNames[node.componentId];
  }

  // Normalize: "Button/Primary" → "Button", "Card - Large" → "Card"
  const baseName = name.split(/[\/\-\s]/)[0].trim();

  // 1. Check built-in known components
  const match = KNOWN_COMPONENTS[baseName];
  if (match) {
    const props = match.extractProps(node);
    const hasChildren =
      baseName === "Card" && (node.children?.length ?? 0) > 0;

    return {
      matched: true,
      componentName: baseName,
      importName: match.import,
      props,
      hasChildren,
    };
  }

  // 2. Check custom components from config
  if (config?.customComponents) {
    const customMatch = config.customComponents[baseName];
    if (customMatch) {
      const props = extractCustomProps(node, customMatch.propMap);
      return {
        matched: true,
        componentName: baseName,
        importName: customMatch.import || baseName,
        props,
        hasChildren: customMatch.hasChildren ?? false,
      };
    }
  }

  return { matched: false };
}

/**
 * Extract props for a custom component using the configured prop map.
 */
function extractCustomProps(
  node: FigmaNode,
  propMap?: Record<string, string>
): Record<string, string | boolean> {
  const props: Record<string, string | boolean> = {};
  const cp = node.componentProperties || {};

  for (const [key, val] of Object.entries(cp)) {
    const k = key.toLowerCase().replace(/#.*$/, "");

    // Use propMap to rename Figma props to component props
    const mappedName = propMap?.[k] || k;

    if (val.type === "BOOLEAN") {
      props[mappedName] = val.value === true || val.value === "true";
    } else {
      props[mappedName] = String(val.value);
    }
  }

  // Fallback: extract label from first TEXT child
  if (!props.label && !props.text && node.children) {
    const textChild = node.children.find((c) => c.type === "TEXT");
    if (textChild?.characters) props.label = textChild.characters;
  }

  return props;
}

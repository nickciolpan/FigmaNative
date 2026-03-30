/**
 * FIGMA ↔ REACT NATIVE COMPONENT MAP
 *
 * This file documents the 1:1 mapping between Figma components
 * and React Native components. When a designer uses a component
 * in Figma, the developer uses the exact same component name and props.
 *
 * WORKFLOW:
 * 1. Designer builds screen in Figma using these components
 * 2. Developer opens Figma Dev Mode → sees component names + props
 * 3. Developer copies the component tree into React Native
 * 4. Tailwind classes from Figma auto-layout map to NativeWind classes
 *
 * The gap between design and code is just the JSX wrapper.
 */

export const COMPONENT_MAP = {
  // Figma Component Name → Import path
  Button: "src/components/Button",
  Card: "src/components/Card",
  Input: "src/components/Input",
  Avatar: "src/components/Avatar",
  Badge: "src/components/Badge",
  Divider: "src/components/Divider",
} as const;

/**
 * FIGMA AUTO-LAYOUT → NATIVEWIND CHEAT SHEET
 *
 * Figma Auto Layout          →  NativeWind Class
 * ─────────────────────────────────────────────
 * Direction: Vertical        →  flex-col (default)
 * Direction: Horizontal      →  flex-row
 * Gap: 8                     →  gap-2
 * Gap: 12                    →  gap-3
 * Gap: 16                    →  gap-4
 * Padding: 16                →  p-4
 * Padding: 24                →  p-6
 * Align: Center              →  items-center
 * Justify: Space Between     →  justify-between
 * Fill Container             →  flex-1
 * Hug Contents               →  self-start (or omit)
 */

/**
 * FIGMA DESIGN TOKEN → TAILWIND MAPPING
 *
 * Figma Token                →  Tailwind Class
 * ─────────────────────────────────────────────
 * Colors/Primary/600         →  bg-blue-600, text-blue-600
 * Colors/Gray/100            →  bg-gray-100
 * Colors/Gray/900            →  text-gray-900
 * Radius/lg                  →  rounded-lg
 * Radius/2xl                 →  rounded-2xl
 * Shadow/sm                  →  shadow-sm
 * Font/Semibold              →  font-semibold
 * Font/Medium                →  font-medium
 * Text/sm                    →  text-sm
 * Text/base                  →  text-base
 * Text/lg                    →  text-lg
 */

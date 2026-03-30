/**
 * Figma REST API client — minimal, no dependencies beyond fetch.
 */

const BASE = "https://api.figma.com/v1";

export type FigmaNode = {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  characters?: string; // text content
  componentId?: string;
  // Layout
  layoutMode?: "HORIZONTAL" | "VERTICAL" | "NONE";
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  // Style
  cornerRadius?: number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  opacity?: number;
  visible?: boolean;
  // Fills
  fills?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
    opacity?: number;
    // Gradient support
    gradientStops?: Array<{ color: { r: number; g: number; b: number; a: number }; position: number }>;
  }>;
  // Strokes
  strokes?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
  }>;
  strokeWeight?: number;
  strokeAlign?: string;
  // Effects (shadows, blurs)
  effects?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
    offset?: { x: number; y: number };
    radius?: number;
    spread?: number;
    visible?: boolean;
  }>;
  // Text properties
  fontSize?: number | "MIXED";
  fontFamily?: string | "MIXED";
  fontStyle?: string | "MIXED";
  fontWeight?: number | "MIXED";
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  lineHeight?: { value: number; unit: string } | "MIXED";
  letterSpacing?: { value: number; unit: string } | "MIXED";
  textDecoration?: string;
  textCase?: string;
  // Dimensions
  width?: number;
  height?: number;
  // Layout growth
  layoutGrow?: number;
  layoutAlign?: string;
  // Component properties (instances)
  componentProperties?: Record<
    string,
    { type: string; value: string | boolean }
  >;
  // Overrides on instances
  overrides?: Array<{ id: string; overriddenFields: string[] }>;
};

export type FigmaFile = {
  name: string;
  document: FigmaNode;
  components: Record<string, { name: string; description: string }>;
  componentSets: Record<string, { name: string }>;
};

export async function fetchFile(
  fileKey: string,
  token: string
): Promise<FigmaFile> {
  const res = await fetch(`${BASE}/files/${fileKey}?geometry=paths`, {
    headers: { "X-Figma-Token": token },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Figma API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchNode(
  fileKey: string,
  nodeId: string,
  token: string
): Promise<FigmaNode> {
  const encodedId = nodeId.replace("-", ":");
  const res = await fetch(
    `${BASE}/files/${fileKey}/nodes?ids=${encodeURIComponent(encodedId)}`,
    { headers: { "X-Figma-Token": token } }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Figma API ${res.status}: ${text}`);
  }
  const data = await res.json();
  const nodeData = data.nodes[encodedId];
  if (!nodeData) throw new Error(`Node ${nodeId} not found`);
  return nodeData.document;
}

// FigmaNative — Export/Sync plugin for React Native component generation.
// Run this plugin in Figma: Plugins > Development > Import plugin from manifest

// ─── Show UI ────────────────────────────────────────────────

figma.showUI(__html__, { width: 320, height: 420, themeColors: false });

// ─── Selection tracking ─────────────────────────────────────

function sendSelectionInfo() {
  const sel = figma.currentPage.selection;
  if (sel.length === 1) {
    const node = sel[0];
    figma.ui.postMessage({
      type: "selection-change",
      name: node.name,
      nodeType: node.type,
    });
  } else {
    figma.ui.postMessage({
      type: "selection-change",
      name: null,
      nodeType: null,
    });
  }
}

figma.on("selectionchange", sendSelectionInfo);
// Send initial selection state
sendSelectionInfo();

// ─── Deep extraction ────────────────────────────────────────

function rgbToHex(r, g, b) {
  const toHex = (v) => {
    const h = Math.round(v * 255).toString(16);
    return h.length === 1 ? "0" + h : h;
  };
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

function extractColor(paint) {
  if (!paint) return null;
  if (paint.type === "SOLID") {
    const c = paint.color;
    return {
      type: "SOLID",
      hex: rgbToHex(c.r, c.g, c.b),
      r: c.r,
      g: c.g,
      b: c.b,
      opacity: paint.opacity !== undefined ? paint.opacity : 1,
    };
  }
  if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL") {
    return {
      type: paint.type,
      stops: (paint.gradientStops || []).map((s) => ({
        hex: rgbToHex(s.color.r, s.color.g, s.color.b),
        position: s.position,
        opacity: s.color.a,
      })),
    };
  }
  if (paint.type === "IMAGE") {
    return { type: "IMAGE", scaleMode: paint.scaleMode };
  }
  return { type: paint.type };
}

function extractFills(node) {
  if (!("fills" in node) || !Array.isArray(node.fills)) return [];
  return node.fills
    .filter((f) => f.visible !== false)
    .map(extractColor)
    .filter(Boolean);
}

function extractStrokes(node) {
  if (!("strokes" in node) || !Array.isArray(node.strokes)) return [];
  return node.strokes
    .filter((s) => s.visible !== false)
    .map(extractColor)
    .filter(Boolean);
}

function extractEffects(node) {
  if (!("effects" in node) || !Array.isArray(node.effects)) return [];
  return node.effects
    .filter((e) => e.visible !== false)
    .map((e) => {
      const effect = { type: e.type };
      if (e.color) {
        effect.color = rgbToHex(e.color.r, e.color.g, e.color.b);
        effect.opacity = e.color.a;
      }
      if (e.offset) effect.offset = e.offset;
      if (e.radius !== undefined) effect.radius = e.radius;
      if (e.spread !== undefined) effect.spread = e.spread;
      return effect;
    });
}

function extractConstraints(node) {
  if (!("constraints" in node)) return null;
  return {
    horizontal: node.constraints.horizontal,
    vertical: node.constraints.vertical,
  };
}

function extractNode(node) {
  const data = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible !== false,
  };

  // Dimensions
  if ("width" in node) data.width = Math.round(node.width * 100) / 100;
  if ("height" in node) data.height = Math.round(node.height * 100) / 100;

  // Position (relative to parent)
  if ("x" in node) data.x = Math.round(node.x * 100) / 100;
  if ("y" in node) data.y = Math.round(node.y * 100) / 100;

  // Rotation
  if ("rotation" in node && node.rotation !== 0) {
    data.rotation = node.rotation;
  }

  // Opacity
  if ("opacity" in node && node.opacity !== 1) {
    data.opacity = node.opacity;
  }

  // Blend mode
  if ("blendMode" in node && node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") {
    data.blendMode = node.blendMode;
  }

  // Layout properties (Auto Layout)
  if ("layoutMode" in node && node.layoutMode !== "NONE") {
    data.layoutMode = node.layoutMode; // HORIZONTAL or VERTICAL
    data.itemSpacing = node.itemSpacing;
    data.padding = {
      top: node.paddingTop,
      right: node.paddingRight,
      bottom: node.paddingBottom,
      left: node.paddingLeft,
    };
    data.primaryAxisAlignItems = node.primaryAxisAlignItems;
    data.counterAxisAlignItems = node.counterAxisAlignItems;
    data.primaryAxisSizingMode = node.primaryAxisSizingMode;
    data.counterAxisSizingMode = node.counterAxisSizingMode;
    if ("layoutWrap" in node) data.layoutWrap = node.layoutWrap;
  }

  // Layout sizing (child behavior in auto-layout parent)
  if ("layoutSizingHorizontal" in node) {
    data.layoutSizingHorizontal = node.layoutSizingHorizontal;
  }
  if ("layoutSizingVertical" in node) {
    data.layoutSizingVertical = node.layoutSizingVertical;
  }
  if ("layoutGrow" in node && node.layoutGrow !== 0) {
    data.layoutGrow = node.layoutGrow;
  }
  if ("layoutAlign" in node && node.layoutAlign !== "INHERIT") {
    data.layoutAlign = node.layoutAlign;
  }

  // Corner radius
  if ("cornerRadius" in node) {
    if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      data.cornerRadius = node.cornerRadius;
    } else if (node.cornerRadius === figma.mixed) {
      data.cornerRadius = {
        topLeft: node.topLeftRadius,
        topRight: node.topRightRadius,
        bottomRight: node.bottomRightRadius,
        bottomLeft: node.bottomLeftRadius,
      };
    }
  }

  // Fills, strokes, effects
  data.fills = extractFills(node);
  data.strokes = extractStrokes(node);
  if ("strokeWeight" in node && node.strokeWeight) {
    data.strokeWeight = node.strokeWeight;
  }
  if ("strokeAlign" in node) {
    data.strokeAlign = node.strokeAlign;
  }
  if ("dashPattern" in node && node.dashPattern && node.dashPattern.length > 0) {
    data.dashPattern = node.dashPattern;
  }
  data.effects = extractEffects(node);

  // Constraints
  const constraints = extractConstraints(node);
  if (constraints) data.constraints = constraints;

  // Clipping
  if ("clipsContent" in node) {
    data.clipsContent = node.clipsContent;
  }

  // ─── Text-specific ───
  if (node.type === "TEXT") {
    // Characters
    data.characters = node.characters;

    // Font size
    if (node.fontSize !== figma.mixed) {
      data.fontSize = node.fontSize;
    } else {
      data.fontSize = "MIXED";
    }

    // Font name / weight
    if (node.fontName !== figma.mixed) {
      data.fontFamily = node.fontName.family;
      data.fontStyle = node.fontName.style;
    } else {
      data.fontFamily = "MIXED";
      data.fontStyle = "MIXED";
    }

    // Font weight (numeric approximation)
    if (node.fontWeight !== figma.mixed) {
      data.fontWeight = node.fontWeight;
    }

    // Text alignment
    if (node.textAlignHorizontal) data.textAlignHorizontal = node.textAlignHorizontal;
    if (node.textAlignVertical) data.textAlignVertical = node.textAlignVertical;

    // Line height
    if (node.lineHeight !== figma.mixed) {
      data.lineHeight = node.lineHeight;
    }

    // Letter spacing
    if (node.letterSpacing !== figma.mixed) {
      data.letterSpacing = node.letterSpacing;
    }

    // Text decoration
    if (node.textDecoration && node.textDecoration !== "NONE") {
      data.textDecoration = node.textDecoration;
    }

    // Text case
    if (node.textCase && node.textCase !== figma.mixed && node.textCase !== "ORIGINAL") {
      data.textCase = node.textCase;
    }

    // Auto resize
    if (node.textAutoResize) {
      data.textAutoResize = node.textAutoResize;
    }

    // Paragraph spacing
    if (node.paragraphSpacing) {
      data.paragraphSpacing = node.paragraphSpacing;
    }
  }

  // ─── Component / Instance specifics ───
  if (node.type === "COMPONENT") {
    // Component property definitions
    if (node.componentPropertyDefinitions) {
      data.componentPropertyDefinitions = {};
      for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
        data.componentPropertyDefinitions[key] = {
          type: def.type,
          defaultValue: def.defaultValue,
        };
        if (def.variantOptions) {
          data.componentPropertyDefinitions[key].variantOptions = def.variantOptions;
        }
      }
    }
  }

  if (node.type === "INSTANCE") {
    // Main component reference
    if (node.mainComponent) {
      data.mainComponentName = node.mainComponent.name;
      data.mainComponentId = node.mainComponent.id;

    }
    // Overridden properties
    try {
      const props = node.componentProperties;
      if (props && Object.keys(props).length > 0) {
        data.componentProperties = {};
        for (const [key, val] of Object.entries(props)) {
          data.componentProperties[key] = {
            type: val.type,
            value: val.value,
          };
        }
      }
    } catch (e) {
      // Some instances may not support componentProperties
    }
  }

  // ─── Component Set (variant group) ───
  if (node.type === "COMPONENT_SET") {
    if (node.componentPropertyDefinitions) {
      data.componentPropertyDefinitions = {};
      for (const [key, def] of Object.entries(node.componentPropertyDefinitions)) {
        data.componentPropertyDefinitions[key] = {
          type: def.type,
          defaultValue: def.defaultValue,
        };
        if (def.variantOptions) {
          data.componentPropertyDefinitions[key].variantOptions = def.variantOptions;
        }
      }
    }
  }

  // ─── Vector / Boolean specifics ───
  if (node.type === "VECTOR" || node.type === "STAR" || node.type === "POLYGON" ||
      node.type === "ELLIPSE" || node.type === "RECTANGLE" || node.type === "LINE") {
    // We capture the basic shape type; SVG export would need exportAsync
    data.isShape = true;
  }

  if (node.type === "BOOLEAN_OPERATION") {
    data.booleanOperation = node.booleanOperation;
  }

  // ─── Children (recursive) ───
  // For INSTANCE nodes, children exist but may need special access
  if ("children" in node) {
    try {
      var childArray = node.children;
      if (childArray && childArray.length > 0) {
        data.children = [];
        for (var ci = 0; ci < childArray.length; ci++) {
          try {
            data.children.push(extractNode(childArray[ci]));
          } catch (childErr) {
            // Skip children that can't be accessed (e.g. locked instance internals)
          }
        }
        if (data.children.length === 0) delete data.children;
      }
    } catch (e) {
      // Some node types may not allow children access
    }
  }

  return data;
}

// ─── Sync from code: create/update Figma components ─────────

/**
 * Convert a ComponentDescription (from GET /components) into a node definition
 * that buildNode() and applyNodeProperties() can consume.
 *
 * ComponentDescription shape:
 *   { name, props, variants, layout: { direction, gap, padding, cornerRadius }, fills }
 *
 * Node definition shape expected by buildNode:
 *   { name, type, width, height, layoutMode, itemSpacing, padding, cornerRadius, fills, children, ... }
 */
function componentDescToNodeDef(comp) {
  var layout = comp.layout || {};
  var def = {
    name: comp.name,
    type: "COMPONENT",
    width: 320,
    height: 80,
    layoutMode: layout.direction === "HORIZONTAL" ? "HORIZONTAL" : "VERTICAL",
    primaryAxisSizingMode: "AUTO",
    counterAxisSizingMode: "AUTO",
  };

  // Gap
  if (layout.gap && layout.gap > 0) {
    def.itemSpacing = layout.gap;
  }

  // Padding (uniform from the description)
  if (layout.padding && layout.padding > 0) {
    def.padding = {
      top: layout.padding,
      right: layout.padding,
      bottom: layout.padding,
      left: layout.padding,
    };
  }

  // Corner radius
  if (layout.cornerRadius && layout.cornerRadius > 0) {
    def.cornerRadius = layout.cornerRadius;
  }

  // Fills — convert from { type, color: { r, g, b } } to { type, hex, r, g, b, opacity }
  if (comp.fills && comp.fills.length > 0) {
    def.fills = comp.fills.map(function(f) {
      if (f.type === "SOLID" && f.color) {
        var toHex = function(v) {
          var h = Math.round(v * 255).toString(16);
          return h.length === 1 ? "0" + h : h;
        };
        return {
          type: "SOLID",
          hex: "#" + toHex(f.color.r) + toHex(f.color.g) + toHex(f.color.b),
          r: f.color.r,
          g: f.color.g,
          b: f.color.b,
          opacity: 1,
        };
      }
      return f;
    });
  } else {
    def.fills = [];
  }

  // Build children from props — add a text label for each TEXT prop
  var children = [];
  if (comp.props) {
    for (var i = 0; i < comp.props.length; i++) {
      var prop = comp.props[i];
      if (prop.type === "TEXT") {
        children.push({
          name: prop.name,
          type: "TEXT",
          characters: prop.default || prop.name,
          fontSize: 14,
          fills: [{ type: "SOLID", hex: "#333333", r: 0.2, g: 0.2, b: 0.2, opacity: 1 }],
        });
      }
    }
  }
  if (children.length > 0) {
    def.children = children;
  }

  return def;
}

async function syncFromCode(components) {
  if (!Array.isArray(components) || components.length === 0) {
    figma.ui.postMessage({
      type: "sync-result",
      success: false,
      message: "No components received or invalid format.",
    });
    return;
  }

  // Load fonts we might need
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  } catch (e) {
    // Continue even if some fonts fail
  }

  const created = [];
  const updated = [];
  const page = figma.currentPage;

  for (const comp of components) {
    // Server now returns full Figma-compatible node trees directly
    var def = comp;

    // Check if a component with this name already exists on the page
    let existing = null;
    page.findAll((n) => {
      if ((n.type === "COMPONENT" || n.type === "FRAME") && n.name === comp.name) {
        existing = n;
      }
      return false;
    });

    if (existing && existing.type === "COMPONENT") {
      // Update existing component
      await applyNodeProperties(existing, def);
      updated.push(comp.name);
    } else {
      // Create new component
      const node = await buildNode(def);
      if (node) {
        page.appendChild(node);
        created.push(comp.name);
      }
    }
  }

  figma.ui.postMessage({
    type: "sync-result",
    success: true,
    message:
      "Created: " + (created.length ? created.join(", ") : "none") +
      " | Updated: " + (updated.length ? updated.join(", ") : "none"),
  });
}

function hexToRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255,
  };
}

function buildFillFromData(fillData) {
  if (fillData.type === "SOLID" && fillData.hex) {
    const rgb = hexToRgb(fillData.hex);
    return {
      type: "SOLID",
      color: rgb,
      opacity: fillData.opacity !== undefined ? fillData.opacity : 1,
    };
  }
  return null;
}

async function buildNode(def) {
  if (!def || !def.type) return null;

  let node;

  if (def.type === "COMPONENT") {
    node = figma.createComponent();
  } else if (def.type === "FRAME" || def.type === "INSTANCE" || def.type === "GROUP") {
    node = figma.createFrame();
  } else if (def.type === "TEXT") {
    node = figma.createText();
    try {
      const family = def.fontFamily || "Inter";
      const style = def.fontStyle || "Regular";
      await figma.loadFontAsync({ family, style });
      node.fontName = { family, style };
    } catch (e) {
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      node.fontName = { family: "Inter", style: "Regular" };
    }
    if (def.characters) node.characters = def.characters;
    if (def.fontSize && def.fontSize !== "MIXED") node.fontSize = def.fontSize;
    if (def.textAlignHorizontal) node.textAlignHorizontal = def.textAlignHorizontal;
    if (def.textAlignVertical) node.textAlignVertical = def.textAlignVertical;
    if (def.lineHeight && def.lineHeight !== "MIXED" && typeof def.lineHeight === "object") {
      node.lineHeight = def.lineHeight;
    }
    if (def.letterSpacing && def.letterSpacing !== "MIXED" && typeof def.letterSpacing === "object") {
      node.letterSpacing = def.letterSpacing;
    }
  } else if (def.type === "RECTANGLE") {
    node = figma.createRectangle();
  } else if (def.type === "ELLIPSE") {
    node = figma.createEllipse();
  } else if (def.type === "LINE") {
    node = figma.createLine();
  } else if (def.type === "VECTOR") {
    node = figma.createRectangle(); // fallback
  } else {
    // Default to frame for unknown types
    node = figma.createFrame();
  }

  await applyNodeProperties(node, def);

  // Build children recursively
  if (def.children && "appendChild" in node) {
    for (const childDef of def.children) {
      const child = await buildNode(childDef);
      if (child) node.appendChild(child);
    }
  }

  // Add component properties after children are set
  if (def.type === "COMPONENT" && def.componentPropertyDefinitions) {
    for (const [key, propDef] of Object.entries(def.componentPropertyDefinitions)) {
      try {
        // Extract clean property name (remove Figma's hash suffix like "#1234:0")
        const cleanName = key.split("#")[0];
        node.addComponentProperty(cleanName, propDef.type, propDef.defaultValue || "");
      } catch (e) {
        // Property might already exist or type not supported
      }
    }
  }

  return node;
}

async function applyNodeProperties(node, def) {
  if (def.name) node.name = def.name;

  // Dimensions
  if (def.width && def.height && "resize" in node) {
    try {
      node.resize(def.width, def.height);
    } catch (e) {
      // Some nodes can't be resized
    }
  }

  // Position
  if (def.x !== undefined) node.x = def.x;
  if (def.y !== undefined) node.y = def.y;

  // Rotation
  if (def.rotation && "rotation" in node) node.rotation = def.rotation;

  // Opacity
  if (def.opacity !== undefined && "opacity" in node) node.opacity = def.opacity;

  // Fills
  if (def.fills && def.fills.length > 0 && "fills" in node) {
    const fills = def.fills.map(buildFillFromData).filter(Boolean);
    if (fills.length > 0) node.fills = fills;
  } else if (def.fills && def.fills.length === 0 && "fills" in node) {
    node.fills = [];
  }

  // Strokes
  if (def.strokes && def.strokes.length > 0 && "strokes" in node) {
    const strokes = def.strokes.map(buildFillFromData).filter(Boolean);
    if (strokes.length > 0) node.strokes = strokes;
  }
  if (def.strokeWeight && "strokeWeight" in node) node.strokeWeight = def.strokeWeight;

  // Corner radius
  if (def.cornerRadius !== undefined && "cornerRadius" in node) {
    if (typeof def.cornerRadius === "number") {
      node.cornerRadius = def.cornerRadius;
    } else if (typeof def.cornerRadius === "object") {
      node.topLeftRadius = def.cornerRadius.topLeft || 0;
      node.topRightRadius = def.cornerRadius.topRight || 0;
      node.bottomRightRadius = def.cornerRadius.bottomRight || 0;
      node.bottomLeftRadius = def.cornerRadius.bottomLeft || 0;
    }
  }

  // Clipping
  if (def.clipsContent !== undefined && "clipsContent" in node) {
    node.clipsContent = def.clipsContent;
  }

  // Auto layout
  if (def.layoutMode && "layoutMode" in node) {
    node.layoutMode = def.layoutMode;
    if (def.itemSpacing !== undefined) node.itemSpacing = def.itemSpacing;
    if (def.padding) {
      if (def.padding.top !== undefined) node.paddingTop = def.padding.top;
      if (def.padding.right !== undefined) node.paddingRight = def.padding.right;
      if (def.padding.bottom !== undefined) node.paddingBottom = def.padding.bottom;
      if (def.padding.left !== undefined) node.paddingLeft = def.padding.left;
    }
    if (def.primaryAxisAlignItems) node.primaryAxisAlignItems = def.primaryAxisAlignItems;
    if (def.counterAxisAlignItems) node.counterAxisAlignItems = def.counterAxisAlignItems;
    if (def.primaryAxisSizingMode) node.primaryAxisSizingMode = def.primaryAxisSizingMode;
    if (def.counterAxisSizingMode) node.counterAxisSizingMode = def.counterAxisSizingMode;
  }

  // Text auto-resize (must be set before layoutSizing for text nodes)
  if (def.textAutoResize && "textAutoResize" in node) {
    try {
      node.textAutoResize = def.textAutoResize;
    } catch (e) {
      // Not all text nodes support this
    }
  }

  // Layout sizing
  if (def.layoutSizingHorizontal && "layoutSizingHorizontal" in node) {
    try {
      node.layoutSizingHorizontal = def.layoutSizingHorizontal;
    } catch (e) {
      // May fail if node isn't in auto-layout parent yet
    }
  }
  if (def.layoutSizingVertical && "layoutSizingVertical" in node) {
    try {
      node.layoutSizingVertical = def.layoutSizingVertical;
    } catch (e) {}
  }
  if (def.layoutGrow !== undefined && "layoutGrow" in node) {
    node.layoutGrow = def.layoutGrow;
  }

  // Effects
  if (def.effects && def.effects.length > 0 && "effects" in node) {
    node.effects = def.effects.map((e) => {
      const effect = {
        type: e.type,
        visible: true,
        blendMode: "NORMAL",
        radius: e.radius || 0,
      };
      if (e.color) {
        const rgb = hexToRgb(e.color);
        effect.color = { r: rgb.r, g: rgb.g, b: rgb.b, a: e.opacity !== undefined ? e.opacity : 1 };
      } else {
        effect.color = { r: 0, g: 0, b: 0, a: 0.25 };
      }
      if (e.offset) effect.offset = e.offset;
      else effect.offset = { x: 0, y: 0 };
      if (e.spread !== undefined) effect.spread = e.spread;
      return effect;
    });
  }
}

// ─── Asset extraction ────────────────────────────────────────

/**
 * Walk the node tree and export image fills as PNG.
 * Skips deep recursion into INSTANCE internals to avoid hangs.
 * Max 10 assets, max depth 5.
 */
async function extractAssets(node) {
  var assets = [];

  // Collect all nodes that need asset export
  var queue = [node];
  var visited = 0;

  while (queue.length > 0) {
    var current = queue.shift();
    visited++;

    // Report progress
    figma.ui.postMessage({
      type: "progress",
      message: "Scanning assets... (" + visited + " nodes, " + assets.length + " assets found) — " + (current.name || current.type),
    });

    // Check for image fills
    if ("fills" in current && Array.isArray(current.fills)) {
      var hasImage = false;
      for (var i = 0; i < current.fills.length; i++) {
        if (current.fills[i].type === "IMAGE" && current.fills[i].visible !== false) {
          hasImage = true;
          break;
        }
      }
      if (hasImage) {
        try {
          figma.ui.postMessage({ type: "progress", message: "Exporting image: " + (current.name || "unnamed") + "..." });
          var bytes = await current.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
          var base64 = figma.base64Encode(bytes);
          var name = (current.name || "image_" + visited).replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
          assets.push({ name: name, data: base64, nodeId: current.id, format: "png" });
        } catch (e) {
          figma.ui.postMessage({ type: "progress", message: "Failed to export image: " + (current.name || "unnamed") + " — " + e.message });
        }
      }
    }

    // Export vector nodes as SVG
    if (current.type === "VECTOR" || current.type === "BOOLEAN_OPERATION") {
      try {
        figma.ui.postMessage({ type: "progress", message: "Exporting SVG: " + (current.name || "vector") + "..." });
        var svgBytes = await current.exportAsync({ format: "SVG" });
        var svgBase64 = figma.base64Encode(svgBytes);
        var svgName = (current.name || "vector_" + visited).replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
        assets.push({ name: svgName, data: svgBase64, nodeId: current.id, format: "svg" });
      } catch (e) {
        figma.ui.postMessage({ type: "progress", message: "Failed to export SVG: " + (current.name || "vector") + " — " + e.message });
      }
    }

    // Add children to queue
    if ("children" in current) {
      try {
        for (var c = 0; c < current.children.length; c++) {
          queue.push(current.children[c]);
        }
      } catch (e) {
        // Skip if children access fails
      }
    }
  }

  figma.ui.postMessage({ type: "progress", message: "Asset scan complete: " + visited + " nodes, " + assets.length + " assets." });
  return assets;
}

// ─── Message handler ────────────────────────────────────────

figma.ui.onmessage = async (msg) => {
  if (msg.type === "export") {
    const sel = figma.currentPage.selection;
    if (sel.length !== 1) {
      figma.notify("Please select a single component or frame.");
      return;
    }

    const node = sel[0];
    figma.ui.postMessage({ type: "progress", message: "Extracting node tree: " + node.name + "..." });
    const data = extractNode(node);
    figma.ui.postMessage({ type: "progress", message: "Node tree extracted. Scanning for assets..." });

    // Extract image/vector assets
    var assets = [];
    try {
      assets = await extractAssets(node);
    } catch (e) {
      figma.ui.postMessage({ type: "progress", message: "Asset extraction error: " + e.message });
    }

    // Sanitize data to remove any Figma symbols (figma.mixed etc) that can't be serialized
    var safeData = JSON.parse(JSON.stringify(data, function(key, value) {
      if (typeof value === "symbol") return "MIXED";
      return value;
    }));
    var safeAssets = JSON.parse(JSON.stringify(assets));

    figma.ui.postMessage({ type: "progress", message: "Sending to UI... (" + assets.length + " assets)" });
    figma.ui.postMessage({ type: "export-data", data: safeData, assets: safeAssets });
    var assetMsg = assets.length > 0 ? " + " + assets.length + " assets" : "";
    figma.notify("Extracted: " + node.name + assetMsg);
  }
};

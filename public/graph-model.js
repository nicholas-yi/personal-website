export const MAX_SAMPLES = 256;
export const MAX_EDGES = 12;
export const MAX_HISTORY = 20;
export const MIN_STROKE_LENGTH = 24;
export const MOBILE_BREAKPOINT = 740;
export const NODE_PASS_RADIUS = 24;
export const NODE_LIMIT_NOTE = "A little limit: up to 3 dots per line. Kept the first dot, first pass-through, and last dot.";
export const INK_PALETTE = Object.freeze(["#52623e", "#8b5260", "#4b6f86", "#805f38", "#6c5a85", "#34756c"]);

const seed = [
  ["microsoft", "microsoft", "Engineer at Microsoft AI Development and Acceleration since July 2025; post-training since July 2026.", 0],
  ["stashbird", "Stashbird", "Stashbird: Episode-Grounded Lifecycle Reconciliation for Conversational Agent Memory. My co-authored work on keeping conversational memories useful as conversations change.", 1],
  ["graphrag", "GraphRAG", "Microsoft Research work on graph-based retrieval for code, plus co-authored GraphRAG field notes.", 9, "RAG"],
  ["bassoon", "bassoon", "Something I enjoy away from the screen.", 7],
  ["archery", "archery", "Something I enjoy away from the screen.", 6],
  ["photography", "film photography", "Something I enjoy away from the screen.", 4, "film"],
  ["staccato", "Staccato / accessibility", "My brother stutters, so speech accessibility is personal to me. Our Staccato team won the Ability Hack Executive Challenge at the Microsoft Global Hackathon in November 2025.", 3, "speech"],
  ["evaluation", "evaluation", "I build evaluation tools to help research teams test agents and compare their progress.", 2, "eval"],
  ["museums", "art museums", "I've volunteered on archival art documentation at Stanford's Cantor Arts Center and written about Rodin's lasting influence.", 5, "art"],
  ["opensource", "open source", "I like work that others can inspect and build on. Staccato's speech-recognition code is public in Microsoft's GitHub organization.", 8],
];

function failure(code, message) {
  return { ok: false, code, message };
}

function validLayout(layout) {
  return layout && Number.isFinite(layout.width) && layout.width > 0 &&
    Number.isFinite(layout.height) && layout.height > 0;
}

function pointResult(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return failure("invalid-point", "A line needs finite x and y coordinates.");
  }
  return {
    ok: true,
    point: { x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) },
  };
}

function validNodes(nodes) {
  return Array.isArray(nodes) && nodes.length > 0 && nodes.every((node) =>
    node && typeof node.id === "string" && Number.isFinite(node.x) && Number.isFinite(node.y)) &&
    new Set(nodes.map((node) => node.id)).size === nodes.length;
}

export function pairKey(source, target) {
  return connectionKey(source, target);
}

export function createSketch() {
  return {
    nodes: seed.map(([id, label, detail, slot, compactLabel = label]) => {
      const angle = -Math.PI * 3 / 5 + slot * Math.PI / 5;
      return { id, label, compactLabel, detail, angle, x: 0.5 + Math.cos(angle) * 0.36, y: 0.5 + Math.sin(angle) * 0.36 };
    }),
    edges: [],
    nextColorIndex: 0,
  };
}

export function createHistory() {
  return { past: [], future: [] };
}

function checkHistory(history, sketch) {
  if (!history || !Array.isArray(history.past) || !Array.isArray(history.future) ||
    !sketch || !validNodes(sketch.nodes) || !Array.isArray(sketch.edges)) {
    throw new TypeError("Sketch history needs valid past/future stacks and a current sketch.");
  }
}

export function rememberSketch(history, sketch) {
  checkHistory(history, sketch);
  history.past.push(structuredClone(sketch));
  if (history.past.length > MAX_HISTORY) history.past.shift();
  history.future.length = 0;
}

export function undoSketch(history, sketch) {
  checkHistory(history, sketch);
  if (!history.past.length) return failure("no-undo", "Nothing to undo yet.");
  history.future.push(structuredClone(sketch));
  return { ok: true, sketch: history.past.pop() };
}

export function redoSketch(history, sketch) {
  checkHistory(history, sketch);
  if (!history.future.length) return failure("no-redo", "Nothing to redo yet.");
  history.past.push(structuredClone(sketch));
  return { ok: true, sketch: history.future.pop() };
}

export function createConnectionCatalog() {
  return Object.values(CONNECTION_MATRIX).map((entry) => ({
    ...entry, sources: entry.sources.map((link) => ({ ...link })),
  }));
}

export function connectionForPair(source, target) {
  const first = seed.find(([id]) => id === source);
  const second = seed.find(([id]) => id === target);
  if (!first || !second) return failure("unknown-node", "Choose dots that are on this paper.");
  if (source === target) return failure("same-node", "Try reaching a different dot with your line.");
  const entry = CONNECTION_MATRIX[pairKey(source, target)];
  if (!entry) throw new Error(`Missing local connection: ${source} / ${target}`);
  return { ok: true, kind: entry.kind, message: entry.message, sources: entry.sources.map((link) => ({ ...link })) };
}

function checkedRoute(stroke) {
  const ids = stroke.nodeIds === undefined ? [stroke.source, stroke.target] : stroke.nodeIds;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 3) {
    return failure("invalid-route", "A line can connect two or three distinct dots.");
  }
  if (ids.some((id) => !seed.some(([known]) => known === id))) {
    return failure("unknown-node", "Choose dots that are on this paper.");
  }
  if (new Set(ids).size !== ids.length) {
    return failure("same-node", "This line came back to the same dot. Try finishing at a different dot.");
  }
  return { ok: true, nodeIds: [...ids] };
}

function routeMetadata(nodeIds) {
  const connections = nodeIds.slice(1).map((target, index) => {
    const source = nodeIds[index];
    const { kind, message, sources } = connectionForPair(source, target);
    return { source, target, kind, message, sources };
  });
  return {
    source: nodeIds[0],
    target: nodeIds.at(-1),
    connections,
    kind: connections.length === 1 ? connections[0].kind :
      connections[0].kind === connections[1].kind ? "chain" : "mixed",
    message: connections.map((connection) => connection.message).join("\n\n"),
    sources: [...new Map(connections.flatMap((connection) => connection.sources)
      .map((link) => [link.url, { ...link }])).values()],
  };
}

function checkedAnchors(stroke, nodeIds, length) {
  const indices = stroke.anchorIndices ?? (nodeIds.length === 2 ? [0, length - 1] : null);
  if (!Array.isArray(indices) || indices.length !== nodeIds.length ||
    indices.some((index, i) => !Number.isInteger(index) || index < 0 || index >= length ||
      (i > 0 && index <= indices[i - 1])) || indices[0] !== 0 || indices.at(-1) !== length - 1) {
    return failure("invalid-anchors", "Each selected dot needs an ordered anchor on the line.");
  }
  return { ok: true, anchorIndices: [...indices] };
}

// Model coordinates are normalized, but padding and label sizes are actual pixels.
export function clampPosition(position, layout, label = {}) {
  const result = pointResult(position);
  if (!result.ok) return result;
  if (!validLayout(layout)) return failure("invalid-layout", "The paper needs positive width and height.");
  if (!label || typeof label !== "object" || Array.isArray(label)) {
    return failure("invalid-label-size", "Label dimensions must be finite, non-negative numbers.");
  }
  const { width = 0, height = 0, padding = 10 } = label;
  if (![width, height, padding].every((value) => Number.isFinite(value) && value >= 0)) {
    return failure("invalid-label-size", "Label dimensions must be finite, non-negative numbers.");
  }
  const insetX = Math.min(0.5, (width / 2 + padding) / layout.width);
  const insetY = Math.min(0.5, (height / 2 + padding) / layout.height);
  return {
    ok: true,
    point: {
      x: Math.max(insetX, Math.min(1 - insetX, result.point.x)),
      y: Math.max(insetY, Math.min(1 - insetY, result.point.y)),
    },
  };
}

export function layoutNodes(nodes, layout, labels = {}) {
  if (!validNodes(nodes)) return failure("invalid-nodes", "The paper needs valid dots.");
  if (!validLayout(layout)) return failure("invalid-layout", "The paper needs positive width and height.");
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
    return failure("invalid-label-size", "The paper needs a map of label dimensions.");
  }
  let radius = Infinity;
  for (const node of nodes) {
    const dimensions = labels[node.id];
    const checked = clampPosition({ x: 0.5, y: 0.5 }, layout, dimensions);
    if (!checked.ok) return checked;
    const width = dimensions?.width ?? 96;
    const height = dimensions?.height ?? 44;
    const padding = dimensions?.padding ?? 10;
    const cos = Math.abs(Math.cos(node.angle));
    const sin = Math.abs(Math.sin(node.angle));
    if (cos > 1e-8) radius = Math.min(radius, (layout.width / 2 - width / 2 - padding - 2) / cos);
    if (sin > 1e-8) radius = Math.min(radius, (layout.height / 2 - height / 2 - padding - 22) / sin);
  }
  radius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const positioned = [];
  for (const node of nodes) {
    const angle = node.angle;
    const point = Number.isFinite(angle) ? {
      x: 0.5 + Math.cos(angle) * radius / layout.width,
      y: 0.5 + Math.sin(angle) * radius / layout.height,
    } : { x: node.x, y: node.y };
    const clamped = clampPosition(point, layout, labels[node.id]);
    if (!clamped.ok) return clamped;
    positioned.push({ ...node, ...clamped.point });
  }
  return { ok: true, nodes: positioned };
}

export function nearestNode(nodes, point, layout) {
  if (!validNodes(nodes)) return failure("invalid-nodes", "The paper needs valid dots.");
  if (!validLayout(layout)) return failure("invalid-layout", "The paper needs positive width and height.");
  const checked = pointResult(point);
  if (!checked.ok) return checked;
  let nearest = null;
  let distance = Infinity;
  for (const node of nodes) {
    const next = Math.hypot(
      (checked.point.x - node.x) * layout.width,
      (checked.point.y - node.y) * layout.height,
    );
    if (next < distance) {
      nearest = node;
      distance = next;
    }
  }
  return { ok: true, node: nearest, distance };
}

export function appendSample(samples, point) {
  if (!Array.isArray(samples) || samples.length > MAX_SAMPLES ||
    samples.some((sample) => !pointResult(sample).ok)) {
    return failure("invalid-samples", "That line has invalid or too many samples.");
  }
  const checked = pointResult(point);
  if (!checked.ok) return checked;
  const last = samples.at(-1);
  if (last?.x === checked.point.x && last?.y === checked.point.y) {
    return { ok: true, samples, changed: false };
  }
  // Thin the interior periodically; never throw away the first or newest endpoint.
  const kept = samples.length === MAX_SAMPLES
    ? samples.filter((_, index) => index % 2 === 0)
    : samples;
  return { ok: true, samples: [...kept, checked.point], changed: true };
}

function checkedSamples(samples, minimum = 2) {
  if (!Array.isArray(samples) || samples.length < minimum || samples.length > MAX_SAMPLES) {
    return failure("invalid-samples", `A line needs ${minimum}–${MAX_SAMPLES} samples.`);
  }
  const points = [];
  for (const point of samples) {
    const checked = pointResult(point);
    if (!checked.ok) return checked;
    points.push(checked.point);
  }
  return { ok: true, points };
}

export function snapStroke(nodes, samples, layout) {
  if (!validLayout(layout)) return failure("invalid-layout", "The paper needs positive width and height.");
  if (!validNodes(nodes)) return failure("invalid-nodes", "The paper needs valid dots.");
  const checked = checkedSamples(samples);
  if (!checked.ok) return checked;
  const { points } = checked;
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths.at(-1) + Math.hypot(
      (points[i].x - points[i - 1].x) * layout.width,
      (points[i].y - points[i - 1].y) * layout.height,
    ));
  }
  const length = lengths.at(-1);
  if (length < MIN_STROKE_LENGTH) {
    return failure("short-stroke", "A little longer? Draw a line toward a different dot, or tap two dots.");
  }
  const first = nearestNode(nodes, points[0], layout).node;
  const last = nearestNode(nodes, points.at(-1), layout).node;
  const endpoints = checkedRoute({ source: first.id, target: last.id });
  if (!endpoints.ok) return endpoints;
  const passes = [];
  for (const [order, node] of nodes.entries()) {
    if (node.id === first.id || node.id === last.id) continue;
    let closest = null;
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const end = points[i];
      const dx = (end.x - start.x) * layout.width;
      const dy = (end.y - start.y) * layout.height;
      const squared = dx * dx + dy * dy;
      const t = squared === 0 ? 0 : Math.max(0, Math.min(1,
        ((node.x - start.x) * layout.width * dx + (node.y - start.y) * layout.height * dy) / squared));
      const projected = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
      const distance = Math.hypot((node.x - projected.x) * layout.width, (node.y - projected.y) * layout.height);
      const at = lengths[i - 1] + Math.sqrt(squared) * t;
      const interior = at > MIN_STROKE_LENGTH / 2 && at < length - MIN_STROKE_LENGTH / 2;
      if (distance > NODE_PASS_RADIUS || !interior) {
        if (closest) break;
        continue;
      }
      if (!closest || distance < closest.distance) closest = { node, segment: i, at, distance, order };
      // Finish the first pass when the pen leaves this dot's radius; revisits do not add another dot.
      if (Math.hypot((node.x - end.x) * layout.width, (node.y - end.y) * layout.height) > NODE_PASS_RADIUS) break;
    }
    if (closest) passes.push(closest);
  }
  passes.sort((a, b) => a.at - b.at || a.order - b.order);
  const middle = passes[0];
  const nodeIds = middle ? [first.id, middle.node.id, last.id] : [first.id, last.id];
  const route = checkedRoute({ nodeIds });
  if (!route.ok) return route;
  points[0] = { x: first.x, y: first.y };
  points[points.length - 1] = { x: last.x, y: last.y };
  const anchorIndices = [0];
  if (middle) {
    points.splice(middle.segment, 0, { x: middle.node.x, y: middle.node.y });
    anchorIndices.push(middle.segment);
  }
  anchorIndices.push(points.length - 1);
  if (points.length > MAX_SAMPLES) {
    // At most one anchor was inserted. Drop the least distinctive non-anchor sample.
    let remove = -1;
    let error = Infinity;
    for (let i = 1; i < points.length - 1; i++) {
      if (anchorIndices.includes(i)) continue;
      const previous = points[i - 1];
      const next = points[i + 1];
      const deviation = Math.abs((points[i].x - previous.x) * (next.y - previous.y) -
        (points[i].y - previous.y) * (next.x - previous.x));
      if (deviation < error) {
        error = deviation;
        remove = i;
      }
    }
    points.splice(remove, 1);
    for (let i = 0; i < anchorIndices.length; i++) {
      if (anchorIndices[i] > remove) anchorIndices[i]--;
    }
  }
  return {
    ok: true, nodeIds, anchorIndices, points, capped: passes.length > 1,
    ...routeMetadata(nodeIds),
    note: passes.length > 1 ? NODE_LIMIT_NOTE : "",
  };
}

export function connectNodes(nodes, source, target) {
  if (!validNodes(nodes)) return failure("invalid-nodes", "The paper needs valid dots.");
  const connection = connectionForPair(source, target);
  if (!connection.ok) return connection;
  const first = nodes.find((node) => node.id === source);
  const last = nodes.find((node) => node.id === target);
  if (!first || !last) return failure("unknown-node", "Choose dots that are on this paper.");
  return {
    ok: true,
    ...routeMetadata([source, target]),
    nodeIds: [source, target],
    anchorIndices: [0, 2],
    capped: false,
    note: "",
    points: [
      { x: first.x, y: first.y },
      { x: (first.x + last.x) / 2, y: Math.max(0, (first.y + last.y) / 2 - 0.04) },
      { x: last.x, y: last.y },
    ],
  };
}

export function retainStroke(sketch, stroke) {
  if (!sketch || !validNodes(sketch.nodes) || !Array.isArray(sketch.edges) || sketch.edges.length > MAX_EDGES ||
    !Number.isInteger(sketch.nextColorIndex) || sketch.nextColorIndex < 0 || sketch.nextColorIndex >= INK_PALETTE.length) {
    return failure("invalid-sketch", "Start with a valid sketch.");
  }
  if (!stroke) return failure("invalid-stroke", "Draw a line first.");
  const route = checkedRoute(stroke);
  if (!route.ok) return route;
  const { nodeIds } = route;
  if (!nodeIds.every((id) => sketch.nodes.some((node) => node.id === id))) {
    return failure("unknown-node", "Choose dots that are on this paper.");
  }
  const checked = checkedSamples(stroke.points);
  if (!checked.ok) return checked;
  const anchors = checkedAnchors(stroke, nodeIds, checked.points.length);
  if (!anchors.ok) return anchors;
  const id = [nodeIds.join("--"), [...nodeIds].reverse().join("--")].sort()[0];
  const existing = sketch.edges.findIndex((edge) => edge.id === id);
  const replaced = existing !== -1;
  const edge = {
    id, nodeIds, anchorIndices: anchors.anchorIndices, points: checked.points,
    ...routeMetadata(nodeIds),
    capped: stroke.capped === true,
    note: stroke.capped === true ? NODE_LIMIT_NOTE : "",
    colorIndex: sketch.nextColorIndex,
    color: INK_PALETTE[sketch.nextColorIndex],
  };
  if (replaced) sketch.edges.splice(existing, 1);
  sketch.edges.push(edge);
  const discarded = sketch.edges.length > MAX_EDGES ? sketch.edges.shift() : null;
  sketch.nextColorIndex = (sketch.nextColorIndex + 1) % INK_PALETTE.length;
  return { ok: true, edge, replaced, discarded };
}

export function reprojectStroke(edge, nodes) {
  if (!validNodes(nodes)) return failure("invalid-nodes", "The paper needs valid dots.");
  if (!edge) return failure("invalid-stroke", "Draw a line first.");
  const route = checkedRoute(edge);
  if (!route.ok) return route;
  const checked = checkedSamples(edge.points);
  if (!checked.ok) return checked;
  const anchors = checkedAnchors(edge, route.nodeIds, checked.points.length);
  if (!anchors.ok) return anchors;
  const selected = route.nodeIds.map((id) => nodes.find((node) => node.id === id));
  if (selected.some((node) => !node)) return failure("unknown-node", "Choose dots that are on this paper.");
  selected.forEach((node, i) => {
    checked.points[anchors.anchorIndices[i]] = { x: node.x, y: node.y };
  });
  return { ok: true, points: checked.points, anchorIndices: anchors.anchorIndices };
}

export function strokePath(samples, layout, anchorIndices = null) {
  if (!validLayout(layout)) return failure("invalid-layout", "The paper needs positive width and height.");
  const checked = checkedSamples(samples, 1);
  if (!checked.ok) return checked;
  const anchors = anchorIndices ?? (checked.points.length === 1 ? [0] : [0, checked.points.length - 1]);
  if (!Array.isArray(anchors) || anchors.length === 0 || anchors[0] !== 0 || anchors.at(-1) !== checked.points.length - 1 ||
    anchors.some((index, i) => !Number.isInteger(index) || index < 0 || index >= checked.points.length ||
      (i > 0 && index <= anchors[i - 1]))) {
    return failure("invalid-anchors", "The ink needs ordered anchors on the line.");
  }
  const points = checked.points.map((point) => ({ x: point.x * layout.width, y: point.y * layout.height }));
  const xy = (point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  let d = `M ${xy(points[0])}`;
  for (let part = 1; part < anchors.length; part++) {
    const end = anchors[part];
    for (let i = anchors[part - 1] + 1; i < end; i += 1) {
      const middle = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
      d += ` Q ${xy(points[i])} ${xy(middle)}`;
    }
    d += ` L ${xy(points[end])}`;
  }
  if (points.length === 1) d += ` L ${xy(points[0])}`;
  return { ok: true, d };
}
import { CONNECTION_MATRIX, connectionKey } from "./connection-matrix.js";
export { PAPER_URL, ARTICLE_URL } from "./connection-matrix.js";

import test from "node:test";
import assert from "node:assert/strict";
import {
  ARTICLE_URL, MAX_EDGES, MAX_SAMPLES, PAPER_URL,
  appendSample, clampPosition, connectNodes, connectionForPair,
  createConnectionCatalog, createSketch, layoutNodes, nearestNode,
  pairKey, reprojectStroke, retainStroke, snapStroke, strokePath,
  INK_PALETTE, NODE_LIMIT_NOTE,
  MAX_HISTORY, createHistory, rememberSketch, undoSketch, redoSketch,
  MOBILE_BREAKPOINT,
} from "../public/graph-model.js";
import { CONNECTION_MATRIX, STACCATO_URL } from "../public/connection-matrix.js";

const desktop = { width: 800, height: 430 };
const mobile = { width: 288, height: 460 };
const point = (node) => ({ x: node.x, y: node.y });

test("the blank sketch has ten approved nodes, supplied facts, and no fabricated edges", () => {
  const sketch = createSketch();
  assert.deepEqual(sketch.nodes.map((node) => [node.id, node.label]), [
    ["microsoft", "microsoft"], ["stashbird", "Stashbird"], ["graphrag", "GraphRAG"],
    ["bassoon", "bassoon"], ["archery", "archery"], ["photography", "film photography"],
    ["staccato", "Staccato / accessibility"], ["evaluation", "evaluation"], ["museums", "art museums"],
    ["opensource", "open source"],
  ]);
  assert.deepEqual(sketch.edges, []);
  assert.match(sketch.nodes[0].detail, /July 2025.*post-training/);
  assert.ok(!sketch.nodes.some((node) => node.id === "cmu"));
  assert.ok(!sketch.nodes.some((node) => ["memory", "outdoors", "cooking"].includes(node.id)));
  assert.match(sketch.nodes.find((node) => node.id === "staccato").detail, /Ability Hack.*November 2025/);
  assert.match(sketch.nodes.find((node) => node.id === "museums").detail, /Stanford's Cantor Arts Center/);
  assert.match(sketch.nodes.find((node) => node.id === "stashbird").detail, /Stashbird: Episode-Grounded Lifecycle Reconciliation for Conversational Agent Memory/);
  assert.equal(sketch.nodes.find((node) => node.id === "stashbird").compactLabel, "Stashbird");
  assert.equal(sketch.nodes[0].compactLabel, "microsoft");
  for (const node of sketch.nodes) {
    assert.ok(node.x > 0 && node.x < 1 && node.y > 0 && node.y < 1);
    assert.ok(Number.isFinite(node.angle));
    assert.ok(typeof node.compactLabel === "string" && node.compactLabel.length > 0);
  }
});

test("the local matrix covers all 45 pairs, with distinct facts and playful parallels", () => {
  const catalog = createConnectionCatalog();
  assert.equal(catalog.length, 45);
  assert.equal(Object.keys(CONNECTION_MATRIX).length, 45);
  assert.equal(catalog.filter((entry) => entry.kind === "known").length, 13);
  assert.equal(catalog.filter((entry) => entry.kind === "playful").length, 32);
  assert.equal(new Set(catalog.map((entry) => pairKey(entry.source, entry.target))).size, catalog.length);
  assert.equal(new Set(catalog.map((entry) => entry.message)).size, 45);
  const nodes = createSketch().nodes;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const key = pairKey(nodes[i].id, nodes[j].id);
      assert.ok(Object.hasOwn(CONNECTION_MATRIX, key), key);
      assert.ok(connectionForPair(nodes[i].id, nodes[j].id).message.length > 40);
    }
  }
  for (const entry of catalog) {
    assert.ok(["known", "playful"].includes(entry.kind));
    assert.deepEqual(connectionForPair(entry.source, entry.target), connectionForPair(entry.target, entry.source));
    for (const source of entry.sources) assert.ok([PAPER_URL, ARTICLE_URL, STACCATO_URL].includes(source.url));
    if (entry.kind === "playful") assert.deepEqual(entry.sources, []);
  }
  const research = connectionForPair("microsoft", "stashbird");
  assert.match(research.message, /Episode-Grounded Lifecycle Reconciliation for Conversational Agent Memory/);
  assert.equal(research.sources[0].url, PAPER_URL);
  assert.equal(connectionForPair("microsoft", "graphrag").sources[0].url, ARTICLE_URL);
  assert.equal(connectionForPair("stashbird", "graphrag").sources.length, 2);
  assert.equal(connectionForPair("microsoft", "staccato").sources[0].url, STACCATO_URL);
  assert.equal(connectionForPair("staccato", "opensource").sources[0].url, STACCATO_URL);
  assert.match(connectionForPair("microsoft", "evaluation").message, /Microsoft AI Development and Acceleration/);
  assert.match(connectionForPair("archery", "photography").message, /Things I enjoy away from the screen/);
});

test("previously generic pairings now reveal authored parallels, not fabricated facts", () => {
  const result = connectionForPair("opensource", "bassoon");
  assert.equal(result.ok, true);
  assert.equal(result.kind, "playful");
  assert.match(result.message, /someone else play a piece/);
  assert.deepEqual(result.sources, []);
  assert.equal(Object.isFrozen(CONNECTION_MATRIX), true);
  assert.equal(Object.isFrozen(CONNECTION_MATRIX["bassoon--opensource"]), true);
});

test("nearest-node search uses pixel distance, not normalized distance on a rectangle", () => {
  const nodes = [
    { id: "microsoft", x: 0.6, y: 0.5 },
    { id: "evaluation", x: 0.5, y: 0.7 },
  ];
  assert.equal(nearestNode(nodes, { x: 0.5, y: 0.5 }, { width: 1000, height: 100 }).node.id, "evaluation");
  assert.equal(nearestNode(nodes, { x: 0.5, y: 0.5 }, { width: 100, height: 1000 }).node.id, "microsoft");
  assert.ok(Math.abs(nearestNode(nodes, { x: 0.5, y: 0.5 }, { width: 1000, height: 100 }).distance - 20) < 0.00001);
});

test("a scribble snaps only its endpoints and retains interior hand-drawn samples", () => {
  const nodes = layoutNodes(createSketch().nodes, desktop).nodes;
  const first = nodes.find((node) => node.id === "stashbird");
  const last = nodes.find((node) => node.id === "evaluation");
  const samples = [
    { x: first.x + 0.01, y: first.y + 0.01 },
    { x: 0.4, y: 0.45 },
    { x: 0.22, y: 0.37 },
    { x: last.x - 0.01, y: last.y - 0.01 },
  ];
  const original = structuredClone(samples);
  const result = snapStroke([first, last], samples, desktop);
  assert.equal(result.ok, true);
  assert.equal(result.kind, "known");
  assert.equal(result.source, first.id);
  assert.equal(result.target, last.id);
  assert.deepEqual(result.points[0], point(first));
  assert.deepEqual(result.points.at(-1), point(last));
  assert.deepEqual(result.points.slice(1, -1), samples.slice(1, -1));
  assert.deepEqual(samples, original);
});

test("short strokes and returning to the same nearest node never invent a second endpoint", () => {
  const nodes = layoutNodes(createSketch().nodes, desktop).nodes;
  const start = point(nodes[0]);
  assert.equal(snapStroke(nodes, [start, { x: start.x + 0.001, y: start.y }], desktop).code, "short-stroke");
  assert.equal(snapStroke(nodes, [
    start, { x: 0.5, y: 0.5 }, { x: start.x + 0.001, y: start.y },
  ], desktop).code, "same-node");
  const sketch = createSketch();
  assert.equal(retainStroke(sketch, { source: "evaluation", target: "evaluation", points: [start, start] }).code, "same-node");
  assert.equal(sketch.edges.length, 0);
});

test("live samples are bounded, pure, and keep the original and latest endpoint", () => {
  const first = { x: 0.12, y: 0.34 };
  let samples = [first];
  for (let i = 0; i < 3000; i += 1) {
    const before = structuredClone(samples);
    const next = { x: (i % 100) / 100, y: ((i * 3) % 100) / 100 };
    const result = appendSample(samples, next);
    assert.equal(result.ok, true);
    assert.deepEqual(samples, before);
    samples = result.samples;
    assert.ok(samples.length <= MAX_SAMPLES);
    assert.deepEqual(samples[0], first);
    assert.deepEqual(samples.at(-1), next);
  }
  assert.equal(appendSample(samples, samples.at(-1)).changed, false);
  assert.deepEqual(appendSample([], { x: -3, y: 4 }).samples, [{ x: 0, y: 1 }]);
});

test("retained edges discard the oldest at the cap; reversed duplicates redraw without growth", () => {
  const sketch = createSketch();
  const nodes = layoutNodes(sketch.nodes, desktop).nodes;
  const pairs = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) pairs.push([nodes[i].id, nodes[j].id]);
  }
  for (const [a, b] of pairs.slice(0, MAX_EDGES + 1)) {
    assert.equal(retainStroke(sketch, connectNodes(nodes, a, b)).ok, true);
    assert.ok(sketch.edges.length <= MAX_EDGES);
  }
  assert.equal(sketch.edges.length, MAX_EDGES);
  assert.equal(sketch.edges.some((edge) => edge.id === pairKey(...pairs[0])), false);
  const [a, b] = pairs[1];
  const redrawn = connectNodes(nodes, b, a);
  redrawn.points[1] = { x: 0.42, y: 0.42 };
  const saved = retainStroke(sketch, redrawn);
  assert.equal(saved.replaced, true);
  assert.equal(sketch.edges.length, MAX_EDGES);
  assert.equal(sketch.edges.at(-1).id, pairKey(a, b));
  assert.deepEqual(sketch.edges.at(-1).points[1], { x: 0.42, y: 0.42 });
});

test("retaining a stroke cannot promote playful parallels to factual claims", () => {
  const sketch = createSketch();
  const line = connectNodes(sketch.nodes, "opensource", "bassoon");
  line.kind = "known";
  line.message = "an invented accomplishment";
  line.sources = [{ label: "not supplied", url: "https://example.com" }];
  const result = retainStroke(sketch, line);
  assert.equal(result.edge.kind, "playful");
  assert.match(result.edge.message, /someone else play a piece/);
  assert.deepEqual(result.edge.sources, []);
});

test("tap/keyboard connections are pointer-agnostic and immediately carry the right facts", () => {
  const nodes = layoutNodes(createSketch().nodes, mobile).nodes;
  const result = connectNodes(nodes, "microsoft", "graphrag");
  assert.equal(result.ok, true);
  assert.equal(result.kind, "known");
  assert.equal(result.points.length, 3);
  assert.equal(result.sources[0].url, ARTICLE_URL);
  assert.deepEqual(result.points[0], point(nodes.find((node) => node.id === "microsoft")));
  assert.equal("pointerId" in result, false);
});

test("responsive node positions clamp full label bounds on narrow and rectangular paper", () => {
  const sketch = createSketch();
  const labels = Object.fromEntries(sketch.nodes.map((node) => [node.id, { width: 116, height: 44, padding: 10 }]));
  for (const width of [256, 288, 358, 620, 804]) {
    const layout = { width, height: 400 };
    const result = layoutNodes(sketch.nodes, layout, labels);
    assert.equal(result.ok, true);
    for (const node of result.nodes) {
      assert.ok(node.x * width >= 68 - 0.00001);
      assert.ok(node.x * width <= width - 68 + 0.00001);
      assert.ok(node.y * 400 >= 32);
      assert.ok(node.y * 400 <= 368);
    }
  }
  const phone = layoutNodes(sketch.nodes, mobile).nodes;
  assert.ok(phone[0].x < 0.5);
  assert.equal(phone[0].y, Math.min(...phone.map((node) => node.y)));
  assert.equal(phone.find((node) => node.id === "archery").y, Math.max(...phone.map((node) => node.y)));
  assert.ok(phone.find((node) => node.id === "evaluation").x > 0.5);
  assert.ok(phone.find((node) => node.id === "graphrag").x < 0.5);
  assert.equal(new Set(phone.map((node) => node.y.toFixed(5))).size, 5);
  assert.deepEqual(clampPosition({ x: -1, y: 2 }, mobile, { width: 100, height: 40 }).point, {
    x: 60 / 288, y: 1 - 30 / 460,
  });
  assert.deepEqual(clampPosition({ x: 0, y: 0 }, { width: 10, height: 10 }, { width: 100, height: 100 }).point, { x: 0.5, y: 0.5 });
});

test("resize reprojection keeps scribble interiors and attaches ends to the new fixed layout", () => {
  const sketch = createSketch();
  const oldNodes = layoutNodes(sketch.nodes, desktop).nodes;
  const newNodes = layoutNodes(sketch.nodes, mobile).nodes;
  const stroke = connectNodes(oldNodes, "microsoft", "photography");
  const original = structuredClone(stroke);
  const resized = reprojectStroke(stroke, newNodes);
  assert.equal(resized.ok, true);
  assert.deepEqual(resized.points[0], point(newNodes[0]));
  assert.deepEqual(resized.points.at(-1), point(newNodes.find((node) => node.id === "photography")));
  assert.deepEqual(resized.points[1], stroke.points[1]);
  assert.deepEqual(stroke, original);
});

test("the smooth SVG helper retains both endpoints without depending on DOM or pointer types", () => {
  const result = strokePath([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.5 }, { x: 0.8, y: 0.9 }], desktop);
  assert.equal(result.ok, true);
  assert.match(result.d, /^M 80\.0 86\.0 Q /);
  assert.match(result.d, / L 640\.0 387\.0$/);
  assert.equal(strokePath([{ x: 0, y: 0 }], desktop).ok, true);
});

test("the constellation uses one physical radius, not an ellipse, at every breakpoint", () => {
  const sketch = createSketch();
  for (const width of [265, 288, 358, 620, 804]) {
    const height = Math.max(330, Math.min(560, width * 0.7));
    const compact = width < MOBILE_BREAKPOINT;
    const labels = Object.fromEntries(sketch.nodes.map((node) => [node.id, {
      width: compact ? ["microsoft", "stashbird"].includes(node.id) ? 53 : 44 : Math.min(width / 4 - 14, node.label.length * 6.9 + 29),
      height: 44, padding: 10,
    }]));
    const result = layoutNodes(sketch.nodes, { width, height }, labels);
    assert.equal(result.ok, true);
    const radii = result.nodes.map((node) => Math.hypot((node.x - 0.5) * width, (node.y - 0.5) * height));
    assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-8);
    assert.ok(Math.min(...radii) > 85);
    for (const node of result.nodes) {
      const dx = (node.x - 0.5) * width;
      const dy = (node.y - 0.5) * height;
      assert.ok(Math.abs(Math.atan2(dy, dx) - Math.atan2(Math.sin(node.angle), Math.cos(node.angle))) < 1e-8);
    }
    for (let i = 0; i < result.nodes.length; i++) {
      for (let j = i + 1; j < result.nodes.length; j++) {
        const a = result.nodes[i], b = result.nodes[j];
        const overlaps = Math.abs(a.x - b.x) * width < (labels[a.id].width + labels[b.id].width) / 2 &&
          Math.abs(a.y - b.y) * height < 44;
        assert.equal(overlaps, false, `Labels ${a.id}/${b.id} overlap at ${width}px`);
      }
    }
  }
});

test("unknown dots and invalid input produce explicit results without mutating a sketch", () => {
  const sketch = createSketch();
  const snapshot = structuredClone(sketch);
  for (const ids of [["missing", "evaluation"], ["evaluation", "missing"], [null, "bassoon"]]) {
    assert.equal(connectionForPair(...ids).code, "unknown-node");
    assert.equal(connectNodes(sketch.nodes, ...ids).code, "unknown-node");
    assert.equal(retainStroke(sketch, { source: ids[0], target: ids[1], points: [] }).code, "unknown-node");
  }
  assert.equal(connectNodes(sketch.nodes, "evaluation", "evaluation").code, "same-node");
  assert.equal(connectNodes([], "evaluation", "bassoon").code, "invalid-nodes");
  assert.equal(nearestNode([], { x: 0, y: 0 }, desktop).code, "invalid-nodes");
  assert.equal(nearestNode(sketch.nodes, { x: NaN, y: 0 }, desktop).code, "invalid-point");
  assert.equal(nearestNode(sketch.nodes, { x: 0, y: 0 }, { width: 0, height: 2 }).code, "invalid-layout");
  assert.equal(snapStroke(sketch.nodes, [], desktop).code, "invalid-samples");
  assert.equal(snapStroke(sketch.nodes, [{ x: 0, y: 0 }, { x: Infinity, y: 1 }], desktop).code, "invalid-point");
  assert.equal(snapStroke(sketch.nodes, [], null).code, "invalid-layout");
  assert.equal(appendSample(null, { x: 0, y: 0 }).code, "invalid-samples");
  assert.equal(appendSample([], null).code, "invalid-point");
  assert.equal(appendSample(Array(MAX_SAMPLES + 1).fill({ x: 0, y: 0 }), { x: 0, y: 0 }).code, "invalid-samples");
  assert.equal(layoutNodes(sketch.nodes, desktop, { evaluation: { width: -1 } }).code, "invalid-label-size");
  assert.equal(layoutNodes(sketch.nodes, desktop, null).code, "invalid-label-size");
  assert.equal(clampPosition({ x: 0, y: 0 }, desktop, null).code, "invalid-label-size");
  assert.equal(layoutNodes(sketch.nodes, { width: 1, height: -1 }).code, "invalid-layout");
  assert.equal(retainStroke(null, null).code, "invalid-sketch");
  assert.equal(retainStroke(sketch, null).code, "invalid-stroke");
  assert.equal(reprojectStroke(null, sketch.nodes).code, "invalid-stroke");
  assert.equal(reprojectStroke({ source: "missing", target: "evaluation", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, sketch.nodes).code, "unknown-node");
  assert.equal(strokePath([], desktop).code, "invalid-samples");
  assert.equal(strokePath([{ x: 0, y: 0 }], {}).code, "invalid-layout");
  assert.deepEqual(sketch, snapshot);
});

test("reset and catalog access isolate all nodes, ink, labels, samples, and sources", () => {
  const sketch = createSketch();
  const original = createSketch();
  const line = connectNodes(sketch.nodes, "stashbird", "evaluation");
  retainStroke(sketch, line);
  line.points[0].x = 0.99;
  assert.notEqual(sketch.edges[0].points[0].x, 0.99);
  sketch.nodes[0].label = "edited";
  sketch.edges[0].sources[0].url = "edited";
  const catalog = createConnectionCatalog();
  const sourced = catalog.find((entry) => entry.source === "stashbird" && entry.target === "evaluation");
  sourced.sources[0].url = "edited";
  assert.deepEqual(createSketch(), original);
  assert.equal(connectionForPair("stashbird", "evaluation").sources[0].url, PAPER_URL);
  assert.equal(createConnectionCatalog().find((entry) => entry.source === "stashbird" && entry.target === "evaluation").sources[0].url, PAPER_URL);
});

const lineNodes = (ids) => ids.map((id, i) => ({ id, label: id, x: 0.1 + i * 0.8 / (ids.length - 1), y: 0.5 }));

test("a sparse two-sample stroke detects and exactly anchors an interior third node", () => {
  const nodes = lineNodes(["microsoft", "stashbird", "evaluation"]);
  const result = snapStroke(nodes, [point(nodes[0]), point(nodes[2])], desktop);
  assert.equal(result.ok, true);
  assert.deepEqual(result.nodeIds, ["microsoft", "stashbird", "evaluation"]);
  assert.deepEqual(result.anchorIndices, [0, 1, 2]);
  assert.deepEqual(result.points, nodes.map(point));
  assert.equal(result.connections.length, 2);
  assert.match(result.connections[1].message, /evaluating memory systems/);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, PAPER_URL);
  assert.equal(result.capped, false);
  const path = strokePath(result.points, desktop, result.anchorIndices);
  assert.ok(path.d.includes(` L ${(desktop.width / 2).toFixed(1)} ${(desktop.height / 2).toFixed(1)}`));
});

test("a fourth encountered dot is explicitly capped without growing the pair matrix", () => {
  const nodes = lineNodes(["microsoft", "stashbird", "graphrag", "evaluation"]);
  const result = snapStroke(nodes, [point(nodes[0]), point(nodes[3])], desktop);
  assert.equal(result.ok, true);
  assert.deepEqual(result.nodeIds, ["microsoft", "stashbird", "evaluation"]);
  assert.equal(result.capped, true);
  assert.equal(result.note, NODE_LIMIT_NOTE);
  assert.equal(result.connections.length, 2);
  assert.ok(!result.connections.some((connection) => connection.source === "graphrag" || connection.target === "graphrag"));
  assert.equal(Object.keys(CONNECTION_MATRIX).length, 45);
});

test("passing a node repeatedly adds it once, while same-endpoint loops get an explicit retry", () => {
  const nodes = lineNodes(["microsoft", "stashbird", "evaluation"]);
  const samples = [point(nodes[0]), point(nodes[1]), { x: 0.5, y: 0.8 }, point(nodes[1]), point(nodes[2])];
  const result = snapStroke(nodes, samples, desktop);
  assert.equal(result.ok, true);
  assert.deepEqual(result.nodeIds, ["microsoft", "stashbird", "evaluation"]);
  assert.equal(new Set(result.nodeIds).size, 3);
  assert.equal(snapStroke(nodes, [point(nodes[0]), point(nodes[1]), point(nodes[0])], desktop).code, "same-node");
});

test("three-node ink reattaches every anchor after resizing and preserves freehand interiors", () => {
  const nodes = lineNodes(["microsoft", "stashbird", "evaluation"]);
  const samples = [point(nodes[0]), { x: 0.3, y: 0.54 }, point(nodes[1]), { x: 0.7, y: 0.48 }, point(nodes[2])];
  const original = snapStroke(nodes, samples, desktop);
  const resizedNodes = nodes.map((node, i) => ({ ...node, x: 0.2 + i * 0.25, y: 0.2 + i * 0.2 }));
  const projected = reprojectStroke(original, resizedNodes);
  assert.equal(projected.ok, true);
  original.anchorIndices.forEach((index, i) => assert.deepEqual(projected.points[index], point(resizedNodes[i])));
  projected.points.forEach((sample, index) => {
    if (!original.anchorIndices.includes(index)) assert.deepEqual(sample, original.points[index]);
  });
});

test("inserting an interior anchor never exceeds the live sample budget", () => {
  const nodes = lineNodes(["microsoft", "stashbird", "evaluation"]);
  const samples = Array.from({ length: MAX_SAMPLES }, (_, i) => ({ x: 0.1 + 0.8 * i / (MAX_SAMPLES - 1), y: 0.5 }));
  const result = snapStroke(nodes, samples, desktop);
  assert.equal(result.ok, true);
  assert.equal(result.points.length, MAX_SAMPLES);
  result.anchorIndices.forEach((index, i) => assert.deepEqual(result.points[index], point(nodes[i])));
  assert.equal(new Set(result.anchorIndices).size, 3);
});

test("stroke colors advance and wrap, including redraws of the same route", () => {
  const sketch = createSketch();
  for (let i = 0; i < INK_PALETTE.length + 2; i++) {
    const saved = retainStroke(sketch, connectNodes(sketch.nodes, "microsoft", "stashbird"));
    assert.equal(saved.ok, true);
    assert.equal(saved.edge.color, INK_PALETTE[i % INK_PALETTE.length]);
    assert.equal(saved.edge.colorIndex, i % INK_PALETTE.length);
    assert.equal(sketch.edges.length, 1);
  }
  assert.equal(new Set(INK_PALETTE).size, INK_PALETTE.length);
  assert.equal(createSketch().nextColorIndex, 0);
});

test("reversed three-dot routes redraw the same retained line and cannot invent metadata", () => {
  const nodes = lineNodes(["microsoft", "stashbird", "bassoon"]);
  const sketch = createSketch();
  const first = snapStroke(nodes, [point(nodes[0]), point(nodes[2])], desktop);
  first.kind = "known";
  first.message = "invented";
  first.connections = [{ kind: "known", message: "invented", sources: [] }];
  const saved = retainStroke(sketch, first);
  assert.equal(saved.ok, true);
  assert.equal(saved.edge.connections.length, 2);
  assert.equal(saved.edge.connections[0].kind, "known");
  assert.equal(saved.edge.connections[1].kind, "playful");
  assert.ok(!saved.edge.message.includes("invented"));
  const reverse = snapStroke(nodes, [point(nodes[2]), point(nodes[0])], desktop);
  const redrawn = retainStroke(sketch, reverse);
  assert.equal(redrawn.replaced, true);
  assert.equal(sketch.edges.length, 1);
  assert.notEqual(redrawn.edge.color, saved.edge.color);
});

test("undo and redo restore complete routes, colors, and replies without aliasing", () => {
  const history = createHistory();
  let sketch = createSketch();
  rememberSketch(history, sketch);
  retainStroke(sketch, connectNodes(sketch.nodes, "microsoft", "stashbird"));
  const expected = structuredClone(sketch);
  const undone = undoSketch(history, sketch);
  assert.equal(undone.ok, true);
  sketch = undone.sketch;
  assert.equal(sketch.edges.length, 0);
  assert.equal(sketch.nextColorIndex, 0);
  const redone = redoSketch(history, sketch);
  assert.equal(redone.ok, true);
  sketch = redone.sketch;
  assert.deepEqual(sketch, expected);
  sketch.edges[0].message = "edited by caller";
  assert.equal(history.past[0].edges.length, 0);
  assert.equal(createSketch().edges.length, 0);
});

test("clear is an undoable edit and a new drawing invalidates the redo branch", () => {
  const history = createHistory();
  let sketch = createSketch();
  rememberSketch(history, sketch);
  retainStroke(sketch, connectNodes(sketch.nodes, "stashbird", "evaluation"));
  const drawn = structuredClone(sketch);
  rememberSketch(history, sketch);
  sketch = createSketch();
  sketch = undoSketch(history, sketch).sketch;
  assert.deepEqual(sketch, drawn);
  assert.equal(history.future.length, 1);
  rememberSketch(history, sketch);
  retainStroke(sketch, connectNodes(sketch.nodes, "bassoon", "archery"));
  assert.equal(history.future.length, 0);
  assert.equal(redoSketch(history, sketch).code, "no-redo");
  assert.equal(sketch.edges.length, 2);
});

test("history is bounded, reset-isolated, and empty undo/redo results are explicit", () => {
  const history = createHistory();
  let sketch = createSketch();
  assert.equal(undoSketch(history, sketch).code, "no-undo");
  assert.equal(redoSketch(history, sketch).code, "no-redo");
  for (let i = 0; i < MAX_HISTORY + 10; i++) {
    rememberSketch(history, sketch);
    retainStroke(sketch, connectNodes(sketch.nodes, "microsoft", "stashbird"));
    assert.ok(history.past.length <= MAX_HISTORY);
  }
  for (let i = 0; i < MAX_HISTORY; i++) sketch = undoSketch(history, sketch).sketch;
  assert.equal(history.past.length, 0);
  assert.equal(history.future.length, MAX_HISTORY);
  assert.deepEqual(createHistory(), { past: [], future: [] });
  assert.throws(() => rememberSketch(null, sketch), TypeError);
  assert.throws(() => undoSketch(history, null), TypeError);
});

import {
  appendSample,
  connectNodes,
  createSketch,
  layoutNodes,
  nearestNode,
  retainStroke,
  reprojectStroke,
  snapStroke,
  strokePath,
  createHistory,
  rememberSketch,
  undoSketch,
  redoSketch,
  createConnectionCatalog,
  MOBILE_BREAKPOINT,
} from "./graph-model.js";
import { aimTrail, createSpring, createTrail, kickSpring, repulsionTarget, stepSpring, stepTrail } from "./graph-motion.js";

const mounted = new WeakMap();
let instanceCount = 0;
const SVG_NS = "http://www.w3.org/2000/svg";

export function mountGraphPlayground(root) {
  if (mounted.has(root)) return mounted.get(root);
  if (!root?.ownerDocument) throw new TypeError("The paper needs a root element.");
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const prefix = `kg-${++instanceCount}`;
  let sketch = createSketch();
  const history = createHistory();
  let nodes = sketch.nodes;
  let size = { width: 1, height: 1 };
  let pending = null;
  let stroke = null;
  let candidates = [];
  let observer = null;
  const buttons = new Map();
  const springs = new Map(sketch.nodes.map((node) => [node.id, createSpring()]));
  const reducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)");
  let trail = createTrail();
  let hover = { x: 0, y: 0, active: false };
  let motionFrame = 0;
  let motionTime = 0;
  let motionFrozen = false;
  const removers = [];

  function element(tag, className, text) {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function listen(target, type, listener) {
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  }

  const shell = element("div", "kg-playground");
  const keyboardHelp = element(
    "span", "kg-sr-only",
    "Draw through up to three dots, or click or tap two. Keyboard: focus a dot and press Enter or Space, then choose another. Escape cancels. On touch screens, swipe outside the paper to scroll.",
  );
  keyboardHelp.id = `${prefix}-keyboard`;
  const plot = element("div", "kg-plot");
  plot.tabIndex = -1;
  plot.setAttribute("role", "group");
  plot.setAttribute("aria-label", "Draw connections between Nicholas’s work and interests");
  plot.setAttribute("aria-describedby", keyboardHelp.id);
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.classList.add("kg-ink");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("preserveAspectRatio", "none");
  const references = doc.createElementNS(SVG_NS, "g");
  references.classList.add("kg-reference-edges");
  const existingTies = createConnectionCatalog().filter((connection) => connection.kind === "known");
  const retained = doc.createElementNS(SVG_NS, "g");
  retained.classList.add("kg-retained-ink");
  const live = doc.createElementNS(SVG_NS, "path");
  live.classList.add("kg-live-stroke");
  live.setAttribute("vector-effect", "non-scaling-stroke");
  const phantom = doc.createElementNS(SVG_NS, "path");
  phantom.classList.add("kg-pointer-trail");
  phantom.setAttribute("vector-effect", "non-scaling-stroke");
  const pencil = doc.createElementNS(SVG_NS, "circle");
  pencil.classList.add("kg-pointer-tip");
  pencil.setAttribute("r", "1.5");
  svg.append(references, phantom, pencil, retained, live);
  plot.append(svg);

  for (const node of sketch.nodes) {
    const button = element("button", "kg-node");
    const face = element("span", "kg-node-face");
    const text = element("span", "kg-node-label");
    text.append(element("span", "kg-node-label-full", node.label), element("span", "kg-node-label-compact", node.compactLabel));
    face.append(text);
    button.append(face);
    button.type = "button";
    button.dataset.nodeId = node.id;
    button.setAttribute("aria-label", node.label);
    button.title = node.detail;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-describedby", keyboardHelp.id);
    buttons.set(node.id, button);
    plot.append(button);
  }

  const underneath = element("div", "kg-underneath");
  const clear = element("button", "kg-action kg-clear", "clear sketch");
  const undo = element("button", "kg-action kg-undo", "undo");
  const redo = element("button", "kg-action kg-redo", "redo");
  undo.type = "button";
  redo.type = "button";
  undo.disabled = true;
  redo.disabled = true;
  clear.type = "button";
  const actions = element("div", "kg-actions");
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Sketch history");
  actions.append(undo, redo, clear);
  underneath.append(actions);
  const status = element("div", "kg-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  const kind = element("span", "kg-result-kind");
  const message = element("div", "kg-result-message");
  const limitNote = element("p", "kg-limit-note");
  limitNote.hidden = true;
  const sources = element("div", "kg-sources");
  status.append(kind, message, limitNote, sources);
  shell.append(plot, underneath, status, keyboardHelp);

  function report(type, text, links = []) {
    status.dataset.kind = type;
    status.classList.toggle("kg-sr-only", type === "ready");
    kind.textContent = {
      known: "known connection",
      playful: "a playful parallel",
      mixed: "a sketch of two connections",
      chain: "a sketch of two connections",
      pending: "first dot",
      retry: "try another line",
      cancelled: "pencil lifted",
      ready: "",
    }[type];
    message.textContent = text;
    limitNote.textContent = "";
    limitNote.hidden = true;
    sources.replaceChildren();
    for (const link of links) {
      const anchor = element("a", "kg-source", link.label);
      anchor.href = link.url;
      sources.append(anchor);
    }
  }

  function reportStroke(edge) {
    report(edge.kind, edge.message, edge.sources);
    if (edge.nodeIds.length === 3) {
      const label = (id) => nodes.find((node) => node.id === id).label;
      const route = element("p", "kg-result-route", edge.nodeIds.map(label).join(" → "));
      const replies = edge.connections.map((connection) => {
        const paragraph = element("p", "kg-result-leg");
        paragraph.dataset.kind = connection.kind;
        const heading = element("span", "kg-result-leg-label",
          `${label(connection.source)} → ${label(connection.target)} · ${connection.kind === "known" ? "known connection" : "a playful parallel"}`);
        paragraph.append(heading, doc.createTextNode(connection.message));
        return paragraph;
      });
      message.replaceChildren(route, ...replies);
    }
    limitNote.textContent = edge.note;
    limitNote.hidden = !edge.note;
  }

  function feedback(kind) {
    root.dispatchEvent(new view.CustomEvent("site:interaction", { bubbles: true, detail: { kind } }));
  }

  function updateState() {
    undo.disabled = history.past.length === 0;
    redo.disabled = history.future.length === 0;
    root.dataset.graphState = stroke ? "drawing" : pending ? "pending" : sketch.edges.length ? "connected" : "ready";
    root.dataset.graphEdges = String(sketch.edges.length);
    for (const [id, button] of buttons) {
      button.setAttribute("aria-pressed", String(id === pending));
      button.classList.toggle("kg-is-pending", id === pending);
      button.classList.toggle("kg-is-candidate", candidates.includes(id));
    }
  }

  function displayNodes() {
    return nodes.map((node) => {
      const spring = springs.get(node.id);
      return { ...node, x: node.x + spring.x / size.width, y: node.y + spring.y / size.height };
    });
  }

  function drawRetained() {
    const fragment = doc.createDocumentFragment();
    const displayed = displayNodes();
    const positions = new Map(displayed.map((node) => [node.id, node]));
    const referenceFragment = doc.createDocumentFragment();
    for (const connection of existingTies) {
      const source = positions.get(connection.source);
      const target = positions.get(connection.target);
      const line = doc.createElementNS(SVG_NS, "line");
      line.classList.add("kg-reference-edge");
      line.dataset.source = connection.source;
      line.dataset.target = connection.target;
      line.setAttribute("x1", source.x * size.width);
      line.setAttribute("y1", source.y * size.height);
      line.setAttribute("x2", target.x * size.width);
      line.setAttribute("y2", target.y * size.height);
      line.setAttribute("vector-effect", "non-scaling-stroke");
      referenceFragment.append(line);
    }
    references.replaceChildren(referenceFragment);
    for (const edge of sketch.edges) {
      const projected = reprojectStroke(edge, displayed);
      const path = doc.createElementNS(SVG_NS, "path");
      path.classList.add("kg-ink-path", `kg-ink-${edge.kind}`);
      path.dataset.pair = edge.id;
      path.dataset.kind = edge.kind;
      path.dataset.color = String(edge.colorIndex);
      path.dataset.route = edge.nodeIds.join(" ");
      path.style.setProperty("--kg-stroke-color", edge.color);
      path.setAttribute("d", strokePath(projected.points, size, projected.anchorIndices).d);
      path.setAttribute("vector-effect", "non-scaling-stroke");
      fragment.append(path);
    }
    retained.replaceChildren(fragment);
  }

  function renderMotion() {
    for (const [id, button] of buttons) {
      const spring = springs.get(id);
      button.style.setProperty("--kg-dx", `${spring.x.toFixed(2)}px`);
      button.style.setProperty("--kg-dy", `${spring.y.toFixed(2)}px`);
      button.style.setProperty("--kg-tilt", `${Math.max(-1.8, Math.min(1.8, spring.x * 0.25 + spring.vy * 0.01)).toFixed(2)}deg`);
    }
    const visible = !motionFrozen && !reducedMotion.matches && trail.opacity > 0;
    const points = trail.points.map((point) => ({ x: point.x / size.width, y: point.y / size.height }));
    phantom.setAttribute("d", visible && points.length > 1 ? strokePath(points, size).d : "");
    phantom.style.opacity = visible ? String(trail.opacity) : "0";
    pencil.setAttribute("cx", String(trail.x));
    pencil.setAttribute("cy", String(trail.y));
    pencil.style.opacity = visible ? String(trail.opacity * 1.6) : "0";
  }

  function animate(now) {
    motionFrame = 0;
    if (motionFrozen || reducedMotion.matches || doc.hidden) return;
    const dt = motionTime ? Math.min((now - motionTime) / 1000, 0.05) : 1 / 60;
    motionTime = now;
    let active = false;
    let changed = false;
    for (const [index, node] of nodes.entries()) {
      const spring = springs.get(node.id);
      const previousX = spring.x;
      const previousY = spring.y;
      const target = repulsionTarget({ x: node.x * size.width, y: node.y * size.height }, hover, index * 2.4);
      active = stepSpring(spring, target, dt) || active;
      changed = changed || Math.abs(previousX - spring.x) > 0.005 || Math.abs(previousY - spring.y) > 0.005;
    }
    active = stepTrail(trail, dt) || active;
    renderMotion();
    if (changed) drawRetained();
    if (active) motionFrame = view.requestAnimationFrame(animate);
    else {
      motionTime = 0;
      root.dataset.graphMotion = "rest";
    }
  }

  function wakeMotion() {
    if (motionFrame || motionFrozen || reducedMotion.matches || doc.hidden) return;
    motionTime = 0;
    root.dataset.graphMotion = "running";
    motionFrame = view.requestAnimationFrame(animate);
  }

  function resetMotion() {
    view.cancelAnimationFrame(motionFrame);
    motionFrame = 0;
    motionTime = 0;
    hover.active = false;
    trail = createTrail();
    for (const spring of springs.values()) Object.assign(spring, createSpring());
    root.dataset.graphMotion = "rest";
    renderMotion();
  }

  function pulse(id) {
    if (motionFrozen || reducedMotion.matches) return;
    const index = sketch.nodes.findIndex((node) => node.id === id);
    kickSpring(springs.get(id), index % 2 ? 65 : -65, -70);
    wakeMotion();
  }

  function thawMotion() {
    motionFrozen = false;
    hover.active = false;
    trail = createTrail();
    renderMotion();
    wakeMotion();
  }

  function clearLive() {
    live.setAttribute("d", "");
    candidates = [];
  }

  function releaseCapture(pointerId) {
    if (plot.hasPointerCapture(pointerId)) plot.releasePointerCapture(pointerId);
  }

  function cancel(text = "Line cancelled. Try a new one, or tap two dots.") {
    const active = stroke;
    stroke = null;
    pending = null;
    clearLive();
    thawMotion();
    if (active) releaseCapture(active.pointerId);
    updateState();
    report("cancelled", text);
  }

  function relayout() {
    const next = { width: Math.max(1, plot.clientWidth), height: Math.max(1, plot.clientHeight) };
    if (stroke) cancel("The paper changed size. Try that line again.");
    resetMotion();
    size = next;
    root.dataset.graphCompact = String(size.width < MOBILE_BREAKPOINT);
    const labels = Object.fromEntries([...buttons].map(([id, button]) => [
      id, { width: button.offsetWidth, height: button.offsetHeight, padding: 10 },
    ]));
    const result = layoutNodes(sketch.nodes, size, labels);
    nodes = result.nodes;
    for (const node of nodes) {
      const button = buttons.get(node.id);
      button.style.left = `${node.x * 100}%`;
      button.style.top = `${node.y * 100}%`;
    }
    svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
    drawRetained();
  }

  function commit(result) {
    pending = null;
    clearLive();
    if (!result.ok) {
      updateState();
      report("retry", result.message);
      return;
    }
    const previous = structuredClone(sketch);
    const saved = retainStroke(sketch, result);
    if (!saved.ok) {
      updateState();
      report("retry", saved.message);
      return;
    }
    rememberSketch(history, previous);
    candidates = [...saved.edge.nodeIds];
    drawRetained();
    updateState();
    reportStroke(saved.edge);
    for (const id of saved.edge.nodeIds) pulse(id);
    feedback("connection");
  }

  function choose(id) {
    if (stroke) return;
    if (!pending) {
      candidates = [];
      pending = id;
      const node = nodes.find((item) => item.id === id);
      updateState();
      report("pending", `${node.label}: ${node.detail} Choose a second dot.`);
      pulse(id);
      feedback("node");
      return;
    }
    commit(connectNodes(displayNodes(), pending, id));
  }

  function nodeButton(event) {
    const button = event.target.closest?.(".kg-node");
    return button && buttons.get(button.dataset.nodeId) === button ? button : null;
  }

  function eventPoint(event) {
    const rect = plot.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left - plot.clientLeft) / size.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top - plot.clientTop) / size.height)),
    };
  }

  function drawLive() {
    live.setAttribute("d", strokePath(stroke.points, size).d);
    const preview = stroke.points.length > 1 ? snapStroke(stroke.nodes, stroke.points, size) : null;
    candidates = preview?.ok ? preview.nodeIds : [...new Set([
      nearestNode(stroke.nodes, stroke.points[0], size).node.id,
      nearestNode(stroke.nodes, stroke.points.at(-1), size).node.id,
    ])];
    updateState();
  }

  function onPointerDown(event) {
    if (stroke || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    motionFrozen = true;
    view.cancelAnimationFrame(motionFrame);
    motionFrame = 0;
    root.dataset.graphMotion = "frozen";
    trail = createTrail();
    renderMotion();
    const button = nodeButton(event);
    (button ?? plot).focus({ preventScroll: true });
    stroke = {
      pointerId: event.pointerId,
      startNode: button?.dataset.nodeId ?? null,
      startX: event.clientX,
      startY: event.clientY,
      drawn: false,
      nodes: displayNodes(),
      points: [eventPoint(event)],
    };
    plot.setPointerCapture(event.pointerId);
    drawLive();
  }

  function onPointerMove(event) {
    if (!stroke) {
      if (event.pointerType === "touch" || reducedMotion.matches) return;
      const point = eventPoint(event);
      hover = { x: point.x * size.width, y: point.y * size.height, active: true };
      aimTrail(trail, hover.x, hover.y);
      wakeMotion();
      return;
    }
    if (stroke.pointerId !== event.pointerId) return;
    const result = appendSample(stroke.points, eventPoint(event));
    if (!result.ok) return;
    stroke.points = result.samples;
    if (Math.hypot(event.clientX - stroke.startX, event.clientY - stroke.startY) > 5) {
      stroke.drawn = true;
      pending = null;
    }
    if (result.changed) drawLive();
  }

  function onPointerUp(event) {
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    onPointerMove(event);
    const finished = stroke;
    stroke = null;
    releaseCapture(finished.pointerId);
    clearLive();
    thawMotion();
    if (!finished.drawn && finished.startNode) {
      choose(finished.startNode);
    } else {
      const result = finished.points.length < 2
        ? { ok: false, message: "A little longer? Draw toward a different dot, or tap two dots." }
        : snapStroke(finished.nodes, finished.points, size);
      commit(result);
    }
  }

  function onPointerCancel(event) {
    if (stroke?.pointerId === event.pointerId) cancel();
  }

  listen(plot, "pointerdown", onPointerDown);
  listen(plot, "pointermove", onPointerMove);
  listen(plot, "pointerleave", () => {
    if (stroke) return;
    hover.active = false;
    trail.active = false;
    wakeMotion();
  });
  listen(plot, "pointerover", (event) => {
    if (event.pointerType === "touch" || stroke) return;
    const button = nodeButton(event);
    if (button && (!(event.relatedTarget instanceof view.Node) || !button.contains(event.relatedTarget))) pulse(button.dataset.nodeId);
  });
  listen(plot, "pointerup", onPointerUp);
  listen(plot, "pointercancel", onPointerCancel);
  listen(plot, "lostpointercapture", onPointerCancel);
  listen(plot, "click", (event) => {
    const button = nodeButton(event);
    // Pointer taps were handled at release; native keyboard activation has detail zero.
    if (button && event.detail === 0) choose(button.dataset.nodeId);
  });
  listen(shell, "keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  });
  listen(clear, "click", () => {
    const active = stroke;
    stroke = null;
    if (active) releaseCapture(active.pointerId);
    motionFrozen = false;
    resetMotion();
    if (sketch.edges.length) rememberSketch(history, sketch);
    sketch = createSketch();
    pending = null;
    clearLive();
    drawRetained();
    updateState();
    report("ready", "Fresh paper.");
    feedback("clear");
  });
  function restoreHistory(result, kind) {
    if (!result.ok) {
      report("retry", result.message);
      return;
    }
    if (stroke) cancel();
    motionFrozen = false;
    resetMotion();
    sketch = result.sketch;
    pending = null;
    clearLive();
    drawRetained();
    updateState();
    if (sketch.edges.length) reportStroke(sketch.edges.at(-1));
    else report("ready", "Back to fresh paper.");
    feedback(kind);
  }
  listen(undo, "click", () => restoreHistory(undoSketch(history, sketch), "undo"));
  listen(redo, "click", () => restoreHistory(redoSketch(history, sketch), "redo"));
  listen(reducedMotion, "change", () => {
    if (stroke) cancel("Motion preference changed. Try a new line, or tap two dots.");
    resetMotion();
    drawRetained();
  });
  listen(doc, "visibilitychange", () => {
    if (!doc.hidden) return;
    if (stroke) cancel();
    resetMotion();
    drawRetained();
  });
  listen(view, "blur", () => {
    if (stroke) cancel();
    resetMotion();
    drawRetained();
  });

  report("ready", "");
  root.replaceChildren(shell);
  relayout();
  updateState();

  if (view?.ResizeObserver) {
    observer = new view.ResizeObserver((entries) => {
      const plotChanged = plot.clientWidth !== size.width || plot.clientHeight !== size.height;
      if (plotChanged || entries.some((entry) => entry.target !== plot)) relayout();
    });
    observer.observe(plot);
    for (const button of buttons.values()) observer.observe(button);
  } else if (view) {
    listen(view, "resize", relayout);
  }
  if (doc.fonts?.addEventListener) listen(doc.fonts, "loadingdone", relayout);

  const controller = {
    destroy() {
      const active = stroke;
      stroke = null;
      if (active) releaseCapture(active.pointerId);
      observer?.disconnect();
      resetMotion();
      for (const remove of removers) remove();
      buttons.clear();
      shell.remove();
      delete root.dataset.graphState;
      delete root.dataset.graphEdges;
      delete root.dataset.graphMotion;
      delete root.dataset.graphCompact;
      mounted.delete(root);
    },
  };
  mounted.set(root, controller);
  return controller;
}

if (typeof document !== "undefined") {
  for (const root of document.querySelectorAll("[data-graph-playground]")) mountGraphPlayground(root);
}

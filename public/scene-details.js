const DURATIONS = Object.freeze({ chair: 2100, steam: 1600, plant: 1500, bird: 1400, agent: 2400, graph: 3600, speech: 1900, embers: 1100 });
const PROJECT_DETAILS = new Set(["bird", "agent", "graph", "speech"]);
const BUTTERFLY_ARRIVAL = 1200;
const BUTTERFLY_DEPARTURE = 850;

export function installSceneDetails(doc) {
  const buttons = [...doc.querySelectorAll("[data-scene-detail]")];
  if (!buttons.length) return;
  const view = doc.defaultView;
  const reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
  const forced = view.matchMedia("(forced-colors: active)");
  const records = new Map();
  const engaged = record => record.hovered || (record.kind === "flower" && record.activated !== null ? record.activated : record.focused);
  const moving = record => record.visible && !doc.hidden && !reduced.matches && !forced.matches;

  function butterfly(record, phase, duration = 0) {
    view.clearTimeout(record.timer);
    record.timer = 0;
    record.butterfly = phase;
    record.button.dataset.butterfly = phase;
    if (duration) {
      record.timer = view.setTimeout(() => {
        if (record.butterfly !== phase) return;
        record.timer = 0;
        record.butterfly = phase === "arriving" ? "perched" : "idle";
        record.button.dataset.butterfly = record.butterfly;
      }, duration);
    }
  }

  function cancel(record) {
    view.clearTimeout(record.timer);
    record.timer = 0;
    record.button.dataset.detailState = record.kind === "flower" ? "still-rest" : "rest";
    if (record.kind === "flower") {
      record.button.setAttribute("aria-pressed", "false");
      butterfly(record, "idle");
    }
  }

  function update(record) {
    if (record.kind === "flower") {
      const bloom = engaged(record) && record.visible && !doc.hidden;
      record.button.dataset.detailState = !record.visible || doc.hidden ? "still-rest" : bloom ? moving(record) ? "bloom" : "still-bloom" : "rest";
      record.button.setAttribute("aria-pressed", String(bloom));
      if (!moving(record)) {
        butterfly(record, bloom ? "perched" : "idle");
      } else if (bloom && !["arriving", "perched"].includes(record.butterfly)) {
        butterfly(record, "arriving", BUTTERFLY_ARRIVAL);
      } else if (!bloom && !["idle", "departing"].includes(record.butterfly)) {
        butterfly(record, "departing", BUTTERFLY_DEPARTURE);
      }
    } else if (!moving(record)) {
      cancel(record);
    }
  }

  function play(record) {
    if (record.kind === "flower") { update(record); return; }
    if (!moving(record) || record.timer) return;
    record.button.dataset.detailState = "playing";
    record.timer = view.setTimeout(() => {
      record.timer = 0;
      record.button.dataset.detailState = "rest";
    }, DURATIONS[record.kind]);
  }

  for (const button of buttons) {
    const kind = button.dataset.sceneDetail;
    if (kind !== "flower" && !Object.hasOwn(DURATIONS, kind)) throw new Error(`Unknown scene interaction: ${kind}`);
    const engagement = PROJECT_DETAILS.has(kind) ? button.closest(".work-item") : button;
    if (!engagement) throw new Error("The project interaction needs its project card.");
    const record = { button, kind, hovered: false, focused: false, activated: null, visible: false, timer: 0, butterfly: "idle" };
    records.set(button, record);
    button.disabled = false;
    if (kind !== "flower") button.style.setProperty("--detail-duration", `${DURATIONS[kind]}ms`);
    cancel(record);
    engagement.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch") return;
      const wasEngaged = engaged(record);
      record.hovered = true;
      if (!wasEngaged) play(record);
      update(record);
    });
    engagement.addEventListener("pointerleave", event => {
      if (event.pointerType === "touch") return;
      record.hovered = false;
      record.activated = null;
      update(record);
    });
    engagement.addEventListener("focusin", () => {
      const wasEngaged = engaged(record);
      record.focused = true;
      if (!wasEngaged) play(record);
      update(record);
    });
    engagement.addEventListener("focusout", event => {
      if (engagement.contains(event.relatedTarget)) return;
      record.focused = false;
      record.activated = null;
      update(record);
    });
    button.addEventListener("click", () => {
      if (kind === "flower") record.activated = record.activated === null ? true : !record.activated;
      play(record);
    });
    button.addEventListener("pointercancel", () => {
      record.hovered = false;
      record.focused = false;
      record.activated = null;
      cancel(record);
    });
  }
  const updateAll = () => { for (const record of records.values()) update(record); };
  const visibility = new view.IntersectionObserver(entries => {
    for (const entry of entries) {
      const record = records.get(entry.target);
      record.visible = entry.isIntersecting;
      update(record);
    }
  });
  for (const button of buttons) visibility.observe(button);
  reduced.addEventListener("change", updateAll);
  forced.addEventListener("change", updateAll);
  doc.addEventListener("visibilitychange", updateAll);
  view.addEventListener("blur", () => {
    for (const record of records.values()) {
      record.hovered = false;
      record.focused = false;
      record.activated = null;
      cancel(record);
    }
  });
}

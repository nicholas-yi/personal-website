export function installHearth(doc) {
  const hearth = doc.querySelector(".hearth-companions");
  if (!hearth) return;
  const view = doc.defaultView;
  const reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false;
  function update() {
    const active = visible && !doc.hidden && !reduced.matches && doc.documentElement.dataset.rain === "moving";
    const state = active ? "moving" : "still";
    if (hearth.dataset.motion !== state) {
      hearth.dataset.motion = state;
      hearth.dispatchEvent(new view.CustomEvent("hearth:motion", { bubbles: true, detail: { active } }));
    }
  }
  new view.IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: 0.25 }).observe(hearth);
  new view.MutationObserver(update).observe(doc.documentElement, { attributes: true, attributeFilter: ["data-rain"] });
  reduced.addEventListener("change", update);
  doc.addEventListener("visibilitychange", update);
  update();
}

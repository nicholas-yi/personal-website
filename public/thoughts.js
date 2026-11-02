import { createSpring, kickSpring, stepSpring } from "./graph-motion.js";

export function installThoughts(doc) {
  const scene = doc.querySelector(".thinking-hearth");
  if (!scene) return;
  const view = doc.defaultView;
  const reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
  const buttons = [...scene.querySelectorAll(".thought-bubble")];
  const panel = scene.querySelector(".thought-question");
  const thoughts = buttons.map((button) => ({ button, face: button.querySelector(".thought-face"), spring: createSpring() }));
  let frame = 0;
  let lastTime = 0;
  let nextFrame = 0;
  const active = () => scene.dataset.motion === "moving" && !doc.hidden && !reduced.matches;

  function animate(now) {
    frame = 0;
    if (!active()) return;
    if (now >= nextFrame) {
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 1 / 30;
      lastTime = now;
      nextFrame = now + 1000 / 30;
      let unsettled = false;
      for (const thought of thoughts) {
        unsettled = stepSpring(thought.spring, { x: 0, y: 0 }, dt) || unsettled;
        thought.face.style.transform = `translate(${thought.spring.x.toFixed(2)}px, ${thought.spring.y.toFixed(2)}px) rotate(${(thought.spring.x * 0.35).toFixed(2)}deg)`;
      }
      if (!unsettled) { lastTime = 0; nextFrame = 0; return; }
    }
    frame = view.requestAnimationFrame(animate);
  }
  function update() {
    if (active()) {
      if (!frame && thoughts.some(thought => Math.hypot(thought.spring.vx, thought.spring.vy, thought.spring.x, thought.spring.y) > 0.02)) frame = view.requestAnimationFrame(animate);
      return;
    }
    view.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    nextFrame = 0;
    for (const thought of thoughts) {
      Object.assign(thought.spring, createSpring());
      thought.face.style.transform = "none";
    }
  }
  function select(button, index, kick) {
    panel.textContent = button.dataset.question;
    for (const candidate of buttons) candidate.setAttribute("aria-pressed", String(candidate === button));
    if (kick && active()) {
      kickSpring(thoughts[index].spring, index % 2 ? 45 : -45, -55);
      update();
    }
  }
  for (const [index, button] of buttons.entries()) {
    button.disabled = false;
    button.addEventListener("pointerenter", (event) => { if (event.pointerType !== "touch") select(button, index, true); });
    button.addEventListener("focus", () => select(button, index, false));
    button.addEventListener("click", () => select(button, index, true));
  }
  new view.MutationObserver(update).observe(scene, { attributes: true, attributeFilter: ["data-motion"] });
  doc.addEventListener("visibilitychange", update);
  reduced.addEventListener("change", update);
  update();
}

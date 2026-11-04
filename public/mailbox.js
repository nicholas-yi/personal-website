export function installMailbox(doc) {
  const mailbox = doc.querySelector(".mailbox");
  if (!mailbox) return;
  const scene = mailbox.closest(".hearth-companions");
  const engagement = mailbox.closest(".mail-corner") ?? mailbox;
  const view = doc.defaultView;
  const reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
  let hovered = false;
  let focused = false;
  let timer = 0;
  let phase = "idle";
  const moving = () => scene.dataset.motion === "moving" && !doc.hidden && !reduced.matches;
  function setPhase(next) {
    phase = next;
    mailbox.dataset.mail = next;
  }
  function update() {
    view.clearTimeout(timer);
    const engaged = hovered || focused;
    if (!moving()) {
      setPhase(engaged && !doc.hidden ? "perched" : "idle");
    } else if (engaged) {
      if (phase === "perched") return;
      setPhase("arriving");
      timer = view.setTimeout(() => { if (hovered || focused) setPhase("perched"); }, 850);
    } else if (phase !== "idle" && phase !== "departing") {
      setPhase("departing");
      timer = view.setTimeout(() => setPhase("idle"), 750);
    } else if (phase === "departing") {
      timer = view.setTimeout(() => setPhase("idle"), 750);
    }
  }
  engagement.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    hovered = true;
    update();
  });
  engagement.addEventListener("pointerleave", () => { hovered = false; update(); });
  engagement.addEventListener("focusin", () => { focused = true; update(); });
  engagement.addEventListener("focusout", (event) => {
    if (engagement.contains(event.relatedTarget)) return;
    focused = false;
    update();
  });
  new view.MutationObserver(update).observe(scene, { attributes: true, attributeFilter: ["data-motion"] });
  reduced.addEventListener("change", update);
  doc.addEventListener("visibilitychange", update);
  setPhase("idle");
}

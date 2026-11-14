export function installPhotoSheet(doc) {
  const frame = doc.querySelector(".picture-frame");
  if (!frame) return;
  const corner = frame.querySelector(".picture-art");
  const engagement = frame.querySelector(".photo-sheet");
  const trigger = frame.querySelector(".photo-sheet-toggle");
  const panel = frame.querySelector(".photo-sheet-panel");
  const status = frame.querySelector(".photo-sheet-status");
  const choices = [...frame.querySelectorAll("[data-photo-select]")];
  const photos = [...frame.querySelectorAll("[data-photo-frame]")];
  if (!corner || !engagement || !trigger || !panel || !status || !photos.length ||
      choices.length !== photos.length || choices.some((button, index) => button.dataset.photoSelect !== String(index))) {
    throw new Error("The contact sheet needs a frame, controls and matching photo slots.");
  }
  const view = doc.defaultView;
  let hovered = false;
  let focused = false;
  let pinned = false;
  let dismissed = false;
  let timer = 0;

  function cancelClose() {
    view.clearTimeout(timer);
    timer = 0;
  }

  function show() {
    cancelClose();
    if (doc.hidden || dismissed) return;
    panel.hidden = false;
    corner.dataset.sheet = "open";
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-pressed", String(pinned));
    trigger.setAttribute("aria-label", pinned ? "Close the pinned contact sheet" : "Pin the contact sheet open");
  }

  function close(returnFocus = false) {
    cancelClose();
    const hadFocus = panel.contains(doc.activeElement);
    pinned = false;
    dismissed = true;
    panel.hidden = true;
    delete corner.dataset.sheet;
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-pressed", "false");
    trigger.setAttribute("aria-label", "Open the contact sheet preview");
    if (returnFocus && hadFocus) trigger.focus();
  }

  function update() {
    cancelClose();
    if (pinned || hovered || focused) {
      show();
    } else if (!panel.hidden) {
      timer = view.setTimeout(() => {
        timer = 0;
        close();
      }, 240);
    }
  }

  function select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= photos.length) throw new RangeError("That contact sheet frame is unavailable.");
    for (const [position, photo] of photos.entries()) photo.hidden = position !== index;
    for (const [position, button] of choices.entries()) button.setAttribute("aria-pressed", String(position === index));
    status.textContent = `frame ${String(index + 1).padStart(2, "0")} of ${String(photos.length).padStart(2, "0")}`;
  }

  engagement.addEventListener("pointerenter", event => {
    if (event.pointerType === "touch") return;
    hovered = true;
    dismissed = false;
    update();
  });
  engagement.addEventListener("pointerleave", event => {
    if (event.pointerType === "touch") return;
    hovered = false;
    update();
  });
  engagement.addEventListener("focusin", () => {
    focused = true;
    update();
  });
  engagement.addEventListener("focusout", event => {
    if (engagement.contains(event.relatedTarget)) return;
    focused = false;
    dismissed = false;
    update();
  });
  trigger.addEventListener("click", () => {
    if (pinned) close();
    else {
      pinned = true;
      dismissed = false;
      show();
    }
  });
  for (const [index, button] of choices.entries()) {
    button.addEventListener("click", () => {
      select(index);
      pinned = true;
      dismissed = false;
      show();
    });
  }
  doc.addEventListener("pointerdown", event => {
    if (!panel.hidden && !engagement.contains(event.target)) close();
  });
  doc.addEventListener("keydown", event => {
    if (event.key !== "Escape" || panel.hidden) return;
    event.preventDefault();
    close(true);
  });
  doc.addEventListener("visibilitychange", () => {
    if (!doc.hidden) return;
    hovered = false;
    focused = false;
    close();
  });
  view.addEventListener("blur", () => {
    hovered = false;
    focused = false;
    close();
  });
  close();
  dismissed = false;
  select(0);
  trigger.hidden = false;
}

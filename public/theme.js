(() => {
  const key = "nicholas-yi:theme";
  const root = document.documentElement;
  let notice = "";
  let button;

  function report(error) {
    console.warn("Reading palette:", error);
    notice = "This palette works here, but your browser couldn't save or restore the palette preference.";
    const status = document.querySelector("#garden-status");
    if (status) status.textContent = notice;
  }

  function read() {
    try {
      const saved = window.sessionStorage.getItem(key);
      if (saved !== null && saved !== "daylight" && saved !== "lamplight") throw new Error("The saved palette is invalid.");
      return saved ?? "daylight";
    } catch (error) {
      report(error);
      return root.dataset.theme ?? "daylight";
    }
  }

  function apply(palette) {
    const changed = root.dataset.theme !== palette;
    root.dataset.theme = palette;
    const lamp = palette === "lamplight";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = lamp ? "#24231f" : "#f8f7f2";
    if (button) {
      button.setAttribute("aria-pressed", String(lamp));
      button.setAttribute("aria-label", lamp ? "Switch to daylight" : "Switch to lamplight");
      button.title = button.getAttribute("aria-label");
    }
    if (changed) window.dispatchEvent(new Event("themechange"));
  }

  apply(read());

  function install() {
    button = document.querySelector("#theme-toggle");
    if (!button) return;
    apply(root.dataset.theme);
    button.hidden = false;
    root.dataset.themeReady = "true";
    if (notice) document.querySelector("#garden-status").textContent = notice;
    button.addEventListener("click", () => {
      const palette = root.dataset.theme === "lamplight" ? "daylight" : "lamplight";
      apply(palette);
      try {
        window.sessionStorage.setItem(key, palette);
      } catch (error) { report(error); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
  window.addEventListener("pageshow", event => { if (event.persisted) apply(read()); });
})();

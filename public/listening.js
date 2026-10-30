export function installListening(doc) {
  const corner = doc.querySelector("[data-listening]");
  if (!corner) return;
  const view = doc.defaultView;
  const button = corner.querySelector(".listening-toggle");
  const card = corner.querySelector(".listening-card");
  const status = card.querySelector("[data-listening-status]");
  const track = card.querySelector("[data-listening-track]");
  const cover = card.querySelector("[data-listening-cover]");
  const title = card.querySelector("[data-listening-title]");
  const artists = card.querySelector("[data-listening-artists]");
  const album = card.querySelector("[data-listening-album]");
  const time = card.querySelector("time");
  const logo = card.querySelector("[data-listening-logo]");
  const previewButton = card.querySelector(".spotify-preview-toggle");
  const preview = card.querySelector(".spotify-preview");
  const shelf = card.querySelector(".recent-shelf");
  const records = card.querySelector(".recent-records");
  let shelfSignature = "";
  let deferredShelf = null;
  let pinned = false;
  let dismissed = false;
  let hovered = false;
  let timer = 0;
  let closing = 0;
  let pending = null;
  let nextCheck = 0;
  let delay = 30000;
  let trackId = null;
  function stopPreview() {
    preview.removeAttribute("src");
    preview.hidden = true;
    previewButton.textContent = "Open Spotify player";
  }

  function place() {
    card.dataset.placement = "above";
    if (card.getBoundingClientRect().top < doc.querySelector(".site-header").getBoundingClientRect().bottom + 8) {
      card.dataset.placement = "below";
    }
  }
  function schedule() {
    view.clearTimeout(timer);
    if (!card.hidden && !doc.hidden) timer = view.setTimeout(load, Math.max(1000, nextCheck - Date.now()));
  }
  function readTrack(item) {
    if (!item || ![item.title, item.artists, item.album].every((value) => typeof value === "string" && value.length)) {
      throw new Error("Invalid track metadata.");
    }
    const url = new URL(item.url);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com" || !/^\/track\/[a-zA-Z0-9]+$/.test(url.pathname)) {
      throw new Error("Invalid Spotify destination.");
    }
    if (item.image) {
      const image = new URL(item.image);
      if (image.protocol !== "https:" || !image.hostname.endsWith(".scdn.co")) throw new Error("Invalid Spotify artwork.");
    }
    return item;
  }
  function clearShelf() {
    records.replaceChildren();
    shelf.hidden = true;
    shelfSignature = "";
    deferredShelf = null;
  }
  function renderShelf(items) {
    if (!Array.isArray(items) || items.length > 3) throw new Error("Invalid recent-record shelf.");
    for (const item of items) {
      readTrack(item);
      if (!Number.isFinite(Date.parse(item.playedAt))) throw new Error("Invalid recent listening date.");
    }
    const signature = JSON.stringify(items);
    if (signature === shelfSignature) return;
    if (shelf.contains(doc.activeElement)) { deferredShelf = items; return; }
    const entries = items.map((item) => {
      const li = doc.createElement("li");
      const link = doc.createElement("a");
      link.href = item.url;
      link.title = `${item.album} · ${new Date(item.playedAt).toLocaleString()}`;
      if (item.image) {
        const image = doc.createElement("img");
        image.src = item.image;
        image.alt = "";
        image.width = 56;
        image.height = 56;
        image.referrerPolicy = "no-referrer";
        link.append(image);
      }
      const name = doc.createElement("strong");
      name.textContent = item.title;
      const artist = doc.createElement("span");
      artist.textContent = item.artists;
      link.append(name, artist);
      li.append(link);
      return li;
    });
    records.replaceChildren(...entries);
    shelf.hidden = entries.length === 0;
    shelfSignature = signature;
    deferredShelf = null;
  }
  function render(data) {
    if (!["playing", "recent", "empty", "private"].includes(data.state)) throw new Error("Invalid listening state.");
    track.hidden = true;
    previewButton.hidden = true;
    cover.removeAttribute("src");
    cover.hidden = true;
    time.hidden = true;
    if (data.state === "empty" || data.state === "private") {
      status.textContent = data.state === "private" ? "Listening activity is private." : "Nothing in the listening history yet.";
      stopPreview();
      clearShelf();
      return;
    }
    const item = readTrack(data.track);
    renderShelf(data.recent === undefined ? [] : data.recent);
    const url = new URL(item.url);
    if (item.image) {
      cover.src = item.image;
      cover.hidden = false;
    }
    if (data.state === "recent") {
      if (!Number.isFinite(Date.parse(item.playedAt))) throw new Error("Invalid listening date.");
      time.dateTime = item.playedAt;
      time.textContent = new Date(item.playedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      time.hidden = false;
    }
    status.textContent = data.state === "playing" ? "listening now" : "last listened";
    title.textContent = item.title;
    artists.textContent = item.artists;
    album.textContent = item.album;
    track.href = url.href;
    track.hidden = false;
    if (trackId !== url.pathname.split("/").at(-1)) stopPreview();
    trackId = url.pathname.split("/").at(-1);
    previewButton.hidden = false;
  }
  async function load() {
    if (card.hidden || doc.hidden) return;
    if (pending) return pending;
    if (Date.now() < nextCheck) { schedule(); return; }
    status.textContent = "Checking the turntable...";
    card.setAttribute("aria-busy", "true");
    pending = (async () => {
      try {
        const response = await view.fetch("/api/listening", {
          credentials: "omit",
          headers: { Accept: "application/json" },
          signal: view.AbortSignal.timeout(10000),
        });
        const data = await response.json();
        if (!response.ok) {
          const retry = Number(response.headers.get("retry-after"));
          delay = Math.min(600000, Math.max(30000, Number.isFinite(retry) ? retry * 1000 : 30000));
          const message = {
            not_connected: "Listening activity isn't connected yet.",
            authorization_required: "Listening activity needs to be reconnected.",
            rate_limited: "Spotify needs a short breather. Try again shortly.",
          }[data.error] || "Listening activity is temporarily unavailable.";
          throw new Error(message);
        }
        delay = 30000;
        render(data);
      } catch (error) {
        track.hidden = true;
        previewButton.hidden = true;
        stopPreview();
        clearShelf();
        status.textContent = error.message.startsWith("Listening activity") || error.message.startsWith("Spotify needs")
          ? error.message : "Couldn't check the turntable. Please try again shortly.";
        console.error("Spotify listening:", status.textContent);
      } finally {
        card.setAttribute("aria-busy", "false");
        nextCheck = Date.now() + delay;
        pending = null;
        if (!card.hidden) place();
        schedule();
      }
    })();
    return pending;
  }
  function show() {
    view.clearTimeout(closing);
    card.hidden = false;
    button.setAttribute("aria-expanded", "true");
    if (!logo.src) logo.src = logo.dataset.listeningLogo;
    place();
    load();
  }
  function open() {
    if (dismissed) return;
    status.setAttribute("aria-live", "polite");
    show();
  }
  function close() {
    view.clearTimeout(timer);
    stopPreview();
    card.hidden = true;
    button.setAttribute("aria-expanded", "false");
    pinned = false;
  }
  corner.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch") return;
    hovered = true;
    dismissed = false;
    open();
  });
  corner.addEventListener("pointerleave", () => {
    hovered = false;
    dismissed = false;
    closing = view.setTimeout(() => {
      if (!pinned && !corner.contains(doc.activeElement)) close();
    }, 180);
  });
  corner.addEventListener("focusin", open);
  corner.addEventListener("focusout", (event) => {
    if (deferredShelf && !shelf.contains(event.relatedTarget)) {
      renderShelf(deferredShelf);
      place();
    }
    if (!corner.contains(event.relatedTarget) && !hovered) {
      dismissed = false;
      close();
    }
  });
  button.addEventListener("click", () => {
    if (pinned) {
      dismissed = true;
      close();
    } else {
      dismissed = false;
      pinned = true;
      open();
    }
  });
  previewButton.addEventListener("click", () => {
    if (!trackId) return;
    if (!preview.hidden) { stopPreview(); return; }
    preview.src = `https://open.spotify.com/embed/track/${trackId}`;
    preview.hidden = false;
    previewButton.textContent = "Close Spotify player";
    place();
  });
  doc.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || card.hidden) return;
    event.preventDefault();
    dismissed = true;
    if (card.contains(doc.activeElement)) button.focus();
    close();
  });
  doc.addEventListener("pointerdown", (event) => {
    if (!card.hidden && !corner.contains(event.target)) {
      dismissed = true;
      close();
    }
  });
  doc.addEventListener("visibilitychange", () => {
    view.clearTimeout(timer);
    if (doc.hidden) stopPreview();
    if (!doc.hidden && !card.hidden) load();
  });
  view.addEventListener("resize", () => { if (!card.hidden) place(); });
  view.addEventListener("scroll", () => { if (!card.hidden) place(); }, { passive: true });
  button.hidden = false;
}

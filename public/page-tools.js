export const RAIN_PREFERENCE_KEY = "nicholas-yi:rain";

export function createRainPreference(view, report) {
  let saved = null;
  function restore() {
    try {
      const value = view.sessionStorage.getItem(RAIN_PREFERENCE_KEY);
      if (value !== null && value !== "moving" && value !== "paused") {
        throw new Error("The saved rain preference is invalid.");
      }
      saved = value === null ? null : value === "moving";
    } catch (error) {
      console.warn("Rain preference:", error);
      report("Your rain preference couldn't be restored. The rain control still works for this page.");
    }
  }
  restore();
  return {
    restore,
    enabled(reducedMotion) { return !reducedMotion && saved !== false; },
    remember(enabled) {
      if (typeof enabled !== "boolean") throw new TypeError("The rain preference must be on or off.");
      saved = enabled;
      try {
        view.sessionStorage.setItem(RAIN_PREFERENCE_KEY, enabled ? "moving" : "paused");
      } catch (error) {
        console.warn("Rain preference:", error);
        report("Your rain choice applies here, but this browser couldn't remember it across pages.");
      }
    },
  };
}

export function revealStory(doc, hash) {
  if (!hash || hash === "#") return null;
  const target = doc.getElementById(decodeURIComponent(hash.slice(1)));
  if (!target) return null;
  let story = target.closest("details.work-story");
  if (!story) return null;
  while (story) {
    story.open = true;
    story = story.parentElement?.closest("details.work-story");
  }
  return target;
}

export function noteShareURL(doc, id) {
  if (!doc.getElementById(id)?.matches("details.work-story")) throw new Error("That note is not available to share.");
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (!canonical) throw new Error("The note's canonical URL is missing.");
  const url = new URL(canonical.href);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("The note needs a web URL.");
  url.search = "";
  url.hash = id;
  return url.href;
}

export async function copyText(view, text) {
  if (typeof text !== "string" || !text.trim()) throw new TypeError("There is no text to copy.");
  if (!view.navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
  await view.navigator.clipboard.writeText(text);
}

function bindCopy(doc, button, getText, confirmation, label) {
  const group = button.closest(".copy-tools");
  const status = group.querySelector(".copy-status");
  let copying = false;
  button.hidden = false;
  button.addEventListener("click", async () => {
    if (copying || button.disabled) return;
    copying = true;
    button.setAttribute("aria-disabled", "true");
    button.setAttribute("aria-busy", "true");
    status.textContent = "";
    let text;
    try {
      text = getText();
      await copyText(doc.defaultView, text);
      group.querySelector(".copy-fallback")?.remove();
      status.textContent = confirmation;
    } catch (error) {
      console.warn("Copy control:", error);
      status.textContent = text ? "Copy unavailable. Select and copy the text below." : `Couldn't prepare this link: ${error.message}`;
      if (text) {
        let input = group.querySelector(".copy-fallback");
        if (!input) {
          input = doc.createElement("input");
          input.className = "copy-fallback";
          input.type = "text";
          input.readOnly = true;
          input.setAttribute("aria-label", label);
          group.append(input);
        }
        input.value = text;
        input.focus();
        input.select();
      }
    } finally {
      copying = false;
      button.setAttribute("aria-disabled", "false");
      button.setAttribute("aria-busy", "false");
    }
  });
}

export function installPageTools(doc) {
  const view = doc.defaultView;
  const stories = doc.querySelectorAll("details.work-story");
  if (stories.length) {
    let frame = 0;
    function reveal(hash) {
      try {
        const target = revealStory(doc, hash);
        if (!target) return;
        view.cancelAnimationFrame(frame);
        frame = view.requestAnimationFrame(() => {
          frame = 0;
          target.scrollIntoView({ block: "start", behavior: "instant" });
        });
      } catch (error) {
        console.warn("Writing link:", error);
        doc.querySelector("#garden-status").textContent = "That note link couldn't be read. You can still open the writing below.";
      }
    }
    view.addEventListener("hashchange", () => reveal(view.location.hash));
    doc.addEventListener("click", event => {
      const anchor = event.target.closest("a[href]");
      if (!anchor || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = new URL(anchor.href, view.location.href);
      if (url.origin === view.location.origin && url.pathname === view.location.pathname && url.search === view.location.search) reveal(url.hash);
    });
    reveal(view.location.hash);
    for (const button of doc.querySelectorAll("[data-copy-note]")) {
      bindCopy(doc, button, () => noteShareURL(doc, button.dataset.copyNote), "link copied", "Link to this note");
    }
  }
  const mailbox = doc.querySelector(".mailbox");
  const emailButton = doc.querySelector("[data-copy-email]");
  if (mailbox && emailButton) {
    bindCopy(doc, emailButton, () => {
      const url = new URL(mailbox.href);
      if (url.protocol !== "mailto:") throw new Error("The mailbox has no email address.");
      const address = decodeURIComponent(url.pathname);
      if (!address) throw new Error("The mailbox email address is empty.");
      return address;
    }, "address copied", "Email address to copy");
  }
}

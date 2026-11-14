if (new URL(location.href).searchParams.get("review") === "writing") {
  async function loadReview() {
    const responses = await Promise.all([
      fetch(new URL("./writing-originals.json", import.meta.url)),
      fetch("/notes/evaluation"),
    ]);
    if (responses.some(response => !response.ok)) throw new Error("A writing comparison source couldn't load.");
    const originals = await responses[0].json();
    if (typeof originals.memory !== "string" || typeof originals.evaluation !== "string" || typeof originals.revision !== "string") {
      throw new Error("The original writing snapshot is incomplete.");
    }
    const note = new DOMParser().parseFromString(await responses[1].text(), "text/html");
    const currentMemory = document.querySelector('#stashbird-case-study .story-copy');
    const currentEvaluation = note.querySelector(".story-copy");
    if (!currentMemory || !currentEvaluation) throw new Error("The revised writing is unavailable.");
    const root = document.createElement("section");
    root.className = "writing-review";
    root.id = "writing-review";
    root.setAttribute("aria-labelledby", "writing-review-heading");
    const heading = document.createElement("h2");
    heading.id = "writing-review-heading";
    heading.textContent = "In the margins: before & after";
    const introduction = document.createElement("p");
    introduction.textContent = "Review only. The original public drafts sit beside the revisions below. These examples are original writing, with no borrowed anecdotes or invented experiments.";
    const leave = document.createElement("a");
    leave.href = "links.html";
    leave.textContent = "Return to the ordinary Field Notes page";
    root.append(heading, introduction, leave);

    for (const [title, oldHTML, revised] of [
      ["When a conversation changes", originals.memory, currentMemory],
      ["What makes an evaluation trustworthy?", originals.evaluation, currentEvaluation],
    ]) {
      const comparison = document.createElement("details");
      comparison.className = "writing-comparison";
      comparison.open = true;
      const summary = document.createElement("summary");
      summary.textContent = title;
      const columns = document.createElement("div");
      columns.className = "writing-versions";
      for (const [label, html] of [["Original", oldHTML], ["Revised", revised.innerHTML]]) {
        const version = document.createElement("article");
        version.className = "writing-version";
        version.setAttribute("aria-label", `${label}: ${title}`);
        const name = document.createElement("h3");
        name.textContent = label;
        const prose = document.createElement("div");
        prose.className = "story-copy";
        prose.innerHTML = html;
        for (const tools of prose.querySelectorAll(".copy-tools")) tools.remove();
        for (const originalHeading of prose.querySelectorAll("h2")) {
          const subsection = document.createElement("h4");
          subsection.textContent = originalHeading.textContent;
          originalHeading.replaceWith(subsection);
        }
        version.append(name, prose);
        columns.append(version);
      }
      comparison.append(summary, columns);
      root.append(comparison);
    }
    const source = document.createElement("p");
    source.className = "review-provenance";
    source.textContent = `Original drafts captured from repository revision ${originals.revision.slice(0, 7)}. No original text was overwritten in this comparison.`;
    root.append(source);
    document.querySelector(".public-links").before(root);
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.append(robots);
    if (location.hash === "#writing-review") {
      requestAnimationFrame(() => root.scrollIntoView({ block: "start", behavior: "instant" }));
    }
  }
  loadReview().catch(error => {
    console.error("Writing review:", error);
    const notice = document.createElement("p");
    notice.className = "review-error";
    notice.setAttribute("role", "alert");
    notice.textContent = `The writing comparison couldn't load: ${error.message}. The revised notes remain available below.`;
    document.querySelector(".links-intro").after(notice);
  });
}

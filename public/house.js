export function roofArt(columns) {
  if (!Number.isInteger(columns) || columns < 21 || columns > 121) throw new RangeError("The roof needs between 21 and 121 character columns.");
  const width = columns % 2 ? columns : columns - 1;
  const center = (width - 1) / 2;
  const lines = [];
  for (let row = 0; row < 9; row++) {
    const half = Math.max(1, Math.round((center - 1) * row / 8));
    const line = Array(width).fill(" ");
    line[center - half] = "/";
    line[center + half] = "\\";
    for (let col = center - half + 1; col < center + half; col++) {
      line[col] = row % 2 ? "_" : col % 3 === 0 ? ":" : ".";
    }
    lines.push(line.join(""));
  }
  lines.push(`+${"=".repeat(width - 2)}+`);
  return lines.join("\n");
}

export function decorateHouse(doc) {
  const roof = doc.querySelector(".house-roof");
  if (!roof) return;
  const pre = roof.querySelector("pre");
  const measure = doc.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("The ASCII house roof needs a canvas text measurement context.");
  let lastWidth = 0;
  function layout() {
    const width = roof.clientWidth;
    if (width === lastWidth) return;
    lastWidth = width;
    measure.font = doc.defaultView.getComputedStyle(pre).font;
    const columns = Math.max(21, Math.min(121, Math.floor(width / measure.measureText("M").width)));
    pre.textContent = roofArt(columns);
  }
  layout();
  new doc.defaultView.ResizeObserver(layout).observe(roof);
}

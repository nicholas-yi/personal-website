export function puddleGlyphs(width, time, ripples = []) {
  const glyphs = [];
  const spacing = 10;
  const radius = Math.min(115, width * 0.18);
  const centers = width < 500 ? [width * 0.25, width * 0.75] : [width * 0.18, width * 0.5, width * 0.82];
  for (let y = 16; y <= 110; y += 9) {
    for (let x = spacing; x < width; x += spacing) {
      let glyph = "";
      for (let i = 0; i < centers.length; i++) {
        const cy = 54 + i % 2 * 24;
        const distance = Math.hypot((x - centers[i]) / radius, (y - cy) / 19);
        if (distance > 1) continue;
        const wave = Math.sin(distance * 24 - time * 3 + i);
        glyph = distance > 0.86 ? "." : wave > 0.6 ? "~" : wave < -0.5 ? ":" : ".";
        break;
      }
      for (const ripple of ripples) {
        const distance = Math.hypot(x - ripple.x, (y - 55) * 2.7);
        if (Math.abs(distance - (5 + ripple.age * 38)) < 5) glyph = x < ripple.x ? "(" : ")";
      }
      if (glyph) glyphs.push({ x, y, glyph });
    }
  }
  return glyphs;
}

export function installPuddles(doc) {
  const container = doc.querySelector(".page-puddles");
  if (!container) throw new Error("The rain scene needs its page-bottom puddles.");
  const canvas = container.querySelector("canvas");
  const context = canvas.getContext("2d");
  if (!context) return { measure() { return null; }, render() {} };
  let bounds = null;
  let width = 0;
  return {
    measure() {
      bounds = container.getBoundingClientRect();
      const nextWidth = Math.round(bounds.width);
      if (width !== nextWidth) {
        width = nextWidth;
        canvas.width = width;
        canvas.height = 128;
      }
      return bounds;
    },
    render(time, ripples) {
      if (!bounds || bounds.top > doc.defaultView.innerHeight || bounds.bottom < 0) return;
      context.clearRect(0, 0, width, 128);
      context.fillStyle = "#526960";
      context.globalAlpha = 0.55;
      context.font = "11px Consolas, monospace";
      context.textAlign = "center";
      for (const cell of puddleGlyphs(width, time, ripples)) context.fillText(cell.glyph, cell.x, cell.y);
    },
  };
}

import { RAIN_GLYPHS, RAIN_INK } from "./rain.js";

export function createRainGlyphs(doc, scale) {
  const symbols = [...new Set([...RAIN_GLYPHS, "o", "/", "\\"])];
  const cellWidth = 24;
  const cellHeight = 28;
  const atlas = doc.createElement("canvas");
  atlas.width = Math.ceil(symbols.length * cellWidth * scale);
  atlas.height = Math.ceil(cellHeight * scale);
  const context = atlas.getContext("2d");
  if (!context) throw new Error("The rain glyph atlas needs canvas support.");
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.font = "600 13px Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = RAIN_INK;
  for (const [index, symbol] of symbols.entries()) context.fillText(symbol, index * cellWidth + cellWidth / 2, cellHeight / 2);
  const positions = new Map(symbols.map((symbol, index) => [symbol, index]));
  return {
    draw(target, symbol, x, y) {
      const index = positions.get(symbol);
      if (index === undefined) throw new RangeError(`Unknown rain glyph: ${symbol}`);
      target.drawImage(atlas, index * cellWidth * scale, 0, cellWidth * scale, cellHeight * scale,
        x - cellWidth / 2, y - cellHeight / 2, cellWidth, cellHeight);
    },
  };
}

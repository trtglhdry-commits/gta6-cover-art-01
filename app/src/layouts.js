// Layout definitions for Sunset Cover Studio: every layout is a function of the
// cover's width and height, returning its panels as fractions of the cover.
// A panel is { x, y, w, h, rot } in 0..1 fractions; rot is degrees around the
// panel centre (0 for the straight grids). The renderer turns fractions into
// pixels, so one definition serves every export size.

/** The gutter between panels, as a fraction of the cover's shorter side. */
export const GUTTER = 0.012;

/**
 * Panels for the classic poster grid: one big hero panel on the left and
 * three stacked panels on the right.
 */
function heroPanels() {
  const g = GUTTER;
  const right = 0.38;
  const third = (1 - 2 * g) / 3;
  return [
    { x: 0, y: 0, w: 1 - right - g, h: 1, rot: 0 },
    { x: 1 - right, y: 0, w: right, h: third, rot: 0 },
    { x: 1 - right, y: third + g, w: right, h: third, rot: 0 },
    { x: 1 - right, y: 2 * (third + g), w: right, h: third, rot: 0 },
  ];
}

/** Nine equal panels in a 3 x 3 grid. */
function ninePanels() {
  const g = GUTTER;
  const cell = (1 - 2 * g) / 3;
  const panels = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      panels.push({ x: col * (cell + g), y: row * (cell + g), w: cell, h: cell, rot: 0 });
    }
  }
  return panels;
}

/** One photo, edge to edge: the title block sits over it. */
function fullPanels() {
  return [{ x: 0, y: 0, w: 1, h: 1, rot: 0 }];
}

/** Two vertical halves, split down the middle. */
function duoPanels() {
  const g = GUTTER;
  const half = (1 - g) / 2;
  return [
    { x: 0, y: 0, w: half, h: 1, rot: 0 },
    { x: half + g, y: 0, w: half, h: 1, rot: 0 },
  ];
}

/**
 * Three overlapping snapshot frames, tilted like photos tossed on a table,
 * over a sunset backdrop the renderer paints first.
 */
function tiltedPanels() {
  return [
    { x: 0.06, y: 0.10, w: 0.52, h: 0.58, rot: -6 },
    { x: 0.44, y: 0.04, w: 0.50, h: 0.56, rot: 5 },
    { x: 0.24, y: 0.44, w: 0.54, h: 0.52, rot: -2 },
  ];
}

/** Three horizontal bands, made for the tall 9:16 story size. */
function storyPanels() {
  const g = GUTTER;
  const band = (1 - 2 * g) / 3;
  return [
    { x: 0, y: 0, w: 1, h: band, rot: 0 },
    { x: 0, y: band + g, w: 1, h: band, rot: 0 },
    { x: 0, y: 2 * (band + g), w: 1, h: band, rot: 0 },
  ];
}

export const LAYOUTS = {
  hero: { id: 'hero', name: 'Hero + Three', panels: heroPanels, hint: 'Classic poster grid' },
  nine: { id: 'nine', name: 'Nine Panel', panels: ninePanels, hint: '3 x 3 grid' },
  full: { id: 'full', name: 'Full Bleed', panels: fullPanels, hint: 'One photo, edge to edge' },
  duo: { id: 'duo', name: 'Duo Split', panels: duoPanels, hint: 'Two vertical halves' },
  tilted: { id: 'tilted', name: 'Tilted Snapshots', panels: tiltedPanels, hint: 'Overlapping tilted frames' },
  story: { id: 'story', name: 'Story Stack', panels: storyPanels, hint: 'Three bands for 9:16' },
};

/** The layout ids, in the order the picker shows them. */
export const LAYOUT_ORDER = ['hero', 'nine', 'full', 'duo', 'tilted', 'story'];

/**
 * Panels for a layout at a concrete cover size, in pixels.
 * Returns { x, y, w, h, rot, cx, cy } per panel (cx/cy are the centres).
 */
export function panelsFor(layoutId, width, height) {
  const layout = LAYOUTS[layoutId] ?? LAYOUTS.hero;
  return layout.panels().map((p) => {
    const x = p.x * width;
    const y = p.y * height;
    const w = p.w * width;
    const h = p.h * height;
    return { ...p, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  });
}

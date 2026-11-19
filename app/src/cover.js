// The render engine: drawCover(state, canvas) paints the whole cover on a
// 2D canvas at export resolution. Everything is drawn by hand on canvas —
// no images are fetched, no fonts leave app/fonts/.
//
// A cover is: a white poster frame, one of six panel layouts filled with the
// user's photos, a colour grade over every panel, thin black keylines, a
// title block with halftone dots and original display lettering, a HEAT
// meter, a ribbon badge, film grain and a vignette.

import { panelsFor } from './layouts.js';

/** Colour grades: a canvas filter for the photo plus overlay gradients. */
export const GRADES = {
  sunset: {
    id: 'sunset', name: 'Vice Sunset',
    filter: 'saturate(1.35) contrast(1.12) brightness(1.03)',
    overlays: [
      { blend: 'overlay', alpha: 0.55, stops: [[0, '#ff7a18'], [0.55, '#ff2e88'], [1, '#7b2ff7']] },
      { blend: 'soft-light', alpha: 0.35, stops: [[0, '#ffd319'], [1, '#ff2975']] },
    ],
  },
  neon: {
    id: 'neon', name: 'Neon Nights',
    filter: 'saturate(1.6) contrast(1.18) brightness(0.98)',
    overlays: [
      { blend: 'overlay', alpha: 0.6, stops: [[0, '#ff2e88'], [0.5, '#7b2ff7'], [1, '#00e5ff']] },
      { blend: 'soft-light', alpha: 0.4, stops: [[0, '#00e5ff'], [1, '#ff2e88']] },
    ],
  },
  golden: {
    id: 'golden', name: 'Golden Hour',
    filter: 'saturate(1.25) contrast(1.08) brightness(1.08) sepia(0.25)',
    overlays: [
      { blend: 'soft-light', alpha: 0.5, stops: [[0, '#ffd319'], [0.6, '#ff9a3c'], [1, '#b34700']] },
      { blend: 'overlay', alpha: 0.25, stops: [[0, '#fff3b0'], [1, '#ff7a18']] },
    ],
  },
  bubblegum: {
    id: 'bubblegum', name: 'Bubblegum',
    filter: 'saturate(1.9) contrast(1.15) brightness(1.05)',
    overlays: [
      { blend: 'overlay', alpha: 0.55, stops: [[0, '#ff2975'], [1, '#00e5ff']] },
      { blend: 'soft-light', alpha: 0.35, stops: [[0, '#ff8fd1'], [1, '#ff2975']] },
    ],
  },
  noir: {
    id: 'noir', name: 'Noir',
    filter: 'grayscale(1) contrast(1.35) brightness(1.02)',
    overlays: [
      { blend: 'overlay', alpha: 0.35, stops: [[0, '#ff2e88'], [1, '#1a1a2e']] },
      { blend: 'soft-light', alpha: 0.3, stops: [[0, '#ffffff'], [1, '#000000']] },
    ],
  },
};

export const GRADE_ORDER = ['sunset', 'neon', 'golden', 'bubblegum', 'noir'];

/** Export sizes the app offers, in pixels. */
export const SIZES = {
  '1080x1080': { w: 1080, h: 1080, label: 'Square 1080 x 1080' },
  '1080x1350': { w: 1080, h: 1350, label: 'Portrait 1080 x 1350' },
  '1920x1080': { w: 1920, h: 1080, label: 'Landscape 1920 x 1080' },
  '1080x1920': { w: 1080, h: 1920, label: 'Story 1080 x 1920' },
};

export const SIZE_ORDER = ['1080x1080', '1080x1350', '1920x1080', '1080x1920'];

/** A deterministic pseudo-random generator, so the grain looks the same every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One shared grain tile, built once and stamped over the cover. */
let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 160; tile.height = 160;
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(160, 160);
  const rand = mulberry32(20261119);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  grainTile = tile;
  return tile;
}

/**
 * Where a photo lands inside a panel: scale to fit or fill, then zoom and
 * pan. ox/oy are fractions of the panel (-0.5..0.5); zoom is a multiplier.
 * Returns { dx, dy, dw, dh } in panel-local pixels.
 */
export function fitPhotoInPanel(img, panel, zoom, ox, oy, fit) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const base = fit
    ? Math.min(panel.w / iw, panel.h / ih)
    : Math.max(panel.w / iw, panel.h / ih);
  const scale = base * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  return {
    dx: (panel.w - dw) / 2 + ox * panel.w,
    dy: (panel.h - dh) / 2 + oy * panel.h,
    dw, dh,
  };
}

/** Paints one grade's overlay gradients over a panel rectangle. */
function applyGrade(ctx, panel, grade) {
  for (const layer of grade.overlays) {
    const grad = ctx.createLinearGradient(panel.x, panel.y, panel.x + panel.w * 0.25, panel.y + panel.h);
    for (const [stop, color] of layer.stops) grad.addColorStop(stop, color);
    ctx.save();
    ctx.globalCompositeOperation = layer.blend;
    ctx.globalAlpha = layer.alpha;
    ctx.fillStyle = grad;
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.restore();
  }
}

/** Draws one photo panel: photo, grade, keyline, and a selection ring. */
function drawPanel(ctx, panel, photo, grade, selected) {
  ctx.save();
  if (panel.rot) {
    ctx.translate(panel.cx, panel.cy);
    ctx.rotate((panel.rot * Math.PI) / 180);
    ctx.translate(-panel.cx, -panel.cy);
  }
  // Snapshot-frame look for the tilted layout: a white mat around the photo.
  const mat = panel.rot ? Math.min(panel.w, panel.h) * 0.045 : 0;
  ctx.beginPath();
  ctx.rect(panel.x, panel.y, panel.w, panel.h);
  ctx.clip();
  ctx.fillStyle = '#1b1030';
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  if (photo && photo.img) {
    const inner = { x: panel.x + mat, y: panel.y + mat, w: panel.w - 2 * mat, h: panel.h - 2 * mat };
    const placed = fitPhotoInPanel(photo.img, inner, photo.zoom, photo.ox, photo.oy, photo.fit);
    ctx.filter = grade.filter;
    ctx.drawImage(photo.img, inner.x + placed.dx, inner.y + placed.dy, placed.dw, placed.dh);
    ctx.filter = 'none';
    applyGrade(ctx, inner, grade);
  } else {
    // Empty panel: a sunset placeholder so the grid still reads as a poster.
    const grad = ctx.createLinearGradient(panel.x, panel.y, panel.x, panel.y + panel.h);
    grad.addColorStop(0, '#ff7a18'); grad.addColorStop(0.5, '#ff2e88'); grad.addColorStop(1, '#2b1055');
    ctx.fillStyle = grad;
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${Math.max(14, panel.h * 0.05)}px Anton, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DROP A PHOTO', panel.cx, panel.cy);
  }
  ctx.restore();
  // Keyline + (in the editor) a selection ring.
  ctx.save();
  if (panel.rot) {
    ctx.translate(panel.cx, panel.cy);
    ctx.rotate((panel.rot * Math.PI) / 180);
    ctx.translate(-panel.cx, -panel.cy);
  }
  ctx.lineWidth = Math.max(2, panel.w * 0.004);
  ctx.strokeStyle = '#111';
  ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);
  if (selected) {
    ctx.lineWidth = Math.max(3, panel.w * 0.006);
    ctx.strokeStyle = '#ffd319';
    ctx.setLineDash([Math.max(10, panel.w * 0.02), Math.max(8, panel.w * 0.015)]);
    ctx.strokeRect(panel.x + 4, panel.y + 4, panel.w - 8, panel.h - 8);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** Halftone dots across a band: the print-poster texture of the title block. */
function drawHalftone(ctx, x, y, w, h, color) {
  const step = Math.max(9, h * 0.16);
  ctx.save();
  ctx.fillStyle = color;
  for (let row = 0; row * step < h; row++) {
    for (let col = 0; col * step < w; col++) {
      const r = step * 0.16 * (1 + 0.5 * Math.sin(row * 1.3 + col * 0.7));
      ctx.beginPath();
      ctx.arc(x + col * step + step / 2, y + row * step + step / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The title block: sunset band, halftone, big gradient Anton title, Pacifico subtitle. */
function drawTitleBlock(ctx, state, w, h, frame) {
  const title = (state.title || '').trim().toUpperCase();
  const subtitle = (state.subtitle || '').trim();
  const bandH = Math.min(h * 0.22, Math.max(h * 0.13, w * 0.16));
  const bandY = state.titlePos === 'top' ? frame : h - frame - bandH;
  const bandX = frame;
  const bandW = w - 2 * frame;

  // Sunset band with a dark edge so the lettering pops on any photo.
  const band = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY);
  band.addColorStop(0, '#ff7a18'); band.addColorStop(0.45, '#ff2e88'); band.addColorStop(1, '#7b2ff7');
  ctx.save();
  ctx.fillStyle = band;
  ctx.fillRect(bandX, bandY, bandW, bandH);
  ctx.globalAlpha = 0.22;
  drawHalftone(ctx, bandX, bandY, bandW, bandH, '#ffffff');
  ctx.restore();
  ctx.lineWidth = Math.max(2, w * 0.002);
  ctx.strokeStyle = '#111';
  ctx.strokeRect(bandX, bandY, bandW, bandH);

  if (!title && !subtitle) return;
  const cx = bandX + bandW / 2;
  const midY = bandY + bandH / 2;

  if (title) {
    let size = bandH * 0.62 * (state.titleScale || 1);
    const grad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
    grad.addColorStop(0, '#fff3b0'); grad.addColorStop(0.5, '#ffd319'); grad.addColorStop(1, '#ff7a18');
    ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
    while (ctx.measureText(title).width > bandW * 0.92 && size > 16) {
      size -= 2;
      ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ty = subtitle ? midY - bandH * 0.14 : midY;
    // Hard drop shadow, then a white outline, then the sunset fill.
    ctx.fillStyle = '#1a0b2e';
    ctx.fillText(title, cx + size * 0.07, ty + size * 0.07);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(title, cx, ty);
    ctx.fillStyle = grad;
    ctx.fillText(title, cx, ty);
  }

  if (subtitle) {
    const size = Math.max(14, bandH * 0.24);
    ctx.font = `${size}px Pacifico, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sy = title ? midY + bandH * 0.30 : midY;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = size * 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(subtitle, cx, sy);
    ctx.shadowBlur = 0;
  }
}

/** The five-star HEAT meter: bottom-left when the title is on top, top-left otherwise. */
function drawHeatMeter(ctx, state, w, h, frame) {
  const stars = state.heat ?? 5;
  const size = Math.max(16, w * 0.022);
  const x0 = frame + w * 0.012;
  const y = state.titlePos === 'top'
    ? h - frame - size * 1.1
    : frame + size * 1.1;
  ctx.save();
  ctx.font = `bold ${size}px Anton, sans-serif`;
  const labelW = ctx.measureText('HEAT').width;
  const pillW = labelW + size * 0.5 + 5 * size * 1.25 + size * 0.4;
  const pillH = size * 1.9;
  ctx.fillStyle = 'rgba(248,243,234,0.92)';
  ctx.beginPath();
  ctx.roundRect(x0 - size * 0.3, y - pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.08);
  ctx.strokeStyle = '#111';
  ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#111';
  ctx.fillText('HEAT', x0, y);
  ctx.font = `${size * 1.15}px sans-serif`;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ff2975' : 'rgba(17,17,17,0.25)';
    ctx.fillText('★', x0 + labelW + size * 0.5 + i * size * 1.25, y);
  }
  ctx.restore();
}

/** A ribbon badge in the top-right corner: "EST. 2026 • LEONIDA". */
function drawRibbon(ctx, w, h, frame) {
  const badgeW = w * 0.30;
  const badgeH = Math.max(22, h * 0.032);
  const x = w - frame - badgeW;
  const y = frame;
  ctx.save();
  ctx.translate(x + badgeW / 2, y + badgeH / 2);
  ctx.rotate(-2 * Math.PI / 180);
  ctx.fillStyle = '#ffd319';
  ctx.beginPath();
  ctx.moveTo(-badgeW / 2, -badgeH / 2);
  ctx.lineTo(badgeW / 2, -badgeH / 2);
  ctx.lineTo(badgeW / 2 - badgeH * 0.5, badgeH / 2);
  ctx.lineTo(-badgeW / 2 + badgeH * 0.5, badgeH / 2);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = Math.max(2, badgeH * 0.08);
  ctx.strokeStyle = '#111';
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = `bold ${badgeH * 0.52}px Anton, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('EST. 2026  •  LEONIDA', 0, badgeH * 0.04);
  ctx.restore();
}

/** Film grain: the shared tile stamped at low alpha. */
function drawGrain(ctx, w, h) {
  const tile = getGrainTile();
  const pattern = ctx.createPattern(tile, 'repeat');
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** A soft dark vignette around the edges. */
function drawVignette(ctx, w, h) {
  const grad = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.42,
    w / 2, h / 2, Math.max(w, h) * 0.72,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(10,0,20,0.42)');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Draws the whole cover for `state` onto `canvas` (sized by the caller).
 * state: { layout, grade, title, subtitle, titleScale, titlePos, heat,
 *          photos: [{img, zoom, ox, oy, fit}], panels: [photoIndex | -1],
 *          selectedPanel, showFrame }.
 */
export function drawCover(state, canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  const frame = Math.round(Math.min(w, h) * 0.018);
  const gutter = Math.round(Math.min(w, h) * 0.012);

  // White poster frame.
  ctx.save();
  ctx.fillStyle = '#f8f3ea';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const innerW = w - 2 * frame;
  const innerH = h - 2 * frame;

  // Sunset backdrop for the tilted layout (and a warm wash behind the rest).
  if (state.layout === 'tilted') {
    const sky = ctx.createLinearGradient(0, frame, 0, h - frame);
    sky.addColorStop(0, '#2b1055'); sky.addColorStop(0.45, '#ff2e88');
    sky.addColorStop(0.75, '#ff7a18'); sky.addColorStop(1, '#ffd319');
    ctx.fillStyle = sky;
    ctx.fillRect(frame, frame, innerW, innerH);
    // Sun disc behind the frames.
    ctx.save();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(w / 2, frame + innerH * 0.30, Math.min(innerW, innerH) * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Panels, drawn inside the frame on an offset context.
  const panels = panelsFor(state.layout, innerW - gutter, innerH - gutter);
  ctx.save();
  ctx.translate(frame + gutter / 2, frame + gutter / 2);
  panels.forEach((panel, i) => {
    const photoIndex = state.panels?.[i] ?? -1;
    const photo = photoIndex >= 0 ? state.photos[photoIndex] : null;
    drawPanel(ctx, panel, photo, grade, state.selectedPanel === i && state.showSelection);
  });
  ctx.restore();

  drawTitleBlock(ctx, state, w, h, frame);
  drawRibbon(ctx, w, h, frame);
  drawHeatMeter(ctx, state, w, h, frame);
  drawGrain(ctx, w, h);
  drawVignette(ctx, w, h);
}

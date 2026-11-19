// Wires the page: photos in, cover out. State lives in one object; every
// change snapshots it for undo/redo, then redraws the preview canvas.
// A `?shot=` query sets up a fixed scene for a screenshot instead (./shots.js).
import { drawCover, GRADES, GRADE_ORDER, SIZES, SIZE_ORDER } from './cover.js';
import { LAYOUTS, LAYOUT_ORDER, panelsFor } from './layouts.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const titleInput = document.getElementById('title');
const subtitleInput = document.getElementById('subtitle');

// Any uncaught page error is written into the title, so a headless check can
// see it in the dumped DOM instead of guessing from a blank canvas.
window.addEventListener('error', (event) => {
  document.title = `ERR: ${event.message}`;
});

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/** Loads the bundled fonts before the first draw, so lettering is real. */
async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
    ]);
    await document.fonts.ready;
  } catch {
    // System fonts still draw; the cover stays shippable.
  }
}

/** A fresh, empty cover state. */
function freshState() {
  return {
    layout: 'hero',
    grade: 'sunset',
    title: 'BOULEVARD QUEEN',
    subtitle: 'welcome to Leonida',
    titleScale: 1,
    titlePos: 'bottom',
    heat: 5,
    size: '1080x1080',
    photos: [],          // [{ img, name, zoom, ox, oy, fit }] — per-photo crop
    panels: [-1, -1, -1, -1, -1, -1, -1, -1, -1], // panel -> photo index
    selectedPanel: 0,
    showSelection: true,
  };
}

const state = freshState();

/** Undo/redo stacks hold snapshots (photos by index, never the images). */
const undoStack = [];
const redoStack = [];

function snapshot() {
  return JSON.parse(JSON.stringify({
    layout: state.layout, grade: state.grade, title: state.title,
    subtitle: state.subtitle, titleScale: state.titleScale,
    titlePos: state.titlePos, heat: state.heat, size: state.size,
    panels: state.panels, selectedPanel: state.selectedPanel,
    photos: state.photos.map((p) => ({ name: p.name, zoom: p.zoom, ox: p.ox, oy: p.oy, fit: p.fit })),
  }));
}

function restore(snap) {
  state.layout = snap.layout; state.grade = snap.grade;
  state.title = snap.title; state.subtitle = snap.subtitle;
  state.titleScale = snap.titleScale; state.titlePos = snap.titlePos;
  state.heat = snap.heat; state.size = snap.size;
  state.panels = snap.panels.slice();
  state.selectedPanel = snap.selectedPanel;
  snap.photos.forEach((p, i) => {
    if (state.photos[i]) Object.assign(state.photos[i], p);
  });
  syncControls();
}

/** Records the current state, then applies `change` and redraws. */
function commit(change) {
  undoStack.push(snapshot());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  change();
  syncControls();
  redraw();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  redraw();
  status('Undone.');
}

/**
 * Drags and sliders change state continuously, so a snapshot has to be
 * taken before the change starts, not when it ends. armSnapshot() captures
 * one on pointerdown/focus; pushArmed() files it once the change lands.
 */
let armedSnapshot = null;
function armSnapshot() { armedSnapshot = snapshot(); }
function pushArmed() {
  if (!armedSnapshot) return;
  undoStack.push(armedSnapshot);
  armedSnapshot = null;
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  redraw();
  status('Redone.');
}

function status(text) {
  statusEl.textContent = text;
}

/** The panel count of the current layout; panels beyond it hold -1. */
function panelCount() {
  return panelsFor(state.layout, 100, 100).length;
}

/** Assigns photos to panels: round-robin, so every panel shows a photo. */
function dealPhotos() {
  const n = panelCount();
  state.panels = Array.from({ length: 9 }, (_, i) => {
    if (i >= n || !state.photos.length) return -1;
    return i % state.photos.length;
  });
}

/** Adds image files (from picker or drag/drop) as new photos. */
async function addFiles(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) { status('That was not an image file.'); return; }
  for (const file of images) {
    if (state.photos.length >= 4) { status('Four photos at most — remove one first.'); break; }
    const img = await loadImage(URL.createObjectURL(file));
    state.photos.push({ img, name: file.name, zoom: 1, ox: 0, oy: 0, fit: false });
  }
  commit(() => dealPhotos());
  status(`${state.photos.length} photo${state.photos.length === 1 ? '' : 's'} loaded.`);
}

/** Loads one of the bundled sample photos. */
async function loadSample(name) {
  const img = await loadImage(`samples/${name}.jpg`);
  const existing = state.photos.findIndex((p) => p.name === `${name}.jpg`);
  if (existing === -1) {
    if (state.photos.length >= 4) state.photos.shift();
    state.photos.push({ img, name: `${name}.jpg`, zoom: 1, ox: 0, oy: 0, fit: false });
  } else {
    state.photos[existing].img = img;
  }
  commit(() => dealPhotos());
  status(`Sample photo “${name}” loaded.`);
}

/** Redraws the preview canvas at the chosen export size. */
function redraw() {
  const size = SIZES[state.size];
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  drawCover(state, canvas);
}

/** Renders the cover at `sizeKey` on an offscreen canvas and downloads it. */
function exportPng(sizeKey) {
  const size = SIZES[sizeKey];
  const off = document.createElement('canvas');
  off.width = size.w; off.height = size.h;
  drawCover({ ...state, size: sizeKey, showSelection: false }, off);
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sunset-cover-${sizeKey}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      resolve();
    }, 'image/png');
  });
}

async function exportAllSizes() {
  for (const key of SIZE_ORDER) {
    await exportPng(key);
    status(`Exported ${key}…`);
    await new Promise((r) => setTimeout(r, 250));
  }
  status('Exported all four sizes.');
}

/** The photo shown in a panel, if any. */
function panelPhoto(i) {
  const idx = state.panels[i];
  return idx >= 0 ? state.photos[idx] : null;
}

/** Hit-tests a canvas point (CSS pixels) to a panel index, or -1. Panels are
 * drawn inside the frame, offset by frame + gutter/2, so the test mirrors
 * the same offset the renderer uses. */
function hitPanel(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = ((clientX - rect.left) / rect.width) * canvas.width;
  const py = ((clientY - rect.top) / rect.height) * canvas.height;
  const frame = Math.round(Math.min(canvas.width, canvas.height) * 0.018);
  const gutter = Math.round(Math.min(canvas.width, canvas.height) * 0.012);
  const panels = panelsFor(state.layout, canvas.width - 2 * frame - gutter, canvas.height - 2 * frame - gutter);
  const ox = frame + gutter / 2;
  const oy = frame + gutter / 2;
  // Test from the top panel down so an overlapping tilted frame wins over
  // the one under it.
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i];
    const dx = px - (ox + p.cx);
    const dy = py - (oy + p.cy);
    const rot = (-p.rot * Math.PI) / 180;
    const lx = dx * Math.cos(rot) - dy * Math.sin(rot);
    const ly = dx * Math.sin(rot) + dy * Math.cos(rot);
    if (Math.abs(lx) <= p.w / 2 && Math.abs(ly) <= p.h / 2) return i;
  }
  return -1;
}

// --- Drag to pan the photo inside the selected panel -----------------------

let drag = null;

canvas.addEventListener('pointerdown', (e) => {
  const hit = hitPanel(e.clientX, e.clientY);
  if (hit === -1) return;
  state.selectedPanel = hit;
  syncControls();
  redraw();
  const photo = panelPhoto(hit);
  if (!photo) return;
  canvas.setPointerCapture(e.pointerId);
  armSnapshot();
  drag = { x: e.clientX, y: e.clientY, ox: photo.ox, oy: photo.oy, photo, moved: false };
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const frame = Math.round(Math.min(canvas.width, canvas.height) * 0.018);
  const gutter = Math.round(Math.min(canvas.width, canvas.height) * 0.012);
  const panels = panelsFor(state.layout, canvas.width - 2 * frame - gutter, canvas.height - 2 * frame - gutter);
  const p = panels[state.selectedPanel];
  const dx = ((e.clientX - drag.x) / rect.width) * (canvas.width / p.w);
  const dy = ((e.clientY - drag.y) / rect.height) * (canvas.height / p.h);
  drag.photo.ox = Math.max(-0.5, Math.min(0.5, drag.ox + dx));
  drag.photo.oy = Math.max(-0.5, Math.min(0.5, drag.oy + dy));
  if (Math.abs(dx) + Math.abs(dy) > 0.01) drag.moved = true;
  redraw();
});

canvas.addEventListener('pointerup', () => {
  if (drag?.moved) pushArmed();
  drag = null;
});

// --- Controls ---------------------------------------------------------------

const layoutsEl = document.getElementById('layouts');
for (const id of LAYOUT_ORDER) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = LAYOUTS[id].name;
  b.dataset.layout = id;
  b.addEventListener('click', () => commit(() => {
    state.layout = id;
    dealPhotos();
    state.selectedPanel = 0;
  }));
  layoutsEl.appendChild(b);
}

const gradesEl = document.getElementById('grades');
for (const id of GRADE_ORDER) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `swatch swatch-${id}`;
  b.title = GRADES[id].name;
  b.setAttribute('aria-label', GRADES[id].name);
  b.dataset.grade = id;
  b.addEventListener('click', () => commit(() => { state.grade = id; }));
  gradesEl.appendChild(b);
}

const sizesEl = document.getElementById('sizes');
for (const key of SIZE_ORDER) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = SIZES[key].label;
  b.dataset.size = key;
  b.addEventListener('click', () => commit(() => { state.size = key; }));
  sizesEl.appendChild(b);
}

const panelsEl = document.getElementById('panels');
function rebuildPanelButtons() {
  panelsEl.innerHTML = '';
  for (let i = 0; i < panelCount(); i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `Panel ${i + 1}`;
    b.dataset.panel = i;
    b.addEventListener('click', () => {
      state.selectedPanel = i;
      syncControls();
      redraw();
    });
    panelsEl.appendChild(b);
  }
}

document.getElementById('photo').addEventListener('change', (e) => addFiles(e.target.files));
document.getElementById('try-boulevard').addEventListener('click', () => loadSample('boulevard'));
document.getElementById('try-pier').addEventListener('click', () => loadSample('pier'));
document.getElementById('fill-all').addEventListener('click', () => {
  if (!state.photos.length) { status('Load a photo first.'); return; }
  commit(() => { state.panels = state.panels.map((_, i) => (i < panelCount() ? 0 : -1)); });
  status('One photo fills every panel.');
});
document.getElementById('shuffle').addEventListener('click', () => {
  if (state.photos.length < 2) { status('Load at least two photos to shuffle.'); return; }
  commit(() => {
    const order = [...state.photos.keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    state.panels = state.panels.map((p) => (p < 0 ? -1 : order[p]));
  });
  status('Photos shuffled across the panels.');
});

const zoomInput = document.getElementById('zoom');
zoomInput.addEventListener('input', () => {
  const photo = panelPhoto(state.selectedPanel);
  if (!photo) return;
  photo.zoom = Number(zoomInput.value);
  redraw();
});
zoomInput.addEventListener('pointerdown', armSnapshot);
zoomInput.addEventListener('focus', armSnapshot);
zoomInput.addEventListener('change', pushArmed);

document.getElementById('fit').addEventListener('click', () => {
  const photo = panelPhoto(state.selectedPanel);
  if (!photo) return;
  commit(() => { photo.fit = true; });
});
document.getElementById('fill').addEventListener('click', () => {
  const photo = panelPhoto(state.selectedPanel);
  if (!photo) return;
  commit(() => { photo.fit = false; });
});

titleInput.addEventListener('input', () => { state.title = titleInput.value; redraw(); });
titleInput.addEventListener('focus', armSnapshot);
titleInput.addEventListener('change', pushArmed);
subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; redraw(); });
subtitleInput.addEventListener('focus', armSnapshot);
subtitleInput.addEventListener('change', pushArmed);

document.getElementById('title-size').addEventListener('input', (e) => {
  state.titleScale = Number(e.target.value);
  redraw();
});
document.getElementById('title-size').addEventListener('pointerdown', armSnapshot);
document.getElementById('title-size').addEventListener('focus', armSnapshot);
document.getElementById('title-size').addEventListener('change', pushArmed);

document.getElementById('pos-bottom').addEventListener('click', () => commit(() => { state.titlePos = 'bottom'; }));
document.getElementById('pos-top').addEventListener('click', () => commit(() => { state.titlePos = 'top'; }));
document.getElementById('heat').addEventListener('input', (e) => {
  state.heat = Number(e.target.value);
  redraw();
});
document.getElementById('heat').addEventListener('pointerdown', armSnapshot);
document.getElementById('heat').addEventListener('focus', armSnapshot);
document.getElementById('heat').addEventListener('change', pushArmed);

document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('export').addEventListener('click', async () => {
  await exportPng(state.size);
  status(`Exported sunset-cover-${state.size}.png`);
});
document.getElementById('export-all').addEventListener('click', exportAllSizes);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  }
});

// Drag and drop onto the whole app, and onto individual panels.
const dropzone = document.getElementById('dropzone');
for (const target of [dropzone, canvas, document.body]) {
  target.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('over');
  });
  target.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('over');
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });
}

/** Marks the active buttons and inputs for the current state. */
function syncControls() {
  for (const b of layoutsEl.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  }
  for (const b of gradesEl.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  }
  for (const b of sizesEl.querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.size === state.size);
  }
  document.getElementById('layout-hint').textContent = LAYOUTS[state.layout].hint;
  document.getElementById('grade-hint').textContent = `${GRADES[state.grade].name} grade`;
  document.getElementById('pos-bottom').classList.toggle('active', state.titlePos === 'bottom');
  document.getElementById('pos-top').classList.toggle('active', state.titlePos === 'top');
  titleInput.value = state.title;
  subtitleInput.value = state.subtitle;
  document.getElementById('title-size').value = String(state.titleScale);
  document.getElementById('heat').value = String(state.heat);
  const photo = panelPhoto(state.selectedPanel);
  document.getElementById('fit').classList.toggle('active', photo?.fit === true);
  document.getElementById('fill').classList.toggle('active', photo?.fit !== true);
  if (photo) zoomInput.value = String(photo.zoom);
  rebuildPanelButtons();
  for (const b of panelsEl.querySelectorAll('button')) {
    b.classList.toggle('active', Number(b.dataset.panel) === state.selectedPanel);
  }
  document.getElementById('undo').disabled = !undoStack.length;
  document.getElementById('redo').disabled = !redoStack.length;
}

// --- Shot scenes and first paint -------------------------------------------

/** The API shots.js drives: load a sample, set the caption, apply shot params. */
const shotApi = {
  async loadSample(name, captionText) {
    const img = await loadImage(`samples/${name}.jpg`);
    state.photos = [{ img, name: `${name}.jpg`, zoom: 1, ox: 0, oy: 0, fit: false }];
    state.title = captionText;
    titleInput.value = captionText;
    dealPhotos();
    redraw();
  },
  applyQuery(query) {
    if (query.get('layout') && LAYOUTS[query.get('layout')]) state.layout = query.get('layout');
    if (query.get('grade') && GRADES[query.get('grade')]) state.grade = query.get('grade');
    if (query.get('size') && SIZES[query.get('size')]) state.size = query.get('size');
    if (query.get('subtitle')) { state.subtitle = query.get('subtitle'); subtitleInput.value = state.subtitle; }
    if (query.get('titlepos') === 'top') state.titlePos = 'top';
    state.showSelection = false;
    dealPhotos();
    syncControls();
  },
  /** Draws the cover at its export size on an offscreen canvas and returns a PNG data URL. */
  exportDataUrl() {
    const size = SIZES[state.size];
    const off = document.createElement('canvas');
    off.width = size.w; off.height = size.h;
    drawCover({ ...state, showSelection: false }, off);
    return off.toDataURL('image/png');
  },
  redraw,
};

const shot = new URLSearchParams(location.search).get('shot');
await loadFonts();
if (shot) {
  await runShot(shot, new URLSearchParams(location.search), shotApi);
} else {
  syncControls();
  redraw();
}

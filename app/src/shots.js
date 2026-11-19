// Fixed scenes for screenshots: ?shot=cover shows the cover alone, full-frame;
// ?shot=editor shows the editor with a sample photo loaded; ?shot=export
// draws the cover at its export size and stores the PNG as a data URL on
// document.documentElement's data-png attribute, so a headless check can
// verify the real export path. window.__shotReady is set once painted.
//
// Query params: photo (boulevard|pier), caption, layout, grade, size,
// subtitle, titlepos.
export async function runShot(shot, query, api) {
  const photo = query.get('photo') ?? 'pier';
  const caption = query.get('caption') ?? 'Sunset Heist';
  api.applyQuery(query);

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    await api.loadSample(photo, caption);
  } else if (shot === 'editor') {
    await api.loadSample(photo, caption);
  } else if (shot === 'export') {
    await api.loadSample(photo, caption);
    const dataUrl = api.exportDataUrl();
    document.documentElement.setAttribute('data-png', dataUrl);
  }

  api.redraw();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}

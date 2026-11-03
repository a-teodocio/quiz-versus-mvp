// ─── Utilities ──────────────────────────────────────────────────────────────
// Only view changes (session start, results, home) call this; moving between
// questions leaves the scroll position alone.
function scrollToTop() { window.scrollTo(0, 0); }
// Animated scrolls (the top buttons, Next/Prev, revealing the explanation) skip the
// animation when the OS asks for reduced motion.
function scrollBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
function scrollToTopSmooth() { window.scrollTo({ top: 0, behavior: scrollBehavior() }); }
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function openZoom(src) {
  document.getElementById('zoomImg').src = src;
  document.getElementById('zoomOverlay').classList.add('active');
}
function closeZoom() {
  const ov = document.getElementById('zoomOverlay');
  ov.classList.remove('active', 'magnified');
  document.getElementById('zoomHint').textContent = ZOOM_HINT_FIT;
}
// Touch only: a tap on the picture toggles between fit-to-screen and a scrollable magnified view
// (a mouse keeps plain click-to-close). Pinch-zoom still works as before.
const ZOOM_HINT_FIT = 'Tap the picture to magnify';
const ZOOM_HINT_BIG = 'Drag to look around. Tap the picture to shrink';
function toggleZoomMagnify() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const ov = document.getElementById('zoomOverlay');
  const big = ov.classList.toggle('magnified');
  document.getElementById('zoomHint').textContent = big ? ZOOM_HINT_BIG : ZOOM_HINT_FIT;
  ov.scrollTo(0, 0);
}


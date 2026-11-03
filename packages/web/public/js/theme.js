// ─── Theme menu: light / dark / system and the palette ───────────────────────
// Two independent attributes on <html>: data-theme (light | dark, absent = follow the OS) and data-palette
// (absent = Classic). Both are restored by the script in <head> before the first paint. Storage:
// mlsquiz_theme ('light' or 'dark', removed for System) and mlsquiz_palette (a palette id, removed for Classic).
// To add a palette: add its CSS rules (light, OS dark, explicit dark) and one entry here.
const PALETTES = [
  { id: 'classic', name: 'Classic', swatch: ['#f5f4f0', '#3d6cf7'] },
  { id: 'sage', name: 'Sage', swatch: ['#eaf3e9', '#1f6c82'] },
  { id: 'lavender', name: 'Lavender', swatch: ['#f2eefa', '#625699'] },
  { id: 'blush', name: 'Blush', swatch: ['#fbeced', '#7f4b82'] },
  { id: 'sky', name: 'Sky', swatch: ['#e6f2fa', '#2d659b'] },
  { id: 'peach', name: 'Peach', swatch: ['#faede6', '#2e688d'] },
  { id: 'sand', name: 'Sand', swatch: ['#f5f0e4', '#296b82'] },
  { id: 'mauve', name: 'Mauve', swatch: ['#f8ecf5', '#745189'] },
];

function currentPalette() {
  const id = document.documentElement.dataset.palette;
  return PALETTES.some(p => p.id === id) ? id : 'classic';
}

function buildThemeMenu() {
  const html = document.documentElement;
  if (html.dataset.palette && currentPalette() === 'classic') delete html.dataset.palette;  // unknown saved name
  const list = document.getElementById('paletteList');
  PALETTES.forEach(p => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item palette-item';
    btn.setAttribute('role', 'menuitemradio');
    btn.tabIndex = -1;
    btn.dataset.palette = p.id;
    btn.onclick = ev => setPalette(p.id, ev.detail === 0);  // detail 0 = Enter or Space
    const sw = document.createElement('span');
    sw.className = 'palette-swatch';
    sw.style.background = 'linear-gradient(135deg, ' + p.swatch[0] + ' 50%, ' + p.swatch[1] + ' 50%)';
    const name = document.createElement('span');
    name.className = 'palette-name';
    name.textContent = p.name;
    const check = document.createElement('span');
    check.className = 'menu-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';
    btn.append(sw, name, check);
    list.appendChild(btn);
  });
  syncThemeMenu();
}

function syncThemeMenu() {
  const mode = document.documentElement.dataset.theme || 'system';
  const palette = currentPalette();
  document.querySelectorAll('#themeMenu .theme-mode').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === mode ? 'true' : 'false'));
  document.querySelectorAll('#themeMenu .palette-item').forEach(b => b.setAttribute('aria-checked', b.dataset.palette === palette ? 'true' : 'false'));
}

function setThemeMode(mode) {
  const html = document.documentElement;
  if (mode === 'light' || mode === 'dark') html.dataset.theme = mode; else delete html.dataset.theme;
  try {
    if (mode === 'light' || mode === 'dark') localStorage.setItem('mlsquiz_theme', mode); else localStorage.removeItem('mlsquiz_theme');
  } catch {}
  syncThemeMenu();  // the menu stays open so the mode and the palette can be tried together
}

function setPalette(id, byKeyboard) {
  const html = document.documentElement;
  if (id === 'classic') delete html.dataset.palette; else html.dataset.palette = id;
  try {
    if (id === 'classic') localStorage.removeItem('mlsquiz_palette'); else localStorage.setItem('mlsquiz_palette', id);
  } catch {}
  syncThemeMenu();
  closeThemeMenu(byKeyboard === true);  // after a mouse pick focus is not parked on the button, so 1-4 and Enter still reach the quiz
}

function themeMenuItems() {
  return Array.from(document.querySelectorAll('#themeMenu [role="menuitemradio"]'));
}

function focusThemeItem(item) {
  themeMenuItems().forEach(b => { b.tabIndex = b === item ? 0 : -1; });
  item.focus();
}

function openThemeMenu(focusLast) {
  closeRoundMenu();
  show('themeMenu');
  document.getElementById('themeBtn').setAttribute('aria-expanded', 'true');
  const items = themeMenuItems();
  focusThemeItem(focusLast ? items[items.length - 1] : (items.find(b => b.dataset.palette === currentPalette()) || items[0]));
}

function closeThemeMenu(returnFocus) {
  if (document.getElementById('themeMenu').classList.contains('hidden')) return;
  hide('themeMenu');
  const btn = document.getElementById('themeBtn');
  btn.setAttribute('aria-expanded', 'false');
  if (returnFocus) btn.focus();
}

function toggleThemeMenu(ev) {
  if (document.getElementById('themeMenu').classList.contains('hidden')) { openThemeMenu(false); return; }
  const byKeyboard = ev.detail === 0;
  closeThemeMenu(byKeyboard);
  if (!byKeyboard) document.getElementById('themeBtn').blur();  // a mouse click must not leave Enter pointing at the button
}

// Arrow keys move through the menu (the light/dark/system row is first, then the palettes); Tab leaves it.
document.getElementById('themeMenu').addEventListener('keydown', e => {
  const items = themeMenuItems();
  const at = items.indexOf(document.activeElement);
  let to = null;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') to = items[(at + 1) % items.length];
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') to = items[(at - 1 + items.length) % items.length];
  else if (e.key === 'Home') to = items[0];
  else if (e.key === 'End') to = items[items.length - 1];
  else if (e.key === 'Tab') { closeThemeMenu(true); return; }
  if (to) { e.preventDefault(); focusThemeItem(to); }
});
document.getElementById('themeBtn').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openThemeMenu(e.key === 'ArrowUp'); }
});


import './style.css';
import { readWorkbook } from './catalog.js';
import { StarMap } from './star-map.js';
import { PlanarMap } from './planar-map.js';
import { downloadPlanarMap } from './planar-export.js';

const $ = selector => document.querySelector(selector);
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const fmt = (value, unit = '') => value === null || value === undefined || value === '' ? 'Not provided' : `${Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(value)}${unit ? ` ${unit}` : ''}`;
let catalog, selectedId, selectedPlanet = null, sourceUrl = null, loadVersion = 0, map, planarMap;
let theme = 'dark';
let view = '3d';
let focusedStarId = null;
const activeMap = () => view === '2d' ? planarMap : map;

function rememberFocus(id) {
  if (catalog?.byId.has(String(id))) focusedStarId = String(id);
}

function setView(next) {
  view = next === '2d' ? '2d' : '3d';
  $('#viewport').dataset.view = view;
  planarMap.setActive(view === '2d');
  const button = $('#view-toggle');
  button.textContent = view === '2d' ? '3D view' : '2D view';
  button.setAttribute('aria-label', view === '2d' ? 'Switch to 3D view' : 'Switch to 2D view');
  button.setAttribute('aria-pressed', String(view === '2d'));
  $('#viewport').setAttribute('aria-label', view === '2d' ?
    '2D planar star map. Drag to pan, scroll to zoom, click a star to select. Arrow keys pan.' :
    '3D star map. Drag to orbit, right-drag to pan, scroll to zoom. Arrow keys pan.');
  $('#map-gesture').textContent = view === '2d' ? 'DRAG: PAN / SCROLL: ZOOM / CLICK: SELECT' :
    'DRAG: ORBIT / RIGHT-DRAG: PAN / SCROLL: ZOOM';
  $('#map-scale').textContent = view === '2d' ? 'X/Y projection · Z omitted' : 'J2000 · Light-years';
  if (catalog && focusedStarId) activeMap().focus(focusedStarId, false);
}

function renderLegend() {
  const items = $('#legend-items'); items.replaceChildren();
  for (const faction of catalog.factions.values()) {
    const row = el('div', undefined, 'legend-entry');
    const swatch = el('i'); swatch.style.backgroundColor = faction.color;
    row.append(swatch, el('span', faction.name)); row.title = faction.id;
    items.append(row);
  }
  const unclaimed = el('div', undefined, 'legend-entry');
  unclaimed.append(el('i', undefined, 'legend-neutral'), el('span', 'No recorded owner'));
  items.append(unclaimed);
}

function setTheme(next, persist = true) {
  theme = next === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#050914' : '#772e32';
  const button = $('#theme-toggle');
  button.textContent = theme === 'dark' ? '☼ Light' : '◐ Dark';
  button.setAttribute('aria-pressed', String(theme === 'light'));
  if (persist) localStorage.setItem('heavens-gate-theme', theme);
  map?.setTheme(theme);
  planarMap?.setTheme(theme);
}

function facts(items) {
  const list = el('dl', undefined, 'facts');
  for (const [label, value] of items) { const row = el('div'); row.append(el('dt', label), el('dd', value)); list.append(row); }
  return list;
}
function owners(ids) {
  const list = el('div', undefined, 'owner-list');
  if (!ids.length) { list.append(el('span', 'No ownership recorded', 'empty')); return list; }
  for (const id of ids) {
    const f = catalog.factions.get(id), badge = el('span', undefined, 'owner');
    const dot = el('i'); dot.style.setProperty('--owner', f.color); badge.append(dot, document.createTextNode(f.name));
    badge.title = `${f.id}${f.notes ? ` — ${f.notes}` : ''}`; list.append(badge);
  }
  return list;
}
function section(title, right = '') {
  const node = el('div', undefined, 'section-title'); node.append(el('span', title), el('small', right)); return node;
}
function showPlanet(planet) {
  selectedPlanet = planet.name;
  const panel = $('#planet-detail'); panel.replaceChildren();
  document.querySelectorAll('.planet-button').forEach(b => b.classList.toggle('active', b.dataset.planet === planet.name));
  panel.append(el('i', undefined, 'planet-glyph'), el('h3', planet.name), owners(planet.owners));
  const r = planet.row;
  panel.append(facts([
    ['Orbital size', fmt(r.semi_major_axis_au, 'AU')], ['Orbital period', fmt(r.orbital_period_days, 'days')],
    ['Eccentricity', fmt(r.eccentricity)], ['Radius', fmt(r.radius_earth, 'R⊕')],
    [r.mass_provenance === 'Msini' ? 'Minimum mass (M sin i)' : 'Mass / M sin i', fmt(r.mass_or_msini_earth, 'M⊕')],
    ['Incident flux', fmt(r.insolation_earth, 'Earth')], ['Equilibrium temperature', fmt(r.equilibrium_temperature_k, 'K')],
    ['Discovery', [r.discovery_method, r.discovery_year].filter(Boolean).join(' · ') || 'Not provided']
  ]));
  if (!planet.included) panel.append(el('p', 'Excluded from the spreadsheet planet count.', 'note'));
  if (Number(r.controversial)) panel.append(el('p', 'Flagged controversial in the NASA archive.', 'note'));
  if (r.notes) panel.append(el('p', String(r.notes), 'note'));
  panel.append(el('p', 'Orbital size is semi-major axis. Equilibrium temperature is not surface temperature. Measurements do not establish habitability.', 'planet-meta'));
  if (r.reference) panel.append(el('p', String(r.reference), 'planet-meta'));
  if (/^https?:\/\//i.test(r.reference_url ?? '')) {
    const a = el('a', 'Read the source ↗'); a.href = r.reference_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; panel.append(a);
  }
}
function selectStar(id, focus = false) {
  if (!catalog?.byId.has(String(id))) return;
  const star = catalog.byId.get(String(id)); selectedId = star.id; selectedPlanet = null;
  map.select(star.id); planarMap.select(star.id); if (focus) activeMap().focus(star.id);
  const details = $('#details'); details.replaceChildren();
  $('#entry-id').textContent = `HYG ${star.id}`;
  details.append(el('h2', star.name), el('p', [...new Set(star.aliases)].join(' / '), 'aliases'));
  details.append(facts([
    ['Distance from Sol', fmt(star.distance, 'ly')], ['Planets counted', String(star.count)],
    ['Spectral type', star.row.spectral_type || 'Not provided'], ['Luminosity (HYG)', fmt(star.row.hyg_luminosity_solar, 'L☉')],
    ['X / Y / Z', star.xyz.map(v => v.toFixed(2)).join(' / ') + ' ly']
  ]));
  details.append(section('System ownership', star.system), owners(star.owners));
  const planetOnly = star.planetOwners.filter(id => !star.owners.includes(id));
  if (planetOnly.length) { details.append(el('p', 'Additional factions on individual worlds:', 'small'), owners(planetOnly)); }
  if (star.row.notes) details.append(el('p', String(star.row.notes), 'note'));
  details.append(section('Worlds in this entry', `${star.planets.length} in archive`));
  if (!star.planets.length) {
    details.append(el('p', star.sol ? 'Mercury · Venus · Earth · Mars · Jupiter · Saturn · Uranus · Neptune. Solar System orbital records are not in the exoplanet export.' : 'No planet rows in this workbook. This does not establish that the star has no planets.', 'small'));
  } else {
    const list = el('div', undefined, 'planet-list');
    for (const p of star.planets) {
      const b = el('button', undefined, 'planet-button'); b.dataset.planet = p.name;
      b.append(el('span', p.name), el('small', p.included ? `${p.owners.length} owners ↗` : 'excluded ↗'));
      b.onclick = () => showPlanet(p); list.append(b);
    }
    details.append(list); const panel = el('div', undefined, 'planet-detail'); panel.id = 'planet-detail'; details.append(panel);
    showPlanet(star.planets.find(p => p.included) ?? star.planets[0]);
  }
  const focusButton = el('button', 'Center this system on the chart ↗', 'detail-action'); focusButton.onclick = () => activeMap().focus(star.id); details.append(focusButton);
}
function filter() {
  if (!catalog) return;
  const id = $('#faction-filter').value, hostOnly = $('#hosts-only').checked;
  const predicate = s => (!id || (id === '__unassigned' ? !s.owners.length && !s.planetOwners.length : s.owners.includes(id) || s.planetOwners.includes(id))) && (!hostOnly || s.count > 0);
  map.filter(predicate); planarMap.filter(predicate);
}
async function load(file, name, version) {
  const next = await readWorkbook(file);
  if (version !== loadVersion) return;
  catalog = next; map.setCatalog(catalog); planarMap.setCatalog(catalog); renderLegend();
  $('#faction-filter').replaceChildren(new Option('All territories', ''), new Option('No recorded owners', '__unassigned'));
  for (const f of catalog.factions.values()) $('#faction-filter').append(new Option(f.name, f.id));
  $('#hosts-only').checked = false; $('#search').value = ''; $('#search-results').replaceChildren();
  $('#catalog-count').textContent = catalog.inputCount;
  $('#source').textContent = `${name} · ${catalog.inputCount} entries · ${catalog.radius.toFixed(1)} ly extent`;
  $('#map-message').textContent = catalog.warnings.length ? catalog.warnings.join(' ') : '';
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file); $('#download').href = sourceUrl; $('#download').download = name;
  focusedStarId = catalog.stars.find(s => s.sol).id;
  selectStar(focusedStarId);
  document.body.dataset.ready = 'true';
}
async function openSource(file) {
  const version = ++loadVersion; $('#map-message').textContent = 'Reading the workbook…';
  try {
    if (file) await load(file, file.name, version);
    else {
      const response = await fetch(`${import.meta.env.BASE_URL}catalog.xlsx`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Shared workbook not found. Generate it with data/nearby_stars.py, or choose Open workbook.');
      await load(await response.blob(), 'nearby_stars.xlsx', version);
    }
  } catch (error) {
    if (version === loadVersion) $('#map-message').textContent = `Could not open workbook: ${error.message}${catalog ? ' The previous chart is still available.' : ''}`;
  }
}

$('#about').onclick = () => $('#help').showModal();
try {
  map = new StarMap($('#viewport'), id => selectStar(id), rememberFocus);
  planarMap = new PlanarMap($('#viewport'), id => selectStar(id), rememberFocus);
  setTheme(localStorage.getItem('heavens-gate-theme') || 'dark', false);
  setView('3d');
  $('#theme-toggle').onclick = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  $('#view-toggle').onclick = () => setView(view === '3d' ? '2d' : '3d');
  $('#reload').onclick = () => openSource();
  $('#workbook').onchange = event => { const file = event.target.files[0]; if (file) openSource(file); event.target.value = ''; };
  $('#faction-filter').onchange = filter; $('#hosts-only').onchange = filter;
  $('#zoom-in').onclick = () => activeMap().zoom(.8); $('#zoom-out').onclick = () => activeMap().zoom(1.25);
  $('#reset').onclick = () => catalog && activeMap().reset(); $('#focus').onclick = () => selectedId && activeMap().focus(selectedId);
  $('#export-2d').onclick = async event => {
    if (!catalog) return;
    const button = event.currentTarget, original = button.textContent; button.disabled = true; button.textContent = 'Drawing PNG…';
    try {
      const filename = await downloadPlanarMap(catalog, map.visible, selectedId, theme);
      $('#map-message').textContent = `Downloaded ${filename}. The image is an X/Y projection; Z is omitted.`;
    } catch (error) {
      $('#map-message').textContent = `Could not export image: ${error.message}`;
    } finally { button.disabled = false; button.textContent = original; }
  };
  $('#sol-beacon').onclick = () => { if (catalog) { selectStar(catalog.stars.find(s => s.sol).id); map.reset(); } };
  $('#planar-sol').onclick = () => { if (catalog) { selectStar(catalog.stars.find(s => s.sol).id); planarMap.reset(); } };
  $('#search').oninput = () => {
    const results = $('#search-results'); results.replaceChildren();
    const query = $('#search').value.trim().toLowerCase(); if (!query || !catalog) return;
    const found = catalog.stars.filter(s => s.search.includes(query)).slice(0, 12);
    if (!found.length) results.append(el('p', 'No matching star in this workbook.', 'small'));
    for (const s of found) {
      const b = el('button', undefined, 'search-result'); b.setAttribute('role', 'listitem');
      b.append(el('span', s.name), el('small', `${s.distance.toFixed(2)} ly`));
      b.onclick = () => { selectStar(s.id, true); results.replaceChildren(); $('#search').value = s.name; };
      results.append(b);
    }
  };
  $('#search').onkeydown = event => {
    if (event.key === 'Enter') $('#search-results button')?.click();
    if (event.key === 'Escape') { $('#search-results').replaceChildren(); $('#search').value = ''; }
  };
  openSource();
} catch (error) {
  $('#map-message').textContent = '3D graphics could not start. Enable WebGL in your browser and reload.';
  console.error(error);
}

const present = value => value !== null && value !== undefined && value !== '';
const string = value => String(value ?? '').trim();
export const ownerIds = value => [...new Set(string(value).split(';').map(s => s.trim()).filter(Boolean))];

function number(value, label, optional = false) {
  if (!present(value) && optional) return null;
  const result = present(value) ? Number(value) : NaN;
  if (!Number.isFinite(result)) throw new Error(`${label} must be a finite number.`);
  return result;
}
function count(value, label) {
  const n = number(value, label);
  if (n < 0 || !Number.isInteger(n)) throw new Error(`${label} must be a nonnegative integer.`);
  return n;
}
function table(data, required, label) {
  const [headers = [], ...rows] = data ?? [];
  for (const key of required) if (!headers.includes(key)) throw new Error(`${label} is missing ${key}.`);
  return rows.filter(row => row.some(present)).map(row => Object.fromEntries(headers.map((key, i) => [key, row[i]])));
}

export function buildCatalog(sheets) {
  const warnings = new Set();
  const rawStars = table(sheets.Stars, ['hyg_id', 'star_name', 'x_ly', 'y_ly', 'z_ly'], 'Stars');
  const rawPlanets = table(sheets.Planets, ['hyg_id', 'planet_name', 'include_in_count'], 'Planets');
  const rawFactions = sheets.Factions ? table(sheets.Factions, ['faction_id', 'faction_name'], 'Factions') : [];
  const factions = new Map();
  for (const row of rawFactions) {
    const id = string(row.faction_id);
    if (!id || id.includes(';') || factions.has(id)) throw new Error(`Invalid or duplicate faction ID: ${id || '(blank)'}.`);
    let color = string(row.color);
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      if (color) warnings.add(`Invalid color for ${id}; using a neutral color.`);
      color = '#73675b';
    }
    factions.set(id, { id, name: string(row.faction_name) || id, color, notes: string(row.notes) });
  }
  function owners(value) {
    return ownerIds(value).map(id => {
      if (!factions.has(id)) {
        factions.set(id, { id, name: id, color: '#73675b', notes: 'Not defined in Factions.' });
        warnings.add(`Faction ${id} is referenced but not defined in Factions.`);
      }
      return id;
    });
  }
  const stars = [], byId = new Map(), systemOwners = new Map();
  for (const row of rawStars) {
    const id = string(row.hyg_id), name = string(row.star_name) || `HYG ${id}`;
    if (!id || byId.has(id)) throw new Error(`Missing or duplicate HYG ID: ${id}.`);
    const sol = /^(sol|sun)$/i.test(name) && Number(row.distance_ly) === 0;
    const xyz = sol ? [0, 0, 0] : ['x', 'y', 'z'].map(a => number(row[`${a}_ly`], `${name} ${a}_ly`));
    const system = string(row.system_id) || `hyg:${string(row.primary_hyg_id) || id}`;
    const star = { id, name, xyz, sol, system, row, planets: [], owners: [], planetOwners: [], count: 0,
      distance: number(row.distance_ly, `${name} distance_ly`),
      aliases: ['proper_name', 'gliese', 'bayer_flamsteed', 'nasa_hosts'].map(k => string(row[k])).concat(
        ['hip', 'hd', 'hr'].filter(k => present(row[k])).map(k => `${k.toUpperCase()} ${row[k]}`)).filter(Boolean) };
    if (star.distance < 0) throw new Error(`${name} distance cannot be negative.`);
    const claims = systemOwners.get(system) ?? new Set();
    owners(row.faction_owners).forEach(id => claims.add(id));
    systemOwners.set(system, claims);
    stars.push(star); byId.set(id, star);
  }
  const names = new Set();
  for (const row of rawPlanets) {
    const host = byId.get(string(row.hyg_id));
    if (!host) { warnings.add(`Planet ${row.planet_name} has no selected host; omitted.`); continue; }
    const name = string(row.planet_name);
    if (!name || names.has(name)) throw new Error(`Missing or duplicate planet name: ${name}.`);
    names.add(name);
    const include = present(row.include_in_count) ? count(row.include_in_count, `${name} include_in_count`) : 0;
    if (include > 1) throw new Error(`${name} include_in_count must be 0 or 1.`);
    const planet = { name, host: host.id, owners: owners(row.faction_owners), included: include === 1, row };
    host.planets.push(planet);
  }
  for (const s of stars) {
    s.owners = [...systemOwners.get(s.system)];
    s.planetOwners = [...new Set(s.planets.flatMap(p => p.owners))];
    const override = s.row.planet_count_override;
    s.count = present(override) ? count(override, `${s.name} planet_count_override`) :
      s.planets.filter(p => p.included).length + (s.sol ? 8 : 0);
    s.search = `${s.name} ${s.aliases.join(' ')} HYG ${s.id}`.toLowerCase();
  }
  if (stars.filter(s => s.sol).length > 1) throw new Error('More than one Sol entry.');
  const inputCount = stars.length;
  if (!stars.some(s => s.sol)) {
    const sol = { id: 'sol-reference', name: 'Sol', sol: true, xyz: [0, 0, 0], distance: 0, system: 'sol-reference',
      aliases: ['Sun'], search: 'sol sun', planets: [], owners: [], planetOwners: [], count: 8,
      row: { spectral_type: 'G2V', notes: 'Origin reference added because Sol is absent from the workbook.' } };
    stars.unshift(sol); byId.set(sol.id, sol);
  }
  return { stars, byId, factions, inputCount, warnings: [...warnings],
    radius: Math.max(5, ...stars.map(s => Math.hypot(...s.xyz))) };
}

export async function readWorkbook(file) {
  const { default: readExcelFile } = await import('read-excel-file/browser');
  const sheets = await readExcelFile(file);
  return buildCatalog(Object.fromEntries(sheets.map(sheet => [sheet.sheet, sheet.data])));
}

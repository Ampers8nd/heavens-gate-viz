import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, ownerIds } from '../src/catalog.js';

const starHeaders = ['hyg_id', 'star_name', 'distance_ly', 'x_ly', 'y_ly', 'z_ly', 'primary_hyg_id', 'system_id', 'faction_owners', 'planet_count_override'];
const planetHeaders = ['hyg_id', 'planet_name', 'include_in_count', 'faction_owners'];

test('plural system and planet ownership remain distinct', () => {
  const catalog = buildCatalog({
    Stars: [starHeaders, ['1', 'Primary', 4, 1, 2, 3, '1', 'system-a', 'union; league', ''], ['2', 'Companion', 4, 1, 2, 3, '1', 'system-a', 'guild', '']],
    Planets: [planetHeaders, ['1', 'Primary b', 1, 'league; settlers']],
    Factions: [['faction_id', 'faction_name', 'color', 'notes'], ['union', 'Union', '#ff0000', ''], ['league', 'League', '#00ff00', ''], ['guild', 'Guild', '#0000ff', ''], ['settlers', 'Settlers', '#ffff00', '']]
  });
  assert.deepEqual(new Set(catalog.byId.get('1').owners), new Set(['union', 'league', 'guild']));
  assert.deepEqual(new Set(catalog.byId.get('2').owners), new Set(['union', 'league', 'guild']));
  assert.deepEqual(catalog.byId.get('1').planets[0].owners, ['league', 'settlers']);
  assert.equal(catalog.byId.get('1').count, 1);
});

test('owner list is trimmed, deduplicated, and blanks are absent', () => {
  assert.deepEqual(ownerIds(' union ; league;union; '), ['union', 'league']);
  assert.deepEqual(ownerIds(''), []);
});

test('invalid coordinates, counts, and duplicate stars fail explicitly', () => {
  const base = { Planets: [planetHeaders], Factions: [['faction_id', 'faction_name']] };
  assert.throws(() => buildCatalog({ ...base, Stars: [starHeaders, ['1', 'Bad', 4, 'nan', 0, 0, '', '', '', '']] }), /finite number/);
  assert.throws(() => buildCatalog({ ...base, Stars: [starHeaders, ['1', 'Bad', 4, 0, 0, 0, '', '', '', -1]] }), /nonnegative integer/);
  assert.throws(() => buildCatalog({ ...base, Stars: [starHeaders, ['1', 'A', 4, 0, 0, 0], ['1', 'B', 5, 1, 1, 1]] }), /duplicate HYG/);
});

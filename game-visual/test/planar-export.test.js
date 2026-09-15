import test from 'node:test';
import assert from 'node:assert/strict';
import { imageFilename, planarPosition, placeAllLabels, separateAlignedStars } from '../src/planar-export.js';
import { chartTransform, planarDetailForZoom, planarLabelsForZoom, screenToChart } from '../src/planar-map.js';

const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('XY projection ignores Z and centers Sol', () => {
  assert.deepEqual(planarPosition({ xyz: [0, 0, 100] }, 30, 1000, 100), { x: 500, y: 500, scale: 800 / 60 });
  assert.equal(planarPosition({ xyz: [30, 30, -5] }, 30, 1000, 100).x, 900);
  assert.equal(planarPosition({ xyz: [30, 30, -5] }, 30, 1000, 100).y, 100);
});

test('aligned projected stars are separated with their true positions retained', () => {
  const input = Array.from({ length: 12 }, (_, i) => ({ id: String(i), x: 500, y: 500 }));
  const output = separateAlignedStars(input, { left: 0, top: 0, right: 1000, bottom: 1000 }, 24);
  assert.equal(output.length, input.length);
  assert.ok(output.slice(1).every(point => point.moved && point.trueX === 500 && point.trueY === 500));
  for (let a = 0; a < output.length; a++) for (let b = a + 1; b < output.length; b++) {
    assert.ok(Math.hypot(output[a].x - output[b].x, output[a].y - output[b].y) >= 24);
  }
});

test('every name receives a nonoverlapping label inside the image', () => {
  const items = Array.from({ length: 270 }, (_, i) => ({ id: String(i), text: `Star ${i}`, x: 2000, y: 2000, width: 90, height: 27 }));
  const bounds = { left: 50, top: 150, right: 4046, bottom: 3946 };
  const labels = placeAllLabels(items, bounds, [{ x: 1990, y: 1990, width: 20, height: 20 }]);
  assert.equal(labels.length, 270);
  for (const label of labels) assert.ok(label.x >= bounds.left && label.y >= bounds.top && label.x + label.width <= bounds.right && label.y + label.height <= bounds.bottom);
  for (let a = 0; a < labels.length; a++) for (let b = a + 1; b < labels.length; b++) assert.equal(overlap(labels[a], labels[b]), false);
});

test('PNG filename describes the planar projection', () => {
  assert.match(imageFilename(29.4), /^heavens-gate-30ly-xy-\d{4}-\d{2}-\d{2}\.png$/);
});

test('2D screen coordinates invert the displayed planar chart transform', () => {
  const transform = chartTransform(1200, 800, 3, -140, 65);
  const x = transform.x + 1800 * transform.scale;
  const y = transform.y + 2500 * transform.scale;
  const point = screenToChart(x, y, transform);
  assert.ok(Math.abs(point.x - 1800) < 1e-9);
  assert.ok(Math.abs(point.y - 2500) < 1e-9);
});

test('2D overview hides connectors and keeps selected and hovered names', () => {
  const labels = Array.from({ length: 30 }, (_, i) => ({ point: { star: {
    id: String(i), sol: i === 0, count: i < 20 ? 1 : 0,
    owners: [], planetOwners: []
  } } }));
  assert.deepEqual(planarDetailForZoom(1), { labels: 'overview', displacement: 'none', leaders: false });
  assert.equal(planarDetailForZoom(2).displacement, 'selected');
  assert.equal(planarDetailForZoom(4).leaders, true);
  const overview = planarLabelsForZoom(labels, '26', '27', 1);
  assert.ok(overview.length <= 14);
  assert.ok(overview.some(box => box.point.star.id === '26'));
  assert.ok(overview.some(box => box.point.star.id === '27'));
  assert.equal(planarLabelsForZoom(labels, '26', null, 4).length, labels.length);
});

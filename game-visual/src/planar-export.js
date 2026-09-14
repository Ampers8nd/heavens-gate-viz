const TAU = Math.PI * 2;

export function planarPosition(star, radius, size, margin) {
  const usable = size - margin * 2;
  const scale = usable / (radius * 2);
  return {
    x: size / 2 + star.xyz[0] * scale,
    y: size / 2 - star.xyz[1] * scale,
    scale
  };
}

export function imageFilename(radius) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `heavens-gate-${Math.ceil(radius)}ly-xy-${stamp}.png`;
}

function palette(theme) {
  return theme === 'light' ? {
    background: '#f4eedf', panel: '#e8deca', ink: '#302a25', muted: '#796b5c',
    grid: '#c7baa4', accent: '#772e32', host: '#9b432a', star: '#625b50', sol: '#bd6b2d'
  } : {
    background: '#050914', panel: '#0c1322', ink: '#e6e0d5', muted: '#8b99ae',
    grid: '#253149', accent: '#ff6b5f', host: '#5ee6ce', star: '#aab6ca', sol: '#ffd06a'
  };
}

function starColor(catalog, star, colors) {
  const faction = catalog.factions.get(star.owners[0] ?? star.planetOwners[0]);
  return star.sol ? colors.sol : faction?.color ?? (star.count ? colors.host : colors.star);
}

function intersects(a, b, padding = 0) {
  return a.x - padding < b.x + b.width && a.x + a.width + padding > b.x &&
    a.y - padding < b.y + b.height && a.y + a.height + padding > b.y;
}

export function separateAlignedStars(points, bounds, minimumGap = 24) {
  const placed = [];
  for (const original of points) {
    const point = { ...original, trueX: original.x, trueY: original.y, moved: false };
    const clear = candidate => placed.every(other => Math.hypot(candidate.x - other.x, candidate.y - other.y) >= minimumGap);
    if (!clear(point)) {
      let found = null;
      for (let step = 1; step <= 160 && !found; step++) {
        const distance = minimumGap * (.65 + Math.sqrt(step));
        const angle = step * 2.399963229728653;
        const candidate = { x: point.trueX + Math.cos(angle) * distance, y: point.trueY + Math.sin(angle) * distance };
        if (candidate.x > bounds.left && candidate.x < bounds.right && candidate.y > bounds.top && candidate.y < bounds.bottom && clear(candidate)) found = candidate;
      }
      if (found) Object.assign(point, found, { moved: true });
    }
    placed.push(point);
  }
  return placed;
}

export function placeAllLabels(items, bounds, reserved = []) {
  const occupied = [...reserved], result = [];
  const fits = box => box.x >= bounds.left && box.y >= bounds.top && box.x + box.width <= bounds.right &&
    box.y + box.height <= bounds.bottom && !occupied.some(other => intersects(box, other, 4));
  for (const item of items) {
    let box = null;
    for (let step = 0; step < 480 && !box; step++) {
      const distance = 18 + Math.sqrt(step) * 18;
      const angle = step * 2.399963229728653 - Math.PI / 4;
      const centerX = item.x + Math.cos(angle) * distance;
      const centerY = item.y + Math.sin(angle) * distance;
      const candidate = { ...item, x: centerX + (Math.cos(angle) >= 0 ? 5 : -item.width - 5), y: centerY - item.height / 2 };
      if (fits(candidate)) box = candidate;
    }
    // The 4096px chart leaves ample room, but retain a deterministic exhaustive fallback.
    for (let y = bounds.top; y <= bounds.bottom - item.height && !box; y += item.height + 8) {
      for (let x = bounds.left; x <= bounds.right - item.width && !box; x += 18) {
        const candidate = { ...item, x, y };
        if (fits(candidate)) box = candidate;
      }
    }
    if (!box) throw new Error(`Could not place every star name; ${item.text} has no free label position.`);
    occupied.push(box); result.push(box);
  }
  return result;
}

export function drawPlanarMap(canvas, catalog, stars, selectedId, theme = 'dark') {
  const size = 4096, margin = 300, colors = palette(theme);
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create the map image.');
  ctx.fillStyle = colors.background; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = colors.panel; ctx.fillRect(0, 0, size, 118);
  ctx.fillStyle = colors.accent; ctx.fillRect(0, 116, size, 2);
  ctx.fillStyle = colors.ink; ctx.font = '700 34px Georgia, serif'; ctx.fillText("HEAVEN'S GATE / PLANAR STAR CHART", 60, 55);
  ctx.fillStyle = colors.muted; ctx.font = '18px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('HELIOCENTRIC J2000 EQUATORIAL · X/Y PROJECTION · Z COORDINATE OMITTED', 60, 87);
  ctx.textAlign = 'right'; ctx.fillText(`${stars.length} VISIBLE ENTRIES · ${Math.ceil(catalog.radius)} LY EXTENT`, size - 60, 69); ctx.textAlign = 'left';

  const radius = Math.max(10, Math.ceil(catalog.radius / 10) * 10), center = size / 2;
  ctx.strokeStyle = colors.grid; ctx.lineWidth = 2;
  for (let r = 10; r <= radius; r += 10) {
    const px = planarPosition({ xyz: [r, 0] }, radius, size, margin).x - center;
    ctx.beginPath(); ctx.arc(center, center, px, 0, TAU); ctx.stroke();
    ctx.fillStyle = colors.muted; ctx.font = '17px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.fillText(`${r} ly`, center + px + 7, center - 8);
  }
  ctx.beginPath(); ctx.moveTo(margin, center); ctx.lineTo(size - margin, center); ctx.moveTo(center, margin); ctx.lineTo(center, size - margin); ctx.stroke();
  ctx.fillStyle = colors.muted; ctx.font = '18px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('+X · VERNAL EQUINOX', size - margin - 220, center - 18); ctx.fillText('+Y · RA 6H', center + 18, margin + 22);

  const plotBounds = { left: 90, top: 155, right: size - 90, bottom: size - 155 };
  const rawProjected = stars.map(star => ({ star, ...planarPosition(star, radius, size, margin) }))
    .sort((a, b) => Number(b.star.sol) - Number(a.star.sol) || a.star.distance - b.star.distance || a.star.id.localeCompare(b.star.id));
  const projected = separateAlignedStars(rawProjected, plotBounds);
  ctx.save(); ctx.setLineDash([7, 7]); ctx.strokeStyle = colors.muted; ctx.globalAlpha = .55; ctx.lineWidth = 1.5;
  for (const point of projected.filter(point => point.moved)) {
    ctx.beginPath(); ctx.moveTo(point.trueX, point.trueY); ctx.lineTo(point.x, point.y); ctx.stroke();
  }
  ctx.restore();
  for (const point of projected) {
    const { star, x, y } = point;
    const owners = [...new Set([...star.owners, ...star.planetOwners])];
    if (owners.length) {
      ctx.lineWidth = 6;
      owners.forEach((id, i) => {
        ctx.strokeStyle = catalog.factions.get(id)?.color ?? colors.muted;
        ctx.beginPath(); ctx.arc(x, y, star.sol ? 17 : 10, i * TAU / owners.length - Math.PI / 2, (i + 1) * TAU / owners.length - Math.PI / 2); ctx.stroke();
      });
    }
    ctx.fillStyle = starColor(catalog, star, colors);
    ctx.beginPath(); ctx.arc(x, y, star.sol ? 11 : star.count ? 5.5 : 3.5, 0, TAU); ctx.fill();
    if (star.id === selectedId && !star.sol) {
      ctx.strokeStyle = colors.accent; ctx.lineWidth = 3; ctx.strokeRect(x - 13, y - 13, 26, 26);
    }
  }
  const labelOrder = projected.slice().sort((a, b) => {
    const rank = p => p.star.sol || p.star.id === selectedId ? 0 : p.star.count ? 1 : 2;
    return rank(a) - rank(b) || a.star.distance - b.star.distance;
  });
  const labelItems = labelOrder.map(point => {
    const important = point.star.sol || point.star.id === selectedId;
    ctx.font = `${important ? '700 24px' : '17px'} ui-monospace, SFMono-Regular, Menlo, monospace`;
    return { id: point.star.id, point, text: point.star.name, important, x: point.x, y: point.y,
      width: Math.ceil(ctx.measureText(point.star.name).width) + 16, height: important ? 34 : 27 };
  });
  const pointBoxes = projected.map(point => ({ x: point.x - 9, y: point.y - 9, width: 18, height: 18 }));
  const labels = placeAllLabels(labelItems, plotBounds, pointBoxes);
  ctx.save(); ctx.strokeStyle = colors.grid; ctx.lineWidth = 1.2; ctx.globalAlpha = .8;
  for (const box of labels) {
    const anchorX = Math.max(box.x, Math.min(box.point.x, box.x + box.width));
    const anchorY = Math.max(box.y, Math.min(box.point.y, box.y + box.height));
    ctx.beginPath(); ctx.moveTo(box.point.x, box.point.y); ctx.lineTo(anchorX, anchorY); ctx.stroke();
  }
  ctx.restore();
  for (const box of labels) {
    ctx.fillStyle = colors.background + 'ee'; ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = box.important ? colors.accent : colors.ink;
    ctx.font = `${box.important ? '700 24px' : '17px'} ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(box.text, box.x + 8, box.y + (box.important ? 25 : 20));
  }
  ctx.fillStyle = colors.panel; ctx.fillRect(48, size - 120, size - 96, 72);
  ctx.fillStyle = colors.muted; ctx.font = '17px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('ALL FILTERED STARS ARE NAMED. ALIGNED POINTS AND LABELS ARE DISPLACED WITH LEADER LINES. LARGER POINTS HAVE COUNTED PLANETS.', 72, size - 78);
  ctx.textAlign = 'right'; ctx.fillText(new Date().toISOString().slice(0, 10), size - 72, size - 78); ctx.textAlign = 'left';
  return canvas;
}

export async function downloadPlanarMap(catalog, stars, selectedId, theme) {
  const canvas = document.createElement('canvas');
  drawPlanarMap(canvas, catalog, stars, selectedId, theme);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encoding failed.')), 'image/png'));
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = imageFilename(catalog.radius); anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return anchor.download;
}

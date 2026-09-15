import { buildPlanarLayout, planarPalette, planarPosition, planarStarColor } from './planar-export.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const IMAGE_SIZE = 4096;

export function chartTransform(width, height, zoom = 1, panX = 0, panY = 0) {
  const scale = Math.min(width, height) / IMAGE_SIZE * zoom;
  return { scale, x: width / 2 - IMAGE_SIZE / 2 * scale + panX,
    y: height / 2 - IMAGE_SIZE / 2 * scale + panY };
}

export function screenToChart(x, y, transform) {
  return { x: (x - transform.x) / transform.scale, y: (y - transform.y) / transform.scale };
}

export function planarDetailForZoom(zoom) {
  if (zoom < 1.75) return { labels: 'overview', displacement: 'none', leaders: false };
  if (zoom < 3) return { labels: 'systems', displacement: 'selected', leaders: false };
  if (zoom < 4) return { labels: 'all', displacement: 'selected', leaders: false };
  return { labels: 'all', displacement: 'all', leaders: true };
}

export function planarLabelsForZoom(labels, selectedId, hoveredId, zoom) {
  const detail = planarDetailForZoom(zoom);
  if (detail.labels === 'all') return labels;
  const pinned = box => box.point.star.sol || box.point.star.id === selectedId || box.point.star.id === hoveredId;
  const systems = labels.filter(box => pinned(box) || box.point.star.count > 0 ||
    box.point.star.owners.length > 0 || box.point.star.planetOwners.length > 0);
  if (detail.labels === 'systems') return systems;
  const essential = systems.filter(pinned);
  const hosts = systems.filter(box => !pinned(box) && box.point.star.count > 0);
  return [...essential, ...hosts.slice(0, Math.max(0, 14 - essential.length))];
}

export class PlanarMap {
  constructor(viewport, onSelect, onFocus = () => {}) {
    this.viewport = viewport;
    this.canvas = viewport.querySelector('#planar-space');
    this.hover = viewport.querySelector('#planar-hover');
    this.solBeacon = viewport.querySelector('#planar-sol');
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) throw new Error('This browser cannot create the planar map.');
    this.onSelect = onSelect;
    this.onFocus = onFocus;
    this.visible = [];
    this.predicate = () => true;
    this.theme = 'dark';
    this.selected = null;
    this.hovered = null;
    this.active = false;
    this.dirty = true;
    this.zoomLevel = 1;
    this.panX = this.panY = 0;
    this.pending = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(viewport);

    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.animation = null;
      this.hover.textContent = '';
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
        panX: this.panX, panY: this.panY, moved: false };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (this.drag?.id !== event.pointerId) {
        const hit = this.pick(event);
        this.canvas.style.cursor = hit ? 'pointer' : 'grab';
        this.hover.textContent = hit?.star.name ?? '';
        const hovered = hit?.star.id ?? null;
        if (hovered !== this.hovered) { this.hovered = hovered; this.requestRender(); }
        if (hit) {
          const bounds = this.canvas.getBoundingClientRect();
          this.hover.style.left = `${Math.max(8, Math.min(this.width - 180, event.clientX - bounds.left + 18))}px`;
          this.hover.style.top = `${Math.max(8, Math.min(this.height - 35, event.clientY - bounds.top - 24))}px`;
        }
        return;
      }
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
      if (this.drag.moved) {
        this.panX = this.drag.panX + dx; this.panY = this.drag.panY + dy;
        this.canvas.style.cursor = 'grabbing'; this.requestRender();
      }
    });
    this.canvas.addEventListener('pointerup', event => {
      if (this.drag?.id !== event.pointerId) return;
      const moved = this.drag.moved; this.drag = null;
      this.canvas.style.cursor = 'grab';
      if (!moved) {
        const hit = this.pick(event);
        if (hit) this.onSelect(hit.star.id);
      }
    });
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover.textContent = '';
      if (this.hovered !== null) { this.hovered = null; this.requestRender(); }
    });
    this.canvas.addEventListener('dblclick', event => {
      const hit = this.pick(event);
      if (hit) { this.onSelect(hit.star.id); this.focus(hit.star.id); }
    });
    this.canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const bounds = this.canvas.getBoundingClientRect();
      this.zoom(event.deltaY < 0 ? .8 : 1.25, event.clientX - bounds.left, event.clientY - bounds.top);
    }, { passive: false });
    viewport.addEventListener('keydown', event => {
      if (!this.active || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      this.animation = null;
      const step = Math.min(this.width, this.height) / 12;
      this.panX += event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
      this.panY += event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
      this.requestRender();
    });
  }

  setActive(active) {
    this.active = active;
    if (!active) this.hover.textContent = '';
    if (active) { this.resize(); this.requestRender(); }
  }

  setCatalog(catalog) {
    this.animation = null;
    this.catalog = catalog;
    this.selected = catalog.stars.find(star => star.sol)?.id ?? null;
    this.zoomLevel = 1; this.panX = this.panY = 0;
    this.hover.textContent = '';
    this.filter(() => true);
  }

  filter(predicate) {
    this.predicate = predicate;
    this.visible = this.catalog.stars.filter(star => star.sol || predicate(star));
    this.dirty = true; this.requestRender();
  }

  select(id) {
    if (id !== this.selected) this.animation = null;
    this.selected = id; this.filter(this.predicate);
  }

  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
    this.dirty = true; this.requestRender();
  }

  resize() {
    const width = this.viewport.clientWidth, height = this.viewport.clientHeight;
    if (!width || !height) return;
    this.width = width; this.height = height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.dirty = true;
    this.requestRender();
  }

  ensureLayout() {
    if (!this.catalog || !this.dirty) return;
    const transform = chartTransform(this.width, this.height, this.zoomLevel, this.panX, this.panY);
    this.layout = buildPlanarLayout(this.catalog, this.visible, this.selected, this.ctx,
      Math.max(24, 16 / transform.scale));
    this.dirty = false;
  }

  requestRender() {
    if (!this.active || this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.render(); });
  }

  render() {
    if (!this.active || !this.catalog || !this.width) return;
    try { this.ensureLayout(); }
    catch (error) {
      this.viewport.querySelector('#map-message').textContent = `Could not draw 2D chart: ${error.message}`;
      return;
    }
    const ratio = this.canvas.width / this.width;
    const transform = chartTransform(this.width, this.height, this.zoomLevel, this.panX, this.panY);
    const detail = planarDetailForZoom(this.zoomLevel);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const colors = planarPalette(this.theme);
    this.ctx.fillStyle = colors.background;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.setTransform(ratio * transform.scale, 0, 0, ratio * transform.scale,
      ratio * transform.x, ratio * transform.y);
    const center = IMAGE_SIZE / 2;
    const radius = Math.max(10, Math.ceil(this.catalog.radius / 10) * 10);
    const margin = 300;
    this.ctx.strokeStyle = colors.grid;
    this.ctx.lineWidth = Math.max(1, 1 / transform.scale);
    for (let r = 10; r <= radius; r += 10) {
      const px = planarPosition({ xyz: [r, 0] }, radius, IMAGE_SIZE, margin).x - center;
      this.ctx.beginPath(); this.ctx.arc(center, center, px, 0, Math.PI * 2); this.ctx.stroke();
    }
    this.ctx.beginPath(); this.ctx.moveTo(margin, center); this.ctx.lineTo(IMAGE_SIZE - margin, center);
    this.ctx.moveTo(center, margin); this.ctx.lineTo(center, IMAGE_SIZE - margin); this.ctx.stroke();
    if (detail.displacement !== 'none') {
      this.ctx.save(); this.ctx.setLineDash([7, 7]); this.ctx.strokeStyle = colors.muted;
      this.ctx.globalAlpha = .6;
      for (const point of this.layout.points) if (point.moved &&
        (detail.displacement === 'all' || point.star.id === this.selected || point.star.id === this.hovered)) {
        this.ctx.beginPath(); this.ctx.moveTo(point.trueX, point.trueY);
        this.ctx.lineTo(point.x, point.y); this.ctx.stroke();
      }
      this.ctx.restore();
    }
    const markerUnit = 1 / transform.scale;
    for (const point of this.layout.points) {
      const { star, x, y } = point;
      const owners = [...new Set([...star.owners, ...star.planetOwners])];
      if (owners.length && (this.zoomLevel >= 1.75 || owners.length > 1 || star.id === this.selected)) {
        this.ctx.lineWidth = 3 * markerUnit;
        owners.forEach((id, index) => {
          this.ctx.strokeStyle = this.catalog.factions.get(id)?.color ?? colors.muted;
          this.ctx.beginPath(); this.ctx.arc(x, y, (star.sol ? 11 : 7) * markerUnit,
            index * Math.PI * 2 / owners.length - Math.PI / 2,
            (index + 1) * Math.PI * 2 / owners.length - Math.PI / 2); this.ctx.stroke();
        });
      }
      this.ctx.fillStyle = planarStarColor(this.catalog, star, colors);
      this.ctx.beginPath(); this.ctx.arc(x, y, (star.sol ? 8 : star.count ? 4.5 : 3) * markerUnit, 0, Math.PI * 2); this.ctx.fill();
      if (star.id === this.selected && !star.sol) {
        this.ctx.strokeStyle = colors.accent; this.ctx.lineWidth = 1.5 * markerUnit;
        this.ctx.strokeRect(x - 10 * markerUnit, y - 10 * markerUnit, 20 * markerUnit, 20 * markerUnit);
      }
    }
    this.displayedLabels = planarLabelsForZoom(this.layout.labels, this.selected, this.hovered, this.zoomLevel);
    if (detail.leaders) {
      this.ctx.strokeStyle = colors.grid; this.ctx.lineWidth = 1.2;
      for (const box of this.displayedLabels) {
        const anchorX = Math.max(box.x, Math.min(box.point.x, box.x + box.width));
        const anchorY = Math.max(box.y, Math.min(box.point.y, box.y + box.height));
        this.ctx.beginPath(); this.ctx.moveTo(box.point.x, box.point.y);
        this.ctx.lineTo(anchorX, anchorY); this.ctx.stroke();
      }
    }
    for (const box of this.displayedLabels) {
      this.ctx.fillStyle = colors.background + 'ee';
      this.ctx.fillRect(box.x, box.y, box.width, box.height);
      this.ctx.fillStyle = box.important ? colors.accent : colors.ink;
      this.ctx.font = `${box.important ? '700 24px' : '17px'} ui-monospace, SFMono-Regular, Menlo, monospace`;
      this.ctx.fillText(box.text, box.x + 8, box.y + (box.important ? 25 : 20));
    }
    const sol = this.catalog.stars.find(star => star.sol);
    const solChart = planarPosition(sol, radius, IMAGE_SIZE, margin);
    const solX = transform.x + solChart.x * transform.scale;
    const solY = transform.y + solChart.y * transform.scale;
    this.solBeacon.style.left = `${Math.max(45, Math.min(this.width - 45, solX))}px`;
    this.solBeacon.style.top = `${Math.max(20, Math.min(this.height - 20, solY - 18))}px`;
    this.solBeacon.classList.toggle('offscreen', solX < 0 || solX > this.width || solY < 0 || solY > this.height);
  }

  pick(event) {
    // console.log("2d pick event")
    if (!this.active || !this.layout || !this.width) return null;
    const bounds = this.canvas.getBoundingClientRect();
    const transform = chartTransform(this.width, this.height, this.zoomLevel, this.panX, this.panY);
    const point = screenToChart(event.clientX - bounds.left, event.clientY - bounds.top, transform);
    const nearest = this.layout.points.map(item => ({ item, distance: Math.hypot(item.x - point.x, item.y - point.y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance * transform.scale <= 14) return nearest.item;
    return this.displayedLabels?.find(box => point.x >= box.x && point.x <= box.x + box.width &&
      point.y >= box.y && point.y <= box.y + box.height)?.point ?? null;
  }

  zoom(factor, anchorX = this.width / 2, anchorY = this.height / 2) {
    if (!this.width) return;
    this.animation = null;
    const before = chartTransform(this.width, this.height, this.zoomLevel, this.panX, this.panY);
    const chartPoint = screenToChart(anchorX, anchorY, before);
    this.zoomLevel = Math.max(1, Math.min(24, this.zoomLevel / factor));
    const after = chartTransform(this.width, this.height, this.zoomLevel);
    this.panX = anchorX - chartPoint.x * after.scale - after.x;
    this.panY = anchorY - chartPoint.y * after.scale - after.y;
    this.dirty = true;
    this.requestRender();
  }

  reset() {
    // this.zoomLevel = 1; this.panX = this.panY = 0; this.dirty = true; this.requestRender();
    const oldZoom = this.zoomLevel;
    const oldPanX = this.panX;
    const oldPanY = this.panY;
    const token = {}; this.animation = token;
    const start = performance.now();
    const step = time => {
      if (this.animation !== token) return;
      console.log("resetting")
      const t = Math.min(1, (time - start) / 450), eased = 1 - (1 - t) ** 3;
      this.zoomLevel = oldZoom + (1 - oldZoom)*eased;
      this.panX = oldPanX + (0 - oldPanX)*eased
      this.panY = oldPanY + (0 - oldPanY)*eased
      this.dirty = true;
      this.requestRender();
      if (t < 1) requestAnimationFrame(step); else this.animation = null;
    }; requestAnimationFrame(step);
    if (this.catalog) this.onFocus(this.catalog.stars.find(star => star.sol).id);
  }

  focus(id) {
    if (!this.catalog?.byId.has(id) || !this.width) return;
    this.zoomLevel = Math.max(this.zoomLevel, 3);
    this.dirty = true;
    this.ensureLayout();
    const point = this.layout.points.find(item => item.star.id === id) ??
      planarPosition(this.catalog.byId.get(id), Math.max(10, Math.ceil(this.catalog.radius / 10) * 10), IMAGE_SIZE, 300);
    const transform = chartTransform(this.width, this.height, this.zoomLevel);
    const oldPanX = this.panX;
    const oldPanY = this.panY;
    const newPanX = this.width / 2 - point.x * transform.scale - transform.x;
    const newPanY = this.height / 2 - point.y * transform.scale - transform.y;
    // this.panX = this.width / 2 - point.x * transform.scale - transform.x;
    // this.panY = this.height / 2 - point.y * transform.scale - transform.y;
    const token = {}; this.animation = token;
    const start = performance.now();
    const step = time => {
      if (this.animation !== token) return;
      console.log("moving")
      const t = Math.min(1, (time - start) / 450), eased = 1 - (1 - t) ** 3;
      this.panX = oldPanX + (newPanX - oldPanX)*eased
      this.panY = oldPanY + (newPanY - oldPanY)*eased
      this.requestRender();
      if (t < 1) requestAnimationFrame(step); else this.animation = null;
    }; requestAnimationFrame(step);
    this.dirty = true;
    this.onFocus(id);
  }
}

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { thickness } from 'three/src/nodes/core/PropertyNode.js';

export class StarMap {
  constructor(viewport, onSelect, onFocus = () => {}) {
    this.viewport = viewport; this.onSelect = onSelect; this.onFocus = onFocus;
    this.canvas = viewport.querySelector('canvas'); this.labels = viewport.querySelector('#labels');
    this.beacon = viewport.querySelector('#sol-beacon');
    this.scene = new THREE.Scene(); this.theme = 'dark'; this.scene.background = new THREE.Color('#050914');
    this.camera = new THREE.PerspectiveCamera(42, 1, .05, 5000); this.camera.up.set(0, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false; this.controls.minDistance = .5; this.controls.maxDistance = 1000;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.requestRender());
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(viewport);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.visible = []; this.projected = []; this.hovered = null; this.selected = null;
    this.predicate = () => true; this.pending = false;
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('pointerdown', event => {
      this.press = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
      this.animation = null;
    });
    this.canvas.addEventListener('wheel', () => { this.animation = null; }, { passive: true });
    this.canvas.addEventListener('dblclick', event => {
      if (event.buttons) return;
      const nearest = this.pick(event);
      if (this.hovered !== nearest?.star.id) {this.hovered = nearest?.star.id ?? null}
      if (this.hovered !== null) { this.onSelect(this.hovered); this.focus(this.hovered); }
    })
    this.canvas.addEventListener('pointermove', event => {
      if (event.buttons) return;
      const nearest = this.pick(event);
      if (this.hovered !== nearest?.star.id) { this.hovered = nearest?.star.id ?? null; this.requestRender(); }
      this.canvas.style.cursor = nearest ? 'pointer' : 'grab';
    });
    this.canvas.addEventListener('pointerleave', () => { this.hovered = null; this.requestRender(); });
    this.canvas.addEventListener('pointercancel', () => { this.press = null; });
    this.canvas.addEventListener('pointerup', event => {
      const start = this.press; this.press = null;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) {
        const hit = this.pick(event); if (hit) this.onSelect(hit.star.id);
      }
    });
    viewport.addEventListener('keydown', event => {
      if (viewport.dataset.view === '2d' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !this.catalog) return;
      event.preventDefault();
      const movement = new THREE.Vector3();
      const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      const vertical = event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0;
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
      movement.addScaledVector(right, horizontal).addScaledVector(up, vertical).multiplyScalar(this.catalog.radius / 18);
      this.camera.position.add(movement); this.controls.target.add(movement); this.controls.update();
    });
  }

  setCatalog(catalog) {
    this.animation = null; this.catalog = catalog; this.selected = catalog.stars.find(s => s.sol).id;
    this.group.traverse(object => { object.geometry?.dispose(); if (object.material) { object.material.map?.dispose(); object.material.dispose(); } });
    this.group.clear();
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 32;
    const ctx = sprite.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(16, 16, 14, 0, Math.PI * 2); ctx.fill();
    const material = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true,
      map: new THREE.CanvasTexture(sprite), transparent: true, alphaTest: .2 });
    this.points = new THREE.Points(new THREE.BufferGeometry(), material); this.points.frustumCulled = false;
    this.group.add(this.points);
    this.lineMaterials = [];
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#253149', transparent: true, opacity: .5 });
    for (let radius = 10; radius <= catalog.radius + .2; radius += 10) {
      const coords = [];
      for (let i = 0; i < 128; i++) coords.push(new THREE.Vector3(Math.cos(i / 128 * Math.PI * 2) * radius, Math.sin(i / 128 * Math.PI * 2) * radius, 0));
      const ringMaterial = lineMaterial.clone(); this.lineMaterials.push(ringMaterial);
      this.group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(coords), ringMaterial));
    }
    const axes = [];
    for (let a = 0; a < 3; a++) {
      const start = [0, 0, 0], end = [0, 0, 0]; start[a] = -catalog.radius * 1.15; end[a] = catalog.radius * 1.15;
      axes.push(...start, ...end);
    }
    this.lineMaterials.push(lineMaterial);
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(axes, 3)), lineMaterial));
    this.filter(() => true); this.reset(false);
  }

  filter(predicate) {
    this.predicate = predicate;
    this.visible = this.catalog.stars.filter(s => s.sol || predicate(s));
    const colors = [], positions = [];
    for (const s of this.visible) {
      positions.push(...s.xyz);
      const owner = this.catalog.factions.get(s.owners[0] ?? s.planetOwners[0]);
      const dark = this.theme === 'dark';
      const color = new THREE.Color(s.sol ? (dark ? '#ffd06a' : '#9b432a') : owner?.color ?? (s.count ? (dark ? '#5ee6ce' : '#772e32') : (dark ? '#aab6ca' : '#7b7568')));
      colors.push(color.r, color.g, color.b);
    }
    this.points.geometry.dispose();
    this.points.geometry = new THREE.BufferGeometry();
    this.points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.points.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.requestRender();
  }
  select(id) { this.selected = id; this.filter(this.predicate); }
  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
    const dark = this.theme === 'dark';
    this.scene.background.set(dark ? '#050914' : '#f5efe1');
    for (const material of this.lineMaterials ?? []) material.color.set(dark ? '#253149' : '#b8ad96');
    if (this.catalog) this.filter(this.predicate);
    else this.requestRender();
  }
  resize() {
    const width = this.viewport.clientWidth, height = this.viewport.clientHeight;
    if (!width || !height) return;
    this.width = width; this.height = height;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false); this.requestRender();
  }
  project(star) {
    const p = new THREE.Vector3(...star.xyz).project(this.camera);
    return { star, x: (p.x + 1) / 2 * this.width, y: (1 - p.y) / 2 * this.height,
      visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1, depth: p.z,
      distance: this.camera.position.distanceTo(new THREE.Vector3(...star.xyz)) };
  }
  pick(event) {
    const bounds = this.canvas.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    return this.projected.filter(p => p.visible).map(p => ({ ...p, delta: Math.hypot(p.x - x, p.y - y) }))
      .filter(p => p.delta <= 10).sort((a, b) => a.delta - b.delta || a.depth - b.depth)[0];
  }
  requestRender() {
    if (this.pending) return;
    this.pending = true; requestAnimationFrame(() => { this.pending = false; this.render(); });
  }
  render() {
    if (!this.catalog || !this.width) return;
    this.camera.updateMatrixWorld(); this.renderer.render(this.scene, this.camera);
    this.projected = this.visible.map(s => this.project(s));
    const fragment = document.createDocumentFragment(), occupied = [];
    const projectedSun = this.project(this.catalog.stars.find(s => s.sol));
    const sx = Math.max(40, Math.min(this.width - 40, projectedSun.x));
    const sy = Math.max(18, Math.min(this.height - 20, projectedSun.y - 16));
    this.beacon.style.left = `${sx}px`; this.beacon.style.top = `${sy}px`;
    this.beacon.classList.toggle('offscreen', !projectedSun.visible);
    this.beacon.querySelector('span').textContent = '↗ return';
    occupied.push({ x: sx - 45, y: sy - 15, w: 90, h: 30 });
    const candidates = this.projected.filter(p => p.visible && !p.star.sol).sort((a, b) => {
      const priority = p => p.star.id === this.selected ? -2 : p.star.id === this.hovered ? -1 : p.distance;
      return priority(a) - priority(b);
    });
    let nearbyLabels = 0;
    for (const p of candidates) {
      const s = p.star, owners = [...new Set([...s.owners, ...s.planetOwners])];
      if (owners.length) {
        const ring = document.createElement('span'); ring.className = 'claim-ring';
        ring.style.left = `${p.x}px`; ring.style.top = `${p.y}px`;
        ring.style.background = `conic-gradient(${owners.map((id, i) => `${this.catalog.factions.get(id).color} ${i * 100 / owners.length}% ${(i + 1) * 100 / owners.length}%`).join(',')})`;
        fragment.append(ring);
      }
      if (s.id === this.selected) {
        const ring = document.createElement('span'); ring.className = 'selection-ring';
        ring.style.left = `${p.x}px`; ring.style.top = `${p.y}px`; fragment.append(ring);
      }
      const pinned = s.id === this.selected || s.id === this.hovered;
      if (!pinned && (p.distance > this.catalog.radius * 1.75 || nearbyLabels >= 12)) continue;
      const rect = { x: p.x + 10, y: p.y - 22, w: Math.min(240, s.name.length * 7 + 12), h: 20 };
      if (!pinned && (rect.x + rect.w > this.width || rect.y < 0 || occupied.some(r => rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y))) continue;
      const label = document.createElement('span'); label.className = `star-label${s.id === this.selected ? ' selected' : ''}`;
      label.textContent = s.name; label.style.left = `${Math.min(p.x, this.width - rect.w - 12)}px`;
      label.style.top = `${Math.max(23, p.y)}px`; label.dataset.starId = s.id;
      occupied.push(rect); fragment.append(label); if (!pinned) nearbyLabels++;
    }
    this.labels.replaceChildren(fragment);
    this.viewport.dataset.visibleStars = String(this.visible.length);
  }
  moveTo(target, position, animated = true) {
    if (!animated || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.controls.target.copy(target); this.camera.position.copy(position); this.controls.update(); return;
    }
    const token = {}; this.animation = token;
    const oldTarget = this.controls.target.clone(), oldPosition = this.camera.position.clone(), start = performance.now();
    const step = time => {
      if (this.animation !== token) return;
      const t = Math.min(1, (time - start) / 450), eased = 1 - (1 - t) ** 3;
      this.controls.target.lerpVectors(oldTarget, target, eased); this.camera.position.lerpVectors(oldPosition, position, eased);
      this.controls.update(); if (t < 1) requestAnimationFrame(step); else this.animation = null;
    }; requestAnimationFrame(step);
  }
  reset(animated = true) {
    const r = this.catalog.radius;
    this.moveTo(new THREE.Vector3(), new THREE.Vector3(r * 1.6, r * 1.8, r * 1.25), animated);
    this.onFocus(this.catalog.stars.find(star => star.sol).id);
  }
  focus(id, animated = true) {
    const target = new THREE.Vector3(...this.catalog.byId.get(id).xyz);
    const offset = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(this.catalog.radius * .75);
    this.moveTo(target, target.clone().add(offset), animated);
    this.onFocus(id);
  }
  zoom(factor) {
    this.animation = null;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, offset.length() * factor)));
    this.camera.position.copy(this.controls.target).add(offset); this.controls.update();
  }
}

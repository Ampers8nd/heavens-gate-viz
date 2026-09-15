# Browser star map

This lightweight Three.js map reads the shared Excel workbook produced by the
Python data pipeline. It fills the browser viewport; the document itself does not
scroll. On small screens, the dossier has its own scroll area so its details remain
accessible.

## Run

```bash
cd game-visual
npm install
npm run dev
```

Open the local URL printed by Vite. Use `npm run build` to create a static build in
`dist/`; the build embeds a snapshot of the workbook.

The development server reads
[`../data/output/nearby_30ly/nearby_stars.xlsx`](../data/output/nearby_30ly/nearby_stars.xlsx).
Run the Python pipeline first if that file is missing. Use **Open workbook** to load
another compatible `.xlsx` file without uploading it anywhere.

## Controls

- Left-drag to orbit, right-drag or the arrow keys to pan, and scroll or pinch to
  zoom. Click a star or use search to open its system and planet details.
- **2D view** flattens the live star coordinates onto the X/Y plane and separates
  markers that align on screen. It renders stars and labels directly; the PNG is
  created only when you choose **Export 2D**. Drag to pan, scroll to zoom, hover
  for a readable name, and click a point or its name to select it. **3D view**
  returns to the spatial map; search, filters, selection, and the dossier are shared.
  At overview zoom, fewer names and guide lines are shown; they return as you zoom in.
  Switching views keeps the last centered star at the center of the new view.
- The **Faction legend** shows every faction name and color from the workbook,
  plus a neutral marker for systems with no recorded owner. Collapse it for more
  chart space.
- The map starts in dark space mode. **Light mode** and **Dark mode** switch the
  interface and remember the choice in that browser.
- Filters can show planet hosts, unclaimed systems, or individual factions.
- **Export 2D PNG** downloads a 4096 × 4096 XY projection of the currently visible
  stars. It labels every star, separates stars that overlap in projection, and uses
  leader lines to preserve the relationship to their original positions. Z is
  omitted from this planar export.

## Campaign ownership

Ownership is stored in the workbook rather than the web app:

- `Stars.system_id` groups stellar entries into a physical system.
- `Stars.faction_owners` assigns one or more system owners.
- `Planets.faction_owners` assigns owners to individual planets.
- `Factions` maps faction IDs to display names and colors.

Enter multiple faction IDs as a semicolon-separated list. Save the workbook and
refresh the browser map, or load the edited copy with **Open workbook**.
Campaign planets added to the **Planets** sheet survive pipeline regeneration while
their HYG host remains in the selected star volume.

## Checks

```bash
npm test
npm run build
```

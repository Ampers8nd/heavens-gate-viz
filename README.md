# heavens-gate-viz

Star-catalog analysis and interactive maps for the Heaven's Gate NRP server. The
repository includes a Three.js browser map, a standalone Python/Plotly map, and the
pipeline that joins nearby HYG stars to confirmed NASA Archive exoplanets.

## Requirements

- [Node.js](https://nodejs.org/) 20 or newer, including npm, for the Three.js map.
- [Python](https://www.python.org/downloads/) 3.10 or newer for rebuilding the
  spreadsheet and Python map.
- A current WebGL-capable browser.

The install commands below download these project packages:

| Area | Packages |
| --- | --- |
| Browser map | Three.js, `read-excel-file`, and Vite |
| Data and Python map | OpenPyXL and Plotly |

The HYG catalog, NASA export, and generated 30-light-year workbook are already in
the repository, so viewing the browser map does not require rerunning the pipeline.

## View the Three.js browser map

From the repository root:

```bash
cd game-visual
npm install
npm run dev
```

Open the URL printed in the terminal, normally
[`http://127.0.0.1:5173`](http://127.0.0.1:5173). Keep the terminal running while
using the map. Stop the server with **Ctrl+C**.

The map reads
[`data/output/nearby_30ly/nearby_stars.xlsx`](data/output/nearby_30ly/nearby_stars.xlsx),
starts in dark mode, and supports search, selection, faction filters, orbit and pan
controls, and a labeled 2D PNG export. See
[game-visual/README.md](game-visual/README.md) for all controls.

To preview a production build locally:

```bash
npm run build
npm run preview
```

Use the preview URL printed by Vite instead of opening `dist/index.html` directly.

## View the Python 3D map

Create a virtual environment and install the Python packages from the repository
root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r data/requirements.txt
.venv/bin/python data/visualize_stars.py --open
```

On Windows, replace `.venv/bin/python` with `.venv\Scripts\python.exe`. The command
generates and opens
[`data/output/nearby_30ly/star_map.html`](data/output/nearby_30ly/star_map.html).
If it cannot launch a browser automatically, open that HTML file manually.

## Rebuild the star spreadsheet

Rebuilding is optional when you only want to view the included map. To regenerate
the 30-light-year catalog:

```bash
.venv/bin/python data/nearby_stars.py --radius-ly 30
```

Change `--radius-ly` to produce another local volume. Existing faction ownership,
system IDs, notes, count overrides, and planet inclusion choices are preserved when
the destination workbook already exists. Manually added campaign planets are also
retained while their host star remains selected. Other generated scientific fields
are recreated from the source catalogs. See [data/README.md](data/README.md) for
the workbook schema and matching details.

Generated public metadata records source filenames and hashes without local
directory paths. Per-run `summary.json` files and automatic pre-migration workbook
backups remain local through `.gitignore`; neither visualizer requires them.

## Validation

```bash
.venv/bin/python -m unittest discover -s data -p 'test_*.py' -v
cd game-visual
npm test
npm run build
```

## Limitations and AI disclosure

OpenAI Codex (with Astra and 5.6 Sol) generated a large portion of this repository's
code. Catalog names can differ between HYG and the NASA Exoplanet Archive, so
unresolved and ambiguous hosts remain in review tables instead of being guessed.

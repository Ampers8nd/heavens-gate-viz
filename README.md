# heavens-gate-viz

Star-catalog analysis and interactive maps for the Heaven's Gate NRP server.

## Browser star map

```bash
cd game-visual
npm install
npm run dev
```

Open the local URL printed by Vite. The page reads
[`data/output/nearby_30ly/nearby_stars.xlsx`](data/output/nearby_30ly/nearby_stars.xlsx)
directly, starts in dark mode, and fills the browser viewport without document
scrolling. See [game-visual/README.md](game-visual/README.md) for controls, ownership
fields, and the 2D PNG export.

## Data pipeline and Python map

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r data/requirements.txt
.venv/bin/python data/nearby_stars.py --radius-ly 30
.venv/bin/python data/visualize_stars.py --open
```

Change `--radius-ly` to build another local volume. The pipeline assigns confirmed
NASA Archive planets to HYG hosts, writes Sol-centered Cartesian coordinates, and
creates editable Excel and CSV outputs. Details are in [data/README.md](data/README.md).

Generated public metadata records source filenames and hashes without storing local
directory paths. Per-run `summary.json` files and automatic pre-migration workbook
backups stay local through `.gitignore`; neither is required by either visualizer.

## Limitations and AI disclosure

OpenAI Codex (w/ Astra & 5.6 Sol) generated a large portion of this repository's code. Catalog names can
differ between HYG and the NASA Exoplanet Archive, so unresolved and ambiguous hosts
remain in review tables rather than being guessed.

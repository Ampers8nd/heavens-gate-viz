# Data pipeline

This folder contains the uploaded HYG and NASA Exoplanet Archive catalogs, the
matching pipeline, generated spreadsheets, and a standalone Python/Plotly map.
The scripts use local files and do not fetch catalog data.

## Build the spreadsheet

Run from the repository root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r data/requirements.txt
.venv/bin/python data/nearby_stars.py --radius-ly 30
```

The adjustable radius is inclusive and measured from Sol using HYG distances.
Output is written under `data/output/nearby_30ly/`; change the radius or pass
`--output-dir` for another volume. `--csv-only` skips Excel output.

Metadata contains portable source filenames and hashes, never absolute local paths.
`summary.json` and `nearby_stars.before-campaign.xlsx` are local artifacts excluded
from Git; the spreadsheet and browser map do not depend on them.

The main workbook is
[`output/nearby_30ly/nearby_stars.xlsx`](output/nearby_30ly/nearby_stars.xlsx):

- **Stars** contains one row per HYG entry, planet counts, faction ownership, and
  Sol-centered `x_ly`, `y_ly`, `z_ly` coordinates.
- **Planets** contains matched confirmed planets, orbital size and period,
  eccentricity, flux, temperature, radius, mass, and editable planet owners.
- **Factions** defines reusable faction IDs, names, colors, and notes.
- **Review**, **Host matches**, and **Measurements** retain uncertain identities
  and source detail for audit.

Use semicolon-separated faction IDs in `faction_owners`. Star systems and planets can have multiple owners. Keep stars in the same physical system on the same `system_id`. Existing campaign edits are
preserved when the pipeline rewrites the same workbook.

The coordinates use HYG's heliocentric J2000 equatorial frame: +X points to RA 0h,
+Y to RA 6h, and +Z to the north celestial pole. Sol is `(0, 0, 0)`.

Planet matching uses catalog identifiers and the reviewed
[`host_aliases.csv`](host_aliases.csv) crosswalk. It keeps NASA scientific
designations, counts distinct confirmed planet names, and leaves ambiguous matches
for review. A zero matched count means no confirmed planet was matched in these
uploaded files; it does not prove that a star has no planets.

## Python 3D map

```bash
.venv/bin/python data/visualize_stars.py --open
```

The command reads the workbook and writes the self-contained
[`output/nearby_30ly/star_map.html`](output/nearby_30ly/star_map.html). Drag to
orbit, scroll to zoom, and click a star for its catalog and planet details. Rerun
the command after spreadsheet edits.

## Validation and sources

```bash
.venv/bin/python -m unittest discover -s data -p 'test_*.py' -v
```

Catalog documentation: [HYG](https://www.astronexus.com/projects/hyg-details) and
[NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/). HYG-derived
data retain the source's CC BY-SA 4.0 license. Scientific measurements are catalog
values and should not be treated as a determination of habitability.

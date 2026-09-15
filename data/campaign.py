"""Campaign metadata shared by the data pipeline and the game map."""

import argparse
import csv
from pathlib import Path
import shutil

FACTION_COLUMNS = ["faction_id", "faction_name", "color", "notes"]
OWNERSHIP_HELP = (
    "Factions: define faction_id, faction_name, #RRGGBB color and notes. "
    "Stars/Planets faction_owners: semicolon-separated IDs, e.g. union; league. "
    "Blank means no recorded ownership. Stars sharing system_id share the union of "
    "their star-level claims. Planet owners are independent and never inherited. "
    "system_id defaults to the HYG primary and can be edited to group components. "
    "These are fictional campaign annotations, not astronomical data. "
    "Regeneration preserves campaign fields and user count/notes edits from the "
    "existing output workbook, or from --campaign-from when specified."
)


def rows(sheet):
    iterator = sheet.iter_rows(values_only=True)
    columns = next(iterator, ())
    return [dict(zip(columns, row)) for row in iterator if any(v is not None for v in row)]


def key(value):
    return str(int(value)) if isinstance(value, float) and value.is_integer() else str(value or "").strip()


def default_system(star):
    return "hyg:" + key(star.get("primary_hyg_id") or star["hyg_id"])


def apply_campaign(stars, planets, source=None):
    """Preserve editable fields by stable IDs, leaving new scientific values intact."""
    for star in stars:
        star["system_id"] = default_system(star)
        star["faction_owners"] = ""
    for planet in planets:
        planet["faction_owners"] = ""
    if source is None:
        return []
    from openpyxl import load_workbook
    wb = load_workbook(source, read_only=True, data_only=False)
    try:
        if "Stars" not in wb or "Planets" not in wb:
            raise ValueError("Campaign source must contain Stars and Planets sheets")
        for title, current, fields in [
            ("Stars", stars, ("system_id", "faction_owners", "planet_count_override", "notes")),
            ("Planets", planets, ("faction_owners", "include_in_count", "notes")),
        ]:
            identity = (lambda r: key(r.get("hyg_id"))) if title == "Stars" else (
                lambda r: (key(r.get("hyg_id")), r.get("planet_name")))
            previous = {identity(row): row for row in rows(wb[title])}
            for row in current:
                old = previous.get(identity(row), {})
                for field in fields:
                    if field not in old:
                        continue
                    value = old[field]
                    if isinstance(value, str) and value.startswith("="):
                        raise ValueError(f"Campaign field {title}.{field} must contain a literal value")
                    if field == "system_id" and not value:
                        continue
                    if field == "notes":
                        row[field] = "\n".join(dict.fromkeys(filter(None, (row.get(field), value))))
                    else:
                        row[field] = value if value is not None else ""
        # Logic to connect planet ownership from star ownership (single owner)
        stars_by_hyg_id = {
            key(star["hyg_id"]): star
            for star in stars
        }
        sequence = 0
        prev_host_id = ""
        for planet in planets:
            # Introduce a system to divide up the system into equal parts depending on how many owners there are
            # Assumes that planets are added sequantially in terms of system (ie, 2 planets having the same host star wont be found on 2 
            # different ends of the spreadsheet)
            star = stars_by_hyg_id.get(key(planet["hyg_id"]))
            owners = star["faction_owners"]
            owners_list = owners.split(";")
            if len(owners_list) <= 1:
                planet["faction_owners"] = owners
            else:
                if (prev_host_id == star["hyg_id"]):
                    # Previous planet was also in this system
                    sequence += 1
                    sequence = sequence % len(owners_list)
                    planet["faction_owners"] = owners_list[sequence]
                else:
                    # previous planet was a different system
                    sequence = 0
                    planet["faction_owners"] = owners_list[sequence]
            prev_host_id = star["hyg_id"]
        return rows(wb["Factions"]) if "Factions" in wb else []
    finally:
        wb.close()


def upgrade(path):
    """Add campaign columns in place, without regenerating or discarding user cells."""
    from openpyxl import load_workbook
    from openpyxl.styles import PatternFill, Font
    from openpyxl.utils import get_column_letter
    wb = load_workbook(path)
    backup = path.with_name(path.stem + ".before-campaign.xlsx")
    if not backup.exists():
        shutil.copy2(path, backup)
    for title, additions in [("Stars", ["system_id", "faction_owners"]), ("Planets", ["faction_owners"])]:
        ws = wb[title]
        headers = [c.value for c in ws[1]]
        for name in additions:
            if name in headers:
                continue
            column = len(headers) + 1
            ws.cell(1, column, name)
            ws.cell(1, column).font = Font(bold=True, color="FFFFFF")
            ws.cell(1, column).fill = PatternFill("solid", fgColor="183C54")
            ws.column_dimensions[get_column_letter(column)].width = 30
            for row_number in range(2, ws.max_row + 1):
                if name == "system_id":
                    values = {head: ws.cell(row_number, i + 1).value for i, head in enumerate(headers)}
                    ws.cell(row_number, column, default_system(values))
                ws.cell(row_number, column).fill = PatternFill("solid", fgColor="FFF2CC")
            headers.append(name)
        for table in ws.tables.values():
            table.ref = ws.dimensions
            # Preserve existing table columns and append the new names.
            from openpyxl.worksheet.table import TableColumn
            for i in range(len(table.tableColumns), len(headers)):
                table.tableColumns.append(TableColumn(id=i + 1, name=headers[i]))
            if table.autoFilter:
                table.autoFilter.ref = table.ref
    if "Factions" not in wb:
        ws = wb.create_sheet("Factions")
        ws.append(FACTION_COLUMNS)
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = "A1:D1"
        for i, name in enumerate(FACTION_COLUMNS, 1):
            ws.column_dimensions[get_column_letter(i)].width = 30 if name != "notes" else 60
            ws.cell(1, i).font = Font(bold=True, color="FFFFFF")
            ws.cell(1, i).fill = PatternFill("solid", fgColor="183C54")
    if "Read me" in wb:
        sheet = wb["Read me"]
        if not any(r[0].value == "Faction ownership" for r in sheet):
            sheet.append(["Faction ownership", OWNERSHIP_HELP])
            for table in sheet.tables.values():
                table.ref = sheet.dimensions
                if table.autoFilter:
                    table.autoFilter.ref = table.ref
    wb.save(path)
    wb.close()
    # Existing CSVs are independent snapshots; add the schema without replacing their data.
    for name, additions in [("stars.csv", ["system_id", "faction_owners"]), ("planets.csv", ["faction_owners"])]:
        csv_path = path.parent / name
        if not csv_path.exists():
            continue
        with csv_path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            columns, values = list(reader.fieldnames), list(reader)
        for field in additions:
            if field not in columns:
                columns.append(field)
                for row in values:
                    row[field] = default_system(row) if field == "system_id" else ""
        with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=columns)
            writer.writeheader()
            writer.writerows(values)
    print(f"Updated {path}; original saved to {backup.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Add faction fields to an existing selected workbook, retaining its cells.")
    parser.add_argument("workbook", type=Path)
    upgrade(parser.parse_args().workbook)

import csv
from pathlib import Path
import tempfile
import unittest

import nearby_stars as n


def star(id="1", **kwargs):
    return {"id": id, "dist": "1", "ra": "0", "dec": "0", **kwargs}


def planet(name="GJ 15 A b", host="GJ 15 A", **kwargs):
    return {"pl_name": name, "hostname": host, "default_flag": "1",
            "sy_dist": "1", "ra": "0", "dec": "0", **kwargs}


class CatalogTests(unittest.TestCase):
    def test_metadata_filenames_do_not_expose_local_directories(self):
        path = Path("/home/private-user/projects/catalog/host_aliases.csv")
        self.assertEqual(n.metadata_filename(path), "host_aliases.csv")
        self.assertIsNone(n.metadata_filename(None))

    def test_heliocentric_cartesian_coordinates(self):
        sol = star(dist="0", proper="Sol", x="0.000005", y="0", z="0")
        self.assertEqual(n.cartesian(sol, n.PC_TO_LY), dict(x=0, y=0, z=0))
        self.assertEqual(n.cartesian(star(x="1", y="-2", z="3")), dict(x=1, y=-2, z=3))
        self.assertAlmostEqual(n.cartesian(star(x="1"), n.PC_TO_LY)["x"], n.PC_TO_LY)

    def test_distance_units_boundary_sentinels_and_sol(self):
        self.assertTrue(n.selected(star(dist="1"), n.PC_TO_LY))
        self.assertFalse(n.selected(star(dist="1.000001"), n.PC_TO_LY))
        for value in ("", "nan", "inf", "-1", "100000"):
            self.assertFalse(n.selected(star(dist=value), 1e9))
        self.assertFalse(n.selected(star(dist="0", proper="Sol"), 30, True))

    def test_normalization_preserves_components_decimals_and_signs(self):
        self.assertEqual(n.normalize("Gl 15A"), n.normalize("GJ 15 A"))
        self.assertEqual(n.normalize("Gliese 83.1"), n.normalize("GJ 83.1"))
        self.assertNotEqual(n.normalize("Gl 15A"), n.normalize("Gl 15B"))
        self.assertNotEqual(n.normalize("GJ 83.1"), n.normalize("GJ 831"))
        self.assertNotEqual(n.normalize("BD+12 123"), n.normalize("BD-12 123"))

    def test_aliases_from_bayer_variable_and_flamsteed(self):
        ids = n.identifiers(star(bayer="Tau", flam="52", con="Cet", var="YZ"))
        for name in ("tau Cet", "52 Cet", "YZ Cet"):
            self.assertIn(n.normalize(name), ids)

    def test_one_default_row_without_mixing_or_double_count(self):
        rows = [planet(default_flag="0", pl_orbsmax="1.2", rowupdate="2026-01-01"),
                planet(pl_orbsmax="", rowupdate="2020-01-01")]
        chosen, groups = n.choose_planets(rows)
        self.assertEqual(len(chosen), 1)
        self.assertEqual(chosen[rows[0]["pl_name"]][0]["pl_orbsmax"], "")
        self.assertEqual(len(groups[rows[0]["pl_name"]]), 2)

    def test_no_default_latest_and_project_parameter_row(self):
        rows = [planet(default_flag="0", rowupdate="2020-01-01"),
                planet(default_flag="0", rowupdate="2025-01-01", soltype="TESS Project Candidate")]
        result = next(iter(n.choose_planets(rows)[0].values()))
        self.assertEqual(result[0]["rowupdate"], "2025-01-01")
        self.assertIn("no default", result[1])

    def test_identifier_beats_closest_binary_component(self):
        stars = [star(gl="Gl 15A", ra="0.001"), star("2", gl="Gl 15B")]
        chosen, _ = n.choose_planets([planet()])
        matches, _ = n.match_hosts(stars, chosen, 30, None, 180, False)
        self.assertEqual(matches["GJ 15 A"][0]["id"], "1")

    def test_position_alone_does_not_assign(self):
        chosen, _ = n.choose_planets([planet()])
        matches, audit = n.match_hosts([star()], chosen, 30, None, 180, False)
        self.assertFalse(matches)
        self.assertEqual(audit[0]["candidate_hyg_ids"], "1")
        self.assertEqual(audit[0]["status"], "unmatched_nearby")

    def test_duplicate_identifier_not_arbitrarily_resolved(self):
        chosen, _ = n.choose_planets([planet()])
        matches, audit = n.match_hosts([star(gl="Gl 15A"), star("2", gl="Gl 15A")], chosen, 30, None, 180, False)
        self.assertFalse(matches)
        self.assertEqual(audit[0]["status"], "ambiguous_identifier")

    def test_match_before_distance_filter_and_nasa_distance_not_authority(self):
        chosen, _ = n.choose_planets([planet(sy_dist="100")])
        matches, _ = n.match_hosts([star(gl="Gl 15A")], chosen, 30, None, 180, False)
        self.assertIn("GJ 15 A", matches)
        chosen, _ = n.choose_planets([planet()])
        matches, audit = n.match_hosts([star(gl="Gl 15A", dist="20")], chosen, 30, None, 180, False)
        self.assertFalse(matches)
        self.assertEqual(audit[0]["status"], "matched_outside_radius")

    def test_keeps_original_planet_letters_and_host_counts(self):
        stars = [star(gl="Gl 15A"), star("2", gl="Gl 15B"), star("0", dist="0", proper="Sol")]
        chosen, grouped = n.choose_planets([planet(name="GJ 15 A c", sy_pnum="9", pl_controv_flag="1")])
        matches, _ = n.match_hosts(stars, chosen, 30, None, 180, False)
        summaries, planets, _ = n.make_tables(stars, chosen, grouped, matches, 30, False)
        by_id = {s["hyg_id"]: s for s in summaries}
        self.assertEqual(by_id["1"]["planet_count"], 1)
        self.assertEqual(by_id["1"]["controversial_planet_count"], 1)
        self.assertEqual(by_id["2"]["has_planets"], "Unknown")
        self.assertEqual(by_id["0"]["planet_count"], 8)
        self.assertEqual(by_id["0"]["confirmed_exoplanet_count"], 0)
        self.assertEqual(planets[0]["planet_name"], "GJ 15 A c")

    def test_angular_units_and_wraparound(self):
        self.assertAlmostEqual(n.separation({"ra": "15", "dec": "0"}, star(ra="1")), 0)
        self.assertAlmostEqual(n.separation({"ra": "359.999", "dec": "0"}, star()), 3.6)

    def test_comment_csv_and_missing_required_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ps.csv"
            path.write_text('# metadata\npl_name,hostname,default_flag\n"A, b",A,1\n')
            rows, _ = n.read_csv(path, ["hostname"])
            self.assertEqual(rows[0]["pl_name"], "A, b")
            with self.assertRaises(ValueError):
                n.read_csv(path, ["missing"])

    def test_alias_target_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "aliases.csv"
            path.write_text("nasa_hostname,hyg_identifier,source,notes\nGJ 15 A,HYG 1,test,test\n")
            chosen, _ = n.choose_planets([planet()])
            matches, _ = n.match_hosts([star()], chosen, 30, path, 180, False)
            self.assertEqual(matches["GJ 15 A"][1], "verified alias")
            with self.assertRaises(ValueError):
                n.match_hosts([star("2")], chosen, 30, path, 180, False)

    def test_empty_workbook_and_formula_text(self):
        try:
            from openpyxl import load_workbook
        except ImportError:
            self.skipTest("openpyxl not installed")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "test.xlsx"
            tables = {"Stars": ([], n.STAR_COLUMNS), "Planets": ([], n.PLANET_COLUMNS),
                      "Review": ([{"notes": "=1+1"}], ["notes"])}
            n.write_workbook(path, tables)
            wb = load_workbook(path)
            self.assertEqual(wb["Review"]["A2"].data_type, "s")


if __name__ == "__main__":
    unittest.main()

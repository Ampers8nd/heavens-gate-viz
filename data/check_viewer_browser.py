"""Optional browser smoke check: install playwright and its Chromium first."""

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html", type=Path, default=ROOT / "output/nearby_30ly/star_map.html")
    parser.add_argument("--screenshots", type=Path, default=Path("/tmp/heavens-gate-viewer-check"))
    args = parser.parse_args()
    args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, external = [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("request", lambda r: external.append(r.url) if r.url.startswith(("http:", "https:")) else None)
        page.goto(args.html.resolve().as_uri())
        page.wait_for_function("window.starViewerReady===true", timeout=60000)
        page.wait_for_function("document.getElementById('star-map').querySelector('canvas')!==null")
        plot = "document.getElementById('star-map')"
        assert page.locator("#star-total").inner_text() == "270"
        assert page.locator("#star-name").inner_text() == "Sol"
        assert page.evaluate(f"{plot}.data[0].x.length") == 269
        assert page.evaluate(f"{plot}.data[0].text.every(x=>!x)")
        assert page.locator("#sol-beacon").is_visible()
        page.screenshot(path=str(args.screenshots / "overview.png"))
        # A visible isolated point in the supplied catalog's initial view (fixed viewport).
        page.mouse.move(954, 282)
        page.wait_for_timeout(700)
        page.mouse.click(954, 282)
        page.wait_for_function("document.getElementById('star-name').textContent!=='Sol'")
        print("Actual canvas click selected:", page.locator("#star-name").inner_text())
        page.locator("#search").fill("Sirius")
        page.locator("#search-results button").first.click()
        page.wait_for_function("document.getElementById('star-map').data[2].text.length===1")
        assert "Sirius" in page.locator("#star-name").inner_text()
        # Exercise the renderer's point-selection event with a real trace point.
        page.evaluate(f"{plot}.emit('plotly_click', {{points:[{{curveNumber:0,pointNumber:0,customdata:{plot}.data[0].customdata[0]}}]}})")
        assert page.locator("#star-name").inner_text() == "Proxima Centauri"
        for _ in range(3):
            page.locator("#zoom-in").click()
            page.wait_for_timeout(250)
        page.wait_for_function(f"{plot}.data[0].text.filter(Boolean).length>0")
        labels = page.evaluate(f"{plot}.data[0].text.filter(Boolean)")
        assert 0 < len(labels) <= 12
        assert page.evaluate(f"{plot}.layout.scene.annotations.length") == len(labels) + 1
        assert page.locator("#sol-beacon").is_visible()
        page.screenshot(path=str(args.screenshots / "zoomed.png"))
        before = page.evaluate(f"JSON.stringify({plot}.layout.scene.camera.eye)")
        page.mouse.move(1080, 550)
        page.mouse.down()
        page.mouse.move(1200, 590, steps=12)
        page.mouse.up()
        page.wait_for_timeout(500)
        assert page.evaluate(f"JSON.stringify({plot}.layout.scene.camera.eye)") != before
        await_center = f"Object.values({plot}.layout.scene.camera.center).every(v=>v===0)"
        page.wait_for_function(await_center)
        page.locator("#reset").click()
        page.wait_for_function(f"{plot}.data[0].text.every(x=>!x)&&{plot}.data[2].text.length===0")
        assert page.locator("#star-name").inner_text() == "Sol"
        before_wheel = page.evaluate(f"JSON.stringify({plot}.layout.scene.camera.eye)")
        page.mouse.move(1100, 600)
        page.wait_for_timeout(300)
        page.mouse.wheel(0, -350)
        page.wait_for_function(f"JSON.stringify({plot}.layout.scene.camera.eye)!=={before_wheel!r}")
        assert page.locator("#sol-beacon").is_visible()
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(500)
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.screenshot(path=str(args.screenshots / "mobile.png"), full_page=True)
        assert not errors, errors
        assert not external, external
        browser.close()
        print("Browser checks passed: all stars, initial labels, search, point selection, zoom labels, orbit, Sol, reset, mobile layout, offline loading.")
        print(f"Screenshots: {args.screenshots}")


if __name__ == "__main__":
    main()

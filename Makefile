PY ?= python3
.PHONY: setup update check serve
setup:   ## venv with Playwright + Chromium for the site checks
	$(PY) -m venv .venv && .venv/bin/pip install -r requirements-site.txt && .venv/bin/playwright install chromium
update:  ## rebuild the sector-model catalogue (docs/data/models.json) from the notebooks, then run the visual checks
	.venv/bin/python scripts/build_site.py && .venv/bin/python scripts/check_site.py
check:   ## headless layout checks at 1280 and 390 px, dark and light (see scripts/check_site.py)
	.venv/bin/python scripts/check_site.py $(ARGS)
serve:   ## preview at http://localhost:8000 (valuation data is read from the live dashboard)
	cd docs && $(PY) -m http.server 8000

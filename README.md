# ModelosArgentina

Modelos de análisis fundamental y técnico de CEDEARs / sectores para Argentina.

## Contenido
- `modelo_*.ipynb`: notebooks por sector (energía, salud/farma, semiconductores, ETFs, LatAm, etc.)
- `modeloTodosCedears.ipynb`: modelo general todos los CEDEARs
- `*.pdf`: fichas y documentación de ratios

## Uso
1. Crear entorno Python 3.10+:
   `pip install -r requirements.txt` (pandas, numpy, yfinance, matplotlib, etc.)
2. Abrir cualquier notebook con VS Code / Jupyter y ejecutar.

## Origen
Extraído de `StockAnlysis / Modelos argentina`.

## Website (English)
Live: **https://nicolasortizzz.github.io/ModelosArgentina/**: the sector models plus a valuation layer for 18 companies.

| Section | What it shows | Source |
|---|---|---|
| Valuation overview | Price (local listings in KRW at the ECB cross rate, with date), Base and probability-weighted DCF, comps (cycle-adjusted for memory), triangulated fair value, upside, current WACC, 5-year revenue CAGR, Monte Carlo P10–P90; per company: scenarios incl. tails, WACC history FY2021–FY2025 + today, reverse DCF | [market-intelligence-dashboard](https://github.com/nicolasortizzz/market-intelligence-dashboard) `data/valuation_summary.json` |
| Valuation workbench | The full interactive model (sliders, sensitivity, EV bridge, football field, reverse-DCF heatmap), embedded with `?embed=valuation` | same dashboard |
| Sector models / Documents | The notebooks and PDFs in this repo, with their ticker lists; tickers with a full valuation are highlighted | `docs/data/models.json`, built by `scripts/build_site.py` |

**One source of truth.** No valuation numbers are copied into this repo: the page reads them from the dashboard, which writes them in its own `make update` (after its validator passes). Refreshing the dashboard and pushing it updates this site too.

**Updating**
- Valuations: in market-intelligence-dashboard run `make update` and `make push`.
- Sector catalogue (after adding or editing a notebook): `make setup` once, then `make update` here (rebuilds `docs/data/models.json` and runs the visual checks), then commit and push. To add a notebook, add it to `SECTORS` in `scripts/build_site.py` with its English name.
- `make check`: headless checks at 1280 px and 390 px in dark and light mode. They catch horizontal overflow, clipped text, overlapping or unequal-height cards, overlapping axis labels, debug text (undefined/NaN), empty charts, JS errors and a workbench that is not in embed mode. `make check ARGS="--shots /tmp/site_"` also saves screenshots.
- Pages: GitHub Pages serves `docs/` from `main`.

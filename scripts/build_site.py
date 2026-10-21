"""Build docs/data/models.json (the sector-model catalogue shown on the site) from the notebooks in this repo.
Reads each modelo_*.ipynb: title (first markdown heading), the `tickers = [...]` list and the cell count. The
valuation numbers are NOT built here: the site reads them live from the market-intelligence-dashboard
(data/valuation_summary.json), which stays the single source of truth.
Usage: python scripts/build_site.py
"""
import json, glob, os, re, datetime as dt, subprocess
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
REPO = "https://github.com/nicolasortizzz/ModelosArgentina"
NBV = "https://nbviewer.org/github/nicolasortizzz/ModelosArgentina/blob/main/"
# English display names (notebook titles are in Spanish); order = display order
SECTORS = {
    "modeloTodosCedears.ipynb": ("All CEDEARs (master model)", "Base model: every CEDEAR ranked on the same weighted index"),
    "modelo_semiconductores.ipynb": ("Semiconductors", ""), "modelo_software_cloud.ipynb": ("Software, cloud & internet", ""),
    "modelo_robotica_ia.ipynb": ("Robotics, AI & quantum computing", ""), "modelo_autos_electricos.ipynb": ("Electric vehicles & mobility", ""),
    "modelo_ecommerce.ipynb": ("E-commerce", ""), "modelo_finanzas.ipynb": ("Financials, banks & payments", ""),
    "modelo_energia.ipynb": ("Energy", ""), "modelo_salud_farma.ipynb": ("Healthcare, pharma & biotech", ""),
    "modelo_consumo_defensivo.ipynb": ("Consumer staples", ""), "modelo_consumo_discrecional.ipynb": ("Consumer discretionary", ""),
    "modelo_aeroespacial_defensa.ipynb": ("Aerospace, defence & aviation", ""), "modelo_industrial.ipynb": ("Industrials & manufacturing", ""),
    "modelo_mineria_metales.ipynb": ("Mining, metals & lithium", ""), "modelo_real_estate.ipynb": ("Real estate, construction & infrastructure", ""),
    "modelo_telecomunicaciones.ipynb": ("Telecom & media", ""), "modelo_latam.ipynb": ("Latin America (Brazil & Mexico)", ""),
    "modelo_cripto_blockchain.ipynb": ("Crypto & blockchain", ""), "modelo_etfs.ipynb": ("ETFs", ""),
}
DOCS = {"Ratios_Documentacion_Modelo.pdf": ("Model ratios: documentation", "Definitions and weights of every ratio in the index (Spanish)"),
        "Fichas_Empresas_TodosCedears.pdf": ("Company profiles: all CEDEARs", "Description, business lines, founding and top holders (Spanish)"),
        "Fichas_Empresas_Salud_Farma.pdf": ("Company profiles: healthcare & pharma", "Sector profiles (Spanish)"),
        "Fichas_Empresas_Cripto_Blockchain.pdf": ("Company profiles: crypto & blockchain", "Sector profiles (Spanish)")}

def tickers(nb):
    for c in nb["cells"]:
        s = "".join(c["source"])
        m = re.search(r"tickers\s*=\s*\[(.*?)\]", s, re.S) if c["cell_type"] == "code" else None
        if m: return list(dict.fromkeys(re.findall(r'"([A-Za-z0-9.\-^=]+)"', m.group(1))))
    return []

def main():
    models = []
    for f, (name, desc) in SECTORS.items():
        p = os.path.join(ROOT, f)
        if not os.path.exists(p): print("missing", f); continue
        nb = json.load(open(p, encoding="utf-8"))
        md = next(("".join(c["source"]) for c in nb["cells"] if c["cell_type"] == "markdown"), "")
        try: last = subprocess.run(["git", "log", "-1", "--format=%cs", "--", f], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        except Exception: last = ""
        models.append({"file": f, "name": name, "description": desc or f"Same weighted index and ranking as the master model, applied to this sector",
                       "titleOriginal": md.splitlines()[0].lstrip("# ").strip() if md else "", "tickers": tickers(nb),
                       "cells": len(nb["cells"]), "updated": last, "nbviewer": NBV + f, "github": f"{REPO}/blob/main/{f}"})
    docs = [{"file": f, "title": t, "description": d, "sizeKB": round(os.path.getsize(os.path.join(ROOT, f)) / 1024),
             "url": f"{REPO}/blob/main/{f}", "raw": f"{REPO}/raw/main/{f}"} for f, (t, d) in DOCS.items() if os.path.exists(os.path.join(ROOT, f))]
    allt = sorted({t for m in models for t in m["tickers"]})
    out = {"generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "repo": REPO,
           "weights": {"Market Cap": 0.05, "P/E": 0.25, "EPS": 0.10, "EPS Growth": 0.05, "Debt to Equity": 0.25, "ROE": 0.05, "ROE variability": 0.05, "ROIC / WACC": 0.20},
           "models": models, "documents": docs, "uniqueTickers": len(allt)}
    json.dump(out, open(os.path.join(ROOT, "docs", "data", "models.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(f"models.json: {len(models)} models, {len(allt)} unique tickers, {len(docs)} documents")

if __name__ == "__main__":
    main()

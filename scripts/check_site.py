"""Headless visual / layout checks for the site (docs/), at desktop (1280) and mobile (390) widths, dark and light.
Fails (exit 1) on: JS errors, missing title/favicon, horizontal page overflow, clipped text (KPIs, headings, buttons,
table cells, chips), overlapping cards, unequal card heights within a grid row, overlapping chart tick labels,
debug text (undefined / NaN / null / Infinity / [object Object]), empty charts, or a workbench iframe that is not in
embed mode. Valuation data is read from the dashboard (--dash); by default the live one.
Usage: python scripts/check_site.py [--url URL] [--dash DASH_URL] [--shots PREFIX]
  default: serves docs/ on a free port; --shots /workspace/modarg_ writes PREFIX{desktop,mobile}_{dark,light}.png
"""
import sys, os, socket, threading, functools, http.server
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")
JS = r"""() => {
 const P=[], vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=="hidden"};
 const de=document.documentElement,VW=(window.visualViewport?.width||innerWidth); if(de.scrollWidth>VW+1) P.push(`page overflows horizontally: ${de.scrollWidth}px > ${VW}px`);
 for(const e of document.querySelectorAll("body *")){ if(!vis(e)||e.closest(".tbl-scroll")&&e.classList.contains("tbl-scroll")) continue;
   const r=e.getBoundingClientRect(); if(r.right>VW+1&&!e.closest(".tbl-scroll")&&!e.closest(".js-plotly-plot")) {P.push(`element past viewport: ${e.tagName}.${e.className} (${Math.round(r.right)}px)`);break} }
 for(const e of document.querySelectorAll(".kpi .v,.kpi .l,h1,h2,h3,.btn,.chip,.tag,.vt td .pill,.vt th,.links a,.brand b"))
   if(vis(e)&&e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflow!=="visible") P.push(`clipped text: ${e.className||e.tagName} "${e.textContent.trim().slice(0,40)}"`);
 const txt=document.body.innerText; for(const w of ["undefined","NaN","null","Infinity","[object Object]"]) if(new RegExp(`(^|[^A-Za-z])${w.replace(/[[\]]/g,"\\$&")}([^A-Za-z]|$)`).test(txt)) P.push(`debug text on page: ${w}`);
 for(const g of document.querySelectorAll(".grid,.kpis")){ const C=[...g.children].filter(vis), rows={};
   C.forEach(c=>{const r=c.getBoundingClientRect();(rows[Math.round(r.top)]=rows[Math.round(r.top)]||[]).push(r)});
   for(const [t,R] of Object.entries(rows)){ const h=R.map(r=>r.height); if(Math.max(...h)-Math.min(...h)>2) P.push(`unequal card heights in ${g.id||g.className} row @${t}: ${h.map(Math.round)}`);}
   for(let i=0;i<C.length;i++)for(let j=i+1;j<C.length;j++){const a=C[i].getBoundingClientRect(),b=C[j].getBoundingClientRect();
     if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1) P.push(`overlapping cards in ${g.id||g.className}`)}}
 for(const id of ["upChart","dScen","dWacc"]){ const el=document.getElementById(id); if(!el||!vis(el)) continue;
   if(!el.querySelector(".main-svg")) {P.push(`chart ${id} not rendered`);continue}
   for(const ax of ["xtick","ytick"]){ const L=[...el.querySelectorAll(`g.${ax} text`)].map(t=>t.getBoundingClientRect()).filter(r=>r.width);
     for(let i=1;i<L.length;i++){const a=L[i-1],b=L[i]; if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1){P.push(`overlapping ${ax} labels in ${id}`);break}}}}
 if(!document.title||document.title.length<10) P.push("missing title");
 if(!document.querySelector('link[rel=icon]')) P.push("missing favicon");
 return P }"""

def serve():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT); H.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{port}/"

def opt(a, k):
    if k in a: i = a.index(k); v = a[i + 1]; del a[i:i + 2]; return v

def main():
    a = sys.argv[1:]; url, dash, shots = opt(a, "--url"), opt(a, "--dash"), opt(a, "--shots"); srv = None
    if not url: srv, url = serve()
    q = f"?dash={dash}" if dash else ""; fails = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for name, vp, mob in (("desktop", {"width": 1280, "height": 900}, False), ("mobile", {"width": 390, "height": 844}, True)):
            for th in ("dark", "light"):
                ctx = b.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=2 if mob else 1); pg = ctx.new_page(); errs = []
                pg.add_init_script(f"try{{localStorage.setItem('ma-theme','{th}')}}catch(e){{}}")
                pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
                print("..", name, th, flush=True); pg.goto(url + q, wait_until="load"); pg.wait_for_function("()=>document.querySelectorAll('#vt tbody tr[data-t]').length>0", timeout=60000); pg.wait_for_timeout(1500)
                pg.locator("#workbench").scroll_into_view_if_needed(); pg.wait_for_timeout(500)
                fr = pg.frame_locator("#wb")
                if not mob:   # phones get a link to the full-page workbench instead of the iframe
                    try: fr.locator("#vK > *").first.wait_for(timeout=60000)
                    except Exception: fails.append(f"{name}/{th}: workbench did not render")
                elif not pg.evaluate("()=>!!document.getElementById('wbMob').href"): fails.append(f"{name}/{th}: mobile workbench link missing")
                emb = "link (mobile)" if mob else pg.evaluate("()=>{try{const d=document.getElementById('wb').contentDocument;return d?{embed:d.documentElement.classList.contains('embed'),header:getComputedStyle(d.querySelector('header.top')).display,theme:d.documentElement.dataset.theme}:'cross-origin'}catch(e){return 'cross-origin'}}")
                if isinstance(emb, dict) and (not emb["embed"] or emb["header"] != "none" or emb["theme"] != th): fails.append(f"{name}/{th}: workbench not in embed mode / theme mismatch {emb}")
                pg.evaluate("()=>scrollTo(0,0)"); pg.wait_for_timeout(300)
                P = pg.evaluate(JS)
                if pg.evaluate("()=>{const s=document.querySelector('.tbl-scroll');return s.scrollWidth>s.clientWidth+1}"): P.append(f"valuation table needs horizontal scrolling at {vp['width']} px")
                P += [f"JS error: {e}" for e in errs if "favicon" not in e]
                print(f"{'FAIL' if P else 'ok  '} {name:7} {th:5} {vp['width']}px  workbench={emb if isinstance(emb,str) else 'embed'}")
                for p in P: print("      -", p)
                fails += [f"{name}/{th}: {p}" for p in P]
                if shots:
                    if not mob: pg.screenshot(path=f"{shots}{name}_{th}.png", full_page=True)
                    else:
                        for sec in ("top", "valuation", "workbench", "models"):
                            pg.evaluate("id=>{const e=document.getElementById(id);scrollTo(0,id==='top'?0:e.getBoundingClientRect().top+scrollY-64)}", sec); pg.wait_for_timeout(700)
                            pg.screenshot(path=f"{shots}{name}_{th}_{sec}.png")
                ctx.close()
        b.close()
    if srv: srv.shutdown()
    if fails: print(f"\n!! site check FAILED ({len(fails)} problems)"); sys.exit(1)
    print("\n== site check passed (1280 + 390 px, dark + light)")

if __name__ == "__main__":
    main()

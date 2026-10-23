"use strict";
/* Modelos Argentina site. Valuation numbers are read live from the Market Intelligence Dashboard
   (data/valuation_summary.json, written by its `make update`), so that repo is the single source of truth.
   ?dash=<url> overrides the dashboard base (local testing). */
const QS=new URLSearchParams(location.search);
const DASH=(QS.get("dash")||"https://nicolasortizzz.github.io/market-intelligence-dashboard/").replace(/\/?$/,"/");
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const S={sum:null,models:null,sort:{k:"upside",d:-1},sel:null,q:""};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const nf=(d=2)=>new Intl.NumberFormat("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const usd=(v,d=2)=>v==null||!isFinite(v)?"—":(v<0?"−$":"$")+nf(d).format(Math.abs(v));
const pct=(v,d=1)=>v==null||!isFinite(v)?"—":(v<0?"−":"")+nf(d).format(Math.abs(v*100))+"%";
const spct=(v,d=1)=>v==null||!isFinite(v)?"—":(v>=0?"+":"−")+nf(d).format(Math.abs(v*100))+"%";
const SYM={KRW:"₩",TWD:"NT$",EUR:"€",BRL:"R$",CNY:"¥",ARS:"ARS ",JPY:"¥",HKD:"HK$"};
const loc=(v,c)=>v==null?"":(SYM[c]||c+" ")+nf(v>=1000?0:2).format(v);
const dateFmt=d=>{if(!d)return"";const x=new Date(d.length===10?d+"T12:00:00Z":d);return x.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"America/Argentina/Buenos_Aires"})};
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const theme=()=>document.documentElement.dataset.theme;

async function load(){
  const [sum,models]=await Promise.all([fetch(DASH+"data/valuation_summary.json",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}),
    fetch("data/models.json",{cache:"no-cache"}).then(r=>r.json())]);
  S.sum=sum;S.models=models;
  const sec={};models.models.forEach(m=>{if(m.file!=="modeloTodosCedears.ipynb")m.tickers.forEach(t=>(sec[t]=sec[t]||[]).push(m.name))});S.sec=sec;
  const h=location.hash.match(/^#valuation\/(.+)$/);S.sel=h&&sum.companies[decodeURIComponent(h[1])]?decodeURIComponent(h[1]):"000660.KS" in sum.companies?"000660.KS":sum.tickers[0];
  kpis();table();mxInit();models_();docs();wbInit();detail(S.sel,false);upChart();
  $("#asof").textContent=`Valuation snapshot ${dateFmt(sum.generatedAt)} · sector catalogue ${dateFmt(models.generatedAt)}`;
}
function kpis(){const C=Object.values(S.sum.companies),fx=S.sum.fx||{},under=C.filter(c=>c.upside>0).length,med=C.map(c=>c.upside).sort((a,b)=>a-b)[C.length>>1];
  const K=[["Companies valued",C.length,`${under} above price · median ${spct(med)}`],["Sector models",S.models.models.length,`${S.models.uniqueTickers} CEDEAR tickers covered`],
    ["USD / ARS official",fx.ARSUSD_BCRA?"ARS "+nf(2).format(fx.ARSUSD_BCRA):"—",fx.ARS_date?`BCRA wholesale rate · ${dateFmt(fx.ARS_date)}`:""],
    ["Last refresh",dateFmt(S.sum.generatedAt),"prices, FX, WACC and scenarios"]];
  $("#kpis").innerHTML=K.map(([l,v,s])=>`<div class="kpi"><span class="l">${esc(l)}</span><span class="v">${esc(v)}</span><span class="s" title="${esc(s)}">${esc(s)}</span></div>`).join("")}

const COLS=[["ticker","Company",c=>c.ticker],["price","Price",c=>c.price],["base","Base DCF",c=>c.base],["probWeighted","Weighted DCF",c=>c.probWeighted],["comps","Comps",c=>c.comps],
  ["triangulated","Fair value",c=>c.triangulated],["upside","Upside",c=>c.upside],["wacc","WACC",c=>c.wacc??c.costOfEquity],["cagr","Rev. CAGR",c=>c.revenueCagr?.value],["mc","MC P10–P90",c=>c.monteCarlo?.p50/c.price]];
function rows(){const q=S.q.toLowerCase(),C=Object.values(S.sum.companies).filter(c=>!q||c.ticker.toLowerCase().includes(q)||(c.name||"").toLowerCase().includes(q));
  const f=COLS.find(x=>x[0]===S.sort.k)[2];return C.sort((a,b)=>{const x=f(a),y=f(b);if(typeof x==="string")return S.sort.d*x.localeCompare(y);return S.sort.d*((x??-1e9)-(y??-1e9))})}
function table(){const T=$("#vt");
  const TIP={price:"Last close, USD per share or ADR (local price below)",base:"Base-case DCF value",probWeighted:"Probability-weighted DCF across all scenarios incl. tails",comps:"Peer-multiple value",triangulated:"60% weighted DCF + 40% comps",upside:"Fair value vs price",wacc:"Current WACC (banks: cost of equity)",cagr:"Historical 5-year revenue CAGR, FY2020–FY2025",mc:"Monte Carlo P10–P90 (4,000 runs); marker = price"};
  T.querySelector("thead").innerHTML="<tr>"+COLS.map(([k,l])=>`<th scope="col" data-k="${k}" title="${TIP[k]||"Sort"}"${S.sort.k===k?` aria-sort="${S.sort.d>0?"ascending":"descending"}"`:""}>${l}<span class="ar">${S.sort.k===k?(S.sort.d>0?"▲":"▼"):"↕"}</span></th>`).join("")+"</tr>";
  const R=rows(),mx=Math.max(...Object.values(S.sum.companies).map(c=>c.monteCarlo.p90/c.price)),scale=v=>Math.min(100,v/Math.min(mx,4)*100);
  T.querySelector("tbody").innerHTML=R.length?R.map(c=>{const w=c.wacc??c.costOfEquity,h=c.revenueCagr,mc=c.monteCarlo,lo=scale(mc.p10/c.price),hi=scale(mc.p90/c.price),px=scale(1);
    return `<tr data-t="${esc(c.ticker)}" class="${c.ticker===S.sel?"sel":""}" tabindex="0">
    <td><span class="tk">${esc(c.ticker)}${c.preRevenue?' <span class="prb" title="Pre-revenue: value rests on scenarios">pre-revenue</span>':""}</span><span class="nm" title="${esc(c.name)}">${esc(c.name)}</span></td>
    <td class="num">${usd(c.price)}<span class="sub${c.priceLocal!=null?"":" d"}">${c.priceLocal!=null?esc(loc(c.priceLocal,c.currencyLocal)):esc(dateFmt(c.priceDate))}</span></td>
    <td class="num">${usd(c.base)}</td><td class="num">${usd(c.probWeighted)}</td>
    <td class="num">${usd(c.comps)}${c.compsCycleAdjusted?`<span class="sub" title="Peer multiples applied to through-cycle earnings">cycle-adjusted</span>`:""}</td>
    <td class="num"><b>${usd(c.triangulated)}</b></td>
    <td class="num"><span class="pill ${c.upside>=0?"up":"dn"}">${spct(c.upside)}</span></td>
    <td class="num">${pct(w,2)}<span class="sub">${c.costOfEquity!=null?"cost of equity":"today"}</span></td>
    <td class="num">${h?pct(h.value):"—"}<span class="sub">${h?esc(h.currency)+(h.periods<5?` · ${h.periods}y only`:""):""}</span></td>
    <td class="num"><span class="range" title="P10 ${usd(mc.p10)} · median ${usd(mc.p50)} · P90 ${usd(mc.p90)}; marker = price"><i style="left:${lo}%;width:${Math.max(2,hi-lo)}%"></i><b style="left:calc(${px}% - 1px)"></b></span><span class="sub">${usd(mc.p10,0)} – ${usd(mc.p90,0)}</span></td></tr>`}).join(""):`<tr><td class="loading" colspan="10">No company matches “${esc(S.q)}”.</td></tr>`;
  $$("#vt th").forEach(th=>th.onclick=()=>{const k=th.dataset.k;S.sort=S.sort.k===k?{k,d:-S.sort.d}:{k,d:k==="ticker"?1:-1};table()});
  $$("#vt tbody tr[data-t]").forEach(tr=>{tr.onclick=()=>detail(tr.dataset.t,true);tr.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();detail(tr.dataset.t,true)}}});
  const fx=S.sum.fx||{};
  $("#vtFoot").innerHTML=`Prices: last close in the snapshot. Local listings converted at official rates: KRW ${nf(2).format(fx.KRWUSD)} per USD (ECB reference-rate cross, ${dateFmt(fx.KRW_date)}); ADR financials in TWD at ${nf(3).format(fx.TWDUSD)} (CBC, ${dateFmt(fx.TWD_date)}), EUR at ${nf(4).format(fx.EURUSD_ecb)} USD (ECB, ${dateFmt(fx.EUR_date)}), BRL at ${nf(4).format(fx.BRLUSD)} (BCB PTAX, ${dateFmt(fx.BRL_date)})${fx.CADUSD?`, CAD at ${nf(4).format(fx.CADUSD)} (Bank of Canada, ${dateFmt(fx.CAD_date)})`:""}. Regulated utilities and banks: residual income on book value (cost of equity shown); BEP: dividend-discount model. Monte Carlo bar: P10–P90 of 4,000 runs relative to the price (marker).`}

const PL=()=>({paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(0,0,0,0)",font:{family:"Inter, system-ui, sans-serif",size:12.5,color:css("--tx")},margin:{l:10,r:16,t:8,b:36},
  xaxis:{gridcolor:css("--bd"),zerolinecolor:css("--bd"),linecolor:css("--bd"),automargin:true,tickfont:{color:css("--mu")}},yaxis:{gridcolor:css("--bd"),zerolinecolor:css("--bd"),automargin:true,tickfont:{color:css("--mu")}},
  hoverlabel:{font:{family:"Inter, sans-serif"}},showlegend:false});
const CFG={displayModeBar:false,responsive:true};
const narrow=()=>innerWidth<560;
function detail(tk,scroll){const c=S.sum.companies[tk];if(!c)return;S.sel=tk;$$("#vt tbody tr").forEach(r=>r.classList.toggle("sel",r.dataset.t===tk));
  history.replaceState(null,"",location.search+"#valuation/"+encodeURIComponent(tk));
  const D=$("#detail");D.hidden=false;$("#dTitle").textContent=`${c.ticker} · scenarios`;$("#dTag").textContent=c.model;
  const sc=[...c.scenarios].reverse(),short=n=>n.replace(/^Tail:\s*/,"Tail · ");
  if(window.Plotly){const L=PL();L.margin.l=8;L.xaxis.tickprefix="$";L.xaxis.separatethousands=true;L.xaxis.tickformat=",.0f";if(narrow())L.xaxis.nticks=4;L.yaxis.gridcolor="rgba(0,0,0,0)";
    L.shapes=[{type:"line",x0:c.price,x1:c.price,yref:"paper",y0:0,y1:1,line:{color:css("--warn"),width:1.5,dash:"dot"}}];
    L.annotations=[{x:c.price,y:1,yref:"paper",yanchor:"bottom",text:`price ${usd(c.price)}`,showarrow:false,font:{size:11,color:css("--warn")}}];L.margin.t=22;L.margin.r=12;L.xaxis.range=[0,Math.max(c.price,...c.scenarios.map(s=>s.value))*1.28];
    Plotly.react("dScen",[{type:"bar",orientation:"h",y:sc.map(s=>`${short(s.name)} (${Math.round(s.p*100)}%)`),x:sc.map(s=>s.value),
      marker:{color:sc.map(s=>s.value>=c.price?css("--up"):css("--dn")),opacity:.85},text:sc.map(s=>usd(s.value)),textposition:"outside",textfont:{color:css("--mu"),size:11.5},cliponaxis:false,
      hovertemplate:"%{y}<br>%{x:$,.2f}<extra></extra>"}],L,CFG)}
  const fx=c.fx,R=c.reverse,h=c.revenueCagr;
  const kv=[["Price",`${usd(c.price)}${c.priceLocal!=null?` = ${loc(c.priceLocal,c.currencyLocal)}`:""} · ${dateFmt(c.priceDate)}`],
    ...(fx?[["FX (financials)",`${nf(fx.rate>100?2:4).format(fx.rate)} ${fx.quote}${fx.date?" · "+dateFmt(fx.date):""}`]]:[]),
    ["Fair value (triangulated)",`${usd(c.triangulated)} · ${spct(c.upside)} vs price`],
    ["Monte Carlo",`P10 ${usd(c.monteCarlo.p10)} · median ${usd(c.monteCarlo.p50)} · P90 ${usd(c.monteCarlo.p90)}`],
    ...(R&&R.impliedGrowth5y!=null?[["Reverse DCF",`price implies ${pct(R.impliedGrowth5y)} revenue growth p.a. for 5 years at a ${pct(R.baseMargin)} EBIT margin`]]:[]),
    ...(h?[["Revenue CAGR",`${pct(h.value)} in ${h.currency}${h.usd!=null&&h.currency!=="USD"?` · ${pct(h.usd)} in USD`:""} (${h.start}–${h.end})`]]:[]),
    ["Analysts",c.analyst?.targetMean?`${(c.analyst.rec||"").replace("_"," ")} · ${c.analyst.n} analysts · mean target ${usd(c.analyst.targetMean)}`:"—"],
    ...(S.sec[c.ticker]?[["Sector model",S.sec[c.ticker].join(", ")]]:[])];
  $("#dKv").innerHTML=kv.map(([k,v])=>`<span>${esc(k)}</span><span>${esc(v)}</span>`).join("");
  const W=c.waccHistory||[],m=c.waccHistoryMetric||"WACC";$("#dWTitle").textContent=`${c.ticker} · ${m} history`;
  if(window.Plotly&&W.length){const L=PL();L.yaxis.tickformat=".1%";L.yaxis.rangemode="tozero";L.margin.t=8;
    const x=W.map(r=>r.year==="current"?"Today":(narrow()?"FY":"FY")+(narrow()?String(r.year).slice(2):r.year));
    Plotly.react("dWacc",[{type:"scatter",mode:"lines+markers+text",x,y:W.map(r=>r.value),line:{color:css("--ac"),width:2.5,shape:"spline"},
      marker:{size:W.map(r=>r.year==="current"?12:8),color:W.map(r=>r.year==="current"?css("--ac2"):css("--ac")),line:{width:2,color:css("--card")}},
      text:W.map(r=>pct(r.value)),textposition:"top center",textfont:{size:11.5,color:css("--mu")},cliponaxis:false,hovertemplate:"%{x}: %{y:.2%}<extra></extra>"}],
      {...L,yaxis:{...L.yaxis,range:[0,Math.max(...W.map(r=>r.value))*1.25]}},CFG)}
  $("#dNote").textContent=`${m} at each fiscal year-end (FY2021–FY2025) and today: US 10-year Treasury, 60-month Blume-adjusted beta, Damodaran implied ERP and country-risk premium where relevant, book debt at market-cap weights. Sector: ${c.sector}`;
  $("#dOpen").onclick=e=>{e.preventDefault();$("#wbTk").value=tk;wbLoad(tk);$("#workbench").scrollIntoView({behavior:"smooth"})};
  if(scroll)D.scrollIntoView({behavior:"smooth",block:"nearest"})}

function upChart(){if(!window.Plotly)return;const C=Object.values(S.sum.companies).sort((a,b)=>a.upside-b.upside),L=PL();
  L.xaxis.tickformat="+.0%";if(narrow())L.xaxis.nticks=5;L.xaxis.zeroline=true;L.xaxis.zerolinecolor=css("--mu");L.yaxis.gridcolor="rgba(0,0,0,0)";L.margin.l=8;L.margin.b=30;
  Plotly.react("upChart",[{type:"bar",orientation:"h",y:C.map(c=>c.ticker),x:C.map(c=>c.upside),marker:{color:C.map(c=>c.upside>=0?css("--up"):css("--dn")),opacity:.85},
    text:C.map(c=>narrow()?spct(c.upside):`${spct(c.upside)}  ·  ${usd(c.triangulated)} vs ${usd(c.price)}`),textposition:"outside",cliponaxis:false,textfont:{size:11.5,color:css("--mu")},
    customdata:C.map(c=>c.name),hovertemplate:"<b>%{y}</b> %{customdata}<br>upside %{x:+.1%}<extra></extra>"}],
    {...L,xaxis:{...L.xaxis,range:narrow()?[Math.min(0,...C.map(c=>c.upside))*1.5-0.08,Math.max(0,...C.map(c=>c.upside))*1.5+0.05]:[Math.min(0,...C.map(c=>c.upside))*1.6-0.05,Math.max(0,...C.map(c=>c.upside))*1.9+0.05]},bargap:.32},CFG);
  $("#upChart").on?.("plotly_click",e=>detail(e.points[0].y,true))}

function wbUrl(tk,embed=true){return DASH+(embed?`?embed=valuation&theme=${theme()}`:"")+"#valuation/"+encodeURIComponent(tk)}
function wbInit(){const s=$("#wbTk");s.innerHTML=S.sum.tickers.map(t=>`<option value="${esc(t)}">${esc(t)} · ${esc(S.sum.companies[t].name)}</option>`).join("");s.value=S.sel;s.onchange=()=>wbLoad(s.value);$("#wbExt").href=$("#wbMob").href=wbUrl(S.sel,false);
  const f=$("#wb");f.addEventListener("load",fit);
  new IntersectionObserver((e,o)=>{if(e[0].isIntersecting){wbLoad(s.value);o.disconnect()}},{rootMargin:"600px"}).observe(f)}
function wbLoad(tk){$("#wbExt").href=$("#wbMob").href=wbUrl(tk,false);if(!narrow()||$("#wb").src)$("#wb").src=wbUrl(tk)}
function fit(){const f=$("#wb");try{const d=f.contentDocument;if(!d)return;const go=()=>{const h=d.documentElement.scrollHeight;if(h>400)f.style.height=h+"px"};go();
  new ResizeObserver(go).observe(d.body)}catch(e){/* cross-origin (local preview): keep the CSS height */}}

function models_(){const M=S.models,V=S.sum.companies,W=M.weights,mx=Math.max(...Object.values(W));
  $("#weights").innerHTML=`<b>Index weights</b>`+Object.entries(W).map(([k,v])=>`<span class="w"><i style="width:${Math.round(v/mx*44)}px"></i>${esc(k)} ${Math.round(v*100)}%</span>`).join("");
  $("#mGrid").innerHTML=M.models.map(m=>{const t=m.tickers,shown=t.slice(0,m.file==="modeloTodosCedears.ipynb"?24:t.length);
    return `<article class="card model"><div><h3>${esc(m.name)}</h3><span class="meta">${t.length} tickers · ${esc(m.file)}</span></div><p>${esc(m.description)}</p>
    <div class="chips">${shown.map(x=>V[x]?`<button class="chip" type="button" data-t="${esc(x)}" title="Full valuation: ${esc(V[x].name)}">${esc(x)}</button>`:`<span class="chip">${esc(x)}</span>`).join("")}${t.length>shown.length?`<span class="chip more">+${t.length-shown.length} more</span>`:""}</div>
    <div class="links"><a href="${m.nbviewer}" target="_blank" rel="noopener">View notebook ↗</a><a href="${m.github}" target="_blank" rel="noopener">GitHub</a></div></article>`}).join("");
  $$("#mGrid button.chip").forEach(b=>b.onclick=()=>{detail(b.dataset.t,false);$("#valuation").scrollIntoView({behavior:"smooth"})})}
function docs(){$("#dGrid").innerHTML=S.models.documents.map(d=>`<article class="card doc"><div class="ico">PDF</div><h3>${esc(d.title)}</h3><p>${esc(d.description)} · ${nf(0).format(d.sizeKB)} KB</p>
  <div class="links"><a href="${d.url}" target="_blank" rel="noopener">Open ↗</a><a href="${d.raw}">Download</a></div></article>`).join("")}

const MXC=[["evEbitda","EV / EBITDA","x",1],["pe","P/E","x",1],["fpe","Fwd P/E","x",1],["pfcf","P / FCF","x",1],["fcfY","FCF yield","%",-1],["divY","Div. yield","%",-1],["ndE","Net debt / EBITDA","x",0],["pb","P / B","x",1]];
const mxf=(v,u)=>v==null||!isFinite(v)?"—":u==="%"?pct(v):nf(1).format(v)+"x";
function mxInit(){const C=S.sum.companies,G=[...new Set(Object.values(C).map(c=>c.group).filter(Boolean))].sort(),s=$("#mxG");if(!s||!G.length){$("#multiples")?.setAttribute("hidden","");return}
  s.innerHTML=`<option value="">All sectors</option>`+G.map(g=>`<option>${esc(g)}</option>`).join("");const g0=C[S.sel]?.group;s.value=g0&&G.includes(g0)?g0:"";s.onchange=mxTable;mxTable()}
function mxTable(){const C=S.sum.companies,g=$("#mxG").value,L=Object.values(C).filter(c=>c.multiples&&(!g||c.group===g)).sort((a,b)=>(a.group||"").localeCompare(b.group||"")||(a.multiples.evEbitda??1e9)-(b.multiples.evEbitda??1e9));
  $("#mxT thead").innerHTML="<tr><th scope=\"col\">Company</th>"+(g?"":"<th scope=\"col\">Sector</th>")+MXC.map(([,l])=>`<th scope="col">${l}</th>`).join("")+"<th scope=\"col\">Upside</th></tr>";
  const cls=(c,k,d)=>{const v=c.multiples[k],m=c.groupMultiples?.[k]?.med;if(v==null||m==null||!d||c.groupMultiples.members.length<3)return"";if(d>0&&v<=0)return"";const r=v/m;return(d>0?r<.85:r>1.15)?"cheap":(d>0?r>1.15:r<.85)?"rich":""};
  let body=L.map(c=>`<tr data-t="${esc(c.ticker)}" tabindex="0"><td><span class="tk">${esc(c.ticker)}</span><span class="nm">${esc(c.name)}</span></td>${g?"":`<td class="muted">${esc(c.group||"")}</td>`}`+MXC.map(([k,,u,d])=>`<td class="num ${cls(c,k,d)}">${mxf(c.multiples[k],u)}</td>`).join("")+`<td class="num"><span class="pill ${c.upside>=0?"up":"dn"}">${spct(c.upside)}</span></td></tr>`).join("");
  const gm=g&&L[0]?.groupMultiples;if(gm)body+=["med","mean"].map(s=>`<tr class="agg"><td><b>Sector ${s==="med"?"median":"mean"}</b><span class="nm">${gm.members.length} names</span></td>`+MXC.map(([k,,u])=>`<td class="num">${mxf(gm[k]?.[s],u)}</td>`).join("")+"<td></td></tr>").join("");
  $("#mxT tbody").innerHTML=body;$$("#mxT tbody tr[data-t]").forEach(tr=>{tr.onclick=()=>{detail(tr.dataset.t,true)}});
  $("#mxFoot").textContent="EV = market cap + net debt + minority interest; EBITDA trailing twelve months; FCF and dividends from the last fiscal-year cash-flow statement; forward P/E on next-fiscal-year consensus EPS; all in USD at the official rates above. Negative multiples shown as reported but not coloured. Banks: EV-based ratios not meaningful. Source: dashboard data/multiples.json."}

function redraw(){if(!S.sum)return;detail(S.sel,false);upChart();const f=$("#wb");if(f.src)wbLoad($("#wbTk").value)}
$("#theme").onclick=()=>{const r=document.documentElement;r.dataset.theme=theme()==="dark"?"light":"dark";try{localStorage.setItem("ma-theme",r.dataset.theme)}catch(e){}
  document.querySelector('meta[name=theme-color]').content=css("--bg");redraw()};
$("#q").oninput=e=>{S.q=e.target.value.trim();table()};
load().catch(e=>{console.error(e);$("#vt tbody").innerHTML=`<tr><td class="loading" colspan="10">Valuation data could not be loaded (${esc(e.message)}). <a href="${DASH}#valuation">Open the dashboard</a>.</td></tr>`;$("#kpis").innerHTML=""});

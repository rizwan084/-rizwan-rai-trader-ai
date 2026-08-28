const $ = id => document.getElementById(id);
let state = { market: "futures", interval: "15m", scanner: [], selected: "BTCUSDT", chart: null, candleSeries: null };

function fmt(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined,{maximumFractionDigits:2});
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined,{maximumFractionDigits:4});
  return n.toLocaleString(undefined,{maximumFractionDigits:8});
}
function pct(v){ return `${Number(v)>=0?"+":""}${Number(v).toFixed(2)}%`; }
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function initChart(){
  const el=$("chart");
  if(state.chart) state.chart.remove();
  state.chart=LightweightCharts.createChart(el,{layout:{background:{type:"solid",color:"#0e1522"},textColor:"#8491a5"},grid:{vertLines:{color:"#162132"},horzLines:{color:"#162132"}},rightPriceScale:{borderColor:"#26354a"},timeScale:{borderColor:"#26354a",timeVisible:true},crosshair:{mode:1}});
  state.candleSeries=state.chart.addCandlestickSeries({upColor:"#21c77a",downColor:"#ff5570",borderVisible:false,wickUpColor:"#21c77a",wickDownColor:"#ff5570"});
  new ResizeObserver(()=>state.chart.applyOptions({width:el.clientWidth,height:el.clientHeight})).observe(el);
}

function navigate(id){
  document.querySelectorAll(".section").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  $(id).classList.add("active");
  const nav=document.querySelector(`.nav[data-section="${id}"]`);
  if(nav) nav.classList.add("active");
  if(id==="chart" && state.chart) setTimeout(()=>state.chart.timeScale().fitContent(),50);
}

async function api(url){
  const r=await fetch(url);
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
}

async function loadScanner(){
  try{
    const d=await api(`/api/scanner?market=${state.market}&interval=${state.interval}`);
    state.scanner=d.data;
    $("statScanned").textContent=d.scanned;
    $("statMarket").textContent=state.market==="futures"?"Futures":"Spot";
    const top=d.data[0];
    $("statTop").textContent=top?top.symbol:"—";
    $("statConfidence").textContent=top?`${top.confidence}%`:"—";
    $("lastUpdate").textContent="Updated "+new Date().toLocaleTimeString();
    $("scannerBody").innerHTML=d.data.map(x=>`<tr>
      <td><b>${esc(x.symbol)}</b></td><td><span class="signal-badge ${x.direction.toLowerCase()}">${x.direction}</span></td>
      <td>${x.confidence}%</td><td>${fmt(x.price)}</td><td class="${x.change>=0?"long":"short"}">${pct(x.change)}</td>
      <td>${esc(x.structure)}</td><td>${esc(x.liquidity)}</td><td>${x.rsi??"—"}</td>
    </tr>`).join("");
    $("topSetups").innerHTML=d.data.slice(0,5).map(x=>`<div class="setup"><b>${esc(x.symbol)}</b><span class="${x.direction==="LONG"?"long":"short"}">${x.direction}</span><small>${x.confidence}%</small></div>`).join("")||"<div class='error'>No setups returned.</div>";
    $("signalCards").innerHTML=d.data.slice(0,6).map(x=>`<div class="signal-card"><header><h3>${esc(x.symbol)}</h3><span class="${x.direction==="LONG"?"long":"short"}">${x.direction}</span></header><div class="big">${x.confidence}%</div><p>${esc(x.structure)} · ${esc(x.liquidity)}</p><p>RSI ${x.rsi??"—"} · 24h ${pct(x.change)}</p></div>`).join("");
  }catch(e){
    $("scannerBody").innerHTML=`<tr><td colspan="8" class="error">${esc(e.message)}</td></tr>`;
  }
}

async function analyzeSymbol(symbol=state.selected){
  state.selected=symbol.toUpperCase().replace(/[^A-Z0-9]/g,"");
  $("symbolInput").value=state.selected;
  $("chartTitle").textContent=state.selected;
  $("signalMarket").textContent=`${state.market.toUpperCase()} · ${state.interval.toUpperCase()}`;
  try{
    const d=await api(`/api/analyze?symbol=${state.selected}&market=${state.market}&interval=${state.interval}`);
    $("signalDirection").textContent=d.direction;
    $("signalDirection").className=d.direction==="LONG"?"long":"short";
    $("confidenceValue").textContent=d.confidence+"%";
    $("confidenceMeter").style.width=d.confidence+"%";
    $("entry").textContent=fmt(d.entry); $("sl").textContent=fmt(d.stopLoss);
    $("tp1").textContent=fmt(d.targets[0]); $("tp2").textContent=fmt(d.targets[1]); $("tp3").textContent=fmt(d.targets[2]);
    $("support").textContent=fmt(d.support); $("resistance").textContent=fmt(d.resistance);
    $("structureTag").textContent=d.structure; $("liquidityTag").textContent=d.liquidity; $("imbalanceTag").textContent=d.imbalance;
    $("reasons").innerHTML=d.reasons.map(x=>`<li>${esc(x)}</li>`).join("")||"<li>No strong single-factor confirmation.</li>";
    $("ema9").textContent=fmt(d.indicators.ema9); $("ema20").textContent=fmt(d.indicators.ema20); $("ema50").textContent=fmt(d.indicators.ema50);
    $("rsi").textContent=d.indicators.rsi??"—"; $("atr").textContent=fmt(d.indicators.atr); $("volRatio").textContent=(d.indicators.volumeRatio??"—")+"x";
    if(!state.chart) initChart();
    state.candleSeries.setData(d.candles);
    state.chart.timeScale().fitContent();
  }catch(e){
    $("reasons").innerHTML=`<li class="error">${esc(e.message)}</li>`;
  }
}

document.querySelectorAll(".nav").forEach(n=>n.addEventListener("click",()=>navigate(n.dataset.section)));
document.querySelectorAll("[data-go]").forEach(n=>n.addEventListener("click",()=>navigate(n.dataset.go)));
$("market").addEventListener("change",async e=>{state.market=e.target.value;await loadScanner();await analyzeSymbol();});
$("interval").addEventListener("change",async e=>{state.interval=e.target.value;await loadScanner();await analyzeSymbol();});
$("refresh").addEventListener("click",async()=>{await loadScanner();await analyzeSymbol();});
$("analyze").addEventListener("click",()=>analyzeSymbol($("symbolInput").value));
$("symbolInput").addEventListener("keydown",e=>{if(e.key==="Enter") analyzeSymbol($("symbolInput").value);});

(async function boot(){
  initChart();
  await loadScanner();
  await analyzeSymbol("BTCUSDT");
  setInterval(loadScanner,60000);
})();
/* Slot Studio – Custom Slots (demo/arcade)
   - Builder: Symbole, Gewichte, Payouts, Linien
   - Play: 5x3, Multi-Lines, Gewinne links->rechts, WebAudio Sounds
*/

const $ = (id) => document.getElementById(id);

/* ---------- Secure-ish RNG (Browser) ---------- */
function randInt(maxExclusive) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % maxExclusive;
}
function choice(arr) {
  return arr[randInt(arr.length)];
}

/* ---------- Default Slot Definition ---------- */
const DEFAULT_DEF = {
  name: "Arcade Deluxe",
  startCredits: 200,
  accent: "#00e5ff",
  rows: 3,
  reels: 5,
  // icon can be emoji OR URL (http/data). Emoji is easiest.
  symbols: [
    { id:"cherry", icon:"🍒", name:"Cherry", weight:18, pay:{3:5, 4:20, 5:120} },
    { id:"lemon",  icon:"🍋", name:"Lemon",  weight:18, pay:{3:5, 4:18, 5:100} },
    { id:"bell",   icon:"🔔", name:"Bell",   weight:14, pay:{3:8, 4:30, 5:160} },
    { id:"star",   icon:"⭐", name:"Star",   weight:12, pay:{3:10,4:40, 5:220} },
    { id:"diamond",icon:"💎", name:"Diamond",weight:8,  pay:{3:14,4:70, 5:350} },
    { id:"seven",  icon:"7️⃣", name:"Seven", weight:4,  pay:{3:25,4:120,5:700} },
  ],
  // payline = array of rowIndex for each reel (0..2) [left..right]
  lines: [
    { id:"mid",  name:"Middle", pattern:[1,1,1,1,1], enabled:true },
    { id:"top",  name:"Top",    pattern:[0,0,0,0,0], enabled:true },
    { id:"bot",  name:"Bottom", pattern:[2,2,2,2,2], enabled:true },
    { id:"v",    name:"V",      pattern:[0,1,2,1,0], enabled:true },
    { id:"cap",  name:"^",      pattern:[2,1,0,1,2], enabled:true },
    { id:"zig",  name:"Zigzag", pattern:[1,0,1,2,1], enabled:false },
    { id:"zag",  name:"Zagzag", pattern:[1,2,1,0,1], enabled:false },
  ]
};

/* ---------- Persistence ---------- */
const LS_KEY = "slotStudio.def.v1";
const LS_STATE = "slotStudio.state.v1";

function loadDef() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(DEFAULT_DEF);
    const def = JSON.parse(raw);
    return normalizeDef(def);
  } catch {
    return structuredClone(DEFAULT_DEF);
  }
}
function saveDef(def) {
  localStorage.setItem(LS_KEY, JSON.stringify(def, null, 2));
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveState(state) {
  localStorage.setItem(LS_STATE, JSON.stringify(state));
}

/* ---------- Normalize / Validate minimal ---------- */
function normalizeDef(def) {
  const out = structuredClone(DEFAULT_DEF);

  if (def && typeof def === "object") {
    out.name = String(def.name ?? out.name);
    out.startCredits = Math.max(0, Number(def.startCredits ?? out.startCredits) | 0);
    out.accent = String(def.accent ?? out.accent);
    out.rows = 3; out.reels = 5;

    if (Array.isArray(def.symbols) && def.symbols.length >= 3) {
      out.symbols = def.symbols.map((s, i) => ({
        id: String(s.id ?? `s${i}`),
        icon: String(s.icon ?? "❓"),
        name: String(s.name ?? "Symbol"),
        weight: Math.max(1, Number(s.weight ?? 10) | 0),
        pay: {
          3: Math.max(0, Number(s.pay?.[3] ?? 0) | 0),
          4: Math.max(0, Number(s.pay?.[4] ?? 0) | 0),
          5: Math.max(0, Number(s.pay?.[5] ?? 0) | 0),
        }
      }));
    }

    if (Array.isArray(def.lines) && def.lines.length >= 1) {
      out.lines = def.lines.map((l, i) => ({
        id: String(l.id ?? `l${i}`),
        name: String(l.name ?? `Line ${i+1}`),
        pattern: Array.isArray(l.pattern) && l.pattern.length === 5 ? l.pattern.map(n => clampRow(n)) : [1,1,1,1,1],
        enabled: !!l.enabled
      }));
    }
  }
  return out;
}
function clampRow(n) {
  n = Number(n);
  if (Number.isNaN(n)) return 1;
  return Math.min(2, Math.max(0, n|0));
}

/* ---------- Sounds (WebAudio Synth) ---------- */
let audioOn = true;
let AC = null;

function ensureAudio() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
  }
}
function beep(freq, durMs, type="sine", gain=0.06) {
  if (!audioOn) return;
  ensureAudio();
  const t0 = AC.currentTime;
  const osc = AC.createOscillator();
  const g = AC.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs/1000);
  osc.connect(g).connect(AC.destination);
  osc.start(t0);
  osc.stop(t0 + durMs/1000 + 0.02);
}
function winJingle() {
  if (!audioOn) return;
  beep(659, 120, "triangle", 0.07);
  setTimeout(()=>beep(784, 120, "triangle", 0.07), 120);
  setTimeout(()=>beep(988, 160, "triangle", 0.08), 240);
}
function spinTick() { beep(160, 35, "square", 0.03); }
function stopTick() { beep(220, 70, "sawtooth", 0.04); }

/* ---------- App State ---------- */
let def = loadDef();
let state = loadState() || {
  credits: def.startCredits,
  betPerLine: 1,
  auto: false
};
let spinning = false;
let autoTimer = null;

/* ---------- DOM refs ---------- */
const tabPlay = $("tabPlay");
const tabBuilder = $("tabBuilder");
const viewPlay = $("viewPlay");
const viewBuilder = $("viewBuilder");

const slotNameEl = $("slotName");
const creditsEl = $("credits");
const betPerLineEl = $("betPerLine");
const lineCountEl = $("lineCount");
const reelsEl = $("reels");
const msgEl = $("msg");
const winsEl = $("wins");

const spinBtn = $("spinBtn");
const autoBtn = $("autoBtn");
const simBtn = $("simBtn");
const betDown = $("betDown");
const betUp = $("betUp");
const soundToggle = $("soundToggle");
const resetCredits = $("resetCredits");

/* Builder */
const bName = $("bName");
const bStartCredits = $("bStartCredits");
const bAccent = $("bAccent");
const bLines = $("bLines");
const symbolTbody = $("symbolTbody");
const addSymbolBtn = $("addSymbol");
const exportBtn = $("exportBtn");
const importBtn = $("importBtn");
const saveBtn = $("saveBtn");
const jsonBox = $("jsonBox");

/* ---------- Render Grid ---------- */
let cellMatrix = []; // [row][reel] => element
function renderReels() {
  reelsEl.innerHTML = "";
  cellMatrix = Array.from({length:3}, ()=>Array(5).fill(null));

  for (let r = 0; r < def.reels; r++) {
    const col = document.createElement("div");
    col.className = "reel";

    for (let row = 0; row < def.rows; row++) {
      const cell = document.createElement("div");
      cell.className = "cell";

      const icon = document.createElement("div");
      icon.className = "icon";
      icon.textContent = "❓";

      const label = document.createElement("div");
      label.className = "label";
      label.textContent = "";

      cell.appendChild(icon);
      cell.appendChild(label);

      col.appendChild(cell);
      cellMatrix[row][r] = cell;
    }

    reelsEl.appendChild(col);
  }
}

/* ---------- Symbol helpers ---------- */
function getSymbolById(id) {
  return def.symbols.find(s => s.id === id) || def.symbols[0];
}
function renderCell(cell, symId) {
  const s = getSymbolById(symId);
  const iconEl = cell.querySelector(".icon");
  const labelEl = cell.querySelector(".label");

  if (looksLikeUrl(s.icon)) {
    iconEl.textContent = "";
    iconEl.style.fontSize = "0px";
    iconEl.innerHTML = `<img alt="" src="${escapeHtml(s.icon)}" style="width:38px;height:38px;object-fit:contain;filter:drop-shadow(0 6px 14px rgba(0,0,0,.45));" />`;
  } else {
    iconEl.style.fontSize = "";
    iconEl.textContent = s.icon || "❓";
  }
  labelEl.textContent = s.name || "";
}
function looksLikeUrl(x) {
  return typeof x === "string" && (x.startsWith("http://") || x.startsWith("https://") || x.startsWith("data:"));
}
function escapeHtml(str){
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

/* ---------- Weighted pick list for spinning preview ---------- */
function buildWeightedBag() {
  const bag = [];
  for (const s of def.symbols) {
    const w = Math.max(1, s.weight|0);
    for (let i=0;i<w;i++) bag.push(s.id);
  }
  return bag.length ? bag : def.symbols.map(s=>s.id);
}
let weightedBag = buildWeightedBag();

function randomSymbolFromBag() {
  return weightedBag[randInt(weightedBag.length)];
}

/* ---------- Lines ---------- */
function enabledLines() {
  return def.lines.filter(l => l.enabled);
}

/* ---------- UI sync ---------- */
function applyAccent() {
  document.documentElement.style.setProperty("--accent", def.accent || "#00e5ff");
}
function setMsg(t) { msgEl.textContent = t; }
function syncHUD() {
  slotNameEl.textContent = def.name;
  creditsEl.textContent = String(state.credits);
  betPerLineEl.textContent = String(state.betPerLine);
  lineCountEl.textContent = String(enabledLines().length);
  autoBtn.textContent = `AUTO: ${state.auto ? "ON" : "OFF"}`;
  soundToggle.textContent = audioOn ? "ON" : "OFF";
}

/* ---------- Highlight helpers ---------- */
function clearHighlights() {
  for (let row=0; row<3; row++) {
    for (let r=0; r<5; r++) {
      cellMatrix[row][r].classList.remove("win","dim");
    }
  }
}
function dimAllExcept(coordsSet) {
  for (let row=0; row<3; row++) {
    for (let r=0; r<5; r++) {
      const key = `${row},${r}`;
      if (!coordsSet.has(key)) cellMatrix[row][r].classList.add("dim");
    }
  }
}

/* ---------- Spin Animation (simple, reliable) ---------- */
function startSpinAnimation() {
  clearHighlights();
  winsEl.innerHTML = "";
  setMsg("Spinning...");
  spinBtn.disabled = true;
  simBtn.disabled = true;
  betDown.disabled = true;
  betUp.disabled = true;

  // quick tick at start
  spinTick();

  // start “rolling” preview
  const intervals = [];
  for (let r=0; r<5; r++) {
    const iv = setInterval(() => {
      for (let row=0; row<3; row++) {
        renderCell(cellMatrix[row][r], randomSymbolFromBag());
      }
    }, 70);
    intervals.push(iv);
  }
  return intervals;
}

function stopReel(intervals, reelIndex, finalColSyms) {
  clearInterval(intervals[reelIndex]);
  for (let row=0; row<3; row++) {
    renderCell(cellMatrix[row][reelIndex], finalColSyms[row]);
  }
  stopTick();
}

/* ---------- Outcome generation ---------- */
function generateOutcome() {
  // returns grid [row][reel] => symId
  const grid = Array.from({length:3}, ()=>Array(5).fill(null));
  for (let r=0; r<5; r++) {
    for (let row=0; row<3; row++) {
      grid[row][r] = randomSymbolFromBag();
    }
  }
  return grid;
}

/* ---------- Win evaluation (left->right, consecutive matches, len>=3) ---------- */
function evaluate(grid, betPerLine) {
  const lines = enabledLines();
  const wins = [];
  let totalWin = 0;

  for (const line of lines) {
    const pattern = line.pattern; // row for each reel
    const first = grid[pattern[0]][0];
    let len = 1;
    for (let r=1; r<5; r++) {
      const sym = grid[pattern[r]][r];
      if (sym === first) len++;
      else break;
    }
    if (len >= 3) {
      const symObj = getSymbolById(first);
      const mult = symObj.pay[len] || 0;
      const amount = mult * betPerLine;
      if (amount > 0) {
        totalWin += amount;
        wins.push({
          lineId: line.id,
          lineName: line.name,
          symbolId: first,
          symbolName: symObj.name,
          icon: symObj.icon,
          len,
          mult,
          amount,
          coords: pattern.map((row, r)=>({row, r})).slice(0, len) // only matched segment
        });
      }
    }
  }

  return { wins, totalWin };
}

/* ---------- Play flow ---------- */
async function spinOnce() {
  if (spinning) return;

  const lines = enabledLines();
  if (lines.length === 0) {
    setMsg("Aktiviere mindestens 1 Linie im Builder.");
    return;
  }

  const totalBet = state.betPerLine * lines.length;
  if (state.credits < totalBet) {
    setMsg(`Zu wenig Credits. Du brauchst ${totalBet}.`);
    return;
  }

  // On iOS/Chrome: audio context needs user gesture; this click is one.
  if (audioOn) ensureAudio();

  spinning = true;
  state.credits -= totalBet;
  saveState(state);
  syncHUD();

  const intervals = startSpinAnimation();

  const finalGrid = generateOutcome();

  // Stop reels with stagger
  for (let r=0; r<5; r++) {
    await wait(450 + r*220);
    const colSyms = [finalGrid[0][r], finalGrid[1][r], finalGrid[2][r]];
    stopReel(intervals, r, colSyms);
  }

  // Evaluate
  const res = evaluate(finalGrid, state.betPerLine);
  if (res.totalWin > 0) {
    state.credits += res.totalWin;
    saveState(state);
    syncHUD();
    setMsg(`WIN: +${res.totalWin} Credits`);
    winJingle();
    renderWins(res.wins);
    highlightWins(res.wins);
  } else {
    setMsg("Kein Gewinn. Versuch’s nochmal.");
  }

  spinBtn.disabled = false;
  simBtn.disabled = false;
  betDown.disabled = false;
  betUp.disabled = false;
  spinning = false;

  if (state.auto) {
    autoTimer = setTimeout(spinOnce, 350);
  }
}

function renderWins(wins) {
  winsEl.innerHTML = "";
  for (const w of wins) {
    const row = document.createElement("div");
    row.className = "winRow";
    const left = document.createElement("div");
    const icon = looksLikeUrl(w.icon) ? "🟦" : w.icon;
    left.textContent = `${icon} ${w.symbolName} ×${w.len} (Linie: ${w.lineName})`;
    const right = document.createElement("div");
    right.innerHTML = `<b>+${w.amount}</b> <span style="color:var(--muted);font-size:12px;">(x${w.mult})</span>`;
    row.appendChild(left);
    row.appendChild(right);
    winsEl.appendChild(row);
  }
}

function highlightWins(wins) {
  clearHighlights();
  if (!wins.length) return;

  // collect all coords that are part of any win
  const set = new Set();
  for (const w of wins) {
    for (const c of w.coords) set.add(`${c.row},${c.r}`);
  }

  // mark
  for (const key of set) {
    const [row, r] = key.split(",").map(Number);
    cellMatrix[row][r].classList.add("win");
  }
  dimAllExcept(set);
}

/* ---------- RTP sim (quick estimate) ---------- */
function simulate(spins = 10000) {
  const lines = enabledLines();
  if (lines.length === 0) {
    setMsg("RTP Test: keine Linien aktiv.");
    return;
  }
  const bet = Math.max(1, state.betPerLine|0);
  const totalBet = bet * lines.length;

  let wagered = 0;
  let won = 0;
  for (let i=0;i<spins;i++) {
    const g = generateOutcome();
    const res = evaluate(g, bet);
    wagered += totalBet;
    won += res.totalWin;
  }
  const rtp = wagered > 0 ? (won / wagered) * 100 : 0;
  setMsg(`RTP Test (${spins} Spins): ca. ${rtp.toFixed(2)}% (Gewonnen ${won} / Einsatz ${wagered})`);
}

/* ---------- Builder UI ---------- */
function renderBuilder() {
  bName.value = def.name;
  bStartCredits.value = String(def.startCredits);
  bAccent.value = def.accent;

  // Lines
  bLines.innerHTML = "";
  def.lines.forEach((l, idx) => {
    const item = document.createElement("div");
    item.className = "lineItem";

    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!l.enabled;
    cb.onchange = () => { def.lines[idx].enabled = cb.checked; };
    const txt = document.createElement("div");
    txt.innerHTML = `<b>${l.name}</b><div style="color:var(--muted);font-size:12px;margin-top:2px;">Pattern: ${l.pattern.join("-")}</div>`;
    lab.appendChild(cb);
    lab.appendChild(txt);

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = `ID: ${l.id}`;

    item.appendChild(lab);
    item.appendChild(badge);
    bLines.appendChild(item);
  });

  // Symbols table
  symbolTbody.innerHTML = "";
  def.symbols.forEach((s, idx) => {
    const tr = document.createElement("tr");

    tr.appendChild(tdInput(s.icon, (v)=>def.symbols[idx].icon = v));
    tr.appendChild(tdInput(s.name, (v)=>def.symbols[idx].name = v));
    tr.appendChild(tdInputNum(s.weight, 1, 999, (v)=>def.symbols[idx].weight = v));
    tr.appendChild(tdInputNum(s.pay[3] ?? 0, 0, 999999, (v)=>def.symbols[idx].pay[3] = v));
    tr.appendChild(tdInputNum(s.pay[4] ?? 0, 0, 999999, (v)=>def.symbols[idx].pay[4] = v));
    tr.appendChild(tdInputNum(s.pay[5] ?? 0, 0, 999999, (v)=>def.symbols[idx].pay[5] = v));

    const tdDel = document.createElement("td");
    const del = document.createElement("button");
    del.className = "mini del";
    del.textContent = "Löschen";
    del.onclick = () => {
      if (def.symbols.length <= 3) return alert("Mindestens 3 Symbole lassen.");
      def.symbols.splice(idx,1);
      renderBuilder();
    };
    tdDel.appendChild(del);
    tr.appendChild(tdDel);

    symbolTbody.appendChild(tr);
  });

  jsonBox.value = JSON.stringify(def, null, 2);
}

function tdInput(val, onChange) {
  const td = document.createElement("td");
  const inp = document.createElement("input");
  inp.value = String(val ?? "");
  inp.oninput = () => onChange(inp.value);
  td.appendChild(inp);
  return td;
}
function tdInputNum(val, min, max, onChange) {
  const td = document.createElement("td");
  const inp = document.createElement("input");
  inp.type = "number";
  inp.min = String(min);
  inp.max = String(max);
  inp.step = "1";
  inp.value = String(val ?? 0);
  inp.oninput = () => {
    const v = Math.max(min, Math.min(max, Number(inp.value)|0));
    onChange(v);
  };
  td.appendChild(inp);
  return td;
}

function applyBuilderToDef() {
  def.name = String(bName.value || "My Slot");
  def.startCredits = Math.max(0, Number(bStartCredits.value)|0);
  def.accent = String(bAccent.value || "#00e5ff");

  // normalize & rebuild bag
  def = normalizeDef(def);
  weightedBag = buildWeightedBag();
  applyAccent();
  saveDef(def);

  // if user had no state yet or wants reset: we keep current credits unless user hits reset
  if (!state || typeof state.credits !== "number") {
    state = { credits: def.startCredits, betPerLine: 1, auto:false };
  }
  saveState(state);

  // re-render play
  renderReels();
  // fill initial random grid
  for (let r=0;r<5;r++) for (let row=0;row<3;row++) renderCell(cellMatrix[row][r], randomSymbolFromBag());
  syncHUD();
  setMsg("Builder gespeichert. Play ist aktualisiert.");
}

/* ---------- Tabs ---------- */
function showPlay() {
  tabPlay.classList.add("active");
  tabBuilder.classList.remove("active");
  viewPlay.classList.remove("hidden");
  viewBuilder.classList.add("hidden");
}
function showBuilder() {
  tabBuilder.classList.add("active");
  tabPlay.classList.remove("active");
  viewBuilder.classList.remove("hidden");
  viewPlay.classList.add("hidden");
  renderBuilder();
}

/* ---------- Events ---------- */
tabPlay.onclick = showPlay;
tabBuilder.onclick = showBuilder;

spinBtn.onclick = () => spinOnce();

autoBtn.onclick = () => {
  state.auto = !state.auto;
  saveState(state);
  syncHUD();
  if (!state.auto && autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  if (state.auto && !spinning) spinOnce();
};

simBtn.onclick = () => simulate(10000);

betDown.onclick = () => {
  state.betPerLine = Math.max(1, (state.betPerLine|0) - 1);
  saveState(state);
  syncHUD();
};
betUp.onclick = () => {
  state.betPerLine = Math.min(100, (state.betPerLine|0) + 1);
  saveState(state);
  syncHUD();
};

soundToggle.onclick = async () => {
  audioOn = !audioOn;
  if (audioOn) {
    ensureAudio();
    // some browsers start suspended until resume after gesture:
    if (AC && AC.state === "suspended") await AC.resume();
    beep(440, 80, "triangle", 0.06);
  }
  syncHUD();
};

resetCredits.onclick = () => {
  state.credits = def.startCredits;
  saveState(state);
  syncHUD();
  setMsg("Credits zurückgesetzt.");
};

addSymbolBtn.onclick = () => {
  def.symbols.push({
    id: `sym_${Date.now()}`,
    icon: "🟣",
    name: "New",
    weight: 10,
    pay:{3:5,4:20,5:120}
  });
  renderBuilder();
};

exportBtn.onclick = () => {
  jsonBox.value = JSON.stringify(def, null, 2);
  jsonBox.focus();
  jsonBox.select();
};

importBtn.onclick = () => {
  try {
    const parsed = JSON.parse(jsonBox.value);
    def = normalizeDef(parsed);
    renderBuilder();
    alert("Import OK. Jetzt noch 'Speichern & Anwenden' drücken.");
  } catch (e) {
    alert("JSON ungültig: " + e.message);
  }
};

saveBtn.onclick = () => {
  applyBuilderToDef();
  showPlay();
};

/* ---------- Utils ---------- */
function wait(ms){ return new Promise(res => setTimeout(res, ms)); }

/* ---------- Boot ---------- */
function boot() {
  def = normalizeDef(def);
  weightedBag = buildWeightedBag();
  applyAccent();

  // initial state fix
  if (!state || typeof state.credits !== "number") {
    state = { credits: def.startCredits, betPerLine: 1, auto:false };
  }
  saveState(state);

  renderReels();
  for (let r=0;r<5;r++) for (let row=0;row<3;row++) renderCell(cellMatrix[row][r], randomSymbolFromBag());
  syncHUD();
  setMsg("Bereit. (Builder → eigenen Slot bauen)");
}
boot();

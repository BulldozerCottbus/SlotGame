/* Slot Studio v3
   - Admin gate: Ctrl+Alt+# + Code => Builder + RTP sichtbar
   - Multi slots
   - Kein Scroll / Touch gesperrt via CSS
   - Gewinne: auch 3 gleiche "in der Mitte" werden erkannt (Runs überall auf der Linie)
   - PowerSpins: Popup Freispiele (bei Feature-Trigger)
     - Ende: wenn 0 Gewinn => weg
     - wenn genug Gewinn => "Nochmal Chance" (Retry)
   - Triple Chance: Vollbild => Grün/Rot Feature (wie vorher)
*/

const $ = (id) => document.getElementById(id);

/* =========================
   ADMIN
========================= */
// ✅ HIER deinen Code setzen:
const ADMIN_CODE = "1234";

const LS_ADMIN = "slotStudio.admin.v1";
let isAdmin = JSON.parse(localStorage.getItem(LS_ADMIN) || "false");

/* =========================
   RNG + Utils
========================= */
function randInt(maxExclusive) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % maxExclusive;
}
function clampInt(v, min, max){
  v = Number(v);
  if (Number.isNaN(v)) v = min;
  v = v|0;
  return Math.max(min, Math.min(max, v));
}
function clampRow(n) {
  n = Number(n);
  if (Number.isNaN(n)) return 1;
  return Math.min(2, Math.max(0, n|0));
}
function escapeHtml(str){
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function looksLikeUrl(x) {
  return typeof x === "string" && (x.startsWith("http://") || x.startsWith("https://") || x.startsWith("data:"));
}
function wait(ms){ return new Promise(res => setTimeout(res, ms)); }

/* =========================
   Slot Definitions
========================= */
const DEFAULT_DEF = {
  name: "Arcade Deluxe",
  startCredits: 200,
  accent: "#00e5ff",
  rows: 3,
  reels: 5,
  reelMode: "independent", // independent | stacked
  features: {
    // ✅ PowerSpins (Popup)
    powerSpinsEnabled: true,
    powerSpinsCount: 10,
    powerRetryX: 10,         // nochmal chance ab x * Einsatz (SessionWin >= totalBet * X)
    powerRetryCount: 5,

    // ✅ Triple Chance
    ttChanceEnabled: false,
    ttGreens: 3,
    ttReds: 1,
    ttMaxRounds: 0
  },
  symbols: [
    { id:"cherry", icon:"🍒", name:"Cherry",  weight:18, pay:{3:5, 4:20, 5:120} },
    { id:"lemon",  icon:"🍋", name:"Lemon",   weight:18, pay:{3:5, 4:18, 5:100} },
    { id:"bell",   icon:"🔔", name:"Bell",    weight:14, pay:{3:8, 4:30, 5:160} },
    { id:"star",   icon:"⭐",  name:"Star",    weight:12, pay:{3:10,4:40, 5:220} },
    { id:"diamond",icon:"💎",  name:"Diamond", weight:8,  pay:{3:14,4:70, 5:350} },
    { id:"seven",  icon:"7️⃣", name:"Seven",   weight:4,  pay:{3:25,4:120,5:700} },
  ],
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

/* ✅ Triple Chance Slot: 3 Walzen */
const TTC_DEF = {
  ...structuredClone(DEFAULT_DEF),
  name: "Triple Chance (3 Walzen)",
  startCredits: 250,
  accent: "#00ffb3",
  reels: 3,
  reelMode: "stacked",
  features: {
    powerSpinsEnabled: false,
    powerSpinsCount: 10,
    powerRetryX: 10,
    powerRetryCount: 5,

    ttChanceEnabled: true,
    ttGreens: 3,
    ttReds: 1,
    ttMaxRounds: 0
  },
  symbols: [
    { id:"plum",   icon:"🫐", name:"Pflaume", weight:20, pay:{3:8,  4:0, 5:0} },
    { id:"cherry", icon:"🍒", name:"Kirsche", weight:22, pay:{3:6,  4:0, 5:0} },
    { id:"lemon",  icon:"🍋", name:"Zitrone", weight:24, pay:{3:5,  4:0, 5:0} },
    { id:"bell",   icon:"🔔", name:"Glocke",  weight:16, pay:{3:10, 4:0, 5:0} },
    { id:"diamond",icon:"💚", name:"Diamant", weight:10, pay:{3:14, 4:0, 5:0} },
    { id:"seven",  icon:"7️⃣", name:"7",      weight:8,  pay:{3:25, 4:0, 5:0} },
  ],
  lines: [
    { id:"mid", name:"Middle", pattern:[1,1,1], enabled:true },
    { id:"top", name:"Top",    pattern:[0,0,0], enabled:true },
    { id:"bot", name:"Bottom", pattern:[2,2,2], enabled:true },
    { id:"d1",  name:"Diag ↘", pattern:[0,1,2], enabled:true },
    { id:"d2",  name:"Diag ↗", pattern:[2,1,0], enabled:true },
  ]
};

/* =========================
   Normalize
========================= */
function normalizePattern(pat, reels){
  const out = [];
  const src = Array.isArray(pat) ? pat : [];
  for (let i=0;i<reels;i++){
    const v = (i < src.length) ? src[i] : 1;
    out.push(clampRow(v));
  }
  return out;
}

function normalizeDef(def) {
  const base = structuredClone(DEFAULT_DEF);
  const out = structuredClone(base);

  if (def && typeof def === "object") {
    out.name = String(def.name ?? out.name);
    out.startCredits = Math.max(0, Number(def.startCredits ?? out.startCredits) | 0);
    out.accent = String(def.accent ?? out.accent);
    out.rows = 3;

    const r = Number(def.reels);
    out.reels = (r === 3 || r === 5) ? r : base.reels;

    out.reelMode = (def.reelMode === "stacked") ? "stacked" : "independent";

    out.features = {
      powerSpinsEnabled: !!def.features?.powerSpinsEnabled,
      powerSpinsCount: clampInt(def.features?.powerSpinsCount ?? 10, 1, 99),
      powerRetryX: clampInt(def.features?.powerRetryX ?? 10, 1, 200),
      powerRetryCount: clampInt(def.features?.powerRetryCount ?? 5, 1, 99),

      ttChanceEnabled: !!def.features?.ttChanceEnabled,
      ttGreens: clampInt(def.features?.ttGreens ?? 3, 1, 20),
      ttReds: clampInt(def.features?.ttReds ?? 1, 1, 20),
      ttMaxRounds: clampInt(def.features?.ttMaxRounds ?? 0, 0, 99)
    };

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
        pattern: normalizePattern(l.pattern, out.reels),
        enabled: !!l.enabled
      }));
    }
  }

  if (!Array.isArray(out.lines) || out.lines.length === 0) {
    out.lines = [{ id:"mid", name:"Middle", pattern: normalizePattern([1,1,1,1,1], out.reels), enabled:true }];
  }
  return out;
}

/* =========================
   Storage (Multi Slots)
========================= */
const LS_SLOTS_KEY = "slotStudio.slots.v3";
const LS_CURRENT_SLOT = "slotStudio.currentSlotId.v3";
const LS_STATE_MAP = "slotStudio.stateMap.v3";

function loadSlots() {
  try {
    const raw = localStorage.getItem(LS_SLOTS_KEY);
    if (!raw) {
      const init = [
        { id: "slot_arcade", def: normalizeDef(DEFAULT_DEF) },
        { id: "slot_triple", def: normalizeDef(TTC_DEF) }
      ];
      localStorage.setItem(LS_SLOTS_KEY, JSON.stringify(init));
      return init;
    }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("bad slots");
    return arr.map(s => ({ id: String(s.id), def: normalizeDef(s.def) }));
  } catch {
    const init = [
      { id: "slot_arcade", def: normalizeDef(DEFAULT_DEF) },
      { id: "slot_triple", def: normalizeDef(TTC_DEF) }
    ];
    localStorage.setItem(LS_SLOTS_KEY, JSON.stringify(init));
    return init;
  }
}
function saveSlots() {
  localStorage.setItem(LS_SLOTS_KEY, JSON.stringify(slots, null, 2));
}
function loadStateMap() {
  try {
    const raw = localStorage.getItem(LS_STATE_MAP);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === "object") ? obj : {};
  } catch { return {}; }
}
function saveStateMap() {
  localStorage.setItem(LS_STATE_MAP, JSON.stringify(stateMap));
}

/* =========================
   DOM
========================= */
const tabPlay = $("tabPlay");
const tabBuilder = $("tabBuilder");
const viewPlay = $("viewPlay");
const viewBuilder = $("viewBuilder");

const slotNameEl = $("slotName");
const slotSelect = $("slotSelect");
const adminPill = $("adminPill");

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
const bSlotSelect = $("bSlotSelect");
const newSlotBtn = $("newSlotBtn");
const dupSlotBtn = $("dupSlotBtn");
const delSlotBtn = $("delSlotBtn");

const bName = $("bName");
const bStartCredits = $("bStartCredits");
const bAccent = $("bAccent");
const bReels = $("bReels");
const bReelMode = $("bReelMode");

const bPSEnabled = $("bPSEnabled");
const bPSCount = $("bPSCount");
const bPSRetrigX = $("bPSRetrigX");
const bPSRetryCount = $("bPSRetryCount");

const bTTEnabled = $("bTTEnabled");
const bTTGreens = $("bTTGreens");
const bTTReds = $("bTTReds");
const bTTMaxRounds = $("bTTMaxRounds");

const bLines = $("bLines");
const symbolTbody = $("symbolTbody");
const addSymbolBtn = $("addSymbol");
const exportBtn = $("exportBtn");
const importBtn = $("importBtn");
const saveBtn = $("saveBtn");
const jsonBox = $("jsonBox");

/* Admin modal */
const adminModal = $("adminModal");
const adminCode = $("adminCode");
const adminUnlockBtn = $("adminUnlockBtn");
const adminLogoutBtn = $("adminLogoutBtn");
const adminCloseBtn = $("adminCloseBtn");
const adminStatus = $("adminStatus");

/* PowerSpins modal */
const psModal = $("psModal");
const psLeftEl = $("psLeft");
const psWinEl = $("psWin");
const psBetLockEl = $("psBetLock");
const psNeedEl = $("psNeed");
const psSpinBtn = $("psSpinBtn");
const psEndBtn = $("psEndBtn");
const psRetryBtn = $("psRetryBtn");
const psMsg = $("psMsg");

/* Triple Chance modal */
const ttcModal = $("ttcModal");
const ttcBaseEl = $("ttcBase");
const ttcPendingEl = $("ttcPending");
const ttcGreensEl = $("ttcGreens");
const ttcRoundEl = $("ttcRound");
const ttcBoard = $("ttcBoard");
const ttcLamps = $("ttcLamps");
const ttcSpinBtn = $("ttcSpinBtn");
const ttcCollectBtn = $("ttcCollectBtn");
const ttcMsg = $("ttcMsg");

/* =========================
   Sounds (WebAudio Synth)
========================= */
let audioOn = true;
let AC = null;

function ensureAudio() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  return AC;
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
  osc.stop(t0 + durMs/1000 + 0.03);
}
function winJingle() {
  if (!audioOn) return;
  beep(659, 120, "triangle", 0.07);
  setTimeout(()=>beep(784, 120, "triangle", 0.07), 120);
  setTimeout(()=>beep(988, 160, "triangle", 0.08), 240);
}
function spinTick(){ beep(160, 35, "square", 0.03); }
function stopTick(){ beep(220, 70, "sawtooth", 0.04); }
function greenSound(){ beep(880, 90, "triangle", 0.08); }
function redSound(){ beep(140, 160, "sawtooth", 0.09); }
function psSound(){ beep(520, 80, "triangle", 0.06); }

/* =========================
   Runtime state
========================= */
let slots = loadSlots();
let currentSlotId = localStorage.getItem(LS_CURRENT_SLOT) || slots[0].id;

let stateMap = loadStateMap();
let def = getCurrentDef();
let state = getCurrentState();

let weightedBag = buildWeightedBag();
let cellMatrix = []; // [row][reel]
let spinning = false;
let autoTimer = null;

/* PowerSpins state */
let ps = {
  active: false,
  spinsLeft: 0,
  sessionWin: 0,
  betLock: 0,
  retryNeed: 0,
  retryCount: 0,
  allowRetry: false
};

/* Triple Chance state */
let ttc = {
  active: false,
  basePayout: 0,
  pending: 0,
  greens: 0,
  round: 0,
  maxRounds: 0,
  greensPerRound: 3,
  redsPerRound: 1
};

/* =========================
   Core helpers
========================= */
function getCurrentDef(){
  const slot = slots.find(s => s.id === currentSlotId) || slots[0];
  currentSlotId = slot.id;
  return slot.def;
}
function setCurrentDef(newDef){
  const idx = slots.findIndex(s => s.id === currentSlotId);
  if (idx >= 0) {
    slots[idx].def = normalizeDef(newDef);
    def = slots[idx].def;
    saveSlots();
  }
}
function getCurrentState(){
  const st = stateMap[currentSlotId];
  if (st && typeof st.credits === "number") return st;
  const init = { credits: def.startCredits, betPerLine: 1, auto: false };
  stateMap[currentSlotId] = init;
  saveStateMap();
  return init;
}
function saveCurrentState(){
  stateMap[currentSlotId] = state;
  saveStateMap();
}

function applyAccent() {
  document.documentElement.style.setProperty("--accent", def.accent || "#00e5ff");
}
function enabledLines() {
  return def.lines.filter(l => l.enabled);
}
function getSymbolById(id) {
  return def.symbols.find(s => s.id === id) || def.symbols[0];
}
function buildWeightedBag() {
  const bag = [];
  for (const s of def.symbols) {
    const w = Math.max(1, s.weight|0);
    for (let i=0;i<w;i++) bag.push(s.id);
  }
  return bag.length ? bag : def.symbols.map(s=>s.id);
}
function randomSymbolFromBag() {
  return weightedBag[randInt(weightedBag.length)];
}

function setMsg(t){ msgEl.textContent = t; }

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

/* Vollbild = alle Felder gleich */
function isFullScreen(grid){
  const first = grid[0][0];
  for (let row=0; row<def.rows; row++){
    for (let r=0; r<def.reels; r++){
      if (grid[row][r] !== first) return false;
    }
  }
  return true;
}

/* =========================
   UI
========================= */
function syncHUD() {
  slotNameEl.textContent = def.name;
  creditsEl.textContent = String(state.credits);
  betPerLineEl.textContent = String(state.betPerLine);
  lineCountEl.textContent = String(enabledLines().length);
  autoBtn.textContent = `AUTO: ${state.auto ? "ON" : "OFF"}`;
  soundToggle.textContent = audioOn ? "ON" : "OFF";
}
function renderSlotSelects(){
  slotSelect.innerHTML = "";
  bSlotSelect.innerHTML = "";
  for (const s of slots) {
    const o1 = document.createElement("option");
    o1.value = s.id; o1.textContent = s.def.name;
    if (s.id === currentSlotId) o1.selected = true;
    slotSelect.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = s.id; o2.textContent = s.def.name;
    if (s.id === currentSlotId) o2.selected = true;
    bSlotSelect.appendChild(o2);
  }
}
function applyAdminUI(){
  tabBuilder.classList.toggle("hidden", !isAdmin);
  simBtn.classList.toggle("hidden", !isAdmin);
  adminPill.classList.toggle("hidden", !isAdmin);
  if (!isAdmin && !viewBuilder.classList.contains("hidden")) showPlay();
}

/* Tabs */
function showPlay() {
  tabPlay.classList.add("active");
  tabBuilder.classList.remove("active");
  viewPlay.classList.remove("hidden");
  viewBuilder.classList.add("hidden");
}
function showBuilder() {
  if (!isAdmin) return;
  tabBuilder.classList.add("active");
  tabPlay.classList.remove("active");
  viewBuilder.classList.remove("hidden");
  viewPlay.classList.add("hidden");
  renderBuilder();
}
tabPlay.onclick = showPlay;
tabBuilder.onclick = showBuilder;

/* =========================
   Admin Modal (Ctrl+Alt+#)
========================= */
function openAdminModal(){
  adminModal.classList.remove("hidden");
  adminCode.value = "";
  adminStatus.textContent = isAdmin ? "Status: Admin ist aktiv." : "Status: Admin ist NICHT aktiv.";
  adminCode.focus();
}
function closeAdminModal(){ adminModal.classList.add("hidden"); }

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey && e.altKey)) return;
  const keyIsHash = (e.key === "#") || (e.code === "Digit3") || (e.key === "3");
  if (keyIsHash) {
    e.preventDefault();
    openAdminModal();
  }
});

adminUnlockBtn.onclick = async () => {
  if (adminCode.value === ADMIN_CODE) {
    isAdmin = true;
    localStorage.setItem(LS_ADMIN, "true");
    adminStatus.textContent = "✅ Admin freigeschaltet.";
    applyAdminUI();
    if (audioOn) { ensureAudio(); if (AC?.state === "suspended") await AC.resume(); }
    beep(700, 120, "triangle", 0.08);
  } else {
    adminStatus.textContent = "❌ Falscher Code.";
    beep(200, 160, "sawtooth", 0.06);
  }
};
adminLogoutBtn.onclick = () => {
  isAdmin = false;
  localStorage.setItem(LS_ADMIN, "false");
  adminStatus.textContent = "Logout: Admin deaktiviert.";
  applyAdminUI();
};
adminCloseBtn.onclick = closeAdminModal;
adminModal.addEventListener("click", (e) => { if (e.target === adminModal) closeAdminModal(); });

/* =========================
   Render reels (dynamic 3/5)
========================= */
function renderReels() {
  reelsEl.innerHTML = "";
  reelsEl.style.gridTemplateColumns = `repeat(${def.reels}, minmax(0,1fr))`;

  cellMatrix = Array.from({length:def.rows}, ()=>Array(def.reels).fill(null));
  for (let r = 0; r < def.reels; r++) {
    const col = document.createElement("div");
    col.className = "reel";
    for (let row = 0; row < def.rows; row++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.innerHTML = `<div class="icon">❓</div><div class="label"></div>`;
      col.appendChild(cell);
      cellMatrix[row][r] = cell;
    }
    reelsEl.appendChild(col);
  }
}

function clearHighlights() {
  for (let row=0; row<def.rows; row++) {
    for (let r=0; r<def.reels; r++) {
      cellMatrix[row][r].classList.remove("win","dim");
    }
  }
}
function dimAllExcept(coordsSet) {
  for (let row=0; row<def.rows; row++) {
    for (let r=0; r<def.reels; r++) {
      const key = `${row},${r}`;
      if (!coordsSet.has(key)) cellMatrix[row][r].classList.add("dim");
    }
  }
}

/* =========================
   Spin animation
========================= */
function startSpinAnimation() {
  clearHighlights();
  winsEl.innerHTML = "";
  setMsg("Spinning...");

  spinBtn.disabled = true;
  simBtn.disabled = true;
  betDown.disabled = true;
  betUp.disabled = true;

  spinTick();

  const intervals = [];
  for (let r=0; r<def.reels; r++) {
    const iv = setInterval(() => {
      if (def.reelMode === "stacked") {
        const sym = randomSymbolFromBag();
        for (let row=0; row<def.rows; row++) renderCell(cellMatrix[row][r], sym);
      } else {
        for (let row=0; row<def.rows; row++) renderCell(cellMatrix[row][r], randomSymbolFromBag());
      }
    }, 70);
    intervals.push(iv);
  }
  return intervals;
}
function stopReel(intervals, reelIndex, finalColSyms) {
  clearInterval(intervals[reelIndex]);
  for (let row=0; row<def.rows; row++) renderCell(cellMatrix[row][reelIndex], finalColSyms[row]);
  stopTick();
}

/* =========================
   Outcome generation
========================= */
function generateOutcome() {
  const grid = Array.from({length:def.rows}, ()=>Array(def.reels).fill(null));

  if (def.reelMode === "stacked") {
    for (let r=0; r<def.reels; r++) {
      const sym = randomSymbolFromBag();
      for (let row=0; row<def.rows; row++) grid[row][r] = sym;
    }
    return grid;
  }

  for (let r=0; r<def.reels; r++) {
    for (let row=0; row<def.rows; row++) grid[row][r] = randomSymbolFromBag();
  }
  return grid;
}

/* =========================
   ✅ WIN EVALUATION (Runs überall!)
   - Nicht nur links beginnend
   - Erkannt wird jedes 3+ gleiche Segment, auch "in der Mitte"
========================= */
function evaluate(grid, betPerLine) {
  const lines = enabledLines();
  const wins = [];
  let totalWin = 0;

  for (const line of lines) {
    const pattern = normalizePattern(line.pattern, def.reels);
    const lineSyms = [];
    for (let r=0; r<def.reels; r++) {
      lineSyms.push(grid[pattern[r]][r]);
    }

    // Runs suchen (z.B. [A, A, A] oder [B, B, B] in der Mitte etc.)
    let i = 0;
    while (i < def.reels) {
      let j = i + 1;
      while (j < def.reels && lineSyms[j] === lineSyms[i]) j++;

      const len = j - i;
      if (len >= 3) {
        const symId = lineSyms[i];
        const symObj = getSymbolById(symId);
        const mult = symObj.pay[len] || symObj.pay[3] || 0;
        const amount = mult * betPerLine;

        if (amount > 0) {
          totalWin += amount;
          const coords = [];
          for (let r=i; r<j; r++) coords.push({ row: pattern[r], r });

          wins.push({
            lineId: line.id,
            lineName: line.name,
            symbolId: symId,
            symbolName: symObj.name,
            icon: symObj.icon,
            len,
            mult,
            amount,
            coords
          });
        }
      }
      i = j;
    }
  }

  return { wins, totalWin };
}

function renderWins(wins) {
  // nur die letzten 3 anzeigen (damit nix scrollt)
  const last = wins.slice(-3);
  winsEl.innerHTML = "";
  for (const w of last) {
    const row = document.createElement("div");
    row.className = "winRow";
    const left = document.createElement("div");
    const icon = looksLikeUrl(w.icon) ? "🟦" : w.icon;
    left.textContent = `${icon} ${w.symbolName} ×${w.len} (${w.lineName})`;
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
  const set = new Set();
  for (const w of wins) for (const c of w.coords) set.add(`${c.row},${c.r}`);
  for (const key of set) {
    const [row, r] = key.split(",").map(Number);
    cellMatrix[row][r].classList.add("win");
  }
  dimAllExcept(set);
}

/* =========================
   POWERSPINS (Popup)
========================= */
function psOpen(spinsCount, betLock, retryNeed, retryCount){
  // stop auto
  state.auto = false;
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  saveCurrentState();
  syncHUD();

  ps.active = true;
  ps.spinsLeft = spinsCount;
  ps.sessionWin = 0;
  ps.betLock = betLock;
  ps.retryNeed = retryNeed;
  ps.retryCount = retryCount;
  ps.allowRetry = false;

  psLeftEl.textContent = String(ps.spinsLeft);
  psWinEl.textContent = "0";
  psBetLockEl.textContent = String(ps.betLock);
  psNeedEl.textContent = String(ps.retryNeed);
  psMsg.textContent = "PowerSpins gestartet.";
  psRetryBtn.classList.add("hidden");

  psModal.classList.remove("hidden");
}

function psClose(){
  ps.active = false;
  psModal.classList.add("hidden");
}

async function psSpin(){
  if (!ps.active || spinning || ttc.active) return;
  if (ps.spinsLeft <= 0) return;

  psSpinBtn.disabled = true;
  psSound();

  // Freispiele: keine Kosten, aber gleiche Auszahlung mit betLock
  const res = await spinCore({ free: true, betOverride: ps.betLock, suppressFeatureTriggers: true });

  ps.spinsLeft--;
  ps.sessionWin += res.totalWin;

  psLeftEl.textContent = String(ps.spinsLeft);
  psWinEl.textContent = String(ps.sessionWin);

  if (ps.spinsLeft <= 0) {
    // Ende -> Regel: wenn 0 gewonnen => weg, wenn genug gewonnen => nochmal Chance
    if (ps.sessionWin <= 0) {
      psMsg.textContent = "PowerSpins vorbei: 0 Gewinn → weg.";
      await wait(700);
      psClose();
      setMsg("PowerSpins vorbei (0 Gewinn).");
    } else if (ps.sessionWin >= ps.retryNeed) {
      ps.allowRetry = true;
      psMsg.textContent = `PowerSpins vorbei: +${ps.sessionWin} → NOCHMAL CHANCE verfügbar!`;
      psRetryBtn.classList.remove("hidden");
      psSpinBtn.disabled = true;
      return;
    } else {
      psMsg.textContent = `PowerSpins vorbei: +${ps.sessionWin} (zu wenig für nochmal Chance).`;
      await wait(900);
      psClose();
      setMsg(`PowerSpins Ende: +${ps.sessionWin}`);
    }
  } else {
    psMsg.textContent = res.totalWin > 0 ? `+${res.totalWin} gewonnen` : "kein Gewinn";
  }

  psSpinBtn.disabled = false;
}

function psRetry(){
  if (!ps.active || !ps.allowRetry) return;
  ps.allowRetry = false;

  // neue Session (Retry)
  ps.spinsLeft = ps.retryCount;
  ps.sessionWin = 0;

  psLeftEl.textContent = String(ps.spinsLeft);
  psWinEl.textContent = "0";
  psMsg.textContent = "NOCHMAL CHANCE gestartet!";
  psRetryBtn.classList.add("hidden");
  psSpinBtn.disabled = false;
}

psSpinBtn.onclick = psSpin;
psRetryBtn.onclick = psRetry;
psEndBtn.onclick = () => {
  // wenn user manuell beendet: nur collect über credits passiert schon bei wins
  psClose();
  setMsg("PowerSpins beendet.");
};
psModal.addEventListener("click", (e) => { if (e.target === psModal) { psClose(); setMsg("PowerSpins beendet."); } });

/* =========================
   TRIPLE CHANCE (wie vorher)
========================= */
function ttcOpen(basePayout){
  state.auto = false;
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  saveCurrentState();
  syncHUD();

  ttc.active = true;
  ttc.basePayout = Math.max(0, basePayout|0);
  ttc.pending = 0;
  ttc.greens = 0;
  ttc.round = 0;

  ttc.maxRounds = clampInt(def.features?.ttMaxRounds ?? 0, 0, 99);
  ttc.greensPerRound = clampInt(def.features?.ttGreens ?? 3, 1, 20);
  ttc.redsPerRound = clampInt(def.features?.ttReds ?? 1, 1, 20);

  ttcBaseEl.textContent = String(ttc.basePayout);
  ttcPendingEl.textContent = "0";
  ttcGreensEl.textContent = "0";
  ttcRoundEl.textContent = "0";
  ttcMsg.textContent = "Start: SPIN-OFF drücken";

  renderTtcBoard(null);
  renderTtcLamps("reset");

  ttcModal.classList.remove("hidden");
}

function ttcClose(){
  ttc.active = false;
  ttcModal.classList.add("hidden");
}

function renderTtcBoard(pickIndex){
  const tiles = [];
  for (let i=0;i<ttc.greensPerRound;i++) tiles.push("green");
  for (let i=0;i<ttc.redsPerRound;i++) tiles.push("red");

  for (let i = tiles.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  ttcBoard.innerHTML = "";
  tiles.forEach((type, idx) => {
    const d = document.createElement("div");
    d.className = `ttcTile ${type}` + (pickIndex === idx ? " pick" : "");
    d.textContent = type === "green" ? "GRÜN" : "ROT";
    ttcBoard.appendChild(d);
  });

  return tiles;
}

function renderTtcLamps(mode){
  if (mode === "reset") {
    ttcLamps.innerHTML = "";
    for (let i=0;i<12;i++){
      const l = document.createElement("div");
      l.className = "lamp";
      ttcLamps.appendChild(l);
    }
    return;
  }
  const lamps = Array.from(ttcLamps.querySelectorAll(".lamp"));
  if (mode === "green") {
    if (ttc.greens - 1 < lamps.length) lamps[ttc.greens - 1].classList.add("green");
  }
  if (mode === "red") {
    for (const l of lamps) {
      l.classList.remove("green");
      l.classList.add("red");
    }
  }
}

async function ttcSpin(){
  if (!ttc.active) return;

  if (ttc.maxRounds > 0 && ttc.round >= ttc.maxRounds) {
    ttcMsg.textContent = "Max Runden erreicht → Auto-COLLECT.";
    ttcCollect();
    return;
  }

  ttc.round++;
  ttcRoundEl.textContent = String(ttc.round);

  const totalTiles = ttc.greensPerRound + ttc.redsPerRound;
  const pick = randInt(totalTiles);

  const mapping = renderTtcBoard(pick);
  await wait(80);

  const result = mapping[pick];
  if (result === "green") {
    ttc.greens++;
    ttc.pending += ttc.basePayout;
    ttcPendingEl.textContent = String(ttc.pending);
    ttcGreensEl.textContent = String(ttc.greens);
    renderTtcLamps("green");
    ttcMsg.textContent = `✅ GRÜN! +${ttc.basePayout} Bonus`;
    greenSound();
  } else {
    ttc.pending = 0;
    ttc.greens = 0;
    ttcPendingEl.textContent = "0";
    ttcGreensEl.textContent = "0";
    renderTtcLamps("red");
    ttcMsg.textContent = "🟥 ROT! Feature beendet. Bonus weg.";
    redSound();
    await wait(900);
    ttcClose();
  }
}

function ttcCollect(){
  if (!ttc.active) return;
  if (ttc.pending > 0) {
    state.credits += ttc.pending;
    saveCurrentState();
    syncHUD();
    setMsg(`COLLECT: +${ttc.pending} (Triple Chance)`);
  } else {
    setMsg("Triple Chance: nichts zu collecten.");
  }
  ttcClose();
}
ttcSpinBtn.onclick = ttcSpin;
ttcCollectBtn.onclick = ttcCollect;
ttcModal.addEventListener("click", (e) => { if (e.target === ttcModal) ttcCollect(); });

/* =========================
   Core Spin (shared)
========================= */
async function spinCore({ free=false, betOverride=null, suppressFeatureTriggers=false } = {}) {
  if (audioOn) ensureAudio();

  const lines = enabledLines();
  const bet = Math.max(1, (betOverride ?? state.betPerLine)|0);
  const totalBet = bet * lines.length;

  const intervals = startSpinAnimation();
  const finalGrid = generateOutcome();

  for (let r=0; r<def.reels; r++) {
    await wait(330 + r*180);
    const colSyms = [];
    for (let row=0; row<def.rows; row++) colSyms.push(finalGrid[row][r]);
    stopReel(intervals, r, colSyms);
  }

  const res = evaluate(finalGrid, bet);

  // payout
  if (res.totalWin > 0) {
    state.credits += res.totalWin;
    saveCurrentState();
    syncHUD();
    winJingle();
  }

  renderWins(res.wins);
  highlightWins(res.wins);

  return { ...res, finalGrid, totalBet, bet, linesCount: lines.length };
}

/* =========================
   Main Play Spin
========================= */
async function spinOnce() {
  if (spinning || ttc.active || ps.active) return;

  const lines = enabledLines();
  if (lines.length === 0) { setMsg("Aktiviere mindestens 1 Linie im Builder (Admin)."); return; }

  const totalBet = state.betPerLine * lines.length;
  if (state.credits < totalBet) { setMsg(`Zu wenig Credits. Du brauchst ${totalBet}.`); return; }

  spinning = true;
  // Kosten abziehen (normaler Spin)
  state.credits -= totalBet;
  saveCurrentState();
  syncHUD();

  const res = await spinCore({ free:false });

  if (res.totalWin > 0) setMsg(`WIN: +${res.totalWin} Credits`);
  else setMsg("Kein Gewinn. Versuch’s nochmal.");

  // ✅ Feature Trigger (nur wenn nicht unterdrückt)
  if (!ps.active && !ttc.active) {
    // 1) Triple Chance (Vollbild)
    if (def.features?.ttChanceEnabled && isFullScreen(res.finalGrid) && res.totalWin > 0) {
      await wait(450);
      ttcOpen(res.totalWin);
    }

    // 2) PowerSpins (Popup) – auf normalen Slots
    // Trigger: großer Gewinn ODER Vollbild
    if (def.features?.powerSpinsEnabled) {
      const triggerBigWin = res.totalWin >= (res.totalBet * 12); // "genug gewonnen" Feeling
      const triggerFull = isFullScreen(res.finalGrid) && res.totalWin > 0;

      if (triggerBigWin || triggerFull) {
        const psCount = clampInt(def.features.powerSpinsCount ?? 10, 1, 99);
        const retryX = clampInt(def.features.powerRetryX ?? 10, 1, 200);
        const retryCount = clampInt(def.features.powerRetryCount ?? 5, 1, 99);
        const retryNeed = res.totalBet * retryX;

        await wait(350);
        psOpen(psCount, state.betPerLine, retryNeed, retryCount);
      }
    }
  }

  spinBtn.disabled = false;
  simBtn.disabled = false;
  betDown.disabled = false;
  betUp.disabled = false;
  spinning = false;

  if (state.auto && !ps.active && !ttc.active) autoTimer = setTimeout(spinOnce, 320);
}

/* =========================
   RTP Sim (Admin)
========================= */
function simulate(spins = 10000) {
  const lines = enabledLines();
  if (lines.length === 0) { setMsg("RTP Test: keine Linien aktiv."); return; }
  const bet = Math.max(1, state.betPerLine|0);
  const totalBet = bet * lines.length;

  let wagered = 0, won = 0;
  for (let i=0;i<spins;i++) {
    const g = generateOutcome();
    const res = evaluate(g, bet);
    wagered += totalBet;
    won += res.totalWin;
  }
  const rtp = wagered > 0 ? (won / wagered) * 100 : 0;
  setMsg(`RTP Test (${spins} Spins): ca. ${rtp.toFixed(2)}% (Gewonnen ${won} / Einsatz ${wagered})`);
}

/* =========================
   Builder
========================= */
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

function renderBuilder() {
  if (!isAdmin) return;

  bName.value = def.name;
  bStartCredits.value = String(def.startCredits);
  bAccent.value = def.accent;
  bReels.value = String(def.reels);
  bReelMode.value = def.reelMode === "stacked" ? "stacked" : "independent";

  bPSEnabled.checked = !!def.features?.powerSpinsEnabled;
  bPSCount.value = String(def.features?.powerSpinsCount ?? 10);
  bPSRetrigX.value = String(def.features?.powerRetryX ?? 10);
  bPSRetryCount.value = String(def.features?.powerRetryCount ?? 5);

  bTTEnabled.checked = !!def.features?.ttChanceEnabled;
  bTTGreens.value = String(def.features?.ttGreens ?? 3);
  bTTReds.value = String(def.features?.ttReds ?? 1);
  bTTMaxRounds.value = String(def.features?.ttMaxRounds ?? 0);

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
    txt.innerHTML = `<b>${l.name}</b><div style="color:var(--muted);font-size:12px;margin-top:2px;">Pattern: ${normalizePattern(l.pattern, def.reels).join("-")}</div>`;
    lab.appendChild(cb);
    lab.appendChild(txt);

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = `ID: ${l.id}`;

    item.appendChild(lab);
    item.appendChild(badge);
    bLines.appendChild(item);
  });

  // Symbols
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

function applyBuilderToDef() {
  if (!isAdmin) return;

  def.name = String(bName.value || "My Slot");
  def.startCredits = Math.max(0, Number(bStartCredits.value)|0);
  def.accent = String(bAccent.value || "#00e5ff");
  def.reels = (Number(bReels.value) === 3) ? 3 : 5;
  def.reelMode = (bReelMode.value === "stacked") ? "stacked" : "independent";

  def.features = def.features || {};
  def.features.powerSpinsEnabled = !!bPSEnabled.checked;
  def.features.powerSpinsCount = clampInt(bPSCount.value, 1, 99);
  def.features.powerRetryX = clampInt(bPSRetrigX.value, 1, 200);
  def.features.powerRetryCount = clampInt(bPSRetryCount.value, 1, 99);

  def.features.ttChanceEnabled = !!bTTEnabled.checked;
  def.features.ttGreens = clampInt(bTTGreens.value, 1, 20);
  def.features.ttReds = clampInt(bTTReds.value, 1, 20);
  def.features.ttMaxRounds = clampInt(bTTMaxRounds.value, 0, 99);

  // normalize lines patterns length to reels
  def.lines = def.lines.map(l => ({ ...l, pattern: normalizePattern(l.pattern, def.reels) }));

  def = normalizeDef(def);
  setCurrentDef(def);

  weightedBag = buildWeightedBag();
  applyAccent();

  renderReels();
  for (let r=0;r<def.reels;r++){
    if (def.reelMode === "stacked") {
      const sym = randomSymbolFromBag();
      for (let row=0;row<def.rows;row++) renderCell(cellMatrix[row][r], sym);
    } else {
      for (let row=0;row<def.rows;row++) renderCell(cellMatrix[row][r], randomSymbolFromBag());
    }
  }

  renderSlotSelects();
  syncHUD();
  setMsg("Builder gespeichert. Play aktualisiert.");
}

/* Slot management */
function createNewSlot(){
  const id = `slot_${Date.now()}`;
  const newDef = normalizeDef({ ...structuredClone(DEFAULT_DEF), name: `New Slot ${slots.length+1}` });
  slots.push({ id, def: newDef });
  saveSlots();

  currentSlotId = id;
  localStorage.setItem(LS_CURRENT_SLOT, currentSlotId);

  def = getCurrentDef();
  weightedBag = buildWeightedBag();
  state = { credits: def.startCredits, betPerLine: 1, auto: false };
  stateMap[currentSlotId] = state;
  saveStateMap();

  applyAccent();
  renderSlotSelects();
  renderReels();
  syncHUD();
  renderBuilder();
}
function duplicateSlot(){
  const id = `slot_${Date.now()}`;
  const copy = normalizeDef({ ...structuredClone(def), name: def.name + " (Copy)" });
  slots.push({ id, def: copy });
  saveSlots();
  renderSlotSelects();
}
function deleteSlot(){
  if (slots.length <= 1) return alert("Mindestens 1 Slot muss bleiben.");
  if (!confirm("Diesen Slot wirklich löschen?")) return;

  const idx = slots.findIndex(s => s.id === currentSlotId);
  if (idx < 0) return;

  const removed = slots.splice(idx, 1)[0];
  delete stateMap[removed.id];
  saveStateMap();
  saveSlots();

  currentSlotId = slots[0].id;
  localStorage.setItem(LS_CURRENT_SLOT, currentSlotId);
  def = getCurrentDef();
  state = getCurrentState();
  weightedBag = buildWeightedBag();

  applyAccent();
  renderSlotSelects();
  renderReels();
  syncHUD();
  renderBuilder();
}

/* Switch slot */
function switchSlot(id){
  if (!slots.some(s => s.id === id)) return;

  currentSlotId = id;
  localStorage.setItem(LS_CURRENT_SLOT, currentSlotId);

  def = getCurrentDef();
  state = getCurrentState();
  weightedBag = buildWeightedBag();

  // stop features
  state.auto = false;
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  saveCurrentState();
  if (ps.active) psClose();
  if (ttc.active) ttcClose();

  applyAccent();
  renderSlotSelects();
  renderReels();

  for (let r=0;r<def.reels;r++){
    if (def.reelMode === "stacked") {
      const sym = randomSymbolFromBag();
      for (let row=0;row<def.rows;row++) renderCell(cellMatrix[row][r], sym);
    } else {
      for (let row=0;row<def.rows;row++) renderCell(cellMatrix[row][r], randomSymbolFromBag());
    }
  }

  syncHUD();
  setMsg(`Slot gewechselt: ${def.name}`);
}

/* =========================
   Events
========================= */
slotSelect.onchange = () => switchSlot(slotSelect.value);
bSlotSelect.onchange = () => { if (!isAdmin) return; switchSlot(bSlotSelect.value); renderBuilder(); };

spinBtn.onclick = () => spinOnce();

autoBtn.onclick = () => {
  if (ps.active || ttc.active) return;
  state.auto = !state.auto;
  saveCurrentState();
  syncHUD();
  if (!state.auto && autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  if (state.auto && !spinning) spinOnce();
};

simBtn.onclick = () => simulate(10000);

betDown.onclick = () => {
  if (ps.active || ttc.active) return;
  state.betPerLine = Math.max(1, (state.betPerLine|0) - 1);
  saveCurrentState();
  syncHUD();
};
betUp.onclick = () => {
  if (ps.active || ttc.active) return;
  state.betPerLine = Math.min(100, (state.betPerLine|0) + 1);
  saveCurrentState();
  syncHUD();
};

soundToggle.onclick = async () => {
  audioOn = !audioOn;
  if (audioOn) {
    ensureAudio();
    if (AC && AC.state === "suspended") await AC.resume();
    beep(440, 80, "triangle", 0.06);
  }
  syncHUD();
};

resetCredits.onclick = () => {
  if (ps.active || ttc.active) return;
  state.credits = def.startCredits;
  saveCurrentState();
  syncHUD();
  setMsg("Credits zurückgesetzt.");
};

addSymbolBtn.onclick = () => {
  if (!isAdmin) return;
  def.symbols.push({ id:`sym_${Date.now()}`, icon:"🟣", name:"New", weight:10, pay:{3:5,4:20,5:120} });
  renderBuilder();
};

exportBtn.onclick = () => { jsonBox.value = JSON.stringify(def, null, 2); jsonBox.focus(); jsonBox.select(); };
importBtn.onclick = () => {
  if (!isAdmin) return;
  try {
    const parsed = JSON.parse(jsonBox.value);
    def = normalizeDef(parsed);
    setCurrentDef(def);
    renderBuilder();
    alert("Import OK. Jetzt 'Speichern & Anwenden' drücken.");
  } catch (e) { alert("JSON ungültig: " + e.message); }
};
saveBtn.onclick = () => { applyBuilderToDef(); showPlay(); };

newSlotBtn.onclick = () => { if (isAdmin) createNewSlot(); };
dupSlotBtn.onclick = () => { if (isAdmin) duplicateSlot(); };
delSlotBtn.onclick = () => { if (isAdmin) deleteSlot(); };

/* =========================
   Boot
========================= */
function boot() {
  def = normalizeDef(def);
  weightedBag = buildWeightedBag();
  applyAccent();

  renderSlotSelects();
  applyAdminUI();
  renderReels();

  for (let r=0;r<def.reels;r++){
    if (def.reelMode === "stacked") {
      const sym = randomSymbolFromBag();
      for (let row=0;row<def.rows;row++) renderCell(cellMatrix[row][r], sym);
    } else {
      for (let row=0;row<def.rows;row++) renderCell(cellMatrix[row][r], randomSymbolFromBag());
    }
  }

  syncHUD();
  setMsg("Bereit. (Ctrl+Alt+# → Admin Unlock)");
}
boot();

(() => {
  "use strict";

  /* =========================
     Storage / State
  ========================= */
  const STORAGE_KEY = "multiSlotSystem.v2";
  const DAY_MS = 24 * 60 * 60 * 1000;

  const defaultState = {
    balance: 20.00,
    bet: 0.10,
    selectedSlotId: "lucky_pharaoh",
    lastWheelAt: 0,
    customSlots: {},
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultState };
      const parsed = JSON.parse(raw);
      return {
        ...defaultState,
        ...parsed,
        customSlots: parsed.customSlots && typeof parsed.customSlots === "object" ? parsed.customSlots : {},
      };
    } catch {
      return { ...defaultState };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  /* =========================
     RNG
  ========================= */
  function rand01() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  }

  function randInt(minIncl, maxIncl) {
    return minIncl + Math.floor(rand01() * (maxIncl - minIncl + 1));
  }

  function weightedChoice(weightMap) {
    const entries = Object.entries(weightMap).filter(([, w]) => Number(w) > 0);
    let total = 0;
    for (const [, w] of entries) total += Number(w);
    if (total <= 0) return entries.length ? entries[0][0] : null;

    let pick = rand01() * total;
    for (const [k, w] of entries) {
      pick -= Number(w);
      if (pick <= 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  /* =========================
     Audio Engine (Kulisse + Reel + Win/Lose)
     (läuft erst nach User-Interaktion)
  ========================= */
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.ambGain = null;
      this.ambOsc = null;
      this.started = false;
    }

    ensure() {
      if (this.started) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);

      // Ambient: weicher Grundton
      this.ambGain = this.ctx.createGain();
      this.ambGain.gain.value = 0.06;
      this.ambGain.connect(this.master);

      this.ambOsc = this.ctx.createOscillator();
      this.ambOsc.type = "sine";
      this.ambOsc.frequency.value = 55; // low hum
      this.ambOsc.connect(this.ambGain);
      this.ambOsc.start();

      // ganz leises "breathing" per LFO
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.12;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(this.ambGain.gain);
      lfo.start();

      this.started = true;
    }

    blip(freq, dur = 0.06, vol = 0.12, type = "square") {
      if (!this.started) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g);
      g.connect(this.master);
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur);
    }

    reelTick() { this.blip(520 + randInt(-40, 40), 0.05, 0.08, "square"); }
    reelStop() { this.blip(220, 0.08, 0.10, "triangle"); }
    win() { this.blip(740, 0.10, 0.14, "sine"); setTimeout(() => this.blip(980, 0.10, 0.14, "sine"), 90); }
    lose() { this.blip(140, 0.12, 0.11, "sawtooth"); }
  }

  const audio = new AudioEngine();

  /* =========================
     Slot Config (Lucky Pharaoh)
     - Wild/Mystery: 🎭
     - Rubin: 🛑
     - Smaragd: ❇️
  ========================= */
  const SYM = {
    MASK: "MASK",   // 🎭 (wild/mystery)
    DIA: "DIA",     // 💎
    RUB: "RUB",     // 🛑 (Rubin)
    SAP: "SAP",     // 💠 (Saphir)
    EME: "EME",     // ❇️ (Smaragd)
    A: "A",
    K: "K",
    Q: "Q",
    J: "J",
    T10: "10",
  };

  function makeLuckyPharaohSlot() {
    return {
      id: "lucky_pharaoh",
      name: "Lucky Pharaoh",
      reels: 5,
      rows: 3,
      paylines: 10,
      features: {
        powerSpins: true,
        powerTriggerMultiplier: 4,
        mysterySymbol: SYM.MASK,
        wildMode: true,
        wildExpandChance: 0.20,
      },
      symbols: [
        { key: SYM.MASK, label: "🎭" },
        { key: SYM.DIA,  label: "💎" },
        { key: SYM.RUB,  label: "🛑" },
        { key: SYM.SAP,  label: "💠" },
        { key: SYM.EME,  label: "❇️" },
        { key: SYM.A,    label: "A" },
        { key: SYM.K,    label: "K" },
        { key: SYM.Q,    label: "Q" },
        { key: SYM.J,    label: "J" },
        { key: SYM.T10,  label: "10" },
      ],
      weights: {
        base: {
          [SYM.MASK]: 7,
          [SYM.DIA]: 5,
          [SYM.RUB]: 8,
          [SYM.SAP]: 9,
          [SYM.EME]: 10,
          [SYM.A]: 14,
          [SYM.K]: 14,
          [SYM.Q]: 14,
          [SYM.J]: 14,
          [SYM.T10]: 16,
        },
        power: {
          [SYM.MASK]: 13,
          [SYM.DIA]: 6,
          [SYM.RUB]: 9,
          [SYM.SAP]: 10,
          [SYM.EME]: 11,
          [SYM.A]: 12,
          [SYM.K]: 12,
          [SYM.Q]: 12,
          [SYM.J]: 12,
          [SYM.T10]: 14,
        }
      },
      paytable: {
        [SYM.DIA]: { 3: 6,   4: 24,  5: 120 },
        [SYM.RUB]: { 3: 4,   4: 14,  5: 70  },
        [SYM.SAP]: { 3: 3,   4: 12,  5: 60  },
        [SYM.EME]: { 3: 3,   4: 10,  5: 50  },
        [SYM.A]:   { 3: 1.2, 4: 4,   5: 18  },
        [SYM.K]:   { 3: 1.0, 4: 3.5, 5: 16  },
        [SYM.Q]:   { 3: 0.9, 4: 3.2, 5: 14  },
        [SYM.J]:   { 3: 0.8, 4: 3.0, 5: 12  },
        [SYM.T10]: { 3: 0.7, 4: 2.8, 5: 10  },
      }
    };
  }

  function getAllSlots() {
    const defaults = { lucky_pharaoh: makeLuckyPharaohSlot() };
    return { ...defaults, ...(state.customSlots || {}) };
  }

  /* =========================
     Paylines (10 fixed)
  ========================= */
  const PAYLINES = [
    [1,1,1,1,1],
    [0,0,0,0,0],
    [2,2,2,2,2],
    [0,1,2,1,0],
    [2,1,0,1,2],
    [0,0,1,0,0],
    [2,2,1,2,2],
    [1,0,0,0,1],
    [1,2,2,2,1],
    [0,1,1,1,0],
  ];

  /* =========================
     DOM
  ========================= */
  const $ = (id) => document.getElementById(id);

  const balanceEl = $("balance");
  const slotSelect = $("slotSelect");
  const betSelect = $("betSelect");
  const spinBtn = $("spinBtn");
  const autoBtn = $("autoBtn");

  const wheelBtn = $("wheelBtn");
  const wheelCooldownText = $("wheelCooldownText");

  const baseBoardEl = $("baseBoard");
  const statusText = $("statusText");
  const lastWinEl = $("lastWin");
  const eventBox = $("eventBox");
  const slotMetaEl = $("slotMeta");

  const powerPanel = $("powerPanel");
  const powerMeta = $("powerMeta");
  const powerStatus = $("powerStatus");
  const powerWinEl = $("powerWin");
  const pBoards = [ $("pBoard1"), $("pBoard2"), $("pBoard3"), $("pBoard4") ];

  // Power modal
  const powerModalOverlay = $("powerModalOverlay");
  const powerModalText = $("powerModalText");
  const powerBuyRange = $("powerBuyRange");
  const powerBuySpins = $("powerBuySpins");
  const powerBuyCost = $("powerBuyCost");
  const takeWinBtn = $("takeWinBtn");
  const buyPowerBtn = $("buyPowerBtn");
  const closePowerModal = $("closePowerModal");

  // Wheel modal
  const wheelModalOverlay = $("wheelModalOverlay");
  const wheel = $("wheel");
  const wheelInfo = $("wheelInfo");
  const wheelReadyText = $("wheelReadyText");
  const spinWheelBtn = $("spinWheelBtn");
  const closeWheelModal = $("closeWheelModal");

  // Admin / Builder
  const adminOverlay = $("adminOverlay");
  const closeAdmin = $("closeAdmin");
  const adminBalanceInput = $("adminBalanceInput");
  const adminSetBalanceBtn = $("adminSetBalanceBtn");
  const adminResetWheelBtn = $("adminResetWheelBtn");
  const adminExportDataBtn = $("adminExportDataBtn");
  const adminResetAllBtn = $("adminResetAllBtn");

  const builderNewBtn = $("builderNewBtn");
  const builderCloneBtn = $("builderCloneBtn");
  const builderDeleteBtn = $("builderDeleteBtn");
  const builderSlotSelect = $("builderSlotSelect");
  const builderJson = $("builderJson");
  const builderSaveBtn = $("builderSaveBtn");
  const builderExportSlotBtn = $("builderExportSlotBtn");
  const builderImportSlotBtn = $("builderImportSlotBtn");

  /* =========================
     Helpers
  ========================= */
  const WILD = "__WILD__";

  function eur(n) {
    const x = Number(n || 0);
    return "€" + x.toFixed(2);
  }

  function setStatus(msg) {
    statusText.textContent = msg;
  }

  function setEvent(msg) {
    eventBox.innerHTML = msg;
  }

  function getSelectedSlot() {
    const all = getAllSlots();
    return all[state.selectedSlotId] || all["lucky_pharaoh"];
  }

  function symbolDef(slot, key) {
    return slot.symbols.find(s => s.key === key) || { key, label: key };
  }

  function safeClassKey(key) {
    // "10" => "10", others ok
    return String(key).replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function renderBalance() {
    balanceEl.textContent = eur(state.balance);
  }

  function renderTopMeta() {
    const slot = getSelectedSlot();
    slotMetaEl.textContent = `${slot.reels}×${slot.rows} · ${slot.paylines} Linien · Wild/Mystery: 🎭 · Power: ≥ ${slot.features.powerTriggerMultiplier}×`;
  }

  function fillBetOptions() {
    // erweitert: +3,4,5,10
    const bets = [0.10,0.20,0.30,0.40,0.50,0.60,0.70,0.80,0.90,1.00,2.00,3.00,4.00,5.00,10.00];
    betSelect.innerHTML = "";
    for (const b of bets) {
      const opt = document.createElement("option");
      opt.value = String(b);
      opt.textContent = eur(b);
      betSelect.appendChild(opt);
    }
    if (!bets.includes(Number(state.bet))) state.bet = 0.10;
    betSelect.value = String(state.bet);
  }

  function fillSlotOptions() {
    const all = getAllSlots();
    slotSelect.innerHTML = "";
    for (const [id, cfg] of Object.entries(all)) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = cfg.name + (id === "lucky_pharaoh" ? " (Default)" : "");
      slotSelect.appendChild(opt);
    }
    if (!all[state.selectedSlotId]) state.selectedSlotId = "lucky_pharaoh";
    slotSelect.value = state.selectedSlotId;

    // builder
    builderSlotSelect.innerHTML = "";
    for (const [id, cfg] of Object.entries(all)) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = cfg.name + (state.customSlots[id] ? " (Custom)" : " (Built-in)");
      builderSlotSelect.appendChild(opt);
    }
    builderSlotSelect.value = state.selectedSlotId;
  }

  function updateWheelCooldownUI() {
    const now = Date.now();
    const next = (state.lastWheelAt || 0) + DAY_MS;
    if (now >= next) {
      wheelCooldownText.textContent = "Wheel: bereit";
      wheelBtn.classList.add("primary");
    } else {
      wheelBtn.classList.remove("primary");
      const ms = next - now;
      const h = Math.floor(ms / (60*60*1000));
      const m = Math.floor((ms % (60*60*1000)) / (60*1000));
      const s = Math.floor((ms % (60*1000)) / 1000);
      wheelCooldownText.textContent = `Wheel: in ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    }
  }

  /* =========================
     Board build (keep DOM, update only icons)
  ========================= */
  function buildBoard(boardEl, slot) {
    boardEl.innerHTML = "";
    const cells = Array.from({ length: slot.rows }, () => Array.from({ length: slot.reels }, () => null));

    for (let r = 0; r < slot.rows; r++) {
      for (let c = 0; c < slot.reels; c++) {
        const cell = document.createElement("div");
        cell.className = "symbol";

        const icon = document.createElement("div");
        icon.className = "icon";
        icon.textContent = "?";
        cell.appendChild(icon);

        cell.dataset.r = String(r);
        cell.dataset.c = String(c);

        boardEl.appendChild(cell);
        cells[r][c] = cell;
      }
    }

    boardEl._cells = cells; // store
  }

  function setCell(boardEl, slot, r, c, key) {
    const cell = boardEl._cells?.[r]?.[c];
    if (!cell) return;
    const def = symbolDef(slot, key);
    const icon = cell.querySelector(".icon");

    cell.classList.remove("win");
    // remove old sym- classes
    [...cell.classList].forEach(cl => {
      if (cl.startsWith("sym-")) cell.classList.remove(cl);
    });

    cell.classList.add("sym-" + safeClassKey(key));
    cell.dataset.key = key;
    icon.textContent = def.label;
  }

  function clearWinHighlights(boardEl) {
    boardEl.querySelectorAll(".symbol.win").forEach(el => el.classList.remove("win"));
  }

  function highlightPositions(boardEl, positions) {
    for (const p of positions) {
      const cell = boardEl._cells?.[p.r]?.[p.c];
      if (cell) cell.classList.add("win");
    }
  }

  /* =========================
     Grid generation + Mystery/Wild
  ========================= */
  function generateGrid(slot, mode) {
    const weights = mode === "power" ? slot.weights.power : slot.weights.base;
    const grid = Array.from({ length: slot.rows }, () => Array.from({ length: slot.reels }, () => SYM.T10));
    for (let c = 0; c < slot.reels; c++) {
      for (let r = 0; r < slot.rows; r++) {
        grid[r][c] = weightedChoice(weights);
      }
    }
    return grid;
  }

  function applyMysteryAndWild(slot, grid, mode) {
    const out = grid.map(row => row.slice());
    const mystery = slot.features.mysterySymbol;
    const wildMode = !!slot.features.wildMode;
    const expandChance = slot.features.wildExpandChance ?? 0;

    const pool = slot.symbols.map(s => s.key).filter(k => k !== mystery);

    for (let r = 0; r < slot.rows; r++) {
      for (let c = 0; c < slot.reels; c++) {
        if (out[r][c] === mystery) {
          if (wildMode) {
            out[r][c] = WILD;
            const chanceBoost = (mode === "power") ? 1.15 : 1.0;
            if (rand01() < (expandChance * chanceBoost)) {
              for (let rr = 0; rr < slot.rows; rr++) out[rr][c] = WILD;
            }
          } else {
            out[r][c] = pool[randInt(0, pool.length - 1)] || SYM.DIA;
          }
        }
      }
    }
    return out;
  }

  /* =========================
     Win evaluation
     "Anywhere on the line" -> best consecutive segment >=3
  ========================= */
  function evaluateWins(slot, evalGrid, betTotal) {
    const lineBet = betTotal / slot.paylines;

    let totalWin = 0;
    const lineWins = [];

    for (let li = 0; li < PAYLINES.length; li++) {
      const pattern = PAYLINES[li];
      const seq = [];
      const pos = [];
      for (let c = 0; c < slot.reels; c++) {
        const r = pattern[c];
        seq.push(evalGrid[r][c]);
        pos.push({ r, c });
      }

      let best = { amount: 0, symbol: null, length: 0, positions: [] };

      for (let start = 0; start < slot.reels; start++) {
        for (let end = start + 2; end < slot.reels; end++) {
          const len = end - start + 1;

          let base = null;
          for (let k = start; k <= end; k++) {
            if (seq[k] !== WILD) { base = seq[k]; break; }
          }
          if (!base) base = SYM.DIA; // all wild -> diamond

          let ok = true;
          for (let k = start; k <= end; k++) {
            const s = seq[k];
            if (s !== base && s !== WILD) { ok = false; break; }
          }
          if (!ok) continue;

          const pt = slot.paytable[base];
          if (!pt || !pt[len]) continue;

          const amount = pt[len] * lineBet;
          if (amount > best.amount) {
            best = { amount, symbol: base, length: len, positions: pos.slice(start, end + 1) };
          }
        }
      }

      if (best.amount > 0) {
        totalWin += best.amount;
        lineWins.push({ lineIndex: li, ...best });
      }
    }

    totalWin = Math.round(totalWin * 100) / 100;
    for (const lw of lineWins) lw.amount = Math.round(lw.amount * 100) / 100;
    return { totalWin, lineWins };
  }

  /* =========================
     Reel Animation (real stop per reel)
  ========================= */
  async function spinBoardAnimated(boardEl, slot, mode, finalGrid) {
    // Adds reelSpinning class and randomizes symbols in each reel while spinning.
    boardEl.classList.add("reelSpinning");

    const weights = mode === "power" ? slot.weights.power : slot.weights.base;

    const intervals = [];
    const reelDone = Array(slot.reels).fill(false);

    for (let c = 0; c < slot.reels; c++) {
      const iv = setInterval(() => {
        // tick a bit, not too loud
        audio.reelTick();

        // update 3 visible symbols in that reel
        for (let r = 0; r < slot.rows; r++) {
          const k = weightedChoice(weights);
          setCell(boardEl, slot, r, c, k);
        }
      }, 65);
      intervals.push(iv);
    }

    // sequential stopping
    for (let c = 0; c < slot.reels; c++) {
      const stopDelay = 520 + c * 240;
      await wait(stopDelay);

      clearInterval(intervals[c]);
      reelDone[c] = true;

      // set final symbols for reel column
      for (let r = 0; r < slot.rows; r++) {
        setCell(boardEl, slot, r, c, finalGrid[r][c]);
      }
      audio.reelStop();
    }

    boardEl.classList.remove("reelSpinning");
    return reelDone.every(Boolean);
  }

  function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  /* =========================
     Game Flow + Auto Spin
  ========================= */
  let isSpinning = false;
  let pendingPower = null;
  let autoSpin = false;

  function setControlsEnabled(on) {
    spinBtn.disabled = !on;
    autoBtn.disabled = !on;
    wheelBtn.disabled = !on;
    slotSelect.disabled = !on;
    betSelect.disabled = !on;
  }

  function stopAutoSpin(reason) {
    if (!autoSpin) return;
    autoSpin = false;
    autoBtn.textContent = "AUTO: AUS";
    autoBtn.classList.remove("primary");
    if (reason) setEvent(`<b>Auto-Spin gestoppt:</b> ${reason}`);
  }

  async function spinBase() {
    audio.ensure(); // start audio & ambience after first user action

    if (isSpinning) return;
    const slot = getSelectedSlot();
    const bet = Number(state.bet);

    if (state.balance < bet) {
      setStatus("Nicht genug Balance.");
      setEvent(`<b>Kein Spin:</b> Balance zu niedrig (${eur(state.balance)}).`);
      stopAutoSpin("Balance zu niedrig");
      audio.lose();
      return;
    }

    isSpinning = true;
    setControlsEnabled(false);

    // deduct bet
    state.balance = Math.round((state.balance - bet) * 100) / 100;
    saveState();
    renderBalance();

    setStatus("Dreht...");
    setEvent(`Einsatz: <b>${eur(bet)}</b> · Slot: <b>${slot.name}</b>`);
    lastWinEl.textContent = eur(0);

    clearWinHighlights(baseBoardEl);

    // generate final grid upfront (so the spin ends consistently)
    const rawGrid = generateGrid(slot, "base");

    await spinBoardAnimated(baseBoardEl, slot, "base", rawGrid);

    // evaluate
    const evalGrid = applyMysteryAndWild(slot, rawGrid, "base");
    const res = evaluateWins(slot, evalGrid, bet);

    clearWinHighlights(baseBoardEl);
    for (const lw of res.lineWins) highlightPositions(baseBoardEl, lw.positions);

    const win = res.totalWin;
    lastWinEl.textContent = eur(win);

    if (win > 0) {
      setStatus(`Gewinn: ${eur(win)} · Linien: ${res.lineWins.length}`);
      setEvent(`<b>WIN</b> ✅ +${eur(win)} · Einsatz ${eur(bet)} · Linien ${res.lineWins.length}`);
      audio.win();

      const trigger = slot.features.powerSpins && win >= slot.features.powerTriggerMultiplier * bet;
      if (trigger) {
        pendingPower = { baseWin: win, bet, slotId: slot.id };
        openPowerModal(pendingPower);
        stopAutoSpin("Power-Spins verfügbar");
      } else {
        state.balance = Math.round((state.balance + win) * 100) / 100;
        saveState();
        renderBalance();
      }
    } else {
      setStatus("Kein Gewinn.");
      setEvent(`<b>LOSE</b> ❌ Einsatz ${eur(bet)}`);
      audio.lose();
    }

    isSpinning = false;
    setControlsEnabled(true);

    // auto spin scheduling
    if (autoSpin && !pendingPower && powerModalOverlay.classList.contains("hidden") && wheelModalOverlay.classList.contains("hidden")) {
      await wait(900);
      if (autoSpin) spinBase();
    }
  }

  /* =========================
     Power Spins
  ========================= */
  function openPowerModal(info) {
    const slot = getAllSlots()[info.slotId] || getSelectedSlot();
    const maxSpins = Math.max(1, Math.floor(info.baseWin / info.bet));
    powerBuyRange.min = "1";
    powerBuyRange.max = String(maxSpins);
    powerBuyRange.value = String(Math.min(3, maxSpins));

    powerModalText.innerHTML =
      `Du hast <b>${eur(info.baseWin)}</b> gewonnen (≥ ${slot.features.powerTriggerMultiplier}× Einsatz).<br/>
       Willst du den Gewinn nehmen oder in <b>Power-Spins</b> investieren?`;

    syncPowerBuyText(info.bet);
    powerModalOverlay.classList.remove("hidden");
  }

  function closePowerModalNow() { powerModalOverlay.classList.add("hidden"); }

  function syncPowerBuyText(bet) {
    const spins = Number(powerBuyRange.value);
    powerBuySpins.textContent = spins === 1 ? "1 Spin" : `${spins} Spins`;
    powerBuyCost.textContent = `${eur(spins * bet)} (aus Gewinn)`;
  }

  async function startPowerSpins({ baseWin, bet, slotId }, spinsToBuy) {
    const slot = getAllSlots()[slotId] || getSelectedSlot();

    const cost = Math.round(spinsToBuy * bet * 100) / 100;
    const immediate = Math.round((baseWin - cost) * 100) / 100;

    state.balance = Math.round((state.balance + immediate) * 100) / 100;
    saveState();
    renderBalance();

    powerPanel.classList.remove("hidden");
    powerWinEl.textContent = eur(0);
    powerMeta.textContent = `${spinsToBuy} Spin(s) · Einsatz ${eur(bet)} · 4 Felder`;
    powerStatus.textContent = "Power-Spins laufen...";

    isSpinning = true;
    setControlsEnabled(false);

    let powerTotal = 0;
    let spinsLeft = spinsToBuy;

    // build mini boards if missing
    for (const pb of pBoards) {
      if (!pb._cells) buildBoard(pb, slot);
      clearWinHighlights(pb);
    }

    while (spinsLeft > 0) {
      let spinWin = 0;

      for (let i = 0; i < 4; i++) {
        clearWinHighlights(pBoards[i]);
        const raw = generateGrid(slot, "power");
        await spinBoardAnimated(pBoards[i], slot, "power", raw);
        const evalGrid = applyMysteryAndWild(slot, raw, "power");
        const res = evaluateWins(slot, evalGrid, bet);
        for (const lw of res.lineWins) highlightPositions(pBoards[i], lw.positions);
        spinWin += res.totalWin;
      }

      spinWin = Math.round(spinWin * 100) / 100;
      powerTotal = Math.round((powerTotal + spinWin) * 100) / 100;
      powerWinEl.textContent = eur(powerTotal);

      powerStatus.textContent = `Spin gewonnen: ${eur(spinWin)} · Übrig: ${spinsLeft - 1}`;

      // Bonus: großer Gewinn -> +1 extra spin
      if (spinWin >= 4 * bet) {
        spinsLeft += 1;
        powerStatus.textContent += " · +1 Extra!";
      }

      spinsLeft -= 1;
      await wait(450);
    }

    state.balance = Math.round((state.balance + powerTotal) * 100) / 100;
    saveState();
    renderBalance();

    powerStatus.textContent = `Fertig. Power-Gewinn: ${eur(powerTotal)} gutgeschrieben.`;
    setEvent(`<b>Power Ende</b> ✅ +${eur(powerTotal)}`);

    isSpinning = false;
    setControlsEnabled(true);
  }

  /* =========================
     Daily Wheel
  ========================= */
  const WHEEL_VALUES = [10,20,30,40,50,60,70,80,90,100];

  function wheelReady() {
    return Date.now() >= (state.lastWheelAt || 0) + DAY_MS;
  }

  function openWheelModal() {
    updateWheelModalText();
    wheelModalOverlay.classList.remove("hidden");
    stopAutoSpin("Wheel geöffnet");
  }

  function closeWheelModalNow() { wheelModalOverlay.classList.add("hidden"); }

  function updateWheelModalText() {
    const now = Date.now();
    const next = (state.lastWheelAt || 0) + DAY_MS;
    if (now >= next) {
      wheelReadyText.textContent = "Bereit zum Drehen ✅";
      spinWheelBtn.disabled = false;
    } else {
      const ms = next - now;
      const h = Math.floor(ms / (60*60*1000));
      const m = Math.floor((ms % (60*60*1000)) / (60*1000));
      const s = Math.floor((ms % (60*1000)) / 1000);
      wheelReadyText.textContent = `Noch nicht bereit. Wieder in ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
      spinWheelBtn.disabled = true;
    }
  }

  let wheelSpinning = false;

  async function spinDailyWheel() {
    audio.ensure();

    if (wheelSpinning) return;
    if (!wheelReady()) { updateWheelModalText(); return; }

    wheelSpinning = true;
    spinWheelBtn.disabled = true;

    const index = randInt(0, WHEEL_VALUES.length - 1);
    const prize = WHEEL_VALUES[index];

    const segmentDeg = 360 / WHEEL_VALUES.length;
    const targetDeg = (360 - (index * segmentDeg) - (segmentDeg / 2));
    const extraTurns = 5 * 360;
    const finalDeg = extraTurns + targetDeg + randInt(-6, 6);

    wheel.style.transform = `rotate(${finalDeg}deg)`;
    wheelInfo.textContent = "Dreht...";

    await wait(2700);

    state.balance = Math.round((state.balance + prize) * 100) / 100;
    state.lastWheelAt = Date.now();
    saveState();

    renderBalance();
    updateWheelCooldownUI();
    updateWheelModalText();

    wheelInfo.innerHTML = `Gewonnen: <b>${eur(prize)}</b> ✅`;
    setEvent(`<b>Daily Wheel</b> ✅ +${eur(prize)}`);
    audio.win();

    wheelSpinning = false;
    spinWheelBtn.disabled = false;
  }

  /* =========================
     Admin / Builder (unchanged logic, still works)
  ========================= */
  const ADMIN_PASSWORD = "1403";

  function tryOpenAdmin() {
    const pwd = prompt("Admin Passwort:");
    if (pwd !== ADMIN_PASSWORD) {
      alert("Falsch.");
      return;
    }
    adminBalanceInput.value = String(state.balance.toFixed(2));
    refreshBuilderJson();
    adminOverlay.classList.remove("hidden");
    stopAutoSpin("Admin geöffnet");
  }

  function closeAdminNow() { adminOverlay.classList.add("hidden"); }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  function exportAllData() {
    copyToClipboard(JSON.stringify(state, null, 2));
    alert("Save JSON wurde in die Zwischenablage kopiert.");
  }

  function resetAll() {
    if (!confirm("Wirklich ALLES zurücksetzen?")) return;
    state = { ...defaultState };
    saveState();
    initUI();
    alert("Zurückgesetzt.");
  }

  function validateSlotConfig(cfg) {
    const errors = [];
    const req = (cond, msg) => { if (!cond) errors.push(msg); };

    req(cfg && typeof cfg === "object", "Config muss ein Objekt sein.");
    if (!cfg || typeof cfg !== "object") return { ok: false, errors };

    req(typeof cfg.id === "string" && cfg.id.length >= 3, "id fehlt/zu kurz.");
    req(typeof cfg.name === "string" && cfg.name.length >= 2, "name fehlt/zu kurz.");
    req(cfg.reels === 5, "reels muss 5 sein.");
    req(cfg.rows === 3, "rows muss 3 sein.");
    req(cfg.paylines === 10, "paylines muss 10 sein.");

    req(cfg.features && typeof cfg.features === "object", "features fehlt.");
    req(Array.isArray(cfg.symbols) && cfg.symbols.length >= 6, "symbols muss Array sein.");
    req(cfg.weights && cfg.weights.base && cfg.weights.power, "weights.base/power fehlen.");
    req(cfg.paytable && typeof cfg.paytable === "object", "paytable fehlt.");

    if (cfg.symbols && Array.isArray(cfg.symbols)) {
      const keys = cfg.symbols.map(s => s.key);
      req(new Set(keys).size === keys.length, "symbols keys müssen eindeutig sein.");
    }

    return { ok: errors.length === 0, errors };
  }

  function refreshBuilderJson() {
    const all = getAllSlots();
    const id = builderSlotSelect.value || state.selectedSlotId;
    const cfg = all[id] || getSelectedSlot();
    builderJson.value = JSON.stringify(cfg, null, 2);
    builderSlotSelect.value = id;
  }

  function saveBuilderJson() {
    let obj;
    try { obj = JSON.parse(builderJson.value); }
    catch (e) { alert("JSON Fehler: " + e.message); return; }

    const validated = validateSlotConfig(obj);
    if (!validated.ok) {
      alert("Config ungültig:\n- " + validated.errors.join("\n- "));
      return;
    }

    const isBuiltIn = (obj.id === "lucky_pharaoh");
    const id = isBuiltIn ? (obj.id + "_custom_" + randInt(1000,9999)) : obj.id;
    obj.id = id;

    state.customSlots[id] = obj;
    state.selectedSlotId = id;

    saveState();
    fillSlotOptions();
    slotSelect.value = state.selectedSlotId;
    builderSlotSelect.value = state.selectedSlotId;

    renderTopMeta();
    rebuildBoardsForSlot();

    alert("Gespeichert als Custom Slot: " + obj.name + " (" + obj.id + ")");
  }

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^\wäöüß]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }

  function builderNewSlot() {
    const name = prompt("Name für neuen Slot:");
    if (!name) return;

    const id = slugify(name) || ("slot_" + randInt(1000,9999));
    const base = makeLuckyPharaohSlot();
    const newCfg = structuredClone(base);

    newCfg.id = id;
    newCfg.name = name;

    state.customSlots[id] = newCfg;
    state.selectedSlotId = id;
    saveState();

    fillSlotOptions();
    slotSelect.value = id;
    builderSlotSelect.value = id;
    refreshBuilderJson();

    renderTopMeta();
    rebuildBoardsForSlot();

    alert("Neuer Slot erstellt (Custom): " + name);
  }

  function builderCloneSelected() {
    const all = getAllSlots();
    const srcId = builderSlotSelect.value || state.selectedSlotId;
    const src = all[srcId];
    if (!src) return;

    const clone = structuredClone(src);
    clone.id = `${src.id}_clone_${randInt(1000,9999)}`;
    clone.name = `${src.name} (Clone)`;

    state.customSlots[clone.id] = clone;
    state.selectedSlotId = clone.id;
    saveState();

    fillSlotOptions();
    slotSelect.value = clone.id;
    builderSlotSelect.value = clone.id;
    refreshBuilderJson();

    renderTopMeta();
    rebuildBoardsForSlot();

    alert("Geklont: " + clone.name);
  }

  function builderDeleteSelected() {
    const id = builderSlotSelect.value || state.selectedSlotId;
    if (!state.customSlots[id]) {
      alert("Nur Custom Slots können gelöscht werden.");
      return;
    }
    if (!confirm("Custom Slot löschen? " + id)) return;

    delete state.customSlots[id];
    state.selectedSlotId = "lucky_pharaoh";
    saveState();

    fillSlotOptions();
    slotSelect.value = state.selectedSlotId;
    builderSlotSelect.value = state.selectedSlotId;
    refreshBuilderJson();

    renderTopMeta();
    rebuildBoardsForSlot();

    alert("Gelöscht.");
  }

  function builderExportSlot() {
    const all = getAllSlots();
    const id = builderSlotSelect.value || state.selectedSlotId;
    const cfg = all[id];
    if (!cfg) return;

    copyToClipboard(JSON.stringify(cfg, null, 2));
    alert("Slot JSON wurde kopiert.");
  }

  function builderImportSlot() {
    const str = prompt("Slot JSON hier einfügen:");
    if (!str) return;

    let obj;
    try { obj = JSON.parse(str); }
    catch (e) { alert("JSON Fehler: " + e.message); return; }

    const validated = validateSlotConfig(obj);
    if (!validated.ok) {
      alert("Ungültig:\n- " + validated.errors.join("\n- "));
      return;
    }

    const id = obj.id && obj.id !== "lucky_pharaoh" ? obj.id : ("import_" + randInt(1000,9999));
    obj.id = id;

    state.customSlots[id] = obj;
    state.selectedSlotId = id;
    saveState();

    fillSlotOptions();
    slotSelect.value = id;
    builderSlotSelect.value = id;
    refreshBuilderJson();

    renderTopMeta();
    rebuildBoardsForSlot();

    alert("Importiert: " + obj.name + " (" + obj.id + ")");
  }

  /* =========================
     Init / Rebuild Boards
  ========================= */
  function rebuildBoardsForSlot() {
    const slot = getSelectedSlot();
    buildBoard(baseBoardEl, slot);

    // show an idle random grid
    const g = generateGrid(slot, "base");
    for (let r = 0; r < slot.rows; r++) for (let c = 0; c < slot.reels; c++) setCell(baseBoardEl, slot, r, c, g[r][c]);
  }

  /* =========================
     Events
  ========================= */
  spinBtn.addEventListener("click", spinBase);

  autoBtn.addEventListener("click", () => {
    audio.ensure();
    autoSpin = !autoSpin;
    autoBtn.textContent = autoSpin ? "AUTO: AN" : "AUTO: AUS";
    autoBtn.classList.toggle("primary", autoSpin);

    if (autoSpin) {
      setEvent("<b>Auto-Spin</b> ✅ gestartet");
      if (!isSpinning) spinBase();
    } else {
      setEvent("<b>Auto-Spin</b> ❌ gestoppt");
    }
  });

  wheelBtn.addEventListener("click", openWheelModal);
  closeWheelModal.addEventListener("click", closeWheelModalNow);
  spinWheelBtn.addEventListener("click", spinDailyWheel);

  slotSelect.addEventListener("change", () => {
    state.selectedSlotId = slotSelect.value;
    saveState();
    renderTopMeta();
    rebuildBoardsForSlot();
    fillSlotOptions(); // keep builder in sync
    setEvent(`Slot gewechselt: <b>${getSelectedSlot().name}</b>`);
    stopAutoSpin("Slot gewechselt");
  });

  betSelect.addEventListener("change", () => {
    state.bet = Number(betSelect.value);
    saveState();
    setStatus("Einsatz gesetzt: " + eur(state.bet));
    setEvent(`Einsatz: <b>${eur(state.bet)}</b>`);
  });

  // Power modal
  closePowerModal.addEventListener("click", () => {
    if (pendingPower) {
      const w = pendingPower.baseWin;
      state.balance = Math.round((state.balance + w) * 100) / 100;
      saveState();
      renderBalance();
      setEvent(`<b>Gewinn genommen</b> ✅ +${eur(w)} (Power abgelehnt)`);
      pendingPower = null;
    }
    closePowerModalNow();
  });

  powerBuyRange.addEventListener("input", () => {
    if (!pendingPower) return;
    syncPowerBuyText(pendingPower.bet);
  });

  takeWinBtn.addEventListener("click", () => {
    if (!pendingPower) return;
    const w = pendingPower.baseWin;
    state.balance = Math.round((state.balance + w) * 100) / 100;
    saveState();
    renderBalance();
    setEvent(`<b>Gewinn genommen</b> ✅ +${eur(w)}`);
    pendingPower = null;
    closePowerModalNow();
  });

  buyPowerBtn.addEventListener("click", async () => {
    if (!pendingPower) return;
    const info = pendingPower;
    const spins = Number(powerBuyRange.value);

    const maxSpins = Math.max(1, Math.floor(info.baseWin / info.bet));
    if (spins < 1 || spins > maxSpins) {
      alert("Ungültige Spin-Anzahl.");
      return;
    }

    pendingPower = null;
    closePowerModalNow();
    await startPowerSpins(info, spins);
  });

  // Admin
  closeAdmin.addEventListener("click", closeAdminNow);

  adminSetBalanceBtn.addEventListener("click", () => {
    const v = Number(adminBalanceInput.value);
    if (!Number.isFinite(v) || v < 0) return alert("Ungültig.");
    state.balance = Math.round(v * 100) / 100;
    saveState();
    renderBalance();
    alert("Balance gesetzt: " + eur(state.balance));
  });

  adminResetWheelBtn.addEventListener("click", () => {
    state.lastWheelAt = 0;
    saveState();
    updateWheelCooldownUI();
    updateWheelModalText();
    alert("Wheel Cooldown zurückgesetzt.");
  });

  adminExportDataBtn.addEventListener("click", exportAllData);
  adminResetAllBtn.addEventListener("click", resetAll);

  // Builder
  builderSlotSelect.addEventListener("change", refreshBuilderJson);
  builderSaveBtn.addEventListener("click", saveBuilderJson);
  builderNewBtn.addEventListener("click", builderNewSlot);
  builderCloneBtn.addEventListener("click", builderCloneSelected);
  builderDeleteBtn.addEventListener("click", builderDeleteSelected);
  builderExportSlotBtn.addEventListener("click", builderExportSlot);
  builderImportSlotBtn.addEventListener("click", builderImportSlot);

  // Key combo: Ctrl+Alt+# (German AltGr)
  window.addEventListener("keydown", (e) => {
    const ctrlAlt = e.ctrlKey && e.altKey;
    const isHash = (e.key === "#") || (e.code === "Digit3") || (e.code === "Backslash");
    if (ctrlAlt && isHash) {
      e.preventDefault();
      tryOpenAdmin();
    }
  });

  /* =========================
     Wheel tick UI
  ========================= */
  setInterval(() => {
    updateWheelCooldownUI();
    if (!wheelModalOverlay.classList.contains("hidden")) updateWheelModalText();
  }, 1000);

  /* =========================
     Init
  ========================= */
  function initUI() {
    renderBalance();
    fillBetOptions();
    fillSlotOptions();
    renderTopMeta();

    rebuildBoardsForSlot();
    updateWheelCooldownUI();

    setStatus("Bereit.");
    setEvent("—");
  }

  initUI();

})();

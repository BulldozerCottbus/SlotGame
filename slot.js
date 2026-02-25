/* =========================================================
  Multi Slot System (Lucky Pharaoh Default)
  - 5 reels x 3 rows
  - 10 fixed paylines
  - Mystery symbol "LP" -> transforms to random symbol
  - Optional Wild mode: LP can act as Wild + expand reel
  - Power-Spins when win >= 4x bet (buy with win)
  - 4 boards simultaneously during Power-Spins
  - Daily Wheel every 24h (10..100€)
  - Admin: Ctrl+Alt+# (German: AltGr) + password 1403
  - Builder: add/clone/import/export slots (custom slots stored in localStorage)
========================================================= */

(() => {
  "use strict";

  /* -------------------------
     Storage / State
  ------------------------- */
  const STORAGE_KEY = "multiSlotSystem.v1";
  const DAY_MS = 24 * 60 * 60 * 1000;

  const defaultState = {
    balance: 20.00,
    bet: 0.10,
    selectedSlotId: "lucky_pharaoh",
    lastWheelAt: 0,
    customSlots: {}, // id -> config
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

  /* -------------------------
     Crypto RNG helpers
  ------------------------- */
  function rand01() {
    // [0,1)
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  }

  function randInt(minIncl, maxIncl) {
    const r = rand01();
    return minIncl + Math.floor(r * (maxIncl - minIncl + 1));
  }

  function weightedChoice(weightMap) {
    // weightMap: {key: weight}
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

  /* -------------------------
     Default Slot Config
  ------------------------- */
  // Symbol keys
  const SYM = {
    LP: "LP",       // Lucky Pharaoh logo (Mystery / optional Wild)
    DIA: "DIA",
    RUB: "RUB",
    SAP: "SAP",
    EME: "EME",
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
      // Features
      features: {
        powerSpins: true,
        powerTriggerMultiplier: 4, // win >= 4x bet
        mysterySymbol: SYM.LP,
        wildMode: true, // LP can act as wild + may expand reel
        wildExpandChance: 0.20, // 20% expand reel if LP shows
      },
      // Symbol definitions (for rendering)
      symbols: [
        { key: SYM.LP, label: "LP", type: "lp" },
        { key: SYM.DIA, label: "💎", type: "gem" },
        { key: SYM.RUB, label: "🔴", type: "gem" },
        { key: SYM.SAP, label: "🔵", type: "gem" },
        { key: SYM.EME, label: "🟢", type: "gem" },
        { key: SYM.A, label: "A", type: "card" },
        { key: SYM.K, label: "K", type: "card" },
        { key: SYM.Q, label: "Q", type: "card" },
        { key: SYM.J, label: "J", type: "card" },
        { key: SYM.T10, label: "10", type: "card" },
      ],
      // Weights (base game)
      weights: {
        base: {
          [SYM.LP]: 6,
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
        // Increased special chance in Power-Spins
        power: {
          [SYM.LP]: 12,
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
      // Paytable multipliers (per line bet)
      // payout = lineBet * multiplier
      paytable: {
        [SYM.DIA]: { 3: 6, 4: 24, 5: 120 },
        [SYM.RUB]: { 3: 4, 4: 14, 5: 70 },
        [SYM.SAP]: { 3: 3, 4: 12, 5: 60 },
        [SYM.EME]: { 3: 3, 4: 10, 5: 50 },
        [SYM.A]:   { 3: 1.2, 4: 4,  5: 18 },
        [SYM.K]:   { 3: 1.0, 4: 3.5,5: 16 },
        [SYM.Q]:   { 3: 0.9, 4: 3.2,5: 14 },
        [SYM.J]:   { 3: 0.8, 4: 3.0,5: 12 },
        [SYM.T10]: { 3: 0.7, 4: 2.8,5: 10 },
      }
    };
  }

  function getAllSlots() {
    const defaults = {
      lucky_pharaoh: makeLuckyPharaohSlot(),
    };
    // Merge custom (custom can override id collisions intentionally)
    return { ...defaults, ...(state.customSlots || {}) };
  }

  /* -------------------------
     Paylines (10 fixed)
     Each line is an array of row indices per reel (0..2)
  ------------------------- */
  const PAYLINES = [
    [1,1,1,1,1], // middle
    [0,0,0,0,0], // top
    [2,2,2,2,2], // bottom
    [0,1,2,1,0], // V
    [2,1,0,1,2], // inverted V
    [0,0,1,0,0],
    [2,2,1,2,2],
    [1,0,0,0,1],
    [1,2,2,2,1],
    [0,1,1,1,0],
  ];

  /* -------------------------
     DOM
  ------------------------- */
  const $ = (id) => document.getElementById(id);

  const balanceEl = $("balance");
  const slotSelect = $("slotSelect");
  const betSelect = $("betSelect");
  const spinBtn = $("spinBtn");
  const wheelBtn = $("wheelBtn");
  const wheelCooldownText = $("wheelCooldownText");

  const baseBoardEl = $("baseBoard");
  const statusText = $("statusText");
  const lastWinEl = $("lastWin");
  const logEl = $("log");
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

  /* -------------------------
     UI Helpers
  ------------------------- */
  function eur(n) {
    const x = Number(n || 0);
    return "€" + x.toFixed(2);
  }

  function setStatus(msg) {
    statusText.textContent = msg;
  }

  function log(msg) {
    const div = document.createElement("div");
    div.className = "logItem";
    div.innerHTML = msg;
    logEl.prepend(div);
    // keep reasonable size
    while (logEl.children.length > 8) logEl.lastElementChild.remove();
  }

  function getSelectedSlot() {
    const all = getAllSlots();
    const s = all[state.selectedSlotId];
    return s || all["lucky_pharaoh"];
  }

  function renderTopMeta() {
    const slot = getSelectedSlot();
    slotMetaEl.textContent = `${slot.reels}×${slot.rows} · ${slot.paylines} Linien · Mystery: ${slot.features.mysterySymbol}${slot.features.wildMode ? " · Wild" : ""}`;
  }

  function renderBalance() {
    balanceEl.textContent = eur(state.balance);
  }

  function fillBetOptions() {
    const bets = [0.10,0.20,0.30,0.40,0.50,0.60,0.70,0.80,0.90,1.00,2.00];
    betSelect.innerHTML = "";
    for (const b of bets) {
      const opt = document.createElement("option");
      opt.value = String(b);
      opt.textContent = eur(b);
      betSelect.appendChild(opt);
    }
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

    // builder select
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

  /* -------------------------
     Board Rendering
  ------------------------- */
  function symbolDef(slot, key) {
    return slot.symbols.find(s => s.key === key) || { key, label: key, type: "card" };
  }

  function clearWinHighlights(boardEl) {
    boardEl.querySelectorAll(".symbol.win").forEach(el => el.classList.remove("win"));
  }

  function renderBoard(boardEl, slot, gridKeys) {
    // gridKeys: rows x reels -> key
    boardEl.innerHTML = "";
    for (let r = 0; r < slot.rows; r++) {
      for (let c = 0; c < slot.reels; c++) {
        const key = gridKeys[r][c];
        const def = symbolDef(slot, key);

        const cell = document.createElement("div");
        cell.className = "symbol";
        if (def.type === "lp") cell.classList.add("lp");
        if (def.type === "card") cell.classList.add("card");

        const icon = document.createElement("div");
        icon.className = "icon";
        icon.textContent = def.label;
        cell.appendChild(icon);

        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.dataset.key = key;

        boardEl.appendChild(cell);
      }
    }
  }

  function highlightPositions(boardEl, positions) {
    // positions: [{r,c}, ...]
    for (const p of positions) {
      const el = boardEl.querySelector(`.symbol[data-r="${p.r}"][data-c="${p.c}"]`);
      if (el) el.classList.add("win");
    }
  }

  function boardSpinAnim(boardEl, on) {
    if (on) boardEl.classList.add("spinning");
    else boardEl.classList.remove("spinning");
  }

  /* -------------------------
     Grid Generation
  ------------------------- */
  function generateGrid(slot, mode) {
    const weights = (mode === "power") ? slot.weights.power : slot.weights.base;
    const grid = Array.from({ length: slot.rows }, () => Array.from({ length: slot.reels }, () => SYM.T10));

    for (let c = 0; c < slot.reels; c++) {
      for (let r = 0; r < slot.rows; r++) {
        const k = weightedChoice(weights);
        grid[r][c] = k;
      }
    }
    return grid;
  }

  /* -------------------------
     Mystery / Wild Transform
  ------------------------- */
  const WILD = "__WILD__";

  function applyMysteryAndWild(slot, grid, mode) {
    // Creates evaluated grid where LP is transformed / wild logic applied.
    // Also returns "revealMap" to show what LP became (optional).
    const out = grid.map(row => row.slice());
    const revealMap = new Map(); // key: "r,c" -> revealedSymbolKey

    const mystery = slot.features.mysterySymbol;
    const wildMode = !!slot.features.wildMode;

    // Helper: choose a random non-LP symbol
    const pool = slot.symbols.map(s => s.key).filter(k => k !== mystery);
    const bestSymbol = SYM.DIA; // for all-wild segments choose diamond (highest)
    const expandChance = slot.features.wildExpandChance ?? 0;

    for (let r = 0; r < slot.rows; r++) {
      for (let c = 0; c < slot.reels; c++) {
        if (out[r][c] === mystery) {
          if (wildMode) {
            // LP acts as wild
            out[r][c] = WILD;

            // Optional expand reel (turn entire column into wild) - mostly in power mode, but we allow always
            const chanceBoost = (mode === "power") ? 1.15 : 1.0;
            if (rand01() < (expandChance * chanceBoost)) {
              for (let rr = 0; rr < slot.rows; rr++) out[rr][c] = WILD;
            }
          } else {
            // Pure mystery: transforms to a random symbol
            const revealed = pool[randInt(0, pool.length - 1)] || bestSymbol;
            out[r][c] = revealed;
            revealMap.set(`${r},${c}`, revealed);
          }
        }
      }
    }

    return { evalGrid: out, revealMap };
  }

  /* -------------------------
     Win Evaluation (10 lines)
     "Anywhere on the line" -> we pay the BEST consecutive segment of length >=3,
     not necessarily from left edge.
  ------------------------- */
  function evaluateWins(slot, evalGrid, betTotal) {
    const linesCount = slot.paylines;
    const lineBet = betTotal / linesCount;

    let totalWin = 0;
    const lineWins = []; // { lineIndex, amount, symbol, length, positions }

    for (let li = 0; li < PAYLINES.length; li++) {
      const pattern = PAYLINES[li];
      const seq = [];
      const pos = [];
      for (let c = 0; c < slot.reels; c++) {
        const r = pattern[c];
        seq.push(evalGrid[r][c]);
        pos.push({ r, c });
      }

      // Find best segment of consecutive indices [i..j], len>=3, all match (wild allowed)
      let best = { amount: 0, symbol: null, length: 0, positions: [] };

      for (let start = 0; start < slot.reels; start++) {
        for (let end = start + 2; end < slot.reels; end++) {
          const len = end - start + 1;
          // Determine base symbol: first non-wild in segment
          let base = null;
          for (let k = start; k <= end; k++) {
            if (seq[k] !== WILD) { base = seq[k]; break; }
          }
          if (!base) base = SYM.DIA; // all wilds -> treat as diamond

          // Validate
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
            best = {
              amount,
              symbol: base,
              length: len,
              positions: pos.slice(start, end + 1),
            };
          }
        }
      }

      if (best.amount > 0) {
        totalWin += best.amount;
        lineWins.push({ lineIndex: li, ...best });
      }
    }

    // Round to cents (avoid float drift)
    totalWin = Math.round(totalWin * 100) / 100;
    for (const lw of lineWins) lw.amount = Math.round(lw.amount * 100) / 100;

    return { totalWin, lineWins };
  }

  /* -------------------------
     Game Flow
  ------------------------- */
  let isSpinning = false;
  let pendingPower = null; // { baseWin, bet, slotId }

  function canSpin(bet) {
    return Number(state.balance) >= Number(bet) && !isSpinning;
  }

  function setControlsEnabled(on) {
    spinBtn.disabled = !on;
    wheelBtn.disabled = !on;
    slotSelect.disabled = !on;
    betSelect.disabled = !on;
  }

  async function spinBase() {
    if (isSpinning) return;
    const slot = getSelectedSlot();
    const bet = Number(state.bet);

    if (state.balance < bet) {
      setStatus("Nicht genug Balance. Dreh am Daily Wheel (24h) oder lass Admin nachladen.");
      log(`<b>Kein Spin:</b> Balance zu niedrig (${eur(state.balance)}).`);
      return;
    }

    isSpinning = true;
    setControlsEnabled(false);

    // Deduct bet
    state.balance = Math.round((state.balance - bet) * 100) / 100;
    saveState();
    renderBalance();

    setStatus("Dreht...");
    clearWinHighlights(baseBoardEl);
    boardSpinAnim(baseBoardEl, true);

    // Generate + render quickly, then reveal after delay
    const rawGrid = generateGrid(slot, "base");
    renderBoard(baseBoardEl, slot, rawGrid);

    await wait(750);

    // Evaluate with mystery/wild transformations
    const { evalGrid } = applyMysteryAndWild(slot, rawGrid, "base");
    const res = evaluateWins(slot, evalGrid, bet);

    boardSpinAnim(baseBoardEl, false);

    // Highlight wins on base board (using pattern positions; we highlight raw positions)
    clearWinHighlights(baseBoardEl);
    for (const lw of res.lineWins) {
      highlightPositions(baseBoardEl, lw.positions);
    }

    const win = res.totalWin;
    lastWinEl.textContent = eur(win);

    if (win > 0) {
      setStatus(`Gewinn: ${eur(win)} (${res.lineWins.length} Linie(n))`);
      log(`<b>Win:</b> ${eur(win)} · Einsatz ${eur(bet)} · Linien ${res.lineWins.length}`);

      // Power-Spins trigger?
      const trigger = slot.features.powerSpins && win >= slot.features.powerTriggerMultiplier * bet;
      if (trigger) {
        pendingPower = { baseWin: win, bet, slotId: slot.id };
        openPowerModal(pendingPower);
      } else {
        // Add win to balance immediately
        state.balance = Math.round((state.balance + win) * 100) / 100;
        saveState();
        renderBalance();
      }
    } else {
      setStatus("Kein Gewinn.");
      log(`<b>Lose:</b> Einsatz ${eur(bet)}`);
    }

    isSpinning = false;
    setControlsEnabled(true);
  }

  function wait(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  /* -------------------------
     Power-Spins
  ------------------------- */
  function openPowerModal(info) {
    const slot = getAllSlots()[info.slotId] || getSelectedSlot();
    const maxSpins = Math.max(1, Math.floor(info.baseWin / info.bet));
    powerBuyRange.min = "1";
    powerBuyRange.max = String(maxSpins);
    powerBuyRange.value = String(Math.min(3, maxSpins));

    const winText = eur(info.baseWin);
    powerModalText.innerHTML =
      `Du hast <b>${winText}</b> gewonnen (≥ ${slot.features.powerTriggerMultiplier}× Einsatz).<br/>
       Du kannst den Gewinn nehmen oder einen Teil davon in <b>Power-Spins</b> investieren.<br/>
       In Power-Spins spielst du auf <b>4 Feldern gleichzeitig</b> und die Chance auf Sondersymbole ist erhöht.`;

    syncPowerBuyText(info.bet);

    powerModalOverlay.classList.remove("hidden");
  }

  function closePowerModalNow() {
    powerModalOverlay.classList.add("hidden");
  }

  function syncPowerBuyText(bet) {
    const spins = Number(powerBuyRange.value);
    powerBuySpins.textContent = spins === 1 ? "1 Spin" : `${spins} Spins`;
    powerBuyCost.textContent = `${eur(spins * bet)} (aus Gewinn)`;
  }

  async function startPowerSpins({ baseWin, bet, slotId }, spinsToBuy) {
    const slot = getAllSlots()[slotId] || getSelectedSlot();

    // Invest cost from win
    const cost = Math.round(spinsToBuy * bet * 100) / 100;
    const immediate = Math.round((baseWin - cost) * 100) / 100;

    // Pay immediate remainder now
    state.balance = Math.round((state.balance + immediate) * 100) / 100;
    saveState();
    renderBalance();

    // Show power panel
    powerPanel.classList.remove("hidden");
    powerWinEl.textContent = eur(0);
    powerMeta.textContent = `${spinsToBuy} Spin(s) · Einsatz ${eur(bet)} · 4 Felder`;
    powerStatus.textContent = "Power-Spins laufen...";

    let powerTotal = 0;
    let spinsLeft = spinsToBuy;

    // Lock base controls during power
    isSpinning = true;
    setControlsEnabled(false);

    while (spinsLeft > 0) {
      // Spin all 4 boards
      for (const b of pBoards) {
        clearWinHighlights(b);
        boardSpinAnim(b, true);
      }

      const rawBoards = [];
      for (let i = 0; i < 4; i++) rawBoards.push(generateGrid(slot, "power"));

      // Render raw first (animation feel)
      for (let i = 0; i < 4; i++) renderBoard(pBoards[i], slot, rawBoards[i]);

      await wait(700);

      // Evaluate each board
      let spinWin = 0;
      for (let i = 0; i < 4; i++) {
        const { evalGrid } = applyMysteryAndWild(slot, rawBoards[i], "power");
        const res = evaluateWins(slot, evalGrid, bet);

        for (const b of pBoards) boardSpinAnim(b, false);

        // Highlight on that board
        clearWinHighlights(pBoards[i]);
        for (const lw of res.lineWins) highlightPositions(pBoards[i], lw.positions);

        spinWin += res.totalWin;
      }

      spinWin = Math.round(spinWin * 100) / 100;
      powerTotal = Math.round((powerTotal + spinWin) * 100) / 100;

      powerWinEl.textContent = eur(powerTotal);
      powerStatus.textContent = `Spin gewonnen: ${eur(spinWin)} · Übrig: ${spinsLeft - 1}`;

      // Optional: re-trigger mechanic (small spice) — if very big spin in power, +1 extra spin
      if (spinWin >= 4 * bet) {
        spinsLeft += 1;
        powerStatus.textContent += " · +1 Extra Power-Spin!";
        log(`<b>Power Bonus:</b> +1 Extra Spin (SpinWin ${eur(spinWin)})`);
      }

      spinsLeft -= 1;
      await wait(450);
    }

    // Pay power winnings
    state.balance = Math.round((state.balance + powerTotal) * 100) / 100;
    saveState();
    renderBalance();

    log(`<b>Power-Spins Ende:</b> +${eur(powerTotal)} (aus investiertem Gewinn)`);
    powerStatus.textContent = `Fertig. Power-Gewinn: ${eur(powerTotal)} wurde gutgeschrieben.`;

    isSpinning = false;
    setControlsEnabled(true);
  }

  /* -------------------------
     Daily Wheel (24h)
  ------------------------- */
  const WHEEL_VALUES = [10,20,30,40,50,60,70,80,90,100];

  function wheelReady() {
    return Date.now() >= (state.lastWheelAt || 0) + DAY_MS;
  }

  function openWheelModal() {
    updateWheelModalText();
    wheelModalOverlay.classList.remove("hidden");
  }

  function closeWheelModalNow() {
    wheelModalOverlay.classList.add("hidden");
  }

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
    if (wheelSpinning) return;
    if (!wheelReady()) {
      updateWheelModalText();
      return;
    }
    wheelSpinning = true;
    spinWheelBtn.disabled = true;

    const index = randInt(0, WHEEL_VALUES.length - 1);
    const prize = WHEEL_VALUES[index];

    // Wheel has 10 segments => 36 degrees each.
    // We rotate so that chosen segment lands at pointer (top).
    // Add multiple turns for animation.
    const segmentDeg = 360 / WHEEL_VALUES.length;
    const targetDeg = (360 - (index * segmentDeg) - (segmentDeg / 2));
    const extraTurns = 5 * 360;
    const finalDeg = extraTurns + targetDeg + randInt(-6, 6);

    wheel.style.transform = `rotate(${finalDeg}deg)`;
    wheelInfo.textContent = "Dreht...";

    await wait(2700);

    // Apply prize
    state.balance = Math.round((state.balance + prize) * 100) / 100;
    state.lastWheelAt = Date.now();
    saveState();

    renderBalance();
    updateWheelCooldownUI();
    updateWheelModalText();

    wheelInfo.innerHTML = `Gewonnen: <b>${eur(prize)}</b> ✅`;
    log(`<b>Daily Wheel:</b> +${eur(prize)}`);

    wheelSpinning = false;
    spinWheelBtn.disabled = false;
  }

  /* -------------------------
     Admin Mode (Ctrl+Alt+#)
  ------------------------- */
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
  }

  function closeAdminNow() {
    adminOverlay.classList.add("hidden");
  }

  function exportAllData() {
    const dataStr = JSON.stringify(state, null, 2);
    copyToClipboard(dataStr);
    alert("Save JSON wurde in die Zwischenablage kopiert.");
  }

  function resetAll() {
    if (!confirm("Wirklich ALLES zurücksetzen? (Balance, Slots, Wheel, etc.)")) return;
    state = { ...defaultState };
    saveState();
    initUI();
    alert("Zurückgesetzt.");
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  /* -------------------------
     Builder (Slots hinzufügen ohne andere zu zerstören)
  ------------------------- */
  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[^\wäöüß]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
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
    try {
      obj = JSON.parse(builderJson.value);
    } catch (e) {
      alert("JSON Fehler: " + e.message);
      return;
    }
    const validated = validateSlotConfig(obj);
    if (!validated.ok) {
      alert("Config ungültig:\n- " + validated.errors.join("\n- "));
      return;
    }

    // Built-in slots dürfen nicht direkt überschrieben werden -> wir speichern als Custom Slot
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
    renderSlotMetaPanel();

    alert("Gespeichert als Custom Slot: " + obj.name + " (" + obj.id + ")");
  }

  function validateSlotConfig(cfg) {
    const errors = [];
    const req = (cond, msg) => { if (!cond) errors.push(msg); };

    req(cfg && typeof cfg === "object", "Config muss ein Objekt sein.");
    if (!cfg || typeof cfg !== "object") return { ok: false, errors };

    req(typeof cfg.id === "string" && cfg.id.length >= 3, "id (string) fehlt/zu kurz.");
    req(typeof cfg.name === "string" && cfg.name.length >= 2, "name (string) fehlt/zu kurz.");
    req(cfg.reels === 5, "reels muss 5 sein (Fix).");
    req(cfg.rows === 3, "rows muss 3 sein (Fix).");
    req(cfg.paylines === 10, "paylines muss 10 sein (Fix).");

    req(cfg.features && typeof cfg.features === "object", "features fehlt.");
    req(cfg.symbols && Array.isArray(cfg.symbols) && cfg.symbols.length >= 6, "symbols muss Array sein (min 6).");
    req(cfg.weights && cfg.weights.base && cfg.weights.power, "weights.base/power fehlen.");
    req(cfg.paytable && typeof cfg.paytable === "object", "paytable fehlt.");

    // basic checks
    if (cfg.symbols && Array.isArray(cfg.symbols)) {
      const keys = cfg.symbols.map(s => s.key);
      req(new Set(keys).size === keys.length, "symbols keys müssen eindeutig sein.");
    }

    return { ok: errors.length === 0, errors };
  }

  function builderNewSlot() {
    const name = prompt("Name für neuen Slot:");
    if (!name) return;

    const id = slugify(name) || ("slot_" + randInt(1000,9999));
    const base = makeLuckyPharaohSlot();
    const newCfg = structuredClone(base);

    newCfg.id = id;
    newCfg.name = name;

    // small variation: slightly different weights by default
    newCfg.weights.base[SYM.LP] = Math.max(1, newCfg.weights.base[SYM.LP] - 1);
    newCfg.weights.power[SYM.LP] = Math.max(1, newCfg.weights.power[SYM.LP] - 1);

    state.customSlots[id] = newCfg;
    state.selectedSlotId = id;
    saveState();

    fillSlotOptions();
    slotSelect.value = id;
    builderSlotSelect.value = id;
    refreshBuilderJson();
    renderTopMeta();
    renderSlotMetaPanel();

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
    renderSlotMetaPanel();

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

    // fallback
    state.selectedSlotId = "lucky_pharaoh";
    saveState();

    fillSlotOptions();
    slotSelect.value = state.selectedSlotId;
    builderSlotSelect.value = state.selectedSlotId;
    refreshBuilderJson();
    renderTopMeta();
    renderSlotMetaPanel();

    alert("Gelöscht.");
  }

  function builderExportSlot() {
    const all = getAllSlots();
    const id = builderSlotSelect.value || state.selectedSlotId;
    const cfg = all[id];
    if (!cfg) return;

    const str = JSON.stringify(cfg, null, 2);
    copyToClipboard(str);
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

    // Always store as custom to avoid breaking built-ins
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
    renderSlotMetaPanel();

    alert("Importiert: " + obj.name + " (" + obj.id + ")");
  }

  /* -------------------------
     Extra UI
  ------------------------- */
  function renderSlotMetaPanel() {
    const slot = getSelectedSlot();
    renderTopMeta();
    // Ensure base board exists
    const grid = generateGrid(slot, "base");
    renderBoard(baseBoardEl, slot, grid);
  }

  /* -------------------------
     Events
  ------------------------- */
  spinBtn.addEventListener("click", spinBase);

  wheelBtn.addEventListener("click", () => {
    openWheelModal();
    updateWheelModalText();
  });

  closeWheelModal.addEventListener("click", closeWheelModalNow);
  spinWheelBtn.addEventListener("click", spinDailyWheel);

  slotSelect.addEventListener("change", () => {
    state.selectedSlotId = slotSelect.value;
    saveState();
    renderSlotMetaPanel();
    fillSlotOptions(); // keep builder in sync
  });

  betSelect.addEventListener("change", () => {
    state.bet = Number(betSelect.value);
    saveState();
    setStatus("Einsatz gesetzt: " + eur(state.bet));
  });

  // Power modal interactions
  closePowerModal.addEventListener("click", () => {
    // If player closes: treat as taking win
    if (pendingPower) {
      const w = pendingPower.baseWin;
      state.balance = Math.round((state.balance + w) * 100) / 100;
      saveState();
      renderBalance();
      log(`<b>Power-Spins abgelehnt:</b> Gewinn ${eur(w)} gutgeschrieben.`);
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
    log(`<b>Gewinn genommen:</b> +${eur(w)} (kein Power)`);
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

    log(`<b>Power gekauft:</b> ${spins} Spins (Kosten ${eur(spins * info.bet)})`);
    pendingPower = null;
    closePowerModalNow();
    await startPowerSpins(info, spins);
  });

  // Admin modal
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

  // Key combo: Ctrl+Alt+# (German AltGr = Ctrl+Alt + Digit3)
  window.addEventListener("keydown", (e) => {
    const ctrlAlt = e.ctrlKey && e.altKey;
    const isHash = (e.key === "#") || (e.code === "Digit3") || (e.code === "Backslash");
    if (ctrlAlt && isHash) {
      e.preventDefault();
      tryOpenAdmin();
    }
  });

  /* -------------------------
     Init
  ------------------------- */
  function initUI() {
    renderBalance();
    fillBetOptions();
    fillSlotOptions();
    renderSlotMetaPanel();
    updateWheelCooldownUI();

    // Live wheel cooldown tick
    setInterval(() => {
      updateWheelCooldownUI();
      if (!wheelModalOverlay.classList.contains("hidden")) updateWheelModalText();
    }, 1000);
  }

  initUI();

})();

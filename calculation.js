// UI state, persistence and rendering. Simulation lives in engine.js.

const STORAGE_KEY = 'tgOptimizerState';

function todayLocalISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Full ISO timestamp (UTC, hour-precision) for time-decay arithmetic.
function nowISOWithTime() {
    return new Date().toISOString();
}

// Parse an ISO date — accepts either YYYY-MM-DD (treated as midnight UTC, for
// backwards-compat with old saved entries) or a full ISO timestamp.
function parseISOToMs(iso) {
    if (!iso) return Date.now();
    if (typeof iso !== 'string') return Date.now();
    if (iso.length === 10) return Date.parse(iso + 'T00:00:00Z');
    return Date.parse(iso);
}

function defaultSavedState(todayISO) {
    // All default values live in DEFAULTS (buildings.js) — adjust them there.
    const today = todayISO || todayLocalISO();
    return {
        savedAt: today,
        form: {
            currentTG:       DEFAULTS.currentTG,
            currentTTG:      DEFAULTS.currentTTG,
            dailyIncome:     DEFAULTS.dailyIncome,
            currentSpeedUps: DEFAULTS.currentSpeedUps,
            speedUpIncome:   DEFAULTS.speedUpIncome,
        },
        buildings: JSON.parse(JSON.stringify(DEFAULTS.buildings)),
        buildTimes: Object.assign({}, DEFAULTS.buildTimes),
    };
}

function applyTimeDecay(state, todayISO) {
    const savedMs = parseISOToMs(state.savedAt);
    const nowMs = parseISOToMs(todayISO);
    const elapsedDays = Math.max(0, (nowMs - savedMs) / 86400000);
    if (elapsedDays === 0) return state;

    const MAX_MAIN = 8;
    const isMax = (b) => b.main >= MAX_MAIN && b.sub === 0;

    for (const name of BUILDINGS_ORDER) {
        const b = state.buildings[name];
        if (!b || !b.upgrading) continue;
        const buildTime = (state.buildTimes && Number.isFinite(state.buildTimes[name]) && state.buildTimes[name] > 0)
            ? state.buildTimes[name] : 1;
        let remaining = elapsedDays;

        // Finish the current in-progress upgrade, then chain through as many further
        // upgrades as the elapsed gap covers (assumes the player kept queueing upgrades).
        while (remaining >= b.daysLeft && !isMax(b)) {
            remaining -= b.daysLeft;
            if (b.sub < 4) b.sub += 1;
            else { b.main += 1; b.sub = 0; }
            if (isMax(b)) { b.upgrading = false; b.daysLeft = 0; break; }
            b.daysLeft = buildTime;
        }
        if (b.upgrading && !isMax(b)) {
            if (remaining > 0) b.daysLeft -= remaining;
            if (b.daysLeft <= 0) b.daysLeft = buildTime > 0 ? Math.min(buildTime, 1 / 24) : 0; // safety
        }
    }
    state.savedAt = todayISO || nowISOWithTime();
    return state;
}

function loadSavedState(todayISO) {
    const now = todayISO || nowISOWithTime();
    if (typeof localStorage === 'undefined') return defaultSavedState(now);
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultSavedState(now);
        const parsed = JSON.parse(raw);
        const merged = Object.assign(defaultSavedState(now), parsed);
        merged.buildings = Object.assign(defaultSavedState(now).buildings, parsed.buildings || {});
        merged.buildTimes = Object.assign({}, DEFAULT_BUILD_TIMES, parsed.buildTimes || {});
        return applyTimeDecay(merged, now);
    } catch (e) {
        return defaultSavedState(now);
    }
}

function saveState(state) {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* quota / privacy mode */ }
}

// Split a float number of days into whole days and whole hours (0-23).
function splitDH(daysFloat) {
    const totalH = Math.max(0, Math.round((Number.isFinite(daysFloat) ? daysFloat : 0) * 24));
    return { d: Math.floor(totalH / 24), h: totalH % 24 };
}

// "3d 13h" / "3d" / "13h" / "0h" for falsy.
function formatDH(daysFloat) {
    const { d, h } = splitDH(daysFloat);
    if (d && h) return `${d}d ${h}h`;
    if (d) return `${d}d`;
    return `${h}h`;
}

function formatBuildTimesSummary(buildTimes) {
    return BUILDINGS_ORDER.map(name => {
        const t = buildTimes[name];
        const label = t === 0 ? 'instant' : formatDH(t);
        return `${name}: ${label}`;
    }).join(' · ');
}

// Combine days+hours inputs into a float number of days. NaN/invalid → 0.
// Hours are clamped to 0-23 (24h is a day, not an hour value).
function readDH(dId, hId) {
    const dEl = document.getElementById(dId);
    const hEl = document.getElementById(hId);
    const d = dEl ? parseInt(dEl.value, 10) : 0;
    const h = hEl ? parseInt(hEl.value, 10) : 0;
    const dSafe = Number.isFinite(d) && d >= 0 ? d : 0;
    let hSafe = Number.isFinite(h) && h >= 0 ? h : 0;
    if (hSafe > 23) hSafe = 23;
    return dSafe + hSafe / 24;
}

function readFormState() {
    const buildings = {};
    const buildTimes = {};
    for (const name of BUILDINGS_ORDER) {
        const key = name.replace(/\s+/g, '');
        buildings[name] = {
            main: parseInt(document.getElementById(`st-${key}-main`).value, 10),
            sub:  parseInt(document.getElementById(`st-${key}-sub`).value, 10),
            upgrading: !!document.getElementById(`st-${key}-upg`)?.checked,
            daysLeft: readDH(`st-${key}-days-d`, `st-${key}-days-h`),
        };
        const btD = document.getElementById(`bt-${key}-d`);
        const btH = document.getElementById(`bt-${key}-h`);
        if (btD || btH) {
            const v = readDH(`bt-${key}-d`, `bt-${key}-h`);
            buildTimes[name] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_BUILD_TIMES[name];
        } else {
            buildTimes[name] = DEFAULT_BUILD_TIMES[name];
        }
    }
    return {
        savedAt: nowISOWithTime(),
        form: {
            currentTG: parseFloat(document.getElementById('currentTG').value),
            currentTTG: parseFloat(document.getElementById('currentTTG').value),
            dailyIncome: parseFloat(document.getElementById('dailyIncome').value),
            currentSpeedUps: readDH('currentSpeedUpsD', 'currentSpeedUpsH'),
            speedUpIncome: readDH('speedUpIncomeD', 'speedUpIncomeH'),
        },
        buildings,
        buildTimes,
    };
}

// Write a float-days value to a (days, hours) input pair.
function writeDH(dId, hId, daysFloat) {
    const { d, h } = splitDH(Number.isFinite(daysFloat) ? daysFloat : 0);
    const dEl = document.getElementById(dId);
    const hEl = document.getElementById(hId);
    if (dEl) dEl.value = d;
    if (hEl) hEl.value = h;
}

function applyStateToForm(state) {
    document.getElementById('currentTG').value = state.form.currentTG;
    document.getElementById('currentTTG').value = state.form.currentTTG;
    document.getElementById('dailyIncome').value = state.form.dailyIncome;
    writeDH('currentSpeedUpsD', 'currentSpeedUpsH',
        Number.isFinite(state.form.currentSpeedUps) ? state.form.currentSpeedUps : 0);
    writeDH('speedUpIncomeD', 'speedUpIncomeH',
        Number.isFinite(state.form.speedUpIncome) ? state.form.speedUpIncome : 1);
    for (const name of BUILDINGS_ORDER) {
        const key = name.replace(/\s+/g, '');
        const b = state.buildings[name];
        document.getElementById(`st-${key}-main`).value = b.main;
        document.getElementById(`st-${key}-sub`).value = b.sub;
        const upg = document.getElementById(`st-${key}-upg`);
        if (upg) upg.checked = !!b.upgrading;
        writeDH(`st-${key}-days-d`, `st-${key}-days-h`, b.daysLeft);
        const daysRow = document.getElementById(`st-${key}-days-wrap`);
        if (daysRow) daysRow.style.visibility = b.upgrading ? 'visible' : 'hidden';
        const bt = state.buildTimes && Number.isFinite(state.buildTimes[name])
            ? state.buildTimes[name]
            : DEFAULT_BUILD_TIMES[name];
        writeDH(`bt-${key}-d`, `bt-${key}-h`, bt);
    }
    const summary = document.getElementById('buildTimesSummary');
    if (summary) summary.textContent = formatBuildTimesSummary(state.buildTimes || DEFAULT_BUILD_TIMES);
}

// Detect a main-tier bump (e.g. completing "Town Center (6-0)" or "Embassy (7-0)").
function isMilestone(row) {
    return row.completed.some(s => /(Town Center) \(\d+-0\)/.test(s));
}

function renderHistory(history, tbody) {
    tbody.innerHTML = '';
    for (const row of history) {
        const tr = document.createElement('tr');
        const classes = [];
        if (row.weekday === 'Monday') classes.push('monday-row');
        if (row.approved) classes.push('approved-day');
        if (isMilestone(row)) classes.push('milestone-row');
        if (classes.length) tr.className = classes.join(' ');
        // An upgrade that starts and completes the same day (instant via speed-ups or a
        // 0-day build) collapses the Start/Done pair into a single "Built" pill.
        const completedSet = new Set(row.completed);
        const startedSet = new Set(row.started);
        const instant = row.started.filter(s => completedSet.has(s));
        const pureStarts = row.started.filter(s => !completedSet.has(s));
        const pureDones = row.completed.filter(c => !startedSet.has(c));
        const activeBadges = row.active && row.active.length
            ? row.active.map(a => `<span class="badge active">Active: ${a}</span>`).join(' ')
            : '';
        const instantBadges = instant.map(s => `<span class="badge instant">Built: ${s}</span>`).join(' ');
        const startBadges = pureStarts.map(s => `<span class="badge start">Start: ${s}</span>`).join(' ');
        const doneBadges = pureDones.map(c => `<span class="badge complete">Done: ${c}</span>`).join(' ');
        const acts = [activeBadges, instantBadges, startBadges, doneBadges].filter(Boolean).join(' ');
        const suBalDays = Number.isFinite(row.speedUpsFloat) ? row.speedUpsFloat : row.speedUps;
        const suBalStr = formatDH(suBalDays);
        const suCell = row.suSpent > 0
            ? `${suBalStr} <small style="color:#c0392b">(−${formatDH(row.suSpent)})</small>`
            : suBalStr;
        tr.innerHTML = `<td>${row.date}</td><td>${row.weekday}</td><td>${row.convs || '-'}</td><td>${row.tg}</td><td>${row.ttg}</td><td>${suCell}</td><td>${acts} <small>${row.notes}</small></td>`;
        tbody.appendChild(tr);
    }
}

function calculatePlan() {
    const state = readFormState();
    saveState(state);
    const summaryEl = document.getElementById('buildTimesSummary');
    if (summaryEl) summaryEl.textContent = formatBuildTimesSummary(state.buildTimes || DEFAULT_BUILD_TIMES);

    const { currentTG: cTG, currentTTG: cTTG, dailyIncome: dIncome,
            currentSpeedUps: cSU, speedUpIncome: suInc } = state.form;
    const startISO = todayLocalISO();

    const summaryBar = document.getElementById('summaryBar');
    const finishEl = document.getElementById('finishDate');
    const spendEl = document.getElementById('totalSpend');
    const errorEl = document.getElementById('errorMsg');
    const tbody = document.getElementById('planBody');

    const errors = [];
    if (!Number.isFinite(cTG) || cTG < 0) errors.push('Current TG must be a non-negative number');
    if (!Number.isFinite(cTTG) || cTTG < 0) errors.push('Current TTG must be a non-negative number');
    if (!Number.isFinite(dIncome) || dIncome < 0) errors.push('Daily Income must be a non-negative number');
    if (!Number.isFinite(cSU) || cSU < 0) errors.push('Current Speed-ups must be a non-negative number');
    if (!Number.isFinite(suInc) || suInc < 0) errors.push('Speed-up Income must be a non-negative number');

    summaryBar.style.display = 'flex';

    const clearSummary = (msg) => {
        errorEl.textContent = msg;
        errorEl.style.display = msg ? 'inline' : 'none';
    };

    // Validation errors: show a banner but KEEP the last good plan rendered so a brief
    // mid-typing empty state doesn't wipe the table.
    if (errors.length) { clearSummary(errors.join(' · ')); return; }
    tbody.innerHTML = '';

    const queueWithTimes = applyBuildTimes(UPGRADE_QUEUE, state.buildTimes);
    const filteredQueue = filterQueueForState(queueWithTimes, state.buildings);
    const preActive = extractPreActiveBuilders(filteredQueue, state.buildings);
    // The user enters daysLeft as "time remaining from now", but the simulator
    // ticks calendar days starting at midnight today. Shift remainingDays forward
    // by the fraction of today already elapsed so completion lands on the right
    // calendar day (e.g. typing 5d 22h at 13:39 should finish Friday, not Thu).
    const now = new Date();
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const elapsedTodayDays = (now - midnight) / 86400000;
    for (const b of preActive) {
        b.remainingDays += elapsedTodayDays;
    }
    const initialState = {
        tcMainTier: state.buildings['Town Center'].main,
        embassyMainTier: state.buildings['Embassy'].main,
        preActiveBuilders: preActive,
    };

    let res;
    try {
        res = solveUpgradePath(cTG, cTTG, dIncome, filteredQueue, startISO, initialState, cSU, suInc);
    } catch (err) {
        clearSummary(`Simulation failed: ${err.message}`);
        return;
    }
    clearSummary('');

    if (!res.history.length) {
        finishEl.textContent = 'No upgrades remaining.';
        spendEl.textContent = '';
        return;
    }

    const last = res.history[res.history.length - 1];
    const finishFull = new Date(last.dateISO + 'T00:00:00Z').toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
    if (res.truncated) {
        finishEl.innerHTML = `Plan too long — showing first <b>${res.history.length}</b> days (up to ${finishFull}). Increase income or reduce queue.`;
    } else {
        finishEl.innerHTML = `Finish: <b>${finishFull}</b>`;
    }
    const totalTG = Math.floor(res.refineTGSpent + res.upgradeTGSpent);
    const totalTTG = Math.floor(res.upgradeTTGSpent);
    spendEl.innerHTML =
        `Spent: <b>${totalTG}</b>&nbsp;<img class="icon" src="TG.webp" alt="">TG · ` +
        `<b>${totalTTG}</b>&nbsp;<img class="icon" src="TTG.webp" alt="">TTG · ` +
        `<b>${res.speedUpsSpent}</b>&nbsp;SU`;

    renderHistory(res.history, tbody);
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const nowISO = nowISOWithTime();
        const hasSaved = typeof localStorage !== 'undefined' && !!localStorage.getItem(STORAGE_KEY);
        const state = loadSavedState(nowISO);
        applyStateToForm(state);
        saveState(state);

        const pane = document.getElementById('statePane');
        if (pane) pane.open = !hasSaved;
        const infoPane = document.getElementById('infoPane');
        if (infoPane) infoPane.open = !hasSaved;

        let pendingTimer = null;
        const scheduleRecalc = (ev) => {
            if (pendingTimer) clearTimeout(pendingTimer);
            pendingTimer = setTimeout(() => {
                pendingTimer = null;
                const s = readFormState();
                saveState(s);
                // Mid-edit `input` events on number fields should not rewrite the field
                // (would interrupt typing). On `change` (blur / Enter) we DO rewrite, so
                // out-of-range hour entries (e.g. 25) snap back to the clamped value.
                const target = ev && ev.target;
                const isMidTypeNumber = target && target.type === 'number' && ev.type === 'input';
                if (!isMidTypeNumber) applyStateToForm(s);
                calculatePlan();
            }, 150);
        };
        document.querySelectorAll('.persist').forEach(el => {
            el.addEventListener('input', scheduleRecalc);
            el.addEventListener('change', scheduleRecalc);
        });

        // Enter on any input triggers form submit — still run a recalc for that flow.
        const form = document.getElementById('calcForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                calculatePlan();
            });
        }

        // Run an initial calculation so the user sees a plan on first load.
        calculatePlan();

        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) resetBtn.addEventListener('click', () => {
            if (!confirm('Reset all saved settings to defaults?')) return;
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
            location.reload();
        });
    });
}

if (typeof module !== 'undefined') {
    module.exports = {
        STORAGE_KEY, defaultSavedState, loadSavedState, saveState,
        applyTimeDecay, formatBuildTimesSummary, todayLocalISO, nowISOWithTime,
        parseISOToMs, isMilestone, splitDH, formatDH,
    };
}

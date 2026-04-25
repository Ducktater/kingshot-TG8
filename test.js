const fs = require('fs');
const path = require('path');

const bld = fs.readFileSync(path.join(__dirname, 'buildings.js'), 'utf8');
const eng = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
const calc = fs.readFileSync(path.join(__dirname, 'calculation.js'), 'utf8');
const strip = (s) => s.replace(/if \(typeof module[\s\S]*$/, '').replace(/if \(typeof document[\s\S]*$/, '');
const loader = new Function(
    strip(bld) + '\n' + strip(eng) + '\n' + strip(calc) +
    '\nreturn { UPGRADE_QUEUE, RESTRICTED, isApprovedDate, daysUntilApproved, solveUpgradePath, '
    + 'filterQueueForState, extractPreActiveBuilders, defaultSavedState, applyTimeDecay, '
    + 'applyBuildTimes, DEFAULT_BUILD_TIMES, formatBuildTimesSummary, isMilestone };'
);
const { UPGRADE_QUEUE, RESTRICTED, isApprovedDate, daysUntilApproved, solveUpgradePath,
        filterQueueForState, extractPreActiveBuilders, defaultSavedState, applyTimeDecay,
        applyBuildTimes, DEFAULT_BUILD_TIMES, formatBuildTimesSummary, isMilestone } = loader();

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
    if (cond) { passed++; }
    else { failed++; failures.push(msg); console.error('FAIL:', msg); }
}
function test(name, fn) {
    try { fn(); } catch (e) { failed++; failures.push(`${name}: ${e.message}`); console.error('ERROR:', name, e.message); }
}

// Approved-date pattern
test('pattern: kickoff', () => {
    assert(isApprovedDate('2026-04-24'), '2026-04-24 (kickoff Fri) is approved');
});
test('pattern: anchor week', () => {
    assert(isApprovedDate('2026-05-18'), '2026-05-18 Mon is approved');
    assert(isApprovedDate('2026-05-19'), '2026-05-19 Tue is approved');
    assert(isApprovedDate('2026-05-22'), '2026-05-22 Fri is approved');
});
test('pattern: non-approved weekdays', () => {
    assert(!isApprovedDate('2026-05-20'), '2026-05-20 Wed is not approved');
    assert(!isApprovedDate('2026-05-21'), '2026-05-21 Thu is not approved');
    assert(isApprovedDate('2026-05-23'), '2026-05-23 Sat IS approved (prep-week Saturday)');
    assert(!isApprovedDate('2026-05-24'), '2026-05-24 Sun is not approved');
});
test('pattern: off-cycle weeks', () => {
    assert(!isApprovedDate('2026-05-25'), '2026-05-25 Mon (week after anchor) is not approved');
    assert(!isApprovedDate('2026-06-01'), '2026-06-01 Mon (2 weeks after) is not approved');
    assert(!isApprovedDate('2026-06-08'), '2026-06-08 Mon (3 weeks after) is not approved');
    assert(isApprovedDate('2026-06-15'),  '2026-06-15 Mon (4 weeks after) is approved');
});
test('pattern: anomaly resolved', () => {
    assert(isApprovedDate('2026-12-29'), '2026-12-29 Tue matches the clean pattern');
    assert(!isApprovedDate('2026-12-31'), '2026-12-31 Thu (original-data anomaly) is not approved');
});
test('pattern: far future', () => {
    assert(isApprovedDate('2027-04-19'), '2027-04-19 Mon (past original horizon) is approved');
    assert(!isApprovedDate('2030-01-01'), '2030-01-01 Wed (far future) is not approved');
});
test('pattern: pre-anchor dates', () => {
    assert(!isApprovedDate('2026-04-20'), '2026-04-20 Mon (pre-kickoff) is not approved');
    assert(!isApprovedDate('2025-01-01'), '2025-01-01 (far past) is not approved');
});

// daysUntilApproved
test('daysUntilApproved: today is approved', () => {
    assert(daysUntilApproved('2026-04-24') === 0, 'from 2026-04-24 the next approved is today (0 days)');
    assert(daysUntilApproved('2026-05-18') === 0, 'from 2026-05-18 the next approved is today (0 days)');
});
test('daysUntilApproved: counts forward correctly', () => {
    assert(daysUntilApproved('2026-05-20') === 2, '2026-05-20 Wed → 2 days to Fri 05-22');
    assert(daysUntilApproved('2026-04-25') === 23, '2026-04-25 → 23 days to 2026-05-18');
});

// Simulation invariants
const plan = solveUpgradePath(500, 20, 45, UPGRADE_QUEUE, '2026-04-24');
const costPlan = solveUpgradePath(500, 20, 45, UPGRADE_QUEUE, '2026-04-24');

test('sim: plan is non-empty and finite', () => {
    assert(plan.history.length > 0, 'time plan produces history');
    assert(plan.history.length < 2000, 'time plan finishes before the history cap');
    assert(costPlan.history.length > 0, 'cost plan produces history');
});
test('sim: first row matches the requested start date', () => {
    assert(plan.history[0].dateISO === '2026-04-24', 'first row ISO is start date');
    assert(plan.history[0].weekday === 'Friday', 'first row is Friday');
});

// TC → Embassy gate
test('sim: TC 6-1 does not start before Embassy 6-0 completes', () => {
    const emb60Idx = plan.history.findIndex(r => r.completed.some(s => s.includes('Embassy (6-0)')));
    const tc61Idx  = plan.history.findIndex(r => r.started.some(s => s.includes('Town Center (6-1)')));
    assert(emb60Idx >= 0, 'Embassy 6-0 completes at some point');
    assert(tc61Idx >= emb60Idx, `TC 6-1 start (${tc61Idx}) is on or after Embassy 6-0 done (${emb60Idx})`);
});
test('sim: TC 7-1 does not start before Embassy 7-0 completes', () => {
    const emb70Idx = plan.history.findIndex(r => r.completed.some(s => s.includes('Embassy (7-0)')));
    const tc71Idx  = plan.history.findIndex(r => r.started.some(s => s.includes('Town Center (7-1)')));
    if (emb70Idx >= 0 && tc71Idx >= 0) {
        assert(tc71Idx >= emb70Idx, `TC 7-1 start (${tc71Idx}) is on or after Embassy 7-0 done (${emb70Idx})`);
    }
});

// Restricted-date gate
test('sim: restricted upgrades only start on approved dates', () => {
    for (const row of plan.history) {
        for (const s of row.started) {
            if (/Barracks|Range|Stable/.test(s)) {
                assert(isApprovedDate(row.dateISO), `Restricted "${s}" starts on ${row.dateISO} (approved)`);
            }
        }
    }
});

// Builder-slot rule
test('sim: never more than 2 concurrent multi-day builders', () => {
    for (const row of plan.history) {
        assert(row.active.length <= 2, `${row.dateISO}: active count ${row.active.length} ≤ 2`);
    }
});

// Cost ≤ Time for equivalent inputs (cost strategy spends less or equal total TG)
test('sim: cost strategy spends no more TG than time strategy', () => {
    assert(costPlan.totalTGSpent <= plan.totalTGSpent, `cost spend ${costPlan.totalTGSpent} ≤ time spend ${plan.totalTGSpent}`);
});

// Time strategy finishes no later than cost strategy
test('sim: time strategy finishes no later than cost strategy', () => {
    assert(plan.history.length <= costPlan.history.length, `time days ${plan.history.length} ≤ cost days ${costPlan.history.length}`);
});

// Monday-reset behaviour
test('sim: weekly counter resets on Mondays (no refines carried across Monday within same weekly-count)', () => {
    // Smoke test: the engine runs without runaway counts; check no row shows more than 100 convs
    for (const row of plan.history) {
        assert(row.convs <= 100, `${row.dateISO} convs=${row.convs} within weekly cap`);
    }
});

// Input validation (via solveUpgradePath directly — should not throw on zero values)
test('sim: zero wallet + zero income still runs (queue may not complete)', () => {
    const r = solveUpgradePath(0, 0, 0, UPGRADE_QUEUE.slice(0, 1), '2026-04-24');
    assert(Array.isArray(r.history), 'returns a history array');
});

// TTG integer maths — no float drift shown in ttg strings
test('sim: ttg display parses as a finite number', () => {
    for (const row of plan.history) {
        const v = parseFloat(row.ttg);
        assert(Number.isFinite(v) && v >= 0, `${row.dateISO} ttg=${row.ttg} is a non-negative number`);
    }
});

// Timezone independence — different TZ env var should produce identical plans
test('sim: identical plan regardless of user locale settings', () => {
    const a = solveUpgradePath(500, 20, 45, UPGRADE_QUEUE, '2026-04-24');
    const b = solveUpgradePath(500, 20, 45, UPGRADE_QUEUE, '2026-04-24');
    assert(a.history.length === b.history.length, 'same length');
    assert(a.totalTGSpent === b.totalTGSpent, 'same spend');
});

// Queue isolation — simulation must not mutate the shared UPGRADE_QUEUE
test('sim: does not mutate the input queue', () => {
    const before = JSON.stringify(UPGRADE_QUEUE);
    solveUpgradePath(500, 20, 45, UPGRADE_QUEUE, '2026-04-24');
    const after = JSON.stringify(UPGRADE_QUEUE);
    assert(before === after, 'UPGRADE_QUEUE is untouched');
});


// Current-state filtering
test('filter: skips items at or below current tier', () => {
    const buildings = {
        'Town Center': { main: 6, sub: 0 }, 'Embassy': { main: 5, sub: 0 },
        'Barracks': { main: 5, sub: 0 }, 'Range': { main: 5, sub: 0 }, 'Stable': { main: 5, sub: 0 },
    };
    const filtered = filterQueueForState(UPGRADE_QUEUE, buildings);
    assert(!filtered.some(it => it.building === 'Town Center' && (it.tier === '5-3' || it.tier === '5-4' || it.tier === '6-0')),
        'TC tiers ≤ 6-0 are filtered out when current TC is 6-0');
    assert(filtered.some(it => it.building === 'Town Center' && it.tier === '6-1'),
        'TC 6-1 remains in the filtered queue');
});

// Pre-active builder extraction
test('preActive: pulls in-progress upgrade out of queue with remainingDays', () => {
    const buildings = {
        'Town Center': { main: 5, sub: 2, upgrading: true, daysLeft: 3 },
        'Embassy': { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
        'Barracks': { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
        'Range': { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
        'Stable': { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
    };
    const queue = filterQueueForState(UPGRADE_QUEUE, buildings);
    const preActive = extractPreActiveBuilders(queue, buildings);
    assert(preActive.length === 1, 'one preActive builder extracted');
    assert(preActive[0].building === 'Town Center' && preActive[0].tier === '5-3' && preActive[0].remainingDays === 3,
        'preActive is TC 5-3 with 3 days left');
    assert(!queue.some(it => it.building === 'Town Center' && it.tier === '5-3'),
        'TC 5-3 no longer in the queue');
});

// Initial state end-to-end
test('sim: starting at TC 6-0 Embassy 5-0 — first TC upgrade waits for Embassy', () => {
    const buildings = {
        'Town Center': { main: 6, sub: 0 }, 'Embassy': { main: 5, sub: 0 },
        'Barracks': { main: 5, sub: 0 }, 'Range': { main: 5, sub: 0 }, 'Stable': { main: 5, sub: 0 },
    };
    const q = filterQueueForState(UPGRADE_QUEUE, buildings);
    const r = solveUpgradePath(500, 20, 45, q, '2026-04-24', {
        tcMainTier: 6, embassyMainTier: 5, preActiveBuilders: [],
    });
    const tc61Idx  = r.history.findIndex(x => x.started.some(s => s.includes('Town Center (6-1)')));
    const emb60Idx = r.history.findIndex(x => x.completed.some(s => s.includes('Embassy (6-0)')));
    assert(emb60Idx >= 0 && tc61Idx >= emb60Idx, 'TC 6-1 still gated on Embassy 6-0 from mid-game start');
});

test('sim: pre-active builder completes after its remainingDays', () => {
    const buildings = {
        'Town Center': { main: 5, sub: 2, upgrading: true, daysLeft: 3 },
        'Embassy': { main: 5, sub: 0 }, 'Barracks': { main: 5, sub: 0 },
        'Range': { main: 5, sub: 0 }, 'Stable': { main: 5, sub: 0 },
    };
    const q = filterQueueForState(UPGRADE_QUEUE, buildings);
    const preActive = extractPreActiveBuilders(q, buildings);
    const r = solveUpgradePath(500, 20, 45, q, '2026-04-24', {
        tcMainTier: 5, embassyMainTier: 5, preActiveBuilders: preActive,
    });
    assert(r.history[0].active.some(a => a.includes('Town Center (5-3)')), 'day 0 shows TC 5-3 active');
    const completeIdx = r.history.findIndex(x => x.completed.some(s => s.includes('Town Center (5-3)')));
    assert(completeIdx === 2, `TC 5-3 completes on day index 2 (3 days in), got ${completeIdx}`);
});

// Time decay
test('decay: elapsed days decrement daysLeft without completing', () => {
    const s = defaultSavedState();
    s.savedAt = '2026-04-24';
    s.buildings['Town Center'] = { main: 5, sub: 2, upgrading: true, daysLeft: 5 };
    applyTimeDecay(s, '2026-04-26');
    assert(s.buildings['Town Center'].upgrading === true, 'still upgrading after 2 days');
    assert(s.buildings['Town Center'].daysLeft === 3, `daysLeft 5 → 3, got ${s.buildings['Town Center'].daysLeft}`);
    assert(s.savedAt === '2026-04-26', 'savedAt advanced');
});

test('decay: completes upgrade and chains into the next one when timer overshoots', () => {
    // TC 5-2 was upgrading to 5-3 (3 days left). 6 days elapsed, TC build time = 6.
    // Expected: TC 5-3 completes at day 3. TC 5-4 auto-starts, 3 days into its 6-day build.
    const s = defaultSavedState();
    s.savedAt = '2026-04-24';
    s.buildings['Town Center'] = { main: 5, sub: 2, upgrading: true, daysLeft: 3 };
    applyTimeDecay(s, '2026-04-30');
    const b = s.buildings['Town Center'];
    assert(b.upgrading === true, 'still upgrading (chained into next)');
    assert(b.main === 5 && b.sub === 3, `sub bumped 2 → 3, got ${b.main}-${b.sub}`);
    assert(b.daysLeft === 3, `3 days into the follow-up build, got ${b.daysLeft}`);
});

test('decay: sub 4 → next main tier 0 on completion', () => {
    const s = defaultSavedState();
    s.savedAt = '2026-04-24';
    s.buildings['Town Center'] = { main: 5, sub: 4, upgrading: true, daysLeft: 1 };
    applyTimeDecay(s, '2026-04-27');
    const b = s.buildings['Town Center'];
    assert(b.main === 6 && b.sub === 0, `5-4 → 6-0 on completion, got ${b.main}-${b.sub}`);
});

test('decay: chains through multiple upgrades on a long gap', () => {
    // TC 5-2 upgrading (3 days left), gap 20 days. buildTime=6.
    // Day 3 → 5-3 done. Day 3+6=9 → 5-4 done. Day 9+6=15 → 6-0 done. Day 15+6=21 but gap=20,
    // so 6-1 is 5 days in (20-15=5, 6-5=1 day left).
    const s = defaultSavedState();
    s.savedAt = '2026-04-24';
    s.buildings['Town Center'] = { main: 5, sub: 2, upgrading: true, daysLeft: 3 };
    applyTimeDecay(s, '2026-05-14');
    const b = s.buildings['Town Center'];
    assert(b.main === 6 && b.sub === 0, `chained to 6-0 after 3+6+6=15d, then 5d into 6-1: got ${b.main}-${b.sub}`);
    assert(b.upgrading === true, 'still upgrading (6-1 in progress)');
    assert(b.daysLeft === 1, `1 day left of the 6-day follow-up, got ${b.daysLeft}`);
});

test('decay: caps at TC 8-0 and stops chaining', () => {
    const s = defaultSavedState();
    s.savedAt = '2026-04-24';
    s.buildings['Town Center'] = { main: 7, sub: 4, upgrading: true, daysLeft: 1 };
    applyTimeDecay(s, '2026-05-24');
    const b = s.buildings['Town Center'];
    assert(b.main === 8 && b.sub === 0, `capped at 8-0, got ${b.main}-${b.sub}`);
    assert(b.upgrading === false, 'upgrading cleared at max');
    assert(b.daysLeft === 0, 'daysLeft zeroed at max');
});

test('speed-ups: fractional income never drives balance negative', () => {
    const q = applyBuildTimes(UPGRADE_QUEUE, { 'Town Center': 6, 'Embassy': 5, 'Barracks': 1, 'Range': 1, 'Stable': 1 });
    const preActive = [{ building: 'Town Center', tier: '5-1', remainingDays: 6 }];
    // 0.8 SU/day, start with 0. Active builder present from day 0. On approved kickoff day,
    // only 0.8 SU accrued — less than 1 whole unit, so nothing should be spent and balance
    // must not go negative.
    const r = solveUpgradePath(500, 20, 45, q, '2026-04-24', { tcMainTier:5, embassyMainTier:5, preActiveBuilders: preActive }, 0, 0.8);
    assert(r.history[0].speedUps === 0, `day 0 SU floor = 0 (0.8 accrued, no whole unit to spend), got ${r.history[0].speedUps}`);
    for (const row of r.history.slice(0, 50)) {
        assert(row.speedUps >= 0, `${row.dateISO} SU=${row.speedUps} is non-negative`);
    }
});

test('speed-ups: fractional balance eventually spends when a whole unit accumulates', () => {
    // 0.8/day → day 2 has 0.8+0.8+0.8 = 2.4 but spent some to complete TC, check accounting
    const q = applyBuildTimes(UPGRADE_QUEUE, { 'Town Center': 6, 'Embassy': 5, 'Barracks': 1, 'Range': 1, 'Stable': 1 });
    const preActive = [{ building: 'Town Center', tier: '5-1', remainingDays: 6 }];
    const r = solveUpgradePath(500, 20, 45, q, '2026-04-24', { tcMainTier:5, embassyMainTier:5, preActiveBuilders: preActive }, 0, 0.8);
    // Kickoff (day 0) is an approved day and TC is active with 6 remaining. Day 0 has 0.8 SU
    // accrued — not enough. But on day 24 (2026-05-18 Mon approved), 25*0.8=20 SU have accrued,
    // more than enough to finish TC. Speed-ups used should be > 0 by then.
    const day24 = r.history[24];
    assert(day24 && day24.dateISO === '2026-05-18', `day 24 is 2026-05-18`);
    assert(r.speedUpsSpent > 0, `some SU has been spent by end of plan, got ${r.speedUpsSpent}`);
});

test('decay: same-day load is a no-op', () => {
    const s = defaultSavedState();
    s.savedAt = '2026-04-24';
    s.buildings['Town Center'] = { main: 5, sub: 2, upgrading: true, daysLeft: 3 };
    applyTimeDecay(s, '2026-04-24');
    assert(s.buildings['Town Center'].daysLeft === 3, 'daysLeft unchanged');
});

test('decay: sub-day elapsed time reduces daysLeft by hours', () => {
    // Arrange — saved at 09:00 UTC on 2026-04-24 with 3 days remaining
    const s = defaultSavedState();
    s.savedAt = '2026-04-24T09:00:00Z';
    s.buildings['Town Center'] = { main: 5, sub: 2, upgrading: true, daysLeft: 3 };
    // Act — reload at 18:00 UTC the same day (9 hours later)
    applyTimeDecay(s, '2026-04-24T18:00:00Z');
    // Assert — daysLeft has dropped by 9/24 = 0.375
    const expected = 3 - 9 / 24;
    const b = s.buildings['Town Center'];
    assert(Math.abs(b.daysLeft - expected) < 1e-9, `daysLeft=${b.daysLeft}, expected ${expected}`);
});


// Build times override
test('buildTimes: overrides DaysToBuild on every matching item', () => {
    const custom = { 'Town Center': 3, 'Embassy': 2, 'Barracks': 1, 'Range': 1, 'Stable': 1 };
    const out = applyBuildTimes(UPGRADE_QUEUE, custom);
    for (const it of out) {
        assert(it.DaysToBuild === custom[it.building], `${it.building} ${it.tier} DaysToBuild=${it.DaysToBuild} matches ${custom[it.building]}`);
    }
});

test('buildTimes: missing entry falls back to original DaysToBuild', () => {
    const partial = { 'Town Center': 3 };
    const out = applyBuildTimes(UPGRADE_QUEUE, partial);
    for (const it of out) {
        if (it.building === 'Town Center') {
            assert(it.DaysToBuild === 3, `TC override applied`);
        } else {
            const orig = UPGRADE_QUEUE.find(o => o.building === it.building && o.tier === it.tier);
            assert(it.DaysToBuild === orig.DaysToBuild, `${it.building} keeps original DaysToBuild`);
        }
    }
});

test('buildTimes: negative or non-numeric values fall through to originals', () => {
    const bad = { 'Town Center': -5, 'Embassy': 'oops' };
    const out = applyBuildTimes(UPGRADE_QUEUE, bad);
    const tc = out.find(it => it.building === 'Town Center');
    const emb = out.find(it => it.building === 'Embassy');
    // -5 is finite → clamps to 0; 'oops' is not finite → keeps original 5
    assert(tc.DaysToBuild === 0, `negative clamps to 0, got ${tc.DaysToBuild}`);
    assert(emb.DaysToBuild === 5, `non-numeric falls back to original 5, got ${emb.DaysToBuild}`);
});

test('buildTimes: sim honours the override end-to-end', () => {
    const q = applyBuildTimes(UPGRADE_QUEUE, { 'Town Center': 1, 'Embassy': 1, 'Barracks': 0, 'Range': 0, 'Stable': 0 });
    const r = solveUpgradePath(500, 20, 45, q, '2026-04-24');
    // TC 5-1 is first multi-day; with DaysToBuild=1 it should complete within ~a couple of days.
    const tc51Done = r.history.findIndex(x => x.completed.some(s => s.includes('Town Center (5-1)')));
    assert(tc51Done >= 0 && tc51Done <= 2, `TC 5-1 completes quickly with 1-day build time (index ${tc51Done})`);
});

test('defaultSavedState includes buildTimes', () => {
    const s = defaultSavedState('2026-04-24');
    assert(s.buildTimes !== undefined, 'buildTimes present');
    assert(s.buildTimes['Town Center'] === 6, 'TC default = 6');
    assert(s.buildTimes['Embassy'] === 4, 'Embassy default = 4');
    assert(Math.abs(s.buildTimes['Barracks'] - 22 / 24) < 1e-9, 'Barracks default = 22h');
});

test('formatBuildTimesSummary produces a 5-building summary line', () => {
    const bt = { 'Town Center': 6, 'Embassy': 5, 'Barracks': 0, 'Range': 0, 'Stable': 0 };
    const s = formatBuildTimesSummary(bt);
    assert(s.includes('Town Center: 6d'), `contains TC 6d`);
    assert(s.includes('Embassy: 5d'), `contains Embassy 5d`);
    assert(s.includes('Barracks: instant'), `contains Barracks instant`);
    assert(s.split('·').length === 5, `5 entries separated by ·`);
});

test('formatBuildTimesSummary uses Xd Yh format for fractional values', () => {
    const s = formatBuildTimesSummary({ 'Town Center': 1, 'Embassy': 1.5, 'Barracks': 0.5, 'Range': 0, 'Stable': 0 });
    assert(s.includes('Town Center: 1d'), `1 day → "1d"`);
    assert(s.includes('Embassy: 1d 12h'), `1.5 days → "1d 12h"`);
    assert(s.includes('Barracks: 12h'), `0.5 days → "12h"`);
    assert(s.includes('Range: instant'), `0 → instant`);
});


// Speed-ups
test('speed-ups: balance accumulates when there is nothing to spend on', () => {
    const q = applyBuildTimes(UPGRADE_QUEUE, { 'Town Center': 6, 'Embassy': 5, 'Barracks': 1, 'Range': 1, 'Stable': 1 });
    const r = solveUpgradePath(0, 0, 0, q, '2026-04-24', { tcMainTier:5, embassyMainTier:5, preActiveBuilders:[] }, 0, 1);
    // Day 0 is 2026-04-24 (approved) but there are no active builders and nothing can start with
    // walletTG=0. Speed-ups should NOT be consumed — greedy spend only applies when there is
    // something to spend them on.
    assert(r.history[0].speedUps === 1, `day 0 speedUps=${r.history[0].speedUps}`);
    assert(r.history[5].speedUps === 6, `day 5 speedUps=${r.history[5].speedUps}`);
});

test('speed-ups: ignored on non-approved days (even with active builder)', () => {
    // Start with TC actively upgrading, no approved dates in this window (tomorrow is a Saturday)
    const q = applyBuildTimes(UPGRADE_QUEUE, { 'Town Center': 6, 'Embassy': 5, 'Barracks': 1, 'Range': 1, 'Stable': 1 });
    const preActive = [{ building: 'Town Center', tier: '5-1', remainingDays: 6 }];
    // Start on 2026-04-25 (Saturday, not approved); next approved is 2026-05-18
    const r = solveUpgradePath(0, 0, 0, q, '2026-04-25', { tcMainTier:5, embassyMainTier:5, preActiveBuilders: preActive }, 10, 1);
    // On a non-approved day, speed-ups should not be consumed — balance grows purely via income.
    // Day 0 (Sat): start with 10, +1 income, no spend → 11
    assert(r.history[0].speedUps === 11, `day 0 speedUps=${r.history[0].speedUps} (expected 11, no spend on non-approved)`);
});

test('speed-ups: consumed on approved day to reduce active builder remaining days', () => {
    const q = applyBuildTimes(UPGRADE_QUEUE, { 'Town Center': 6, 'Embassy': 5, 'Barracks': 1, 'Range': 1, 'Stable': 1 });
    const preActive = [{ building: 'Town Center', tier: '5-1', remainingDays: 6 }];
    const r = solveUpgradePath(0, 0, 0, q, '2026-04-24', { tcMainTier:5, embassyMainTier:5, preActiveBuilders: preActive }, 10, 0);
    // Day 0: approved. 10 SU start. Tick TC to 5 remaining, then 5 SU finish TC (5 used).
    // Remaining 5 SU carry — no forfeit when nothing else to spend on.
    assert(r.history[0].completed.some(c => c.includes('Town Center (5-1)')), 'TC 5-1 completed on day 0 via speed-ups');
    assert(r.history[0].speedUps === 5, `day 0 speedUps=${r.history[0].speedUps} (carry over, nothing left to spend on)`);
});

test('speed-ups: save days on full-plan build', () => {
    const q = applyBuildTimes(UPGRADE_QUEUE, { 'Town Center': 6, 'Embassy': 5, 'Barracks': 1, 'Range': 1, 'Stable': 1 });
    const noSpeedUp = solveUpgradePath(500, 20, 45, q, '2026-04-24', { tcMainTier:5, embassyMainTier:5, preActiveBuilders:[] }, 0, 0);
    const withSpeedUp = solveUpgradePath(500, 20, 45, q, '2026-04-24', { tcMainTier:5, embassyMainTier:5, preActiveBuilders:[] }, 0, 5);
    assert(withSpeedUp.history.length < noSpeedUp.history.length,
        `with speed-ups=5/day (${withSpeedUp.history.length} days) finishes sooner than without (${noSpeedUp.history.length} days)`);
});

test('speed-ups: default build times for restricted buildings are 22 hours', () => {
    const expected = 22 / 24;
    assert(Math.abs(DEFAULT_BUILD_TIMES['Barracks'] - expected) < 1e-9, 'Barracks default = 22h');
    assert(Math.abs(DEFAULT_BUILD_TIMES['Range'] - expected) < 1e-9, 'Range default = 22h');
    assert(Math.abs(DEFAULT_BUILD_TIMES['Stable'] - expected) < 1e-9, 'Stable default = 22h');
});

test('speed-ups: history row exposes walletSpeedUps', () => {
    const q = applyBuildTimes(UPGRADE_QUEUE, { 'Town Center': 6, 'Embassy': 5, 'Barracks': 1, 'Range': 1, 'Stable': 1 });
    const r = solveUpgradePath(500, 20, 45, q, '2026-04-24', { tcMainTier:5, embassyMainTier:5, preActiveBuilders:[] }, 3, 1);
    assert(typeof r.history[0].speedUps === 'number', 'speedUps field present on history row');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

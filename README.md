# TG Optimizer

A single-page planner that estimates the fastest path to **Town Center 8** (and maxing out Barracks / Range / Stable along the way) for a Rise of Kingdoms-style city. It simulates day by day, handles a KvK prep-week approved-date cadence, refining mechanics and speed-ups, and renders an activity table with per-day balances.

The whole app is static (HTML + JS + two webp icons) and runs from any HTTP server. No build step, no dependencies.

---

## Terminology

| Name | Meaning |
|------|---------|
| **Truegold** (`TG`) | Primary currency. Earned as daily income, spent on upgrades and refines. |
| **Tempered Truegold** (`TTG`) | Secondary resource. Produced by refining TG. Required alongside TG for every upgrade. |
| **Speed-up** (`SU`) | Third currency measured in days. Removes 1 day of remaining build time per unit. Consumed only on approved dates. |
| **Approved date** | A day in KvK prep-week. Points are earned by spending TG/TTG/SU on these days. Restricted buildings can only start on these days. |
| **KvK prep week** | The week containing approved dates. |
| **Restricted buildings** | Barracks, Range, Stable. Upgrades can only start on approved dates. |
| **Main / Sub tier** | Every building's level is `main-sub`, e.g. `6-3`. Crossovers `(N+1)-0` progress the main tier. |

---

## File map

| File | Purpose |
|------|---------|
| `index.html` | Markup, styles, inline DOM-building for the Current Building State and Build Times panes. |
| `buildings.js` | Static data: `UPGRADE_QUEUE` (every upgrade with TG/TTG costs and base DaysToBuild), `RESTRICTED` list, `DEFAULTS` (single source of truth for initial values), the approved-date pattern (`isApprovedDate`, `daysUntilApproved`, `isLastApprovedDayOfWeek`). |
| `engine.js` | Pure simulation: `solveUpgradePath`, queue transforms (`applyBuildTimes`, `filterQueueForState`, `extractPreActiveBuilders`), and the `TIERS` table for refining economy. |
| `calculation.js` | UI/state glue: localStorage (`loadSavedState`, `saveState`, `applyTimeDecay`), form I/O (`readFormState`, `applyStateToForm`), and plan rendering (`calculatePlan`, `renderHistory`). |
| `test.js` | Node-executable test harness (1174 assertions). Run with `node test.js`. |
| `TG.webp`, `TTG.webp` | Icons used near inputs, table headers and summary bar. |

---

## All defaults live in one place

Inside `buildings.js` there is a `DEFAULTS` object — edit that single block to change the app's initial state (wallet values, daily income, starting building tiers, build times). Do **not** hard-code defaults elsewhere; `engine.js` aliases `DEFAULT_BUILD_TIMES = DEFAULTS.buildTimes`, and `calculation.js` reads every other default from `DEFAULTS` on first load.

```js
const DEFAULTS = {
    currentTG:       500,
    currentTTG:      20,
    currentSpeedUps: 0,
    dailyIncome:     45,
    speedUpIncome:   1,

    buildings: {   // main/sub tier + in-progress state per building
        'Town Center': { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
        ...
    },

    buildTimes: {   // days per upgrade, per building
        'Town Center': 6, 'Embassy': 5, 'Barracks': 1, 'Range': 1, 'Stable': 1,
    },
};
```

---

## Rules

### Queue & builder slots
- The upgrade queue is a fixed ordered list in `UPGRADE_QUEUE`. For each building only its **first pending item** is ever eligible to start.
- **One active upgrade per building** at any moment.
- **Max two concurrent multi-day upgrades** (`MAX_BUILDERS = 2`). Instant upgrades (DaysToBuild 0) do not count. With the default `buildTimes` everything has DaysToBuild ≥ 1, so every start consumes a slot.

### Tier gates
- **TC → Embassy gate.** Town Center cannot start any upgrade while `embassyMainTier < tcMainTier`. Once TC reaches main tier N, it is frozen at N-anything until Embassy also reaches N-0.
- **Non-TC → TC gate.** Barracks, Range, Stable, Embassy are stuck at their current main tier's N-0 until Town Center has reached (N+1)-0. Formally: a non-TC target `(M, S)` is allowed iff `M < tcMainTier` or `(M == tcMainTier && S == 0)`.

Consequence: TC and Embassy take turns climbing; they never run in parallel. Restricted buildings can only fire after TC has unlocked their next tier.

### Approved-date pattern (KvK prep-week)
Implemented in `buildings.js` as pure pattern code (not a static list).

- **Mon / Tue / Fri / Sat** of every 4th week.
- Anchor: **Mon 2026-05-18**.
- Plus a one-off kickoff approval on **Fri 2026-04-24**.
- Pattern extends indefinitely into the future.

`isApprovedDate(dateISO)` answers the question directly.

### Restricted buildings
Barracks, Range and Stable can **only start** an upgrade when `isApprovedDate(today)` is true. Town Center and Embassy ignore this restriction by themselves, but the SU-driven scheduling rule below pushes them onto approved days anyway.

### Refining (TG → TTG)
The `TIERS` table in `engine.js` is the single source of truth.

| Weekly count | Tier | Cheap (1st per day) | Regular | EV (TTG) |
|-------------:|:----:|:-------------------:|:-------:|:--------:|
| < 20 | T1 | **10 TG** | 20 TG | 1.45 |
| < 40 | T2 | **25 TG** | 50 TG | 2.15 |
| < 60 | T3 | — | 100 TG | 3.18 |
| < 80 | T4 | — | 130 TG | 3.435 |
| < 100 | T5 | — | 160 TG | 3.71 |
| ≥ 100 | — | no more refines this week |

- Weekly refine counter resets every **Monday**.
- One cheap T1 and one cheap T2 slot per day (independent of weekly count).
- TTG is stored internally as thousandths (`TTG_SCALE = 1000`) for exact integer maths; displayed floored.

### Speed-ups
- Accumulate at `speedUpIncome` per day. No cap on balance. Fractional income is supported (e.g. 0.8/day), stored as a float.
- Consumed **only on approved dates** (the original game rule) and **only in whole units**. Any fractional residue stays in the wallet for future accumulation. The table displays the floored balance.
- 1 speed-up removes 1 day from any active multi-day builder's `remainingDays`.
- On approved days, greedy application: shortest-remaining active builder first; finishing a builder frees its slot so more upgrades can start the same day and also be accelerated.
- **There is no week-end forfeit.** Speed-ups carry over indefinitely. The solver only spends them when there is something to spend on.

### SU-driven scheduling
Points are earned by spending TG/TTG/SU on approved dates. Two rules shape when multi-day upgrades are allowed to start (both gated on `speedUpIncome > 0` — with no SU income they're skipped to avoid deadlock):

- **Troops (Barracks/Range/Stable)** — MUST have `walletSpeedUps >= DaysToBuild` before starting. Troops can't train while being upgraded in the actual game, so any partial progress is unacceptable. Started → immediately instant-completed via speed-ups.
- **Town Center / Embassy** — prefer to start on an approved date so that any speed-ups burned during their build contribute to points. **No insta-finish requirement.** If resources are plentiful and the SU budget isn't quite there, the upgrade still starts on an approved day and any speed-ups applied during its build just shave days off — the rest ticks down naturally.

Net effect on finish time: **none** compared to a fully relaxed rule. The schedule is bottlenecked by the approved-date cadence of the restricted buildings (3 approved days per 4-week cycle). The rules concentrate SU spending onto approved days for points without pushing the finish date out.

### Start policy (priority sort)
Within the eligible pool each day, `pickChosen` sorts candidates by building-type priority:

1. **Barracks / Range / Stable** (the end goal — stronger troops)
2. **Embassy** (progression prerequisite)
3. **Town Center** (progression prerequisite)

Within the same priority, queue order is preserved. This makes the intent explicit even though the queue already orders troops first within each main-tier block.

### Refining policy (unified smart strategy)
The solver has a single strategy (no user toggle). Per day, `doMaintenanceRefines`:

1. Always take the daily cheap T1 (and cheap T2 after weekly count ≥ 20) slot — zero downside.
2. If an eligible upgrade is currently affordable on TG but short on TTG, burst refines (up to T5) to close the gap. T3+ bursts keep a TG reservation so the upgrade itself can still be paid for.
3. If no such blocker exists, stop. Never refine "just in case" — refining costs TG, and extra TTG only saves days when TG is already ready.

This is Pareto-optimal: same-or-fewer days than the old "always burst to T5" strategy, same-or-less TG than the old "cheap slots only" strategy.

### Daily simulation loop (`advanceDay`)
Order matters.

1. Monday → reset the weekly refine counter.
2. Add `dailyIncome` to walletTG. Add `suIncome` to walletSpeedUps.
3. `tickBuilders` — decrement every active builder's `remainingDays` by 1; any hitting 0 are completed (and `tcMainTier` / `embassyMainTier` bump if applicable).
4. `applySpeedUps` — if today is approved, greedy-apply speed-ups to active builders (shortest-remaining first). Finished builders are spliced out and their completion recorded.
5. `computeNeeds` → `doMaintenanceRefines` — described above.
6. `tryStartUpgrades` — loop, up to 200 iterations: pick the next item via `pickChosen`, start it, re-apply speed-ups (so newly-started 1-day troops instant-complete and free slots for more starts same day). Any diagnostic notes ("Wait for Date", "Need TTG", "Need TG") are recorded if nothing started.
7. `recordHistoryRow` — push a snapshot (`dateISO`, date string, weekday, convs, TG, TTG, SU, approved?, started[], completed[], active[], notes).
8. Advance the simulated date by 1 UTC day.

All date maths is UTC to avoid off-by-one across timezones.

---

## UI / persistence

- Everything the user enters (wallet, income, building state, build times) is auto-saved to `localStorage['tgOptimizerState']` on every `change` event and on Calculate.
- On page load, the saved state is read and **time-decay** is applied: for each building marked "currently being upgraded", `daysLeft` is reduced by the days elapsed since the save; upgrades whose timer runs out during the gap auto-complete and bump the tier. The decay **chains**: if enough time has elapsed to cover multiple sequential upgrades, each one is completed in turn using the saved `buildTimes` until the remaining time runs out or the building reaches its max tier (`8-0`). `savedAt` is rolled forward to today.
- Collapsible panes:
  - **About this tool** — general info. Opens by default on first load (no saved state), collapsed otherwise.
  - **Current Building State** — per-building main/sub tier dropdowns + "Currently Being Upgraded" checkbox and Days Left. Same open/closed logic as About.
  - **Build Times** — per-building build time (days per upgrade). Closed by default; the summary line shows the current values.
- Start Date input was removed — the planner always simulates from today (local calendar date, rendered in UTC internally).
- **No Calculate button.** The plan auto-recalculates on any input change (debounced 150 ms). Typing in a number field uses the `input` event so keystrokes re-run the calc once typing settles; checkboxes, dropdowns and the Build Times pane trigger on `change`. The form also catches Enter to run an immediate calc.
- **Reset Defaults** clears localStorage after a confirmation and reloads.
- The plan table:
  - Sticky header on desktop.
  - Icons next to TG / TTG in the inputs, column headers, and summary.
  - Row styling: Mondays get a top border; approved days get a green left-border on the date cell; TC/Embassy N-0 completions (main-tier bumps) get a yellow background + golden left border.
  - Columns: Date, Weekday, Super Refines, TG Bal, TTG Bal, Speed-ups (days), Activity / Logic. Values are shown as integers (TG/TTG/SU all floored). The Active Builds column was removed — any currently-building upgrade is annotated inline in the Activity column (`Active: Town Center (5-1)`).
  - **Per-day speed-up spend** is surfaced inline in the SU cell as a small red suffix `(−N)` on days where speed-ups were consumed. Non-approved days (where SU can't be spent) stay uncluttered.
  - **Activity pills** merge a same-day start + completion into a single mint `Built:` pill (instead of the old Start + Done pair). A genuine multi-day start stays green (`Start:`), a completion of a previously-started build stays blue (`Done:`), and a currently-active builder stays yellow (`Active:`).
  - **Validation errors keep the last good plan visible** (only the summary banner changes) so a mid-typing empty state doesn't wipe the table.
  - **Long plans are flagged** — if the simulation hits `HISTORY_CAP = 2000` days, the result carries `truncated = true` and the summary reads `Plan too long — showing first N days …` instead of a finish date.
  - Mobile responsive: Weekday hidden ≤ 768px, Super Refines hidden ≤ 480px. On mobile the table uses `table-layout: fixed` with explicit narrow widths for the numeric columns and allows badges to wrap, so the sticky `<thead>` works against the page viewport (no scroll-container parent confining it).

### Summary bar
Shows only `Finish: <full date>` and `Spent: <TG> TG · <TTG> TTG · <SU> SU`. No end-balance, no refine/upgrade breakdown.

---

## Running & testing

```bash
# From the project root (D:\Temp\TG)
npx http-server . -p 18734 -c-1
# Open http://127.0.0.1:18734/index.html

# Run the test harness
node test.js      # prints "1234 passed, 0 failed"
```

The tests load `buildings.js`, `engine.js` and `calculation.js` into a single `new Function` scope and run ~1174 assertions covering:
- Approved-date pattern (kickoff, anchor, off-cycle, anomaly rejection, pre-anchor, far future)
- `daysUntilApproved` math
- Simulation invariants (plan non-empty, first row matches start date, TC 6-1 doesn't start before Embassy 6-0, restricted starts only on approved dates, builder-slot cap, weekly cap, non-destructive to UPGRADE_QUEUE, timezone independence)
- Mid-game start with `initialState` and pre-active builders
- Time-decay (no-op same-day, partial decrement, completion with sub-bump, 5-4 → 6-0 crossover on completion)
- Build-time overrides, negative/invalid fallbacks, end-to-end effect
- Speed-up accumulation (no spend with nothing to apply on), approved-day consumption, full-plan days-saved, history exposure

---

## Assumptions & known limitations

- **TG income from events is not modelled.** Only `dailyIncome` feeds the TG wallet. If you expect bonus TG from an event, the plan will be conservative relative to reality.
- **The plan skips Strongest Governor and other events.** Only the KvK prep-week approved-date cadence is modelled.
- **Pattern is king for approved dates.** When the original data had a one-off anomaly (2026-12-31 Thu inserted instead of 2026-12-29 Tue), the code rejects it and keeps the clean pattern. Outliers are treated as bugs in the source data.
- **The further into the future the plan projects, the less accurate it becomes.** Re-run periodically with fresh balances and building state.
- The planner finishes at `Barracks/Range/Stable 8-0` (the last entries in the queue), which also requires `Town Center 8-0`. The "goal" implicitly is maxing troop buildings; TC and Embassy are means to that end.

---

## Design decisions worth remembering

- **Two strategies were merged into one.** The old `Lowest Time` vs `Lowest Cost` toggle was removed. Under realistic inputs the two produced identical finish dates; the unified strategy bursts only when it actually saves a day (TG ready, TTG short). See the "Refining policy" section above.
- **No strategy parameter is passed into `solveUpgradePath` anymore.** The legacy positional slot was removed; tests and callers use the cleaner signature `(currentTG, currentTTG, dailyIncome, queue, startDateISO, initialState, currentSpeedUps, speedUpIncome)`.
- **Speed-up forfeit at week end was added then reverted.** The rule "must be used up" was initially implemented as a hard forfeit, but the user corrected: speed-ups should only be spent if there is something to spend them on. Carryover is now indefinite.
- **TC/Embassy insta-finish requirement was added then relaxed to troops only.** Initially both troops and TC/Embassy required `walletSpeedUps >= DaysToBuild` to start. The user clarified that the insta-finish requirement only applies to troops (they can't train while upgrading). TC/Embassy still prefer approved-day starts for points but can begin even without the full SU budget — they'll finish partially via SU on approved days and partially via natural ticks.
- **Speed-ups consumed in whole units only.** `applySpeedUps` uses `walletSpeedUps >= 1` as its consumption guard; fractional balances from fractional income (e.g. `speedUpIncome = 0.8`) carry over rather than going negative.
- **Comments in code are English**, not Dutch — this project overrides the global-project Dutch-comments convention.

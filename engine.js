// TTG wallet is stored internally in thousandths to keep maths integer-exact.
const TTG_SCALE = 1000;

// Refine tier table — single source of truth for cost, yield and weekly caps.
// `ev` is in TTG_SCALE units.
const TIERS = [
    { tier: 1, maxWeekly: 20,  cheap: 10,  reg: 20,  ev: 1450 },
    { tier: 2, maxWeekly: 40,  cheap: 25,  reg: 50,  ev: 2150 },
    { tier: 3, maxWeekly: 60,  cheap: 100, reg: 100, ev: 3180 },
    { tier: 4, maxWeekly: 80,  cheap: 130, reg: 130, ev: 3435 },
    { tier: 5, maxWeekly: 100, cheap: 160, reg: 160, ev: 3710 },
];
const tierFor = (weeklyCount) => TIERS.find(t => weeklyCount < t.maxWeekly) || null;

const BUILDING = { TC: 'Town Center', EMBASSY: 'Embassy' };
const MONDAY = 1;
const MAX_BUILDERS = 2;
const HISTORY_CAP = 2000;
const BUILDINGS_ORDER = ['Town Center', 'Embassy', 'Barracks', 'Range', 'Stable'];

// Alias — the single source of truth is DEFAULTS.buildTimes in buildings.js.
const DEFAULT_BUILD_TIMES = DEFAULTS.buildTimes;

function parseTierStr(tierStr) {
    const [m, s] = tierStr.split('-').map(Number);
    return { main: m, sub: s };
}
function isTierBeyond(itemTier, currentMain, currentSub) {
    const { main, sub } = parseTierStr(itemTier);
    return main > currentMain || (main === currentMain && sub > currentSub);
}

function filterQueueForState(fullQueue, buildings) {
    return fullQueue.filter(item => {
        const b = buildings[item.building];
        if (!b) return true;
        return isTierBeyond(item.tier, b.main, b.sub);
    });
}

function extractPreActiveBuilders(queue, buildings) {
    const preActive = [];
    for (const name of BUILDINGS_ORDER) {
        const b = buildings[name];
        if (!b || !b.upgrading || !Number.isFinite(b.daysLeft) || b.daysLeft <= 0) continue;
        const idx = queue.findIndex(it => it.building === name);
        if (idx < 0) continue;
        const item = queue[idx];
        if (item.DaysToBuild <= 0) continue;
        queue.splice(idx, 1);
        preActive.push({ building: item.building, tier: item.tier, remainingDays: b.daysLeft });
    }
    return preActive;
}

function applyBuildTimes(queue, buildTimes) {
    return queue.map(item => {
        const t = buildTimes && Number.isFinite(buildTimes[item.building]) ? buildTimes[item.building] : item.DaysToBuild;
        return Object.assign({}, item, { DaysToBuild: Math.max(0, t) });
    });
}

function solveUpgradePath(currentTG, currentTTG, dailyIncome, upgrades, startDateISO, initialState, currentSpeedUps, speedUpIncome) {
    let walletTG = currentTG;
    let walletTTG = Math.round(currentTTG * TTG_SCALE);
    let walletSpeedUps = Number.isFinite(currentSpeedUps) ? currentSpeedUps : 0;
    const suIncome = Number.isFinite(speedUpIncome) ? speedUpIncome : 0;
    let queue = JSON.parse(JSON.stringify(upgrades));
    let activeBuilders = initialState && initialState.preActiveBuilders
        ? JSON.parse(JSON.stringify(initialState.preActiveBuilders))
        : [];
    let weeklyRefines = 0;
    let refineTGSpent = 0;
    let upgradeTGSpent = 0;
    let upgradeTTGSpent = 0;
    let speedUpsSpent = 0;
    const history = [];
    const initialISO = startDateISO || new Date().toISOString().split('T')[0];
    let currentDate = new Date(initialISO + 'T00:00:00Z');

    let tcMainTier = initialState && Number.isFinite(initialState.tcMainTier) ? initialState.tcMainTier : 5;
    let embassyMainTier = initialState && Number.isFinite(initialState.embassyMainTier) ? initialState.embassyMainTier : 5;

    const parseTier = (tierStr) => {
        const [m, s] = tierStr.split('-').map(Number);
        return { main: m, sub: s };
    };
    const onBuildingComplete = (item) => {
        const { main } = parseTier(item.tier);
        if (item.building === BUILDING.TC && main > tcMainTier) tcMainTier = main;
        if (item.building === BUILDING.EMBASSY && main > embassyMainTier) embassyMainTier = main;
    };
    const scale = (ttg) => ttg * TTG_SCALE;

    // The user's entered balances already reflect today's income, so skip adding
    // income on the first simulated day to avoid double-counting.
    let isFirstDay = true;
    let truncated = false;
    while (queue.length > 0 || activeBuilders.length > 0) {
        advanceDay();
        if (history.length >= HISTORY_CAP) { truncated = true; break; }
    }
    return {
        history,
        truncated,
        totalTGSpent: refineTGSpent + upgradeTGSpent,
        refineTGSpent,
        upgradeTGSpent,
        upgradeTTGSpent,
        speedUpsSpent,
        finalTG: Math.floor(walletTG * 100) / 100,
        finalTTG: walletTTG / TTG_SCALE,
        finalSpeedUps: walletSpeedUps,
    };

    function advanceDay() {
        if (currentDate.getUTCDay() === MONDAY) weeklyRefines = 0;
        if (!isFirstDay) {
            walletTG += dailyIncome;
            walletSpeedUps += suIncome;
        }

        const dayState = { t1Used: false, t2Used: false, convs: 0, suSpent: 0 };
        const started = [], completed = [], logicNotes = [];

        tickBuilders(completed);
        applySpeedUps(completed, dayState);

        const needs = computeNeeds();
        doMaintenanceRefines(needs, dayState, logicNotes);
        tryStartUpgrades(started, completed, logicNotes, dayState);

        // Clear after all day-0 processing so tryRefine can see isFirstDay above.
        isFirstDay = false;

        recordHistoryRow(dayState.convs, started, completed, logicNotes, dayState.suSpent);
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    function applySpeedUps(completed, dayState) {
        if (walletSpeedUps < 1) return;
        if (!isApprovedDate(currentDate.toISOString().split('T')[0])) return;
        const sorted = activeBuilders.slice().sort((a, b) => a.remainingDays - b.remainingDays);
        for (const b of sorted) {
            // Speed-ups are consumed in whole days; any fractional residue stays in the
            // wallet for future accumulation.
            while (walletSpeedUps >= 1 && b.remainingDays > 0) {
                b.remainingDays--;
                walletSpeedUps--;
                speedUpsSpent++;
                if (dayState) dayState.suSpent++;
            }
        }
        for (let i = activeBuilders.length - 1; i >= 0; i--) {
            if (activeBuilders[i].remainingDays <= 0) {
                completed.push(`${activeBuilders[i].building} (${activeBuilders[i].tier})`);
                onBuildingComplete(activeBuilders[i]);
                activeBuilders.splice(i, 1);
            }
        }
    }

    function tickBuilders(completed) {
        for (let i = activeBuilders.length - 1; i >= 0; i--) {
            activeBuilders[i].remainingDays--;
            if (activeBuilders[i].remainingDays <= 0) {
                const done = activeBuilders[i];
                completed.push(`${done.building} (${done.tier})`);
                onBuildingComplete(done);
                activeBuilders.splice(i, 1);
            }
        }
    }

    function getRefineCost(count, t1Used, t2Used) {
        const t = tierFor(count);
        if (!t) return Infinity;
        if (t.tier === 1) return t1Used ? t.reg : t.cheap;
        if (t.tier === 2) return t2Used ? t.reg : t.cheap;
        return t.cheap;
    }

    function tryRefine(maxTier, dayState) {
        // Day 0: today's super refines are presumed already done — skip all refining.
        if (isFirstDay) return false;
        const t = tierFor(weeklyRefines);
        if (!t || t.tier > maxTier) return false;
        const cost = getRefineCost(weeklyRefines, dayState.t1Used, dayState.t2Used);
        if (walletTG < cost) return false;
        walletTG -= cost; walletTTG += t.ev; refineTGSpent += cost;
        if (t.tier === 1 && cost === t.cheap) dayState.t1Used = true;
        if (t.tier === 2 && cost === t.cheap) dayState.t2Used = true;
        weeklyRefines++; dayState.convs++;
        return true;
    }

    function firstPendingPerBuilding() {
        const m = {};
        for (const item of queue) if (m[item.building] === undefined) m[item.building] = item;
        return m;
    }

    function isApprovedToday(item) {
        if (!RESTRICTED.includes(item.building)) return true;
        return isApprovedDate(currentDate.toISOString().split('T')[0]);
    }
    function tierUnlockedForNonTC(item) {
        const { main, sub } = parseTier(item.tier);
        return main < tcMainTier || (main === tcMainTier && sub === 0);
    }

    // Returns true if a major-tier milestone (sub===4: last step of a tier;
    // sub===0: first step of the next tier) for any RESTRICTED building is
    // reachable on a remaining approved day in the current approved cycle.
    // Used to defer Embassy/TC so troop buildings can complete their tier first.
    function canFinishOrStartMajorRestrictedTierThisWeek() {
        if (suIncome <= 0) return false;
        const bfp = firstPendingPerBuilding();
        const hasMajorTarget = Object.values(bfp).some(item => {
            if (!RESTRICTED.includes(item.building)) return false;
            const { sub } = parseTierStr(item.tier);
            return sub === 0 || sub === 4;
        });
        if (!hasMajorTarget) return false;
        // Walk forward up to 6 days; stop at the next Monday (start of new cycle).
        let projectedSU = walletSpeedUps;
        for (let d = 1; d <= 6; d++) {
            const next = new Date(currentDate);
            next.setUTCDate(next.getUTCDate() + d);
            if (next.getUTCDay() === MONDAY) break;
            projectedSU += suIncome;
            // Use a small epsilon to absorb floating-point drift (e.g. 0.9999…994 ≈ 1).
            if (isApprovedDate(next.toISOString().split('T')[0]) && projectedSU >= 1 - 1e-9) return true;
        }
        return false;
    }

    function isEligible(item) {
        if (activeBuilders.some(a => a.building === item.building)) return false;
        if (!isApprovedToday(item)) return false;
        if (item.building === BUILDING.TC) {
            if (embassyMainTier < tcMainTier) return false;
        } else if (!tierUnlockedForNonTC(item)) {
            return false;
        }

        // Speed-up-driven scheduling:
        // - Troops (Barracks/Range/Stable) must always be instant-completed with SU. They
        //   are unusable while upgrading, so no partial progress is ever acceptable.
        // - Town Center / Embassy prefer to start on approved days so that any speed-ups
        //   spent during their build contribute to points, but they don't require the full
        //   insta-finish budget — partial progress is fine for them.
        if (item.DaysToBuild > 0) {
            if (RESTRICTED.includes(item.building) && suIncome > 0) {
                // Speed-ups consume in whole units, so a 1.5-day build needs 2 SU.
                if (Math.floor(walletSpeedUps) < Math.ceil(item.DaysToBuild)) return false;
            }
            if ((item.building === BUILDING.TC || item.building === BUILDING.EMBASSY) && suIncome > 0) {
                if (!isApprovedDate(currentDate.toISOString().split('T')[0])) return false;
                // Defer if a RESTRICTED building can reach a major-tier milestone
                // (finish sub===4 or open sub===0) on a remaining approved day this week.
                if (canFinishOrStartMajorRestrictedTierThisWeek()) return false;
            }
        }

        return true;
    }

    function computeNeeds() {
        let remainingTTG = 0;
        let shortTTG = 0;
        let shortTG = 0;
        let hasRestrictedShort = false;
        for (const item of queue) {
            remainingTTG += scale(item.TTG);
            if (item.DaysToBuild === 0 && RESTRICTED.includes(item.building) && tierUnlockedForNonTC(item)) {
                shortTTG += scale(item.TTG);
                shortTG += item.TG;
                hasRestrictedShort = true;
            }
        }
        const nextMulti = queue.find(it => it.DaysToBuild > 0 && isEligible(it));
        if (nextMulti) {
            shortTTG += scale(nextMulti.TTG);
            shortTG += nextMulti.TG;
        }
        return { remainingTTG, shortTTG, shortTG, hasRestrictedShort, nextMulti };
    }

    function doMaintenanceRefines(needs, dayState, logicNotes) {
        if (queue.length === 0 || walletTTG >= needs.remainingTTG) return;

        // Strategy: 14 refines on Monday, 1 on every other day (20/week total).
        // tryRefine(1, …) naturally caps at 20 weekly T1 refines — tierFor(20)
        // returns T2 (tier 2 > maxTier 1), causing tryRefine to return false.
        const dailyTarget = currentDate.getUTCDay() === MONDAY ? 14 : 1;
        for (let i = 0; i < dailyTarget; i++) {
            if (!tryRefine(1, dayState)) break;
        }
    }

    function canStart(item) {
        return item.DaysToBuild === 0 || activeBuilders.length < MAX_BUILDERS;
    }

    // Troop buildings (Barracks/Range/Stable) are the end goal; TC and Embassy are only
    // progression prerequisites. When several options are eligible, prefer troops, then
    // Embassy, then Town Center. Within the same priority, keep queue order.
    function buildingPriority(item) {
        if (RESTRICTED.includes(item.building)) return 0;
        if (item.building === BUILDING.EMBASSY) return 1;
        return 2; // Town Center
    }

    function pickChosen(bfp, dayState, logicNotes) {
        const eligible = queue
            .filter(it => bfp[it.building] === it && isEligible(it) && canStart(it))
            .sort((a, b) => buildingPriority(a) - buildingPriority(b));
        if (eligible.length === 0) return null;
        for (const it of eligible) {
            if (walletTG >= it.TG && walletTTG >= scale(it.TTG)) return it;
        }
        const target = eligible.find(it => walletTG >= it.TG && walletTTG < scale(it.TTG));
        if (!target) return null;
        while (walletTTG < scale(target.TTG)) {
            const nextCost = getRefineCost(weeklyRefines, dayState.t1Used, dayState.t2Used);
            if (walletTG < nextCost + target.TG) {
                logicNotes.push("Saving TG for build start");
                break;
            }
            if (!tryRefine(1, dayState)) break;
        }
        return (walletTG >= target.TG && walletTTG >= scale(target.TTG)) ? target : null;
    }

    function tryStartUpgrades(started, completed, logicNotes, dayState) {
        let bfp = firstPendingPerBuilding();
        for (let guard = 0; guard < 200; guard++) {
            const chosen = pickChosen(bfp, dayState, logicNotes);
            if (!chosen) break;
            walletTG -= chosen.TG;
            walletTTG -= scale(chosen.TTG);
            upgradeTGSpent += chosen.TG;
            upgradeTTGSpent += chosen.TTG;
            started.push(`${chosen.building} (${chosen.tier})`);
            if (chosen.DaysToBuild === 0) {
                completed.push(`${chosen.building} (${chosen.tier})`);
                onBuildingComplete(chosen);
            } else {
                activeBuilders.push({
                    building: chosen.building,
                    tier: chosen.tier,
                    remainingDays: chosen.DaysToBuild,
                });
            }
            queue.splice(queue.indexOf(chosen), 1);
            applySpeedUps(completed, dayState);
            bfp = firstPendingPerBuilding();
        }

        if (started.length === 0 && queue.length > 0) {
            const headItems = Object.values(bfp);
            if (headItems.some(it => RESTRICTED.includes(it.building) && !isApprovedToday(it))) {
                logicNotes.push("Wait for Date");
            }
            const anyEligible = headItems.find(isEligible);
            if (anyEligible) {
                if (walletTTG < scale(anyEligible.TTG)) logicNotes.push("Need TTG");
                else if (walletTG < anyEligible.TG) logicNotes.push("Need TG");
            }
        }
    }

    function recordHistoryRow(convs, started, completed, logicNotes, suSpent) {
        const isoDate = currentDate.toISOString().split('T')[0];
        const activeDisplay = activeBuilders.map(a => `${a.building} (${a.tier})`);
        history.push({
            dateISO: isoDate,
            date: currentDate.toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC',
            }),
            weekday: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][currentDate.getUTCDay()],
            convs,
            tg: Math.floor(walletTG).toString(),
            ttg: Math.floor(walletTTG / TTG_SCALE).toString(),
            speedUps: Math.floor(walletSpeedUps),
            speedUpsFloat: walletSpeedUps,
            suSpent: suSpent || 0,
            approved: isApprovedDate(isoDate),
            started,
            completed,
            active: activeDisplay,
            notes: logicNotes.join(" | "),
        });
    }
}

if (typeof module !== 'undefined') {
    module.exports = {
        TIERS, TTG_SCALE, BUILDING, MONDAY, MAX_BUILDERS, HISTORY_CAP,
        BUILDINGS_ORDER, DEFAULT_BUILD_TIMES,
        parseTierStr, isTierBeyond,
        filterQueueForState, extractPreActiveBuilders, applyBuildTimes,
        solveUpgradePath,
    };
}

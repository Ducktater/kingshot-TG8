const UPGRADE_QUEUE = [
        { "building": "Town Center", "tier": "5-1", "TG": 200, "TTG": 10, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "5-2", "TG": 200, "TTG": 10, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "5-3", "TG": 200, "TTG": 10, "DaysToBuild": 6 },
		{ "building": "Town Center", "tier": "5-4", "TG": 200, "TTG": 10, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "6-0", "TG": 100, "TTG": 20, "DaysToBuild": 6 },
        { "building": "Barracks", "tier": "5-1", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "5-2", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "5-3", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "5-4", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "6-0", "TG": 45, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Range", "tier": "5-1", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Range", "tier": "5-2", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Range", "tier": "5-3", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Range", "tier": "5-4", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Range", "tier": "6-0", "TG": 45, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "5-1", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "5-2", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "5-3", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "5-4", "TG": 90, "TTG": 4, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "6-0", "TG": 45, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Embassy", "tier": "5-1", "TG": 50, "TTG": 2, "DaysToBuild": 5 },
        { "building": "Embassy", "tier": "5-2", "TG": 50, "TTG": 2, "DaysToBuild": 5 },
        { "building": "Embassy", "tier": "5-3", "TG": 50, "TTG": 2, "DaysToBuild": 5 },
        { "building": "Embassy", "tier": "5-4", "TG": 50, "TTG": 2, "DaysToBuild": 5 },
        { "building": "Embassy", "tier": "6-0", "TG": 25, "TTG": 5, "DaysToBuild": 5 },
        { "building": "Town Center", "tier": "6-1", "TG": 240, "TTG": 15, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "6-2", "TG": 240, "TTG": 15, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "6-3", "TG": 240, "TTG": 15, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "6-4", "TG": 240, "TTG": 15, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "7-0", "TG": 120, "TTG": 30, "DaysToBuild": 6 },
        { "building": "Barracks", "tier": "6-1", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "6-2", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "6-3", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "6-4", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "7-0", "TG": 54, "TTG": 13, "DaysToBuild": 0 },
        { "building": "Range", "tier": "6-1", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Range", "tier": "6-2", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Range", "tier": "6-3", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Range", "tier": "6-4", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Range", "tier": "7-0", "TG": 54, "TTG": 13, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "6-1", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "6-2", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "6-3", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "6-4", "TG": 108, "TTG": 6, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "7-0", "TG": 54, "TTG": 13, "DaysToBuild": 0 },
        { "building": "Embassy", "tier": "6-1", "TG": 60, "TTG": 3, "DaysToBuild": 5 },
        { "building": "Embassy", "tier": "6-2", "TG": 60, "TTG": 3, "DaysToBuild": 5 },
        { "building": "Embassy", "tier": "6-3", "TG": 60, "TTG": 3, "DaysToBuild": 5 },
        { "building": "Embassy", "tier": "6-4", "TG": 60, "TTG": 3, "DaysToBuild": 5 },
        { "building": "Embassy", "tier": "7-0", "TG": 30, "TTG": 7, "DaysToBuild": 5 },
        { "building": "Town Center", "tier": "7-1", "TG": 240, "TTG": 20, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "7-2", "TG": 240, "TTG": 20, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "7-3", "TG": 240, "TTG": 20, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "7-4", "TG": 240, "TTG": 20, "DaysToBuild": 6 },
        { "building": "Town Center", "tier": "8-0", "TG": 120, "TTG": 40, "DaysToBuild": 6 },
        { "building": "Barracks", "tier": "7-1", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "7-2", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "7-3", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "7-4", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Barracks", "tier": "8-0", "TG": 54, "TTG": 18, "DaysToBuild": 0 },
        { "building": "Range", "tier": "7-1", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Range", "tier": "7-2", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Range", "tier": "7-3", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Range", "tier": "7-4", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Range", "tier": "8-0", "TG": 54, "TTG": 18, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "7-1", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "7-2", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "7-3", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "7-4", "TG": 108, "TTG": 9, "DaysToBuild": 0 },
        { "building": "Stable", "tier": "8-0", "TG": 54, "TTG": 18, "DaysToBuild": 0 },
    ];

// Approved-date pattern: Mon/Tue/Fri/Sat of every 4th week, anchored on Mon 2026-05-18.
// Plus a single kickoff approval on Fri 2026-04-24 (one cycle-worth of the earlier
// weekdays is skipped before the regular cadence begins).
const APPROVED_ANCHOR_ISO = "2026-05-18";
const APPROVED_WEEKDAYS = [1, 2, 5, 6]; // Mon, Tue, Fri, Sat
const APPROVED_ONE_OFFS = new Set(["2026-04-24"]);

function isApprovedDate(dateISO) {
    if (APPROVED_ONE_OFFS.has(dateISO)) return true;
    const d = new Date(dateISO + "T00:00:00Z");
    const anchor = new Date(APPROVED_ANCHOR_ISO + "T00:00:00Z");
    const diffDays = Math.round((d - anchor) / 86400000);
    if (diffDays < 0) return false;
    if (Math.floor(diffDays / 7) % 4 !== 0) return false;
    return APPROVED_WEEKDAYS.includes(d.getUTCDay());
}

// Days from `dateISO` to the next approved date on or after it (Infinity if never).
function daysUntilApproved(dateISO) {
    const start = new Date(dateISO + "T00:00:00Z");
    for (let i = 0; i < 60; i++) {
        const iso = new Date(start.getTime() + i * 86400000).toISOString().split("T")[0];
        if (isApprovedDate(iso)) return i;
    }
    return Infinity;
}

const RESTRICTED = ["Barracks", "Range", "Stable"];

// ────────────────────────────────────────────────────────────────────────────
// Single source of truth for the app's default values. Edit these to change
// the initial state shown on first run (before the user saves anything).
// ────────────────────────────────────────────────────────────────────────────
const DEFAULTS = {
    // Wallet balances on first run
    currentTG:       500,
    currentTTG:      20,
    currentSpeedUps: 0,

    // Daily income
    dailyIncome:    45,
    speedUpIncome:  1,

    // Starting building state (main tier / sub tier; upgrading = is a build in progress)
    buildings: {
        'Town Center': { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
        'Embassy':     { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
        'Barracks':    { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
        'Range':       { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
        'Stable':      { main: 5, sub: 0, upgrading: false, daysLeft: 0 },
    },

    // Days per upgrade, per building
    // Days per upgrade. Floats are allowed (1 hour = 1/24 ≈ 0.0417 day).
    buildTimes: {
        'Town Center': 6,
        'Embassy':     4,
        'Barracks':    22 / 24,
        'Range':       22 / 24,
        'Stable':      22 / 24,
    },
};

if (typeof module !== 'undefined') {
    module.exports = { UPGRADE_QUEUE, RESTRICTED, DEFAULTS, isApprovedDate, daysUntilApproved };
}
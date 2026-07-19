export const MATCH_COMPLETE_GRACE_MS = 2 * 60 * 60 * 1000;
export const STAGE_LOCK_BUFFER_MS = 30 * 60 * 1000;

// Troostfinale (losers final) and Finale share one lock deadline: the earlier of the two kickoffs.
export const LINKED_LOCK_STAGES = ['Troostfinale', 'Finale'];

export const isMatchStarted = (matchDate, graceMs = MATCH_COMPLETE_GRACE_MS) => {
    if (!matchDate) return false;
    const timestamp = new Date(matchDate).getTime();
    if (Number.isNaN(timestamp)) return false;
    return Date.now() >= timestamp + graceMs;
};

const getLockGroupStages = (stageName) =>
    LINKED_LOCK_STAGES.includes(stageName) ? LINKED_LOCK_STAGES : [stageName];

export const getStageLockDeadline = (stageName, allMatches) => {
    if (!allMatches || allMatches.length === 0) return null;
    const groupStages = getLockGroupStages(stageName);
    const stageMatches = allMatches.filter(m => groupStages.includes(m.stage));
    if (stageMatches.length === 0) return null;
    const earliest = stageMatches.reduce((e, c) => new Date(c.match_date) < new Date(e) ? c.match_date : e, stageMatches[0].match_date);
    return new Date(earliest).getTime() - STAGE_LOCK_BUFFER_MS;
};

export const isStageLocked = (stageName, allMatches) => {
    const deadline = getStageLockDeadline(stageName, allMatches);
    return deadline !== null && Date.now() >= deadline;
};

export const MATCH_COMPLETE_GRACE_MS = 2 * 60 * 60 * 1000;

export const isMatchStarted = (matchDate, graceMs = MATCH_COMPLETE_GRACE_MS) => {
    if (!matchDate) return false;
    const timestamp = new Date(matchDate).getTime();
    if (Number.isNaN(timestamp)) return false;
    return Date.now() >= timestamp + graceMs;
};

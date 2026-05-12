// src/lib/scoring.js

export const calculateOfficialToto = (home, away) => {
    const h = Number(home);
    const a = Number(away);
    if (h > a) return '1';
    if (a > h) return '2';
    return '3';
};

export const calculateMatchPoints = (pred, match, r) => {
    if (!match || match.home_ft === null || match.home_ft === undefined) return 0;
    const isGroup = match.stage === 'Groepsfase';
    let p = 0;

    if (Number(pred.pred_home_ht) === Number(match.home_ht) &&
        Number(pred.pred_away_ht) === Number(match.away_ht)) {
        p += Number(isGroup ? r.points_ht_group : r.points_ht_finals) || 0;
    }

    if (Number(pred.pred_home_ft) === Number(match.home_ft) &&
        Number(pred.pred_away_ft) === Number(match.away_ft)) {
        p += Number(isGroup ? r.points_ft_group : r.points_ft_finals) || 0;
    }

    const officialToto = String(match.match_toto);
    if (String(pred.pred_toto) === String(officialToto)) {
        p += Number(isGroup ? r.points_toto_group : r.points_toto_finals) || 0;
    }
    return p;
};

export const calculateTop4Points = (userPred, official, matrixJson) => {
    if (!userPred || !official || !matrixJson) return 0;
    let total = 0;
    const matrix = typeof matrixJson === 'string' ? JSON.parse(matrixJson) : matrixJson;
    const officialResults = [official.rank_1, official.rank_2, official.rank_3, official.rank_4];
    const myPicks = [userPred.rank_1, userPred.rank_2, userPred.rank_3, userPred.rank_4];

    officialResults.forEach((teamId, index) => {
        if (!teamId) return;
        const officialRankKey = `rank_${index + 1}`;
        const userPredictionIndex = myPicks.indexOf(teamId);
        if (userPredictionIndex !== -1) {
            const userRankKey = `rank_${userPredictionIndex + 1}`;
            const points = matrix[officialRankKey]?.[userRankKey] || 0;
            total += Number(points);
        }
    });
    return total;
};
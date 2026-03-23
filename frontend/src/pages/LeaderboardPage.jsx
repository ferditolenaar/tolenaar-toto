import React, { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const LeaderboardPage = () => {
    const [standings, setStandings] = useState([]);
    const [rules, setRules] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                setLoading(true);

                const [activeRules, official] = await Promise.all([
                    pb.collection('tournament_settings').getFirstListItem('is_active=true', { requestKey: null }).catch(() => null),
                    pb.collection('tournament_top4').getFirstListItem('', { requestKey: null }).catch(() => null)
                ]);

                if (!activeRules) {
                    setLoading(false);
                    return;
                }
                setRules(activeRules);

                const [matches, users, predictions, top4Preds] = await Promise.all([
                    pb.collection('matches').getFullList({ requestKey: null }),
                    pb.collection('users').getFullList({ filter: 'paid = true', requestKey: null }),
                    pb.collection('predictions').getFullList({ requestKey: null }),
                    pb.collection('top_four_predictions').getFullList({ requestKey: null })
                ]);

                // 3. Calculate Scores
                const userScores = users.map(user => {
                    let partA_GroupPoints = 0;  // Part A
                    let partB_FinalsPoints = 0; // Part B
                    let partC_Top4Points = 0;   // Part C

                    // --- Parts A & B: Match Scoring ---
                    const userPreds = predictions.filter(p => p.user === user.id);
                    userPreds.forEach(pred => {
                        const match = matches.find(m => m.id === pred.match);

                        if (match && match.home_ft !== null && match.home_ft !== undefined) {
                            const points = calculateMatchPoints(pred, match, activeRules);

                            if (match.stage === 'Groepsfase') {
                                partA_GroupPoints += points;
                            } else {
                                partB_FinalsPoints += points;
                            }
                        }
                    });

                    // --- Part C: Top 4 Scoring ---
                    const userTop4List = top4Preds.filter(p => p.user === user.id);
                    const preTournament = userTop4List.find(p => p.phase === 'pre_tournament');
                    const postGroup = userTop4List.find(p => p.phase === 'post_group_stage');

                    partC_Top4Points += calculateTop4Points(preTournament, official, activeRules.top4_pre_tournament);
                    partC_Top4Points += calculateTop4Points(postGroup, official, activeRules.top4_post_tournament);

                    const total = partA_GroupPoints + partB_FinalsPoints + partC_Top4Points;

                    return {
                        id: user.id,
                        name: user.firstName ? `${user.firstName} ${user.lastName}` : (user.email),
                        partA: partA_GroupPoints,
                        partB: partB_FinalsPoints,
                        partC: partC_Top4Points,
                        points: total
                    };
                });

                setStandings(userScores.sort((a, b) => b.points - a.points));

            } catch (err) {
                if (!err.isAbort) console.error("Leaderboard error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();
    }, []);

    // --- HELPER FUNCTIONS ---
    const calculateOfficialToto = (home, away) => {
        const h = Number(home);
        const a = Number(away);
        if (h > a) return '1';
        if (a > h) return '2';
        return '3';
    };

    const calculateMatchPoints = (pred, match, r) => {
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

        const officialToto = calculateOfficialToto(match.home_ft, match.away_ft);
        if (String(pred.pred_toto) === String(officialToto)) {
            p += Number(isGroup ? r.points_toto_group : r.points_toto_finals) || 0;
        }

        return p;
    };

    const calculateTop4Points = (userPred, official, matrixJson) => {
        if (!userPred || !official || !matrixJson) return 0;

        let total = 0;
        const matrix = typeof matrixJson === 'string' ? JSON.parse(matrixJson) : matrixJson;

        // 1. Map the OFFICIAL results (The "Rows" now)
        const officialResults = [
            official.rank_1,
            official.rank_2,
            official.rank_3,
            official.rank_4
        ];

        // 2. Map YOUR predictions (The "Columns" now)
        const myPicks = [
            userPred.rank_1,
            userPred.rank_2,
            userPred.rank_3,
            userPred.rank_4
        ];

        // 3. Loop through the OFFICIAL Results
        officialResults.forEach((teamId, index) => {
            if (!teamId) return;

            // "Look at the actual #1 team (e.g. Ghana)"
            const officialRankKey = `rank_${index + 1}`;

            // "Where did the user predict Ghana to finish?"
            const userPredictionIndex = myPicks.indexOf(teamId);

            if (userPredictionIndex !== -1) {
                // User had them in the top 4! 
                const userRankKey = `rank_${userPredictionIndex + 1}`;

                // Lookup: [Official Result Row] -> [User's Prediction Column]
                const points = matrix[officialRankKey]?.[userRankKey] || 0;
                total += Number(points);
            }
        });

        return total;
    };

    if (loading) return <div className="loader">Punten berekenen...</div>;

    return (
        <div className="container-centered page-container">
            <header className="page-header tournament-theme">
                <h1 className="tournament-title">Klassement</h1>
                <p className="admin-subtitle">Wie staat er bovenaan in de DeRoTo pool?</p>
            </header>

            <div className="leaderboard-card">
                <table className="leaderboard-table">
                    <thead>
                        <tr>
                            <th className="text-center">#</th>
                            <th className="text-left">Naam</th>
                            <th className="text-right desktop-only">Groepsfase (A)</th>
                            <th className="text-right desktop-only">Finales (B)</th>
                            <th className="text-right desktop-only">Top 4 (C)</th>
                            <th className="text-right">Totaal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {standings.map((user, index) => (
                            <tr key={user.id} className={index === 0 ? 'top-rank' : ''}>
                                <td className="rank-cell">{index + 1}</td>
                                <td className="name-cell">
                                    {user.name}
                                    {index === 0 && <span className="trophy-icon"> 🏆</span>}
                                    <div className="mobile-only mobile-score-breakdown">
                                        A: {user.partA} | B: {user.partB} | C: {user.partC}
                                    </div>
                                </td>
                                <td className="points-cell text-right secondary-pts desktop-only">{user.partA}</td>
                                <td className="points-cell text-right secondary-pts desktop-only">{user.partB}</td>
                                <td className="points-cell text-right secondary-pts desktop-only">{user.partC}</td>
                                <td className="points-cell text-right total-pts"><strong>{user.points}</strong></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LeaderboardPage;
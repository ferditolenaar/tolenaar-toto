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

                // 1. Fetch Active Rules & Official Top 4 Results
                const [activeRules, official] = await Promise.all([
                    pb.collection('tournament_settings').getFirstListItem('is_active=true', { requestKey: null }),
                    pb.collection('tournament_top4').getFirstListItem('', { requestKey: null }).catch(() => null)
                ]);
                setRules(activeRules);

                // 2. Fetch Matches, Paid Users, Match Predictions, and Top 4 Predictions
                const [matches, users, predictions, top4Preds] = await Promise.all([
                    pb.collection('matches').getFullList({ requestKey: null }),
                    pb.collection('users').getFullList({ filter: 'paid = true', requestKey: null }),
                    pb.collection('predictions').getFullList({ requestKey: null }),
                    pb.collection('top_four_predictions').getFullList({ requestKey: null })
                ]);

                console.log(`Loaded: ${matches.length} matches, ${users.length} users, ${predictions.length} match preds, ${top4Preds.length} top4 preds`);

                // 3. Calculate Scores
                const userScores = users.map(user => {
                    let total = 0;
                    let matchPointsTotal = 0;
                    let top4PointsTotal = 0;

                    // --- Part A & B: Match Scoring ---
                    const userPreds = predictions.filter(p => p.user === user.id);
                    userPreds.forEach(pred => {
                        const match = matches.find(m => m.id === pred.match);
                        if (match && match.home_ft !== null && match.home_ft !== undefined) {
                            matchPointsTotal += calculateMatchPoints(pred, match, activeRules);
                        }
                    });

                    // --- Part C: Top 4 Scoring (Matrix Based) ---
                    const userTop4List = top4Preds.filter(p => p.user === user.id);
                    const preTournament = userTop4List.find(p => p.phase === 'pre_tournament');
                    const postGroup = userTop4List.find(p => p.phase === 'post_group_stage');

                    top4PointsTotal += calculateTop4Points(preTournament, official, activeRules.points_matrix);
                    top4PointsTotal += calculateTop4Points(postGroup, official, activeRules.points_matrix);

                    total = matchPointsTotal + top4PointsTotal;

                    return {
                        id: user.id,
                        name: user.firstName ? `${user.firstName} ${user.lastName}` : (user.name || user.username),
                        matchPoints: matchPointsTotal,
                        top4Points: top4PointsTotal,
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
        return '3'; // Draw
    };

    const calculateMatchPoints = (pred, match, r) => {
        const isGroup = match.stage === 'Groepsfase';
        let p = 0;

        // 1. HT Points
        if (Number(pred.pred_home_ht) === Number(match.home_ht) &&
            Number(pred.pred_away_ht) === Number(match.away_ht)) {
            p += Number(isGroup ? r.points_ht_group : r.points_ht_finals) || 0;
        }

        // 2. FT Points
        if (Number(pred.pred_home_ft) === Number(match.home_ft) &&
            Number(pred.pred_away_ft) === Number(match.away_ft)) {
            p += Number(isGroup ? r.points_ft_group : r.points_ft_finals) || 0;
        }

        // 3. TOTO Points
        const officialToto = calculateOfficialToto(match.home_ft, match.away_ft);
        if (String(pred.pred_toto) === String(officialToto)) {
            p += Number(isGroup ? r.points_toto_group : r.points_toto_finals) || 0;
        }

        return p;
    };

    const calculateTop4Points = (userPred, official, matrixJson) => {
        if (!userPred || !official || !matrixJson) return 0;

        let total = 0;
        let matrix;
        try {
            matrix = typeof matrixJson === 'string' ? JSON.parse(matrixJson) : matrixJson;
        } catch (e) {
            console.error("Matrix parse error", e);
            return 0;
        }

        const userRanks = [userPred.rank_1, userPred.rank_2, userPred.rank_3, userPred.rank_4];
        const officialRanks = [official.rank_1, official.rank_2, official.rank_3, official.rank_4];

        userRanks.forEach((predId, uIndex) => {
            if (!predId) return;
            const oIndex = officialRanks.indexOf(predId);
            if (oIndex !== -1) {
                const userRankKey = `rank_${uIndex + 1}`;
                const officialRankKey = `rank_${oIndex + 1}`;
                const points = matrix[userRankKey]?.[officialRankKey] || 0;
                total += Number(points);
            }
        });

        return total;
    };

    if (loading) return <div className="loader">Punten berekenen...</div>;

    return (
        <div className="container-centered page-container">
            <header className="page-header">
                <h1 className="tournament-title">Klassement</h1>
                <p className="admin-subtitle">Wie staat er bovenaan in de DeRoTo pool?</p>
            </header>

            <div className="leaderboard-card">
                <table className="leaderboard-table">
                    <thead>
                        <tr>
                            <th className="text-center">#</th>
                            <th>Naam</th>
                            <th className="text-right">Matches</th>
                            <th className="text-right">Top 4</th>
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
                                </td>
                                <td className="points-cell text-right secondary-pts">{user.matchPoints}</td>
                                <td className="points-cell text-right secondary-pts">{user.top4Points}</td>
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
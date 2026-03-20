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

                // Add .catch(() => null) to activeRules so the page doesn't die if settings aren't set up yet
                const [activeRules, official] = await Promise.all([
                    pb.collection('tournament_settings').getFirstListItem('is_active=true', { requestKey: null }).catch(() => null),
                    pb.collection('tournament_top4').getFirstListItem('', { requestKey: null }).catch(() => null)
                ]);

                if (!activeRules) {
                    console.warn("No active tournament rules found.");
                    setLoading(false);
                    return;
                }
                setRules(activeRules);

                // 2. Fetch Matches, Paid Users, Match Predictions, and Top 4 Predictions
                const [matches, users, predictions, top4Preds] = await Promise.all([
                    pb.collection('matches').getFullList({ requestKey: null }),
                    pb.collection('users').getFullList({ filter: 'paid = true', requestKey: null }),
                    pb.collection('predictions').getFullList({ requestKey: null }),
                    pb.collection('top_four_predictions').getFullList({ requestKey: null })
                ]);

                const now = new Date();
                const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;

                // Filter to only include matches that started at least 2 hours ago
                const finishedMatches = matches.filter(m => {
                    const matchStart = new Date(m.match_date);
                    return (now.getTime() - matchStart.getTime()) >= TWO_HOURS_IN_MS;
                });

                // 3. Calculate Scores
                const userScores = users.map(user => {
                    let total = 0;
                    let matchPointsTotal = 0;
                    let top4PointsTotal = 0;

                    const userPreds = predictions.filter(p => p.user === user.id);
                    userPreds.forEach(pred => {
                        // Use finishedMatches here instead of the raw matches list
                        const match = matches.find(m => m.id === pred.match);
                        // const match = finishedMatches.find(m => m.id === pred.match);

                        if (match && match.home_ft !== null && match.home_ft !== undefined) {
                            matchPointsTotal += calculateMatchPoints(pred, match, activeRules);
                        }
                    });

                    // --- Part C: Top 4 Scoring ---
                    const userTop4List = top4Preds.filter(p => p.user === user.id);
                    const preTournament = userTop4List.find(p => p.phase === 'pre_tournament');
                    const postGroup = userTop4List.find(p => p.phase === 'post_group_stage');

                    // Use the specific matrix for each phase
                    top4PointsTotal += calculateTop4Points(preTournament, official, activeRules.top4_pre_tournament);
                    top4PointsTotal += calculateTop4Points(postGroup, official, activeRules.top4_post_tournament);

                    total = matchPointsTotal + top4PointsTotal;

                    return {
                        id: user.id,
                        name: user.firstName ? `${user.firstName} ${user.lastName}` : (user.email),
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
        const matrix = typeof matrixJson === 'string' ? JSON.parse(matrixJson) : matrixJson;

        const userRanks = [userPred.rank_1, userPred.rank_2, userPred.rank_3, userPred.rank_4];
        const officialRanks = [official.rank_1, official.rank_2, official.rank_3, official.rank_4];

        userRanks.forEach((predTeamId, uIdx) => {
            if (!predTeamId) return;

            // Check if the predicted team exists anywhere in the official top 4
            const actualPositionIndex = officialRanks.indexOf(predTeamId);

            if (actualPositionIndex !== -1) {
                const predRankKey = `rank_${uIdx + 1}`;
                const actualRankKey = `rank_${actualPositionIndex + 1}`;

                // This lookup will now automatically use the "equal" values 
                // defined in your Euro JSON matrix if that is the active tournament.
                const points = matrix[predRankKey]?.[actualRankKey] || 0;
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
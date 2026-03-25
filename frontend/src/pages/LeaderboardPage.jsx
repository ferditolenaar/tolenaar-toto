import React, { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const LeaderboardPage = () => {
    const [standings, setStandings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                setLoading(true);

                // We only need the users table now!
                // We filter for paid users and sort by total_points descending.
                const users = await pb.collection('users').getFullList({
                    filter: 'paid = true',
                    sort: '-total_points',
                    requestKey: null 
                });

                const formattedStandings = users.map(user => ({
                    id: user.id,
                    name: user.firstName ? `${user.firstName} ${user.lastName}` : user.email,
                    partA: user.score_part_a || 0,
                    partB: user.score_part_b || 0,
                    partC: user.score_part_c || 0,
                    points: user.total_points || 0
                }));

                setStandings(formattedStandings);

            } catch (err) {
                if (!err.isAbort) console.error("Leaderboard error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();
    }, []);

    if (loading) return <div className="loader">Stand laden...</div>;

    return (
        <div className="container-centered page-container">
            <header className="page-header tournament-theme">
                <h1 className="tournament-title">Stand</h1>
                <p className="admin-subtitle">Wie staat er bovenaan in de DeRoTo toto?</p>
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
                                    <div className="player-info-stack">
                                        <span className="player-full-name">
                                            {user.name}
                                            {index === 0 && <span className="trophy-icon"> 🏆</span>}
                                        </span>
                                        <div className="mobile-only mobile-score-breakdown">
                                            A: {user.partA} | B: {user.partB} | C: {user.partC}
                                        </div>
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
import React, { useState, useEffect, useRef, useMemo } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const LeaderboardPage = () => {
    const [standings, setStandings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState('points');
    const [sortDir, setSortDir] = useState('desc');
    const currentUserId = pb.authStore.model?.id;
    const hasScrolledRef = useRef(false);

    useEffect(() => {
        if (standings.length > 0 && !hasScrolledRef.current && currentUserId && sortKey === 'points') {
            hasScrolledRef.current = true;
            setTimeout(() => {
                const userRow = document.getElementById("user-row-" + currentUserId);
                if (userRow) {
                    userRow.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 100);
        }
    }, [standings, currentUserId, sortKey]);

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                setLoading(true);
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
                    points: user.total_points || 0,
                    incomplete: !!user.incomplete
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

    // Compute prize winners
    const prizeMap = useMemo(() => {
        const map = {};
        const add = (id, prize) => {
            map[id] = map[id] || [];
            if (!map[id].includes(prize)) map[id].push(prize);
        };

        const complete = standings.filter(u => !u.incomplete);
        const completeByPoints = [...complete].sort((a, b) => b.points - a.points);

        // Top 5 by total points, among complete users only: a gold/silver/bronze/medal/medal
        // ladder. A tied group shares a single tier and consumes one ladder slot per member,
        // pushing later tiers down - e.g. two people tied for 1st both get gold and the next
        // group gets bronze (silver is skipped). Nobody wins while the leader is at 0 points.
        const TIERS = ['top-gold', 'top-silver', 'top-bronze', 'top-medal', 'top-medal'];
        if (completeByPoints.length > 0 && completeByPoints[0].points > 0) {
            let slot = 0;
            let i = 0;
            while (i < completeByPoints.length && slot < TIERS.length) {
                const score = completeByPoints[i].points;
                const group = [];
                while (i < completeByPoints.length && completeByPoints[i].points === score) {
                    group.push(completeByPoints[i]);
                    i++;
                }
                const tier = TIERS[slot];
                group.forEach(u => add(u.id, tier));
                slot += group.length;
            }
        }

        // Middle: position is determined across everyone (complete and incomplete). If the
        // slot lands on an incomplete user, they can't win it - instead the nearest complete
        // users above and below that position split the prize.
        const fullByPoints = [...standings].sort((a, b) => b.points - a.points);
        if (fullByPoints.length >= 3) {
            const midIdx = Math.floor((fullByPoints.length - 1) / 2);
            const midUser = fullByPoints[midIdx];
            if (!midUser.incomplete) {
                add(midUser.id, 'middle');
            } else {
                for (let i = midIdx - 1; i >= 0; i--) {
                    if (!fullByPoints[i].incomplete) { add(fullByPoints[i].id, 'middle'); break; }
                }
                for (let i = midIdx + 1; i < fullByPoints.length; i++) {
                    if (!fullByPoints[i].incomplete) { add(fullByPoints[i].id, 'middle'); break; }
                }
            }
        }

        // Second-last: determined among complete users only, so incomplete users at the
        // bottom of the field are skipped entirely.
        if (completeByPoints.length >= 2) {
            add(completeByPoints[completeByPoints.length - 2].id, 'second-last');
        }

        // Category winners, among complete users only. Ties share the prize; a category with
        // nobody above 0 (e.g. C before the final has been scored) has no winner yet.
        [['partA', 'winner-a'], ['partB', 'winner-b'], ['partC', 'winner-c']].forEach(([key, prize]) => {
            if (complete.length === 0) return;
            const topScore = Math.max(...complete.map(u => u[key]));
            if (topScore > 0) {
                complete.filter(u => u[key] === topScore).forEach(u => add(u.id, prize));
            }
        });

        return map;
    }, [standings]);

    if (loading) return <div className="loader">Stand laden...</div>;

    const sorted = [...standings].sort((a, b) =>
        sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
    );

    const handleSort = (col) => {
        if (col === sortKey) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        } else {
            setSortKey(col);
            setSortDir('desc');
        }
    };

    const SortHeader = ({ col, label, className }) => (
        <th className={className} onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
            {label}{sortKey === col ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
        </th>
    );

    const PrizeBadges = ({ userId }) => {
        const prizes = prizeMap[userId];
        if (!prizes) return null;
        return (
            <>
                {prizes.includes('top-gold') && <span className="prize-icon prize-medal-gold">🥇</span>}
                {prizes.includes('top-silver') && <span className="prize-icon prize-medal-silver">🥈</span>}
                {prizes.includes('top-bronze') && <span className="prize-icon prize-medal-bronze">🥉</span>}
                {prizes.includes('top-medal') && <span className="prize-icon prize-medal-plain">🏅</span>}
                {prizes.includes('middle') && <span className="prize-icon prize-cup-sm">🏅</span>}
                {prizes.includes('second-last') && <span className="prize-icon prize-cup-sm">🏅</span>}
                {prizes.includes('winner-a') && <span className="prize-icon prize-letter">A</span>}
                {prizes.includes('winner-b') && <span className="prize-icon prize-letter">B</span>}
                {prizes.includes('winner-c') && <span className="prize-icon prize-letter">C</span>}
            </>
        );
    };

    return (
        <div className="container-centered page-container">
            <header className="page-header tournament-theme">
                <h1 className="tournament-title">Stand</h1>
                <p className="admin-subtitle">Wie staat er bovenaan in de DeRoTo toto?</p>
            </header>

            <div className="leaderboard-card">
                <div className="leaderboard-scroll">
                    <table className="leaderboard-table">
                        <thead>
                            <tr>
                                <th className="text-center">#</th>
                                <th className="text-left">Naam</th>
                                <SortHeader col="partA" label="Groepsfase (A)" className="text-right desktop-only" />
                                <SortHeader col="partB" label="Finales (B)" className="text-right desktop-only" />
                                <SortHeader col="partC" label="Top 4 (C)" className="text-right desktop-only" />
                                <SortHeader col="points" label="Totaal" className="text-right" />
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((user, index) => (
                                <tr key={user.id} id={"user-row-" + user.id}
                                    className={[
                                        index === 0 ? 'top-rank' : '',
                                        user.id === currentUserId ? 'current-user-row' : '',
                                        user.incomplete ? 'user-incomplete' : ''
                                    ].filter(Boolean).join(' ')}
                                >
                                    <td className="rank-cell">{index + 1}</td>
                                    <td className="name-cell">
                                        <div className="player-info-stack">
                                            <span className="player-full-name">
                                                {user.name}{user.incomplete && <span className="incomplete-marker">*</span>}
                                                <PrizeBadges userId={user.id} />
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

                <div className="leaderboard-legend">
                    <div className="legend-row">
                        <span className="legend-item"><span className="prize-icon prize-medal-gold">🥇</span> 1e plek totaal</span>
                        <span className="legend-item"><span className="prize-icon prize-medal-silver">🥈</span> 2e plek totaal</span>
                        <span className="legend-item"><span className="prize-icon prize-medal-bronze">🥉</span> 3e plek totaal</span>
                        <span className="legend-item"><span className="prize-icon prize-medal-plain">🏅</span> 4e–5e plek totaal</span>
                        <span className="legend-item"><span className="prize-icon prize-cup-sm">🏅</span> Midden / Voorlaatste</span>
                        <span className="legend-item"><span className="prize-icon prize-letter">A</span> Winnaar Groepsfase</span>
                        <span className="legend-item"><span className="prize-icon prize-letter">B</span> Winnaar Finales</span>
                        <span className="legend-item"><span className="prize-icon prize-letter">C</span> Winnaar Top 4</span>
                    </div>
                    <div className="legend-note">
                        <span className="incomplete-marker">*</span> Niet volledig ingevuld — doet niet mee om de poedelprijzen
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LeaderboardPage;

import React, { useEffect, useState, useMemo, useRef } from 'react';
import pb from '../lib/pocketbase';
import '../MasterGrid.css';
import '../Features.css';

// --- SIMULATION SETTINGS ---
// Set to null for live behavior. 
// Set to 'Zestiende Finale' (or any stage name) to see the transition.
const SIMULATED_STAGE = null;

export default function MasterMatrix() {
    const [data, setData] = useState({ matches: [], users: [], predictions: [] });
    const [searchTerm, setSearchTerm] = useState('');
    const [hideCompleted, setHideCompleted] = useState(false);
    const [loading, setLoading] = useState(true);
    const userRefs = useRef(new Map());

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];

    useEffect(() => {
        const fetchMatrixData = async () => {
            try {
                setLoading(true);
                const [allMatches, allUsers, allPreds] = await Promise.all([
                    pb.collection('matches').getFullList({
                        sort: 'match_date',
                        expand: 'home_team,away_team',
                    }),
                    pb.collection('users').getFullList({ sort: 'order' }),
                    pb.collection('predictions').getFullList({ requestKey: null })
                ]);
                setData({ matches: allMatches, users: allUsers, predictions: allPreds });
            } catch (err) {
                console.error("Matrix fetch error", err);
            } finally {
                setLoading(false);
            }
        };
        fetchMatrixData();
    }, []);

    const isStageOpen = (stageName, allMatches) => {
        // If we are simulating a specific stage, any stage before it in the list is "Closed"
        if (SIMULATED_STAGE) {
            const simIndex = stageOrder.indexOf(SIMULATED_STAGE);
            const stageIndex = stageOrder.indexOf(stageName);
            return stageIndex >= simIndex;
        }

        if (!allMatches || allMatches.length === 0) return true;
        const stageMatches = allMatches.filter(m => m.stage === stageName);
        if (stageMatches.length === 0) return true;
        const earliest = stageMatches.reduce((e, c) => new Date(c.match_date) < new Date(e) ? c.match_date : e, stageMatches[0].match_date);
        return new Date().getTime() < new Date(earliest).getTime() - (30 * 60 * 1000);
    };

    const sortedUsers = useMemo(() => {
        return [...data.users].sort((a, b) => (a.order || 0) - (b.order || 0) || (a.lastName || "").localeCompare(b.lastName || ""));
    }, [data.users]);

    // This determines which stage the nudge pills are counting
    const activeNudgeStage = useMemo(() => {
        if (SIMULATED_STAGE) return SIMULATED_STAGE;
        return stageOrder.find(s => isStageOpen(s, data.matches)) || "Toernooi";
    }, [data.matches]);

    const userStats = useMemo(() => {
        const stats = {};
        const targetMatches = data.matches.filter(m => m.stage === activeNudgeStage);
        sortedUsers.forEach(user => {
            const completed = data.predictions.filter(p => p.user === user.id && targetMatches.some(m => m.id === p.match)).length;
            stats[user.id] = {
                completed,
                total: targetMatches.length,
                isFinished: targetMatches.length > 0 && completed === targetMatches.length
            };
        });
        return stats;
    }, [data.predictions, data.matches, sortedUsers, activeNudgeStage]);

    const filteredUsers = useMemo(() => {
        if (!hideCompleted) return sortedUsers;
        return sortedUsers.filter(user => !userStats[user.id]?.isFinished);
    }, [sortedUsers, hideCompleted, userStats]);

    // Matches to show in the table (those that are NOT open)
    const visibleMatches = useMemo(() => data.matches.filter(m => !isStageOpen(m.stage, data.matches)), [data.matches]);

    const handleOrderChange = async (userId, newOrder) => {
        const val = parseInt(newOrder) || 0;
        try {
            await pb.collection('users').update(userId, { order: val });
            setData(prev => ({ ...prev, users: prev.users.map(u => u.id === userId ? { ...u, order: val } : u) }));
        } catch (err) { console.error(err); }
    };

    const handlePaidToggle = async (userId, currentStatus) => {
        const newStatus = !currentStatus;
        try {
            await pb.collection('users').update(userId, { paid: newStatus });
            setData(prev => ({ ...prev, users: prev.users.map(u => u.id === userId ? { ...u, paid: newStatus } : u) }));
        } catch (err) { console.error(err); }
    };

    if (loading) return <div>Laden...</div>;
    const isAdmin = pb.authStore.model?.role === 'admin';

    return (
        <div className="matrix-main-layout">
            <header className="page-header matrix-header-compact">
                <h1 className="tournament-title">Matrix Overzicht</h1>
                <div className="matrix-controls-centered">
                    <div className="search-wrapper-centered">
                        <input type="text" placeholder="Zoek een deelnemer..." className="matrix-search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    {isAdmin && (
                        <div className="admin-toggle-bar">
                            <label className="admin-toggle-label">
                                <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
                                Verberg voltooide deelnemers
                            </label>
                        </div>
                    )}
                </div>
            </header>

            <div className="matrix-scroll-container tournament-card">
                <table className="master-matrix">
                    <thead>
                        {/* ROW 1: USER IDENTITY & ADMIN */}
                        <tr>
                            <th className="sticky-col matrix-header-cell corner-label">
                                Match
                            </th>
                            {filteredUsers.map((user) => (
                                <th key={user.id} className={`user-header name-cell ${user.paid ? 'status-paid' : 'status-unpaid'}`}>
                                    <div className="header-identity-stack">
                                        {isAdmin && (
                                            <div className="admin-row">
                                                <input
                                                    type="number"
                                                    className="admin-order-input no-spin"
                                                    defaultValue={user.order || 0}
                                                    onBlur={(e) => handleOrderChange(user.id, e.target.value)}
                                                />
                                                <input
                                                    type="checkbox"
                                                    checked={user.paid || false}
                                                    onChange={() => handlePaidToggle(user.id, user.paid)}
                                                />
                                            </div>
                                        )}
                                        <div className="name-stack">
                                            <span className="f-name">{user.firstName}</span>
                                            <span className="l-name">{user.lastName}</span>
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>

                        {/* ROW 2: CURRENT STAGE PROGRESS (The Nudge Row) */}
                        <tr className="nudge-row-header">
                            <th className="sticky-col matrix-header-cell stage-label-cell">
                                {activeNudgeStage}
                            </th>
                            {filteredUsers.map((user) => (
                                <th key={`nudge-${user.id}`} className="nudge-cell">
                                    <div className={`nudge-pill ${userStats[user.id].isFinished ? 'complete' : 'incomplete'}`}>
                                        {userStats[user.id].completed} / {userStats[user.id].total}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleMatches.map(match => (
                            <tr key={match.id}>
                                <td className="sticky-col match-cell">
                                    <div className="matrix-match-info">
                                        <span className="m-code">{match.expand?.home_team?.code} - {match.expand?.away_team?.code}</span>
                                        {match.result && <span className="m-res">({match.result})</span>}
                                    </div>
                                </td>
                                {filteredUsers.map((user) => {
                                    const pred = data.predictions.find(p => p.match === match.id && p.user === user.id);
                                    const htCorrect = pred && pred.pred_home_ht === match.home_ht && pred.pred_away_ht === match.away_ht;
                                    const ftCorrect = pred && pred.pred_home_ft === match.home_ft && pred.pred_away_ft === match.away_ft;
                                    const totoCorrect = pred && pred.pred_toto === match.match_toto;

                                    return (
                                        <td key={`${match.id}-${user.id}`} className="pred-cell-matrix">
                                            <div className="matrix-score-grid">
                                                <div className="score-row">
                                                    <span className={`s-mini ht ${htCorrect ? 'is-correct' : ''}`}>
                                                        {pred ? `${pred.pred_home_ht}-${pred.pred_away_ht}` : '-'}
                                                    </span>
                                                    <span className={`s-mini ft ${ftCorrect ? 'is-correct' : ''}`}>
                                                        {pred ? `${pred.pred_home_ft}-${pred.pred_away_ft}` : '-'}
                                                    </span>
                                                </div>
                                                <div className={`s-toto ${totoCorrect ? 'is-correct' : ''}`}>
                                                    {pred?.pred_toto || '-'}
                                                </div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
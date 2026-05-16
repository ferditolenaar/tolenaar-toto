import React, { useEffect, useState, useMemo, useRef } from 'react';
import pb from '../lib/pocketbase';
import '../MasterGrid.css';
import '../Features.css';

// --- SIMULATION SETTINGS ---
// Set to null for live behavior. 
// Set to 'Zestiende Finale' (or any stage name) to see the transition.
const SIMULATED_STAGE = null;

export default function MasterMatrix() {
    const [data, setData] = useState({ matches: [], users: [], predictions: [], topFour: [] });
    const [searchTerm, setSearchTerm] = useState('');
    const [hideCompleted, setHideCompleted] = useState(false);
    const [loading, setLoading] = useState(true);
    const userRefs = useRef(new Map());

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];

    useEffect(() => {
        const fetchMatrixData = async () => {
            try {
                setLoading(true);
                const [allMatches, allUsers, allPreds, allTopFour] = await Promise.all([
                    pb.collection('matches').getFullList({
                        sort: 'match_date',
                        expand: 'home_team,away_team',
                    }),
                    pb.collection('users').getFullList({ sort: 'order' }),
                    pb.collection('predictions').getFullList({ requestKey: null }),
                    // Safely fetch the top four predictions collection
                    pb.collection('top_four_predictions').getFullList({ requestKey: null }).catch(() => [])
                ]);
                setData({ matches: allMatches, users: allUsers, predictions: allPreds, topFour: allTopFour });
            } catch (err) {
                console.error("Matrix fetch error", err);
            } finally {
                setLoading(false);
            }
        };
        fetchMatrixData();
    }, []);

    const isStageOpen = (stageName, allMatches) => {
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

    const activeNudgeStage = useMemo(() => {
        if (SIMULATED_STAGE) return SIMULATED_STAGE;
        return stageOrder.find(s => isStageOpen(s, data.matches)) || "Toernooi";
    }, [data.matches]);

    // Track standard match predictions progress
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

    // Track Top 4 predictions progress dynamically per phase
    const topFourStats = useMemo(() => {
        const stats = {};
        // Match phase criteria: 'pre_tournament' during group stage, 'post_group_stage' during knockouts
        const expectedPhase = activeNudgeStage === 'Groepsfase' ? 'pre_tournament' : 'post_group_stage';

        sortedUsers.forEach(user => {
            const userRecords = data.topFour.filter(p => p.user === user.id);
            // Look for a record matching the active phase, or fall back to any available record
            const userPred = userRecords.find(p => p.phase === expectedPhase) || userRecords[0];

            let completed = 0;
            if (userPred) {
                if (userPred.rank_1) completed++;
                if (userPred.rank_2) completed++;
                if (userPred.rank_3) completed++;
                if (userPred.rank_4) completed++;
            }

            stats[user.id] = {
                completed,
                total: 4,
                isFinished: completed === 4
            };
        });
        return stats;
    }, [data.topFour, sortedUsers, activeNudgeStage]);

    const filteredUsers = useMemo(() => {
        if (!hideCompleted) return sortedUsers;
        return sortedUsers.filter(user => !userStats[user.id]?.isFinished);
    }, [sortedUsers, hideCompleted, userStats]);

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

                        {/* ROW 2: CURRENT STAGE PROGRESS (The Match Nudge Row) */}
                        <tr className="nudge-row-header">
                            <th className="sticky-col matrix-header-cell stage-label-cell">
                                Wedstrijden ({activeNudgeStage})
                            </th>
                            {filteredUsers.map((user) => (
                                <th key={`nudge-${user.id}`} className="nudge-cell">
                                    <div className={`nudge-pill ${userStats[user.id].isFinished ? 'complete' : 'incomplete'}`}>
                                        {userStats[user.id].completed} / {userStats[user.id].total}
                                    </div>
                                </th>
                            ))}
                        </tr>

                        {/* ROW 3: TOP 4 SELECTION PROGRESS (The New Nudge Row) */}
                        <tr className="nudge-row-header top-four-nudge-row">
                            <th className="sticky-col matrix-header-cell stage-label-cell">
                                Top 4 Keuze
                            </th>
                            {filteredUsers.map((user) => {
                                const stats = topFourStats[user.id] || { completed: 0, total: 4, isFinished: false };
                                return (
                                    <th key={`top4-${user.id}`} className="nudge-cell">
                                        <div className={`nudge-pill ${stats.isFinished ? 'complete' : 'incomplete'}`}>
                                            {stats.completed} / {stats.total}
                                        </div>
                                    </th>
                                );
                            })}
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
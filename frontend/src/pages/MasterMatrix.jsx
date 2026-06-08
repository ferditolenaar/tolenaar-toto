import React, { useEffect, useState, useMemo, useRef } from 'react';
import pb from '../lib/pocketbase';
import '../MasterGrid.css';
import '../Features.css';

// --- SIMULATION SETTINGS ---
// Set to null for live behavior. 
// Set to 'Zestiende Finale' (or any stage name) to see the transition.
const SIMULATED_STAGE = null;

// Local debug helper: only active in development builds.
// Use ?showPreTop4=1 or ?showPrep=1 in the browser when running locally.
const DEBUG_LOCAL_TEST_START = import.meta.env.DEV && ['1', 'true'].includes(
    new URLSearchParams(window.location.search).get('showPreTop4') ||
    new URLSearchParams(window.location.search).get('showPrep') ||
    '0'
);

export default function MasterMatrix() {
    const [data, setData] = useState({ matches: [], users: [], predictions: [], topFour: [] });
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [hideCompleted, setHideCompleted] = useState(false);
    const [loading, setLoading] = useState(true);
    const userRefs = useRef(new Map());
    const scrollContainerRef = useRef(null);
    const headerRef = useRef(null);

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];

    // Get current user ID early for use in effects
    const currentUserId = pb.authStore.model?.id;

    const scrollToUser = (userId) => {
        if (!userId || !scrollContainerRef.current) return;
        const headerCell = userRefs.current.get(userId);
        if (headerCell) {
            headerCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    };

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

    // Auto-scroll to logged-in user when data loads
    useEffect(() => {
        if (loading || !pb.authStore.model?.id) return;
        setTimeout(() => {
            const userCell = userRefs.current.get(pb.authStore.model.id);
            if (userCell) {
                userCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }, 100);
    }, [loading]);

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

        sortedUsers.forEach(user => {
            const preRecord = data.topFour.find(p => p.user === user.id && p.phase === 'pre_tournament');
            const completed = preRecord
                ? ['rank_1', 'rank_2', 'rank_3', 'rank_4'].filter(key => !!preRecord[key]).length
                : 0;

            stats[user.id] = {
                completed,
                total: 4,
                isFinished: completed === 4,
                record: preRecord
            };
        });
        return stats;
    }, [data.topFour, sortedUsers]);

    const filteredUsers = useMemo(() => {
        return !hideCompleted ? sortedUsers : sortedUsers.filter(user => !userStats[user.id]?.isFinished);
    }, [sortedUsers, hideCompleted, userStats]);

    const predictionsByMatchUser = useMemo(() => {
        const map = {};
        data.predictions.forEach(p => {
            map[`${p.match}_${p.user}`] = p;
        });
        return map;
    }, [data.predictions]);

    useEffect(() => {
        const timeout = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250);
        return () => clearTimeout(timeout);
    }, [searchTerm]);

    useEffect(() => {
        if (!scrollContainerRef.current) return;
        if (!debouncedSearch) {
            // When search is cleared, scroll to logged-in user
            if (currentUserId) {
                scrollToUser(currentUserId);
            } else {
                scrollContainerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
            }
            return;
        }

        const needle = debouncedSearch.toLowerCase();
        const target = filteredUsers.find(user => {
            const name = `${user.firstName || ''} ${user.lastName || ''}`.trim().toLowerCase();
            return name.includes(needle);
        });
        if (!target) return;
        const headerCell = userRefs.current.get(target.id);
        if (headerCell) {
            headerCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [debouncedSearch, filteredUsers, currentUserId]);

    const earliestMatchDate = useMemo(() => {
        if (!data.matches.length) return null;
        return data.matches.reduce((earliest, match) => {
            const matchDate = new Date(match.match_date);
            return matchDate < earliest ? matchDate : earliest;
        }, new Date(data.matches[0].match_date));
    }, [data.matches]);

    const hasTournamentStarted = useMemo(() => {
        return earliestMatchDate ? new Date() >= earliestMatchDate : false;
    }, [earliestMatchDate]);

    const tournamentStarted = hasTournamentStarted || DEBUG_LOCAL_TEST_START;
    const showAdminCounts = !tournamentStarted;
    const showTopFourComparisonRow = tournamentStarted;

    const printUserChunks = useMemo(() => {
        const chunkSize = 18; // increase to 18 users per printed page for denser output
        const chunks = [];
        for (let i = 0; i < filteredUsers.length; i += chunkSize) {
            chunks.push(filteredUsers.slice(i, i + chunkSize));
        }
        return chunks;
    }, [filteredUsers]);
    
    const visibleMatches = useMemo(
        () => (tournamentStarted ? data.matches : []),
        [data.matches, tournamentStarted]
    );

    const topFourByUser = useMemo(() => {
        const map = {};
        (data.topFour || []).forEach(t => {
            if (t.phase === 'pre_tournament') {
                map[t.user] = t;
            }
        });
        return map;
    }, [data.topFour]);

    const teamNameById = useMemo(() => {
        const map = {};
        data.matches.forEach(match => {
            const home = match.expand?.home_team;
            const away = match.expand?.away_team;
            if (home?.id) map[home.id] = home.code || home.name || home.id;
            if (away?.id) map[away.id] = away.code || away.name || away.id;
        });
        return map;
    }, [data.matches]);

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

    useEffect(() => {
        const updateHeaderHeight = () => {
            if (headerRef.current) {
                document.documentElement.style.setProperty('--matrix-header-height', `${headerRef.current.offsetHeight}px`);
            }
        };
        updateHeaderHeight();
        window.addEventListener('resize', updateHeaderHeight);
        return () => window.removeEventListener('resize', updateHeaderHeight);
    }, []);

    if (loading) return <div>Laden...</div>;
    const isAdmin = pb.authStore.model?.role === 'admin';

    return (
        <div className="matrix-main-layout">
            <div className="screen-only">
                <header ref={headerRef} className="page-header matrix-header-compact">
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

            <div ref={scrollContainerRef} className="matrix-scroll-container tournament-card">
                <table className="master-matrix">
                    <thead>
                        {/* ROW 1: USER IDENTITY & ADMIN */}
                        <tr>
                            <th className="sticky-col matrix-header-cell corner-label">
                                Match
                            </th>
                            {filteredUsers.map((user) => (
                                <th
                                    key={user.id}
                                    ref={(el) => {
                                        if (el) userRefs.current.set(user.id, el);
                                        else userRefs.current.delete(user.id);
                                    }}
                                    className={`user-header name-cell ${user.paid ? 'status-paid' : 'status-unpaid'}`}>
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
                        {showAdminCounts && (
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
                        )}

                        {/* ROW 3: TOP 4 SELECTION PROGRESS (The New Nudge Row) */}
                        {showAdminCounts && (
                            <tr className="nudge-row-header top-four-nudge-row">
                                <th className="sticky-col matrix-header-cell stage-label-cell">
                                    Top 4 Keuze
                                </th>
                                {filteredUsers.map((user) => {
                                    const stats = topFourStats[user.id] || { completed: 0, total: 4, isFinished: false, record: null };
                                    const tooltip = stats.record
                                        ? ['rank_1', 'rank_2', 'rank_3', 'rank_4']
                                            .map((rank) => teamNameById[stats.record[rank]] || '-')
                                            .join(' | ')
                                        : 'Geen Top 4 ingevuld';

                                    return (
                                        <th key={`top4-${user.id}`} className="nudge-cell">
                                            <div className={`nudge-pill ${stats.isFinished ? 'complete' : 'incomplete'}`} title={tooltip}>
                                                {stats.completed} / {stats.total}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        )}
                        {showTopFourComparisonRow && (
                            <tr className="nudge-row-header top-four-nudge-row">
                                <th className="sticky-col matrix-header-cell stage-label-cell">
                                    <div className="top4-compare-lines">
                                        {['1', '2', '3', '4'].map(rank => (
                                            <div key={rank}>{rank}.</div>
                                        ))}
                                    </div>
                                </th>
                                {filteredUsers.map((user) => {
                                    const record = topFourByUser[user.id];

                                    return (
                                        <th key={`top4-compare-${user.id}`} className="nudge-cell">
                                            <div className="top4-compare-lines">
                                                {['rank_1', 'rank_2', 'rank_3', 'rank_4'].map((rank, index) => (
                                                    <div key={rank}>{teamNameById[record?.[rank]] || '-'}</div>
                                                ))}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        )}
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
                                    const pred = predictionsByMatchUser[`${match.id}_${user.id}`];
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

            <div className="print-only">
                {printUserChunks.map((userChunk, pageIndex) => (
                    <div key={pageIndex} className="print-matrix-page">
                        <div className="print-matrix-page-header">
                            <div>Matrix Overzicht</div>
                            <div>Pagina {pageIndex + 1} / {printUserChunks.length}</div>
                        </div>
                        <table className="print-matrix-table">
                            <thead>
                                <tr>
                                    <th className="print-match-header">Match</th>
                                    {userChunk.map((user) => (
                                        <th key={user.id} className="print-user-header">
                                            {user.firstName} {user.lastName}
                                        </th>
                                    ))}
                                </tr>
                                {tournamentStarted && ['1', '2', '3', '4'].map((rank) => (
                                    <tr key={`top4-rank-${rank}`} className="print-top4-row">
                                        <td className="print-match-header print-top4-label">{rank}.</td>
                                        {userChunk.map((user) => {
                                            const tf = topFourByUser[user.id];
                                            const rawValue = tf ? tf[`rank_${rank}`] : null;
                                            const value = rawValue ? teamNameById[rawValue] || rawValue : '-';
                                            return (
                                                <td key={`top4-${user.id}-${rank}`} className="print-user-header print-top4-value">
                                                    {value}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </thead>
                            <tbody>
                                {visibleMatches.map(match => (
                                    <tr key={`${match.id}-${pageIndex}`}>
                                        <td className="print-match-cell">
                                            <div className="print-match-code">{match.expand?.home_team?.code} - {match.expand?.away_team?.code}</div>
                                            <div className="print-match-stage">{match.stage}</div>
                                        </td>
                                        {userChunk.map((user) => {
                                            const pred = predictionsByMatchUser[`${match.id}_${user.id}`];
                                            return (
                                                <td key={`${match.id}-${user.id}`} className="print-pred-cell">
                                                    <div className="print-pred-stack">
                                                        <span className="print-pred-score">
                                                            {pred ? `${pred.pred_home_ft}-${pred.pred_away_ft}` : '--'}
                                                        </span>
                                                        <span className="print-pred-toto">
                                                            {pred?.pred_toto || '-'}
                                                        </span>
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>
        </div>
    );
}
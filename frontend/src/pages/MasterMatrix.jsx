import React, { useEffect, useState, useMemo, useRef } from 'react';
import pb from '../lib/pocketbase';
import { isMatchStarted } from '../lib/matchUtils';
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
    const matchRefs = useRef(new Map());
    const scrollContainerRef = useRef(null);
    const headerRef = useRef(null);
    const f1RowRef = useRef(null);
    const [f2StickyTop, setF2StickyTop] = useState(176);

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];

    // Get current user ID and role early for use in effects and memos
    const currentUserId = pb.authStore.model?.id;
    const isAdmin = pb.authStore.model?.role === 'admin';

    const scrollToUser = (userId) => {
        if (!userId || !scrollContainerRef.current) return;
        const headerCell = userRefs.current.get(userId);
        if (headerCell) {
            headerCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    };

    useEffect(() => {
        let isMounted = true;

        const fetchMatrixData = async () => {
            try {
                setLoading(true);

                // Check cache for static data
                const CACHE_KEY = 'matrix_static_data';
                const cachedDataStr = localStorage.getItem(CACHE_KEY);
                let cachedStatic = null;
                let doBackgroundFetch = true;

                if (cachedDataStr) {
                    try {
                        const parsed = JSON.parse(cachedDataStr);
                        cachedStatic = parsed.data;
                        // If cache is less than 5 minutes old, skip background fetch to prevent unnecessary re-renders
                        if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
                            doBackgroundFetch = false;
                        }
                    } catch (e) {
                        console.warn("Cache parse error", e);
                    }
                }

                // Always fetch matches fresh
                const matchesPromise = pb.collection('matches').getFullList({
                    sort: 'match_date',
                    expand: 'home_team,away_team',
                });

                if (cachedStatic) {
                    // Fast path: wait only for matches
                    const allMatches = await matchesPromise;
                    if (!isMounted) return;
                    
                    setData({
                        matches: allMatches,
                        users: cachedStatic.users,
                        predictions: cachedStatic.predictions,
                        topFour: cachedStatic.topFour
                    });
                    setLoading(false);

                    // Background refresh if cache is older than 5 minutes
                    if (doBackgroundFetch) {
                        Promise.all([
                            pb.collection('users').getFullList({ sort: 'order' }),
                            pb.collection('predictions').getFullList({ requestKey: null }),
                            pb.collection('top_four_predictions').getFullList({ requestKey: null }).catch(() => [])
                        ]).then(([allUsers, allPreds, allTopFour]) => {
                            if (isMounted) {
                                setData(prev => ({ ...prev, users: allUsers, predictions: allPreds, topFour: allTopFour }));
                            }
                            try {
                                localStorage.setItem(CACHE_KEY, JSON.stringify({
                                    timestamp: Date.now(),
                                    data: { users: allUsers, predictions: allPreds, topFour: allTopFour }
                                }));
                            } catch (error) {
                                console.warn("Cache write error", error);
                            }
                        }).catch(err => console.error("Background fetch error", err));
                    }
                } else {
                    // Slow path: fetch everything
                    const [allMatches, allUsers, allPreds, allTopFour] = await Promise.all([
                        matchesPromise,
                        pb.collection('users').getFullList({ sort: 'order' }),
                        pb.collection('predictions').getFullList({ requestKey: null }),
                        pb.collection('top_four_predictions').getFullList({ requestKey: null }).catch(() => [])
                    ]);

                    if (isMounted) {
                        setData({ matches: allMatches, users: allUsers, predictions: allPreds, topFour: allTopFour });
                        setLoading(false);
                        
                        try {
                            localStorage.setItem(CACHE_KEY, JSON.stringify({
                                timestamp: Date.now(),
                                data: { users: allUsers, predictions: allPreds, topFour: allTopFour }
                            }));
                        } catch (error) { console.warn("Cache error", error); }
                    }
                }
            } catch (err) {
                console.error("Matrix fetch error", err);
                if (isMounted) setLoading(false);
            }
        };
        
        fetchMatrixData();
        return () => { isMounted = false; };
    }, []);

    // Auto-scroll removed from here, moved down

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

    const hasStageStarted = (stageName, allMatches) => {
        if (SIMULATED_STAGE) {
            return stageOrder.indexOf(stageName) <= stageOrder.indexOf(SIMULATED_STAGE);
        }
        const stageMatches = allMatches.filter(m => m.stage === stageName);
        if (stageMatches.length === 0) return false;
        const earliest = stageMatches.reduce((e, c) => new Date(c.match_date) < new Date(e) ? c.match_date : e, stageMatches[0].match_date);
        return new Date() >= new Date(earliest);
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

    // True when group stage is done and Zestiende Finale predictions are still open
    // (closes 30 min before the 2nd Zestiende Finale match, same cutoff as isStageOpen)
    const isPostGroupTop4Window = useMemo(() => {
        const groupMatches = data.matches.filter(m => m.stage === 'Groepsfase');
        if (groupMatches.length === 0) return false;
        const lastGroupDate = groupMatches.reduce((e, m) =>
            new Date(m.match_date) > new Date(e) ? m.match_date : e,
            groupMatches[0].match_date
        );
        const postGroupActive = Date.now() > new Date(lastGroupDate).getTime() + 2 * 60 * 60 * 1000;
        return postGroupActive && isStageOpen('Zestiende Finale', data.matches);
    }, [data.matches]);

    // Track Top 4 predictions progress dynamically per phase
    const topFourStats = useMemo(() => {
        const stats = {};
        const activePhase = isPostGroupTop4Window ? 'post_group_stage' : 'pre_tournament';

        sortedUsers.forEach(user => {
            const record = data.topFour.find(p => p.user === user.id && p.phase === activePhase);
            const completed = record
                ? ['rank_1', 'rank_2', 'rank_3', 'rank_4'].filter(key => !!record[key]).length
                : 0;

            stats[user.id] = {
                completed,
                total: 4,
                isFinished: completed === 4,
                record
            };
        });
        return stats;
    }, [data.topFour, sortedUsers, isPostGroupTop4Window]);

    const filteredUsers = useMemo(() => {
        if (!hideCompleted) return sortedUsers;
        return sortedUsers.filter(user => {
            const matchFinished = !!userStats[user.id]?.isFinished;
            // Only factor top4 into "complete" when a top4 window is actually active
            const firstMatchStarted = data.matches.length > 0 && isMatchStarted(
                data.matches.reduce((e, m) => new Date(m.match_date) < new Date(e) ? m.match_date : e, data.matches[0].match_date)
            );
            const top4WindowActive = !firstMatchStarted || isPostGroupTop4Window;
            if (top4WindowActive) {
                const top4Finished = !!topFourStats[user.id]?.isFinished;
                return !(matchFinished && top4Finished);
            }
            return !matchFinished;
        });
    }, [sortedUsers, hideCompleted, userStats, topFourStats, data.matches, isPostGroupTop4Window]);

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
        return earliestMatchDate ? isMatchStarted(earliestMatchDate) : false;
    }, [earliestMatchDate]);

    const tournamentStarted = hasTournamentStarted || DEBUG_LOCAL_TEST_START;
    // Admins see match completion counts until the active stage's first match actually kicks off
    const showMatchNudgeRow = isAdmin && activeNudgeStage !== 'Toernooi';
    // Admins see top4 completion counts during pre-tournament AND during the post-group window
    const showTop4NudgeRow = isAdmin && (!tournamentStarted || isPostGroupTop4Window);
    const showTopFourComparisonRow = tournamentStarted;
    const showPostGroupTop4Row = hasStageStarted('Zestiende Finale', data.matches);

    const printUserChunks = useMemo(() => {
        const chunkSize = 18; // increase to 18 users per printed page for denser output
        const chunks = [];
        for (let i = 0; i < filteredUsers.length; i += chunkSize) {
            chunks.push(filteredUsers.slice(i, i + chunkSize));
        }
        return chunks;
    }, [filteredUsers]);
    
    const visibleMatches = useMemo(() => {
        if (!tournamentStarted) return [];
        return data.matches.filter(m => hasStageStarted(m.stage, data.matches));
    }, [data.matches, tournamentStarted]);

    const currentMatchId = useMemo(() => {
        if (!visibleMatches || visibleMatches.length === 0) return null;
        const now = new Date().getTime();
        const targetMatch = visibleMatches.find(m => new Date(m.match_date).getTime() > now);
        return targetMatch ? targetMatch.id : visibleMatches[visibleMatches.length - 1].id;
    }, [visibleMatches]);

    // Auto-scroll to logged-in user and current match when data loads
    useEffect(() => {
        if (loading || !scrollContainerRef.current) return;

        setTimeout(() => {
            const container = scrollContainerRef.current;
            const containerRect = container.getBoundingClientRect();
            
            let targetScrollTop = container.scrollTop;
            let targetScrollLeft = container.scrollLeft;
            let shouldScroll = false;

            // 1. Find user target (horizontal)
            const currentUserId = pb.authStore.model?.id;
            if (currentUserId) {
                const userCell = userRefs.current.get(currentUserId);
                if (userCell) {
                    const userRect = userCell.getBoundingClientRect();
                    targetScrollLeft = container.scrollLeft + (userRect.left - containerRect.left) - (containerRect.width / 2) + (userRect.width / 2);
                    shouldScroll = true;
                }
            }

            // 2. Find match target (vertical)
            if (currentMatchId) {
                const matchRow = matchRefs.current.get(currentMatchId);
                if (matchRow) {
                    const matchRect = matchRow.getBoundingClientRect();
                    targetScrollTop = container.scrollTop + (matchRect.top - containerRect.top) - (containerRect.height / 2) + (matchRect.height / 2);
                    shouldScroll = true;
                }
            }

            if (shouldScroll) {
                container.scrollTo({ top: Math.max(0, targetScrollTop), left: Math.max(0, targetScrollLeft), behavior: 'smooth' });
            }
        }, 150);
    }, [loading, currentMatchId]);

    const topFourByUser = useMemo(() => {
        const map = {};
        (data.topFour || []).forEach(t => {
            if (t.phase === 'pre_tournament') {
                map[t.user] = t;
            }
        });
        return map;
    }, [data.topFour]);

    const topFourByUserPost = useMemo(() => {
        const map = {};
        (data.topFour || []).forEach(t => {
            if (t.phase === 'post_group_stage') {
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

    useEffect(() => {
        if (f1RowRef.current) {
            setF2StickyTop(86 + f1RowRef.current.getBoundingClientRect().height);
        }
    }, [showTopFourComparisonRow, showPostGroupTop4Row, filteredUsers]);

    if (loading) return <div>Laden...</div>;

    return (
        <div className="matrix-main-layout">
            <div className="screen-only">
                <header ref={headerRef} className="page-header matrix-header-compact">
                <h1 className="tournament-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Matrix Overzicht
                    <span 
                        onClick={() => {
                            localStorage.removeItem('matrix_static_data');
                            window.location.reload();
                        }}
                        style={{ cursor: 'pointer', marginLeft: '10px', fontSize: '0.8em', opacity: 0.7 }}
                        title="Forceer Herladen"
                    >
                        ↻
                    </span>
                </h1>
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
                        {showMatchNudgeRow && (
                            <tr className="nudge-row-header">
                                <th className="sticky-col matrix-header-cell stage-label-cell">
                                    Wedstrijden ({activeNudgeStage})
                                </th>
                                {filteredUsers.map((user) => (
                                    <th key={`nudge-${user.id}`} className={`nudge-cell ${user.id === currentUserId ? 'is-current-user' : ''}`}>
                                        <div className={`nudge-pill ${userStats[user.id].isFinished ? 'complete' : 'incomplete'}`}>
                                            {userStats[user.id].completed} / {userStats[user.id].total}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        )}

                        {/* ROW 3: TOP 4 SELECTION PROGRESS (The New Nudge Row) */}
                        {showTop4NudgeRow && (
                            <tr className="nudge-row-header top-four-nudge-row">
                                <th className="sticky-col matrix-header-cell stage-label-cell">
                                    {isPostGroupTop4Window ? 'Knock-out Top 4' : 'Top 4 Keuze'}
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
                            <tr ref={f1RowRef} className="nudge-row-header top-four-nudge-row">
                                <th className="sticky-col matrix-header-cell stage-label-cell">
                                    <div style={{ fontSize: '0.65em', opacity: 0.7, marginBottom: '2px' }}>Top 4 F1</div>
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
                                                {['rank_1', 'rank_2', 'rank_3', 'rank_4'].map((rank) => (
                                                    <div key={rank}>{teamNameById[record?.[rank]] || '-'}</div>
                                                ))}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        )}
                        {showPostGroupTop4Row && (
                            <tr className="nudge-row-header top-four-nudge-row">
                                <th className="sticky-col matrix-header-cell stage-label-cell nudge-row-2" style={{ top: f2StickyTop }}>
                                    <div style={{ fontSize: '0.65em', opacity: 0.7, marginBottom: '2px' }}>Top 4 F2</div>
                                    <div className="top4-compare-lines">
                                        {['1', '2', '3', '4'].map(rank => (
                                            <div key={rank}>{rank}.</div>
                                        ))}
                                    </div>
                                </th>
                                {filteredUsers.map((user) => {
                                    const record = topFourByUserPost[user.id];
                                    return (
                                        <th key={`top4-compare-post-${user.id}`} className="nudge-cell nudge-row-2" style={{ top: f2StickyTop }}>
                                            <div className="top4-compare-lines">
                                                {['rank_1', 'rank_2', 'rank_3', 'rank_4'].map((rank) => (
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
                        {visibleMatches.map(match => {
                            const matchStarted = isMatchStarted(match.match_date);
                            
                            return (
                                <tr
                                    key={match.id}
                                    className={match.id === currentMatchId ? 'is-current-match' : ''}
                                    ref={(el) => {
                                        if (el) matchRefs.current.set(match.id, el);
                                        else matchRefs.current.delete(match.id);
                                    }}
                                >
                                    <td className="sticky-col match-cell">
                                        <div className="matrix-match-info">
                                            <span className="m-code">{match.expand?.home_team?.code} - {match.expand?.away_team?.code}</span>
                                            {match.result && <span className="m-res">({match.result})</span>}
                                        </div>
                                    </td>
                                    {filteredUsers.map((user) => {
                                        const pred = predictionsByMatchUser[`${match.id}_${user.id}`];
                                        
                                        // Only highlight predictions if the match has actually started
                                        const htCorrect = matchStarted && pred && pred.pred_home_ht === match.home_ht && pred.pred_away_ht === match.away_ht;
                                        const ftCorrect = matchStarted && pred && pred.pred_home_ft === match.home_ft && pred.pred_away_ft === match.away_ft;
                                        const totoCorrect = matchStarted && pred && pred.pred_toto === match.match_toto;

                                        return (
                                            <td key={`${match.id}-${user.id}`} className={`pred-cell-matrix ${user.id === currentUserId ? 'is-current-user' : ''}`}>
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
                        );
                    })}
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
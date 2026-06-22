import React, { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import { calculateMatchPoints, calculateTop4Points } from '../lib/scoring';
import { isMatchStarted } from '../lib/matchUtils';
import '../Features.css';
import '../Admin.css';

const AdminMatchResults = () => {
    const [matches, setMatches] = useState([]);
    const [allTeams, setAllTeams] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);

    const user = pb.authStore.model;
    const isAdmin = user?.role === 'admin';

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];
    const [activeStages, setActiveStages] = useState(stageOrder);
    const hasScrolledRef = React.useRef(false);

    useEffect(() => {
        if (matches.length > 0 && !hasScrolledRef.current) {
            hasScrolledRef.current = true;
            const now = new Date().getTime();
            let targetMatch = matches.find(m => new Date(m.match_date).getTime() > now);
            if (!targetMatch) {
                targetMatch = matches[matches.length - 1];
            }
            if (targetMatch) {
                setTimeout(() => {
                    const matchEl = document.getElementById("match-" + targetMatch.id);
                    if (matchEl) {
                        matchEl.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }, 100);
            }
        }
    }, [matches]);

    useEffect(() => { loadData(); }, []);

    const handleGlobalRecalculate = async () => {
        if (!window.confirm("Weet je het zeker? Dit overschrijft alle punten in de database.")) return;

        setIsSyncing(true); // Assuming you have a loading state
        try {
            const [rules, official, matches, users, predictions, top4Preds] = await Promise.all([
                pb.collection('tournament_settings').getFirstListItem('is_active=true'),
                pb.collection('tournament_top4').getFirstListItem(''),
                pb.collection('matches').getFullList(),
                pb.collection('users').getFullList({ filter: 'paid = true' }),
                pb.collection('predictions').getFullList(),
                pb.collection('top_four_predictions').getFullList()
            ]);

            const playedMatches = matches.filter(match => isMatchStarted(match.match_date));

            for (const user of users) {
                let pA = 0, pB = 0, pC = 0;

                // Match Points
                predictions.filter(p => p.user === user.id).forEach(pred => {
                    const m = playedMatches.find(match => match.id === pred.match);
                    const pts = calculateMatchPoints(pred, m, rules);
                    if (m?.stage === 'Groepsfase') pA += pts;
                    else if (m) pB += pts;
                });

                // Top 4 Points
                const uTop4 = top4Preds.filter(p => p.user === user.id);
                pC += calculateTop4Points(uTop4.find(p => p.phase === 'pre_tournament'), official, rules.top4_pre_tournament);
                pC += calculateTop4Points(uTop4.find(p => p.phase === 'post_group_stage'), official, rules.top4_post_tournament);

                // UPDATE THE USER RECORD
                await pb.collection('users').update(user.id, {
                    total_points: pA + pB + pC,
                    score_part_a: pA,
                    score_part_b: pB,
                    score_part_c: pC
                });
            }
            alert("Database is bijgewerkt!");
        } catch (err) {
            console.error(err);
            alert("Fout bij herberekenen.");
        } finally {
            setIsSyncing(false);
        }
    };

    const isPlaceholder = (team) => {
        if (!team) return false;
        const name = team.name.toLowerCase();
        return name.includes('winnaar') || name.includes('1e') || name.includes('2e') ||
            name.includes('3e') || name.includes('nummer') || name.includes('wedstrijd');
    };

    const actualTeams = allTeams.filter(t => !isPlaceholder(t));

    const knockoutStages = stageOrder.filter(s => s !== 'Groepsfase');

    const loadData = async () => {
        try {
            const [matchRecords, teamRecords] = await Promise.all([
                pb.collection('matches').getFullList({
                    sort: 'match_date',
                    expand: 'home_team,away_team,home_team_original,away_team_original',
                }),
                pb.collection('teams').getFullList({ sort: 'name' }),
            ]);
            setAllTeams(teamRecords);

            // One-time: snapshot original placeholder teams for knockout matches
            const toInit = matchRecords.filter(m =>
                knockoutStages.includes(m.stage) &&
                (!m.home_team_original || !m.away_team_original)
            );

            if (toInit.length > 0) {
                await Promise.all(toInit.map(m => {
                    const update = {};
                    if (!m.home_team_original && m.home_team) update.home_team_original = m.home_team;
                    if (!m.away_team_original && m.away_team) update.away_team_original = m.away_team;
                    return Object.keys(update).length ? pb.collection('matches').update(m.id, update) : null;
                }));

                const refreshed = await pb.collection('matches').getFullList({
                    sort: 'match_date',
                    expand: 'home_team,away_team,home_team_original,away_team_original',
                });
                setMatches(refreshed);
            } else {
                setMatches(matchRecords);
            }
        } catch (err) {
            console.error("Error loading matches:", err);
        }
    };

    const updateTeamInMatch = async (matchId, field, teamId) => {
        try {
            await pb.collection('matches').update(matchId, { [field]: teamId });
            const updated = await pb.collection('matches').getOne(matchId, { expand: 'home_team,away_team,home_team_original,away_team_original' });
            setMatches(prev => prev.map(m => m.id === matchId ? updated : m));
        } catch (err) {
            console.error("Team update mislukt", err);
        }
    };

    const prevStageConfig = {
        'Achtste Finale':  { stage: 'Zestiende Finale', type: 'winners' },
        'Kwartfinale':     { stage: 'Achtste Finale',   type: 'winners' },
        'Halve Finale':    { stage: 'Kwartfinale',      type: 'winners' },
        'Finale':          { stage: 'Halve Finale',     type: 'winners' },
        'Troostfinale':    { stage: 'Halve Finale',     type: 'losers'  },
    };

    const renderTeam = (match, side) => {
        const field = side === 'home' ? 'home_team' : 'away_team';
        const origField = side === 'home' ? 'home_team_original' : 'away_team_original';
        const team = match.expand?.[field];
        const originalTeam = match.expand?.[origField];
        const isKnockout = match.stage !== 'Groepsfase';

        if (isAdmin && isKnockout) {
            const config = prevStageConfig[match.stage];
            let eligibleTeams = actualTeams;

            if (config) {
                const prevMatches = groupedMatches[config.stage] || [];
                const eligibleIds = new Set();
                prevMatches.forEach(pm => {
                    if (pm.match_toto === '3') {
                        if (pm.home_team) eligibleIds.add(pm.home_team);
                        if (pm.away_team) eligibleIds.add(pm.away_team);
                    } else if (config.type === 'winners') {
                        if (pm.match_toto === '1' && pm.home_team) eligibleIds.add(pm.home_team);
                        else if (pm.match_toto === '2' && pm.away_team) eligibleIds.add(pm.away_team);
                    } else {
                        if (pm.match_toto === '1' && pm.away_team) eligibleIds.add(pm.away_team);
                        else if (pm.match_toto === '2' && pm.home_team) eligibleIds.add(pm.home_team);
                    }
                });
                if (eligibleIds.size > 0) eligibleTeams = actualTeams.filter(t => eligibleIds.has(t.id));
            }

            return (
                <select
                    className="team-select"
                    value={match[field] || ''}
                    onChange={(e) => updateTeamInMatch(match.id, field, e.target.value)}
                >
                    {originalTeam && (
                        <option value={match[origField]}>{originalTeam.name}</option>
                    )}
                    <optgroup label="Landen">
                        {eligibleTeams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </optgroup>
                </select>
            );
        }

        return (
            <>
                <span className="desktop-only">{team?.name}</span>
                <span className="mobile-only">{team?.code}</span>
            </>
        );
    };

    const [visibleStage, setVisibleStage] = useState(stageOrder[0]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        let stageId = entry.target.id;

                        // Group the last three stages under the 'Halve Finale' highlight
                        if (['Troostfinale', 'Finale'].includes(stageId)) {
                            stageId = 'Halve Finale';
                        }

                        setVisibleStage(stageId);
                    }
                });
            },
            { rootMargin: "-10px 0px -80% 0px", threshold: 0 }
        );

        // Observe all stages so we can trigger the highlight shift
        stageOrder.forEach((stage) => {
            const el = document.getElementById(stage);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [matches]);

    // --- CENTRAL PROCESSING ENGINE ---
    const processUpdate = (matchId, field, value) => {
        if (!isAdmin) return;

        const match = matches.find(m => m.id === matchId);
        if (!match) return;

        let cleanValue;
        if (field === 'match_toto') {
            cleanValue = String(value);
        } else {
            cleanValue = value === '' ? '' : Math.max(0, parseInt(value) || 0);
        }

        // Prepare updated object
        const updatedMatch = { ...match, [field]: cleanValue };

        // Auto-TOTO Logic
        if (field === 'home_ft' || field === 'away_ft') {
            const h = parseInt(updatedMatch.home_ft) || 0;
            const a = parseInt(updatedMatch.away_ft) || 0;
            updatedMatch.match_toto = h > a ? '1' : a > h ? '2' : '3';
        }

        // Update UI state
        setMatches(prev => prev.map(m => m.id === matchId ? updatedMatch : m));

        // Trigger Save
        autoSaveResult(matchId, updatedMatch);
    };

    const autoSaveResult = async (matchId, updatedMatch) => {
        setIsSyncing(true);
        const data = {
            home_ht: Number(updatedMatch.home_ht) || 0,
            away_ht: Number(updatedMatch.away_ht) || 0,
            home_ft: Number(updatedMatch.home_ft) || 0,
            away_ft: Number(updatedMatch.away_ft) || 0,
            match_toto: String(updatedMatch.match_toto || '3')
        };

        try {
            await pb.collection('matches').update(matchId, data);
            setLastSaved(new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }));
        } catch (err) {
            console.error("Opslaan mislukt", err);
        } finally {
            setTimeout(() => setIsSyncing(false), 500);
        }
    };

    const handleStep = (matchId, field, delta) => {
        const match = matches.find(m => m.id === matchId);
        const currentVal = parseInt(match?.[field]) || 0;
        processUpdate(matchId, field, currentVal + delta);
    };

    const groupedMatches = matches.reduce((acc, match) => {
        const stage = match.stage || 'Overig';
        if (!acc[stage]) acc[stage] = [];
        acc[stage].push(match);
        return acc;
    }, {});

    const saveMatchNumber = async (matchId, value) => {
        const num = parseInt(value);
        if (!num) return;
        try {
            await pb.collection('matches').update(matchId, { match_number: num });
            setMatches(prev => prev.map(m => m.id === matchId ? { ...m, match_number: num } : m));
        } catch (err) {
            console.error("Match number opslaan mislukt", err);
        }
    };

    const formatDateTime = (dateStr, isMobile) => {
        const d = new Date(dateStr);
        const options = { day: 'numeric', month: isMobile ? 'short' : 'long', timeZone: 'Europe/Amsterdam' };
        const datePart = d.toLocaleDateString('nl-NL', options);
        const timePart = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
        return `${datePart} ${isMobile ? '' : timePart}`;
    };

    const navStages = [
        'Groepsfase',
        'Zestiende Finale',
        'Achtste Finale',
        'Kwartfinale',
        'Halve Finale' // This will now be the last link
    ];

    const getShortStageName = (name) => {
        const names = {
            'Groepsfase': 'Groep',
            'Zestiende Finale': '1/16',
            'Achtste Finale': '1/8',
            'Kwartfinale': '1/4',
            'Halve Finale': '1/2'
        };
        return names[name] || name;
    };

    return (
        <div className="container-centered page-container">
            <header className="page-header tournament-theme">
                <h1 className="tournament-title">
                    {isAdmin ? "Beheer Uitslagen" : "Uitslagen"}
                </h1>
                <div className="filter-container">
                    {navStages.map(stage => (
                        <button
                            key={stage}
                            // Use the visibleStage state to highlight the button
                            className={`filter-block ${visibleStage === stage ? 'active' : ''}`}
                            onClick={() => {
                                // If it's the first stage, just scroll to top
                                if (stage === stageOrder[0]) {
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                } else {
                                    const element = document.getElementById(stage);
                                    if (element) {
                                        element.scrollIntoView({ behavior: 'smooth' });
                                    }
                                }
                            }}
                        >
                            <span className="desktop-only">{stage}</span>
                            <span className="mobile-only">{getShortStageName(stage)}</span>
                        </button>
                    ))}
                </div>

                {/* Clean, secondary action button */}
                {isAdmin && (
                    <div className="admin-actions-bar">
                        <button
                            className={`admin-sync-btn ${isSyncing ? 'syncing' : ''}`}
                            onClick={handleGlobalRecalculate}
                            disabled={isSyncing}
                        >
                            <span className="sync-icon">{isSyncing ? '⏳' : '🔄'}</span>
                            <span>{isSyncing ? 'Punten verwerken...' : 'Herbereken Alle Standen'}</span>
                        </button>
                    </div>
                )}
            </header>

            <div className="predictions-body">
                {stageOrder.map(stageName => {
                    const stageMatches = groupedMatches[stageName];
                    if (!stageMatches || !activeStages.includes(stageName)) return null;

                    return (
                        <div
                            key={stageName}
                            id={stageName}
                            className={`stage-group`}
                        >
                            <h2 className="stage-header-title">
                                {stageName}
                            </h2>
                            <div className="matches-table-wrapper">
                                {stageMatches.map(m => {
                                    const showEmpty = !isAdmin && !isMatchStarted(m.match_date);
                                    
                                    return (
                                    <div key={m.id} id={`match-${m.id}`} className="match-row-wide">
                                        <div className="cell-time desktop-date desktop-only">
                                            {formatDateTime(m.match_date, false)}
                                        </div>
                                        <div className="cell-city desktop-only">{m.match_city}</div>

                                        {stageName !== 'Groepsfase' && (
                                            isAdmin ? (
                                                <input
                                                    type="number"
                                                    className="match-number-input"
                                                    defaultValue={m.match_number || ''}
                                                    placeholder="#"
                                                    onBlur={(e) => saveMatchNumber(m.id, e.target.value)}
                                                />
                                            ) : (
                                                m.match_number && <span className="match-number">#{m.match_number}</span>
                                            )
                                        )}

                                        <div className="mobile-team-container">
                                            <div className="cell-team">
                                                {renderTeam(m, 'home')}
                                            </div>
                                            <span className="mobile-only team-vs">vs</span>
                                            <div className="cell-team">
                                                {renderTeam(m, 'away')}
                                            </div>
                                        </div>

                                        <div className={`cell-inputs ${!isAdmin ? 'row-disabled' : ''}`}>
                                            {/* RUSTSTAND (HT) */}
                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">Ruststand</span>
                                                <div className="score-input-wrapper">
                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'home_ht', -1)}>−</button>
                                                    <span className="label-tag desktop-only">HT</span>
                                                    <input type="number" className="in-ht" value={showEmpty ? '' : (m.home_ht ?? '')} onChange={(e) => processUpdate(m.id, 'home_ht', e.target.value)} disabled={!isAdmin} />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'home_ht', 1)}>+</button>

                                                    <span className="score-dash">-</span>

                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'away_ht', -1)}>−</button>
                                                    <input type="number" className="in-ht" value={showEmpty ? '' : (m.away_ht ?? '')} onChange={(e) => processUpdate(m.id, 'away_ht', e.target.value)} disabled={!isAdmin} />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'away_ht', 1)}>+</button>
                                                </div>
                                            </div>

                                            {/* EINDSTAND (FT) */}
                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">Eindstand</span>
                                                <div className="score-input-wrapper">
                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'home_ft', -1)}>−</button>
                                                    <span className="label-tag desktop-only">FT</span>
                                                    <input type="number" className="in-ft" value={showEmpty ? '' : (m.home_ft ?? '')} onChange={(e) => processUpdate(m.id, 'home_ft', e.target.value)} disabled={!isAdmin} />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'home_ft', 1)}>+</button>

                                                    <span className="score-dash">:</span>

                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'away_ft', -1)}>−</button>
                                                    <input type="number" className="in-ft" value={showEmpty ? '' : (m.away_ft ?? '')} onChange={(e) => processUpdate(m.id, 'away_ft', e.target.value)} disabled={!isAdmin} />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'away_ft', 1)}>+</button>
                                                </div>
                                            </div>

                                            {/* TOTO */}
                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">TOTO</span>
                                                <div className="score-input-wrapper">
                                                    <span className="label-tag toto-label desktop-only">TOTO</span>
                                                    <div className="toto-group">
                                                        {[1, 3, 2].map((val) => (
                                                            <button
                                                                key={val}
                                                                className={`toto-cube ${showEmpty ? '' : (m.match_toto === String(val) ? 'active' : '')}`}
                                                                onClick={() => processUpdate(m.id, 'match_toto', String(val))}
                                                                disabled={!isAdmin}
                                                            >
                                                                {val === 3 ? 'X' : val}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {isAdmin && (
                <div className={`floating-sync-bar ${isSyncing ? 'syncing' : 'synced'}`}>
                    <div className="sync-content">
                        {isSyncing ? (
                            <><div className="sync-loader"></div><span>Opslaan...</span></>
                        ) : (
                            <><span className="sync-icon">✔</span><span>Opgeslagen {lastSaved && `om ${lastSaved}`}</span></>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminMatchResults;
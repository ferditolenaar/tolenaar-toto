import React, { useState, useEffect, useCallback } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const PredictionsPage = () => {
    const [matches, setMatches] = useState([]);
    const [userPredictions, setUserPredictions] = useState({});
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [syncError, setSyncError] = useState(null);
    const [errorTrigger, setErrorTrigger] = useState(0)

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];
    const [activeStages, setActiveStages] = useState(stageOrder);

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isSyncing) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isSyncing]);

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

    const loadData = async () => {
        try {
            const matchRecords = await pb.collection('matches').getFullList({
                sort: 'match_date',
                expand: 'home_team,away_team',
            });
            setMatches(matchRecords);

            const userId = pb.authStore.model?.id;
            if (userId) {
                const predRecords = await pb.collection('predictions').getFullList({
                    filter: `user = "${userId}"`
                });

                const predMap = {};
                predRecords.forEach(p => {
                    predMap[p.match] = {
                        id: p.id,
                        home_ht: p.pred_home_ht ?? 0,
                        away_ht: p.pred_away_ht ?? 0,
                        home_ft: p.pred_home_ft ?? 0,
                        away_ft: p.pred_away_ft ?? 0,
                        toto: p.pred_toto || '3'
                    };
                });
                setUserPredictions(predMap);
            }
        } catch (err) {
            console.error("Error loading data:", err);
        }
    };

    const isStageEditable = (stageName, allMatches) => {
        if (!allMatches || allMatches.length === 0) return true;
        const stageMatches = allMatches.filter(m => m.stage === stageName);
        if (stageMatches.length === 0) return true;
        const earliestMatchDate = stageMatches.reduce((earliest, current) => {
            return new Date(current.match_date) < new Date(earliest) ? current.match_date : earliest;
        }, stageMatches[0].match_date);
        const deadline = new Date(earliestMatchDate).getTime() - (30 * 60 * 1000);
        return new Date().getTime() < deadline;
    };

    const is00LimitReached = (matchId, stage, h_ht, a_ht) => {
        //if (Number(h_ht) !== 0 || Number(a_ht) !== 0) return { isLimitReached: false };

        const exemptStages = ['Halve Finale', 'Troostfinale', 'Finale'];
        if (exemptStages.includes(stage)) return { isLimitReached: false };

        const stageMatches = matches.filter(m => m.stage === stage);
        const maxAllowed = Math.floor(stageMatches.length / 2);

        const currentCount = stageMatches.filter(m => {
            if (m.id === matchId) return false;
            const p = userPredictions[m.id];
            return p && Number(p.home_ht) === 0 && Number(p.away_ht) === 0;
        }).length;

        return {
            isLimitReached: currentCount >= maxAllowed,
            current: currentCount + (Number(h_ht) === 0 && Number(a_ht) === 0 ? 1 : 0),
            max: maxAllowed
        };
    };

    // --- CENTRAL PROCESSING ENGINE ---
    const processUpdate = (matchId, field, value) => {
        const match = matches.find(m => m.id === matchId);
        if (!match || !isStageEditable(match.stage, matches)) return;

        const currentPred = userPredictions[matchId] || { home_ht: 0, away_ht: 0, home_ft: 0, away_ft: 0, toto: '3' };

        let cleanValue;
        if (field === 'toto') {
            cleanValue = String(value); // Keep '1', '2', or '3' as a string
        } else {
            cleanValue = value === '' ? '' : Math.max(0, parseInt(value) || 0);
        }

        const updated = { ...currentPred, [field]: cleanValue };

        // 1. Guard against 0-0 limit
        const check = is00LimitReached(matchId, match.stage, updated.home_ht, updated.away_ht);
        if (check.isLimitReached) {
            setSyncError(`Max ${check.max} x 0-0 ruststanden voor ${match.stage}, nu ${check.current}`);
            setErrorTrigger(prev => prev + 1);
            return; // Block the update
        }

        // 2. TOTO Logic
        if (field === 'home_ft' || field === 'away_ft') {
            const h = parseInt(updated.home_ft) || 0;
            const a = parseInt(updated.away_ft) || 0;
            updated.toto = h > a ? '1' : a > h ? '2' : '3';
        }

        // 3. Update State
        setUserPredictions(prev => ({ ...prev, [matchId]: updated }));

        // 4. Trigger AutoSave (only if it's a valid number or we want to save 0)
        autoSave(matchId, updated);
    };

    const autoSave = async (matchId, updatedData) => {
        const userId = pb.authStore.model?.id;
        if (!userId) return;

        setIsSyncing(true);
        try {
            const data = {
                user: userId,
                match: matchId,
                pred_home_ht: Number(updatedData.home_ht) || 0,
                pred_away_ht: Number(updatedData.away_ht) || 0,
                pred_home_ft: Number(updatedData.home_ft) || 0,
                pred_away_ft: Number(updatedData.away_ft) || 0,
                pred_toto: String(updatedData.toto || '3')
            };

            if (updatedData.id) {
                await pb.collection('predictions').update(updatedData.id, data);
            } else {
                const record = await pb.collection('predictions').create(data);
                setUserPredictions(prev => ({
                    ...prev,
                    [matchId]: { ...updatedData, id: record.id }
                }));
            }

            const match = matches.find(m => m.id === matchId);
            const check = is00LimitReached(matchId, match.stage, updatedData.home_ht, updatedData.away_ht);

            setLastSaved(`${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`);
            setSyncError(null);
        } catch (err) {
            setSyncError("Fout bij opslaan.");
        } finally {
            setTimeout(() => setIsSyncing(false), 500);
        }
    };

    const handleInputChange = (matchId, field, value) => {
        processUpdate(matchId, field, value);
    };

    const handleStep = (matchId, field, delta) => {
        const currentVal = parseInt(userPredictions[matchId]?.[field]) || 0;
        processUpdate(matchId, field, currentVal + delta);
    };

    const handleManualSync = async () => {
        if (isSyncing) return;
        const visibleMatches = matches.filter(m => activeStages.includes(m.stage) && isStageEditable(m.stage, matches));
        for (const m of visibleMatches) {
            if (userPredictions[m.id]) await autoSave(m.id, userPredictions[m.id]);
        }
    };

    const getTeamCode = (name) => name ? name.substring(0, 3).toUpperCase() : '...';

    const groupedMatches = matches.reduce((acc, m) => {
        const s = m.stage || 'Overig';
        if (!acc[s]) acc[s] = [];
        acc[s].push(m);
        return acc;
    }, {});

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
            <header className="page-header">
                <h1 className="tournament-title">WK 2026 Voorspellen</h1>
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
            </header>

            <div className="predictions-body">
                {stageOrder.map(stageName => {
                    const stageMatches = groupedMatches[stageName];
                    const isLocked = !isStageEditable(stageName, matches);
                    if (!stageMatches || !activeStages.includes(stageName)) return null;

                    return (
                        <div
                            key={stageName}
                            id={stageName}
                            className={`stage-group ${isLocked ? 'locked' : ''}`}
                        >
                            <h2 className="stage-header-title">
                                {stageName} {isLocked && <span className="lock-icon">🔒</span>}
                            </h2>
                            <div className="matches-table-wrapper">
                                {stageMatches.map(m => (
                                    <div key={m.id} className={`match-row-wide ${isLocked ? 'row-disabled' : ''}`}>
                                        <div className="cell-time desktop-date desktop-only">
                                            {formatDateTime(m.match_date, false)}
                                        </div>
                                        <div className="cell-city desktop-only">{m.match_city}</div>

                                        <div className="mobile-team-container">
                                            <div className="cell-team">
                                                <span className="desktop-only">{m.expand?.home_team?.name || '...'}</span>
                                                <span className="mobile-only">{getTeamCode(m.expand?.home_team?.name)}</span>
                                            </div>
                                            <span className="mobile-only team-vs">vs</span>
                                            <div className="cell-team">
                                                <span className="desktop-only">{m.expand?.away_team?.name || '...'}</span>
                                                <span className="mobile-only">{getTeamCode(m.expand?.away_team?.name)}</span>
                                            </div>
                                        </div>

                                        <div className="cell-inputs">
                                            {/* RUSTSTAND (HT) */}
                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">Ruststand</span>
                                                <div className="score-input-wrapper">
                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'home_ht', -1)}>−</button>
                                                    <span className="label-tag desktop-only">HT</span>
                                                    <input
                                                        type="number"
                                                        className="in-ht"
                                                        value={userPredictions[m.id]?.home_ht ?? ''}
                                                        onChange={(e) => handleInputChange(m.id, 'home_ht', e.target.value)}
                                                    />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'home_ht', 1)}>+</button>

                                                    <span className="score-dash">-</span>

                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'away_ht', -1)}>−</button>
                                                    <input
                                                        type="number"
                                                        className="in-ht"
                                                        value={userPredictions[m.id]?.away_ht ?? ''}
                                                        onChange={(e) => handleInputChange(m.id, 'away_ht', e.target.value)}
                                                    />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'away_ht', 1)}>+</button>
                                                </div>
                                            </div>

                                            {/* EINDSTAND (FT) */}
                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">Eindstand</span>
                                                <div className="score-input-wrapper">
                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'home_ft', -1)}>−</button>
                                                    <span className="label-tag desktop-only">FT</span>
                                                    <input
                                                        type="number"
                                                        className="in-ft"
                                                        value={userPredictions[m.id]?.home_ft ?? ''}
                                                        onChange={(e) => handleInputChange(m.id, 'home_ft', e.target.value)}
                                                    />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'home_ft', 1)}>+</button>

                                                    <span className="score-dash">-</span>

                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'away_ft', -1)}>−</button>
                                                    <input
                                                        type="number"
                                                        className="in-ft"
                                                        value={userPredictions[m.id]?.away_ft ?? ''}
                                                        onChange={(e) => handleInputChange(m.id, 'away_ft', e.target.value)}
                                                    />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'away_ft', 1)}>+</button>
                                                </div>
                                            </div>

                                            {/* TOTO BOX */}
                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">TOTO</span>
                                                <div className="score-input-wrapper">
                                                    <span className="label-tag toto-label desktop-only">TOTO</span>
                                                    <div className="toto-group">
                                                        {[1, 3, 2].map((val) => (
                                                            <button
                                                                key={val}
                                                                disabled={isLocked}
                                                                className={`toto-cube ${userPredictions[m.id]?.toto === String(val) ? 'active' : ''}`}
                                                                onClick={() => handleInputChange(m.id, 'toto', String(val))}
                                                            >
                                                                {val === 3 ? 'X' : val}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div key={errorTrigger} className={`floating-sync-bar ${syncError ? 'sync-error sync-error-shake' : isSyncing ? 'syncing' : 'synced'}`} onClick={handleManualSync}>
                <div className="sync-content">
                    {syncError ? (
                        <><span className="sync-icon">⚠️</span><span>{syncError}</span></>
                    ) : isSyncing ? (
                        <><div className="sync-loader"></div><span>Opslaan...</span></>
                    ) : (
                        <><span className="sync-icon">✔</span><span>{lastSaved ? `Laatst opgeslagen om ${lastSaved}` : 'Opgeslagen'}</span></>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PredictionsPage;
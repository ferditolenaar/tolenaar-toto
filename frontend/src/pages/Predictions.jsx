import React, { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const PredictionsPage = () => {
    const [matches, setMatches] = useState([]);
    const [userPredictions, setUserPredictions] = useState({});
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [syncError, setSyncError] = useState(null);

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

    const autoSave = async (matchId, updatedData) => {
        const userId = pb.authStore.model?.id;
        if (!userId) return;

        const match = matches.find(m => m.id === matchId);
        const zeroCheck = is00LimitReached(matchId, match.stage, updatedData.home_ht, updatedData.away_ht);

        // 1. Guard check (Uses the 0s already in state/updatedData)
        if (zeroCheck.isLimitReached) {
            setSyncError(`Max ${zeroCheck.max} 0-0 ruststanden bereikt voor ${match.stage}`);
            loadData();
            return;
        }

        setIsSyncing(true);
        try {
            const data = {
                user: userId,
                match: matchId,
                // Everything is a number now, no more ternary null checks
                pred_home_ht: Number(updatedData.home_ht),
                pred_away_ht: Number(updatedData.away_ht),
                pred_home_ft: Number(updatedData.home_ft),
                pred_away_ft: Number(updatedData.away_ft),
                pred_toto: String(updatedData.toto || '3')
            };

            if (updatedData.id) {
                await pb.collection('predictions').update(updatedData.id, data);
            } else {
                const record = await pb.collection('predictions').create(data);

                // Ensure the state gets the new ID so the next save is an update
                setUserPredictions(prev => ({
                    ...prev,
                    [matchId]: {
                        ...updatedData, id: record.id,
                        home_ht: updatedData.home_ht !== '' ? updatedData.home_ht : 0,
                        away_ht: updatedData.away_ht !== '' ? updatedData.away_ht : 0,
                        home_ft: updatedData.home_ft !== '' ? updatedData.home_ft : 0,
                        away_ft: updatedData.away_ft !== '' ? updatedData.away_ft : 0
                    }
                }));
            }
            setLastSaved(`Laatst opgeslagen: ${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} : ${zeroCheck.current}`);
        } catch (err) {
            setSyncError("Fout bij opslaan.");
        } finally {
            setTimeout(() => setIsSyncing(false), 500);
        }
    };

    const handleInputChange = (matchId, field, value) => {
        const finalValue = value === '' ? '' : Math.max(0, parseInt(value) || 0);
        const match = matches.find(m => m.id === matchId);

        setUserPredictions(prev => {
            const current = prev[matchId] || { home_ht: '', away_ht: '', home_ft: '', away_ft: '', toto: '3' };
            const updated = { ...current, [field]: finalValue };

            const zeroCheck = is00LimitReached(matchId, match.stage, updated.home_ht, updated.away_ht);

            // Check if this specific change creates an illegal 0-0
            if (zeroCheck.isLimitReached) {
                setSyncError(`Max ${zeroCheck.max} 0-0 ruststanden bereikt voor ${match.stage}`);
                setTimeout(() => setSyncError(null), 4000);
                return prev; // DO NOT update the state, effectively "undoing" the type
            }

            // TOTO Logic (FT only)
            if (field === 'home_ft' || field === 'away_ft') {
                const h = parseInt(updated.home_ft);
                const a = parseInt(updated.away_ft);
                if (!isNaN(h) && !isNaN(a)) {
                    updated.toto = h > a ? '1' : a > h ? '2' : '3';
                }
            }

            return { ...prev, [matchId]: updated };
        });
    };

    const handleManualSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        const visibleMatches = matches.filter(m => activeStages.includes(m.stage) && isStageEditable(m.stage, matches));
        try {
            for (const m of visibleMatches) {
                if (userPredictions[m.id]) await autoSave(m.id, userPredictions[m.id]);
            }
        } finally {
            setIsSyncing(false);
        }
    };

    const handleStep = (matchId, field, delta) => {
        if (!isStageEditable(matches.find(m => m.id === matchId)?.stage, matches)) return;

        const current = userPredictions[matchId] || {
            home_ht: '', away_ht: '',
            home_ft: 0, away_ft: 0, // Initialize FT to 0 immediately
            toto: '3'
        };

        const currentVal = parseInt(userPredictions[matchId]?.[field]) || 0;
        const newVal = Math.max(0, currentVal + delta); // Prevent negative scores

        // 2. Create the full updated object for this match
        const updatedMatchData = {
            ...(userPredictions[matchId] || { home_ft: '', away_ft: '', home_ht: '', away_ht: '', toto: '3' }),
            [field]: newVal
        };

        // 3. Update TOTO logic (copying your existing FT logic)
        if (field === 'home_ft' || field === 'away_ft') {
            const h = parseInt(updatedMatchData.home_ft);
            const a = parseInt(updatedMatchData.away_ft);
            if (!isNaN(h) && !isNaN(a)) {
                if (h > a) updatedMatchData.toto = '1';
                else if (a > h) updatedMatchData.toto = '2';
                else updatedMatchData.toto = '3';
            }
        }

        // 4. Update UI State immediately
        setUserPredictions(prev => ({ ...prev, [matchId]: updatedMatchData }));

        // 5. Trigger the Guarded Save
        autoSave(matchId, updatedMatchData);
    };

    const is00LimitReached = (matchId, stage, h_ht, a_ht) => {
        // Only check if both are explicitly 0
        if (h_ht !== 0 || a_ht !== 0) return false;

        const exemptStages = ['Halve Finale', 'Troostfinale', 'Finale'];
        if (exemptStages.includes(stage)) return false;

        const stageMatches = matches.filter(m => m.stage === stage);
        const maxAllowed = Math.floor(stageMatches.length / 2);

        const currentCount = stageMatches.filter(m => {
            if (m.id === matchId) return false;
            const p = userPredictions[m.id];
            // Ensure we count actual numbers, not empty strings
            return p && Number(p.home_ht) === 0 && Number(p.away_ht) === 0;
        }).length;

        return {
            isLimitReached: currentCount >= maxAllowed,
            current: currentCount,
            max: maxAllowed
        };
    };

    // Helper formatting functions
    const getTeamCode = (name) => name ? name.substring(0, 8).toUpperCase() : '...';
    const groupedMatches = matches.reduce((acc, m) => {
        const s = m.stage || 'Overig';
        if (!acc[s]) acc[s] = [];
        acc[s].push(m);
        return acc;
    }, {});

    const formatDateTime = (dateStr, isMobile) => {
        const d = new Date(dateStr);
        const datePart = d.toLocaleDateString('nl-NL', { day: 'numeric', month: isMobile ? 'short' : 'long', timeZone: 'Europe/Amsterdam' });
        const timePart = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
        return `${datePart} ${isMobile ? '' : timePart}`;
    };

    return (
        <div className="container-centered page-container">
            <header className="page-header">
                <h1 className="tournament-title">WK 2026 Voorspellen</h1>
                <div className="filter-container">
                    {stageOrder.map(stage => (
                        <button
                            key={stage}
                            className={`filter-block ${activeStages.includes(stage) ? 'active' : ''}`}
                            onClick={() => setActiveStages(prev => prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage])}
                        >
                            {stage}
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
                        <div key={stageName} className={`stage-group ${isLocked ? 'locked' : ''}`}>
                            <h2 className="stage-header-title">
                                {stageName} {isLocked && <span className="lock-icon">🔒 Gesloten</span>}
                            </h2>
                            <div className="matches-table-wrapper">
                                {stageMatches.map(m => (
                                    <div key={m.id} className={`match-row-wide ${isLocked ? 'row-disabled' : ''}`}>
                                        <div className="cell-time desktop-date desktop-only">
                                            {formatDateTime(m.match_date, false)}
                                        </div>
                                        <div className="cell-city desktop-only">{m.match_city}</div>

                                        <div className="mobile-team-container">
                                            <div className="cell-team text-right">
                                                <span className="desktop-only">{m.expand?.home_team?.name || '...'}</span>
                                                <span className="mobile-only">{getTeamCode(m.expand?.home_team?.name)}</span>
                                            </div>
                                            <span className="mobile-only team-vs">vs</span>
                                            <div className="cell-team text-left">
                                                <span className="desktop-only">{m.expand?.away_team?.name || '...'}</span>
                                                <span className="mobile-only">{getTeamCode(m.expand?.away_team?.name)}</span>
                                            </div>
                                        </div>

                                        <div className="cell-inputs">
                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">Ruststand</span>
                                                <div className="score-input-wrapper">
                                                    {/* Home HT */}
                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'home_ht', -1)}>−</button>
                                                    <span className="label-tag desktop-only">HT</span>
                                                    <input
                                                        type="number"
                                                        className="in-ht"
                                                        value={userPredictions[m.id]?.home_ht ?? ''}
                                                        onChange={(e) => handleInputChange(m.id, 'home_ht', e.target.value)}
                                                        onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                    />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'home_ht', 1)}>+</button>

                                                    <span className="score-dash">-</span>

                                                    {/* Away HT */}
                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'away_ht', -1)}>−</button>
                                                    <input
                                                        type="number"
                                                        className="in-ht"
                                                        value={userPredictions[m.id]?.away_ht ?? ''}
                                                        onChange={(e) => handleInputChange(m.id, 'away_ht', e.target.value)}
                                                        onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                    />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'away_ht', 1)}>+</button>
                                                </div>
                                            </div>

                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">Eindstand</span>
                                                <div className="score-input-wrapper">
                                                    <button className="stepper-btn minus mobile-only" onClick={() => {
                                                        if (isLocked) return;
                                                        const current = parseInt(userPredictions[m.id]?.home_ft) || 0;
                                                        const newVal = Math.max(0, current - 1);
                                                        handleInputChange(m.id, 'home_ft', newVal);
                                                        autoSave(m.id, { ...userPredictions[m.id], home_ft: newVal });
                                                    }}>−</button>
                                                    <span className="label-tag desktop-only">FT</span>
                                                    <input type="number" className="in-ft" value={userPredictions[m.id]?.home_ft ?? ''} onChange={(e) => handleInputChange(m.id, 'home_ft', e.target.value)} onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])} />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => {
                                                        if (isLocked) return;
                                                        const current = parseInt(userPredictions[m.id]?.home_ft) || 0;
                                                        const newVal = current + 1;
                                                        handleInputChange(m.id, 'home_ft', newVal);
                                                        autoSave(m.id, { ...userPredictions[m.id], home_ft: newVal });
                                                    }}>+</button>
                                                    <span className="score-dash">-</span>
                                                    <button className="stepper-btn minus mobile-only" onClick={() => {
                                                        if (isLocked) return;
                                                        const current = parseInt(userPredictions[m.id]?.away_ft) || 0;
                                                        const newVal = Math.max(0, current - 1);
                                                        handleInputChange(m.id, 'away_ft', newVal);
                                                        autoSave(m.id, { ...userPredictions[m.id], away_ft: newVal });
                                                    }}>−</button>
                                                    <input type="number" className="in-ft" value={userPredictions[m.id]?.away_ft ?? ''} onChange={(e) => handleInputChange(m.id, 'away_ft', e.target.value)} onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])} />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => {
                                                        if (isLocked) return;
                                                        const current = parseInt(userPredictions[m.id]?.away_ft) || 0;
                                                        const newVal = current + 1;
                                                        handleInputChange(m.id, 'away_ft', newVal);
                                                        autoSave(m.id, { ...userPredictions[m.id], away_ft: newVal });
                                                    }}>+</button>
                                                </div>
                                            </div>

                                            <div className="score-box toto">
                                                <span className="label-tag desktop-only">TOTO</span>
                                                <div className="toto-group">
                                                    {[1, 3, 2].map((val) => (
                                                        <button key={val} disabled={isLocked} className={`toto-cube ${userPredictions[m.id]?.toto === String(val) ? 'active' : ''}`}
                                                            onClick={() => {
                                                                if (isLocked) return;
                                                                const updated = { ...(userPredictions[m.id] || {}), toto: String(val) };
                                                                setUserPredictions(prev => ({ ...prev, [m.id]: updated }));
                                                                autoSave(m.id, updated);
                                                            }}>{val === 3 ? 'X' : val}</button>
                                                    ))}
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

            <div className={`floating-sync-bar ${syncError ? 'sync-error' : isSyncing ? 'syncing' : 'synced'}`} onClick={handleManualSync}>
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
import React, { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const PredictionsPage = () => {
    const [matches, setMatches] = useState([]);
    const [userPredictions, setUserPredictions] = useState({});
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [syncError, setSyncError] = useState(null); // Tracks the error message

    // Stage Filter State
    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];
    const [activeStages, setActiveStages] = useState(stageOrder);

    useEffect(() => {
        loadData();
    }, []);

    // Safety: Warn user if they try to close the tab while an auto-save is in progress
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isSyncing) {
                e.preventDefault();
                e.returnValue = '';
            }
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
                        home_ht: p.pred_home_ht,
                        away_ht: p.pred_away_ht,
                        home_ft: p.pred_home_ft,
                        away_ft: p.pred_away_ft,
                        toto: p.pred_toto || '3'
                    };
                });
                setUserPredictions(predMap);
            }
        } catch (err) {
            console.error("Error loading data:", err);
        }
    };

    // Helper: Logic to determine if a stage is locked (30 mins before first match)
    const isStageEditable = (stageName, allMatches) => {
        if (!allMatches || allMatches.length === 0) return true;

        const stageMatches = allMatches.filter(m => m.stage === stageName);
        if (stageMatches.length === 0) return true;

        const earliestMatchDate = stageMatches.reduce((earliest, current) => {
            return new Date(current.match_date) < new Date(earliest) ? current.match_date : earliest;
        }, stageMatches[0].match_date);

        const deadline = new Date(earliestMatchDate).getTime() - (30 * 60 * 1000);
        const now = new Date().getTime();

        return now < deadline;
    };

    const autoSave = async (matchId, updatedData) => {
        const userId = pb.authStore.model?.id;
        if (!userId) return;

        const match = matches.find(m => m.id === matchId);
        const isZeroZeroHT = Number(updatedData.home_ht) === 0 && Number(updatedData.away_ht) === 0;
        const exemptStages = ['Halve Finale', 'Troostfinale', 'Finale'];

        // --- TOAST-BASED VALIDATION ---
        if (isZeroZeroHT && !exemptStages.includes(match.stage)) {
            const stageMatches = matches.filter(m => m.stage === match.stage);
            const maxAllowed = Math.floor(stageMatches.length / 2);

            const currentCount = stageMatches.filter(m => {
                if (m.id === matchId) return false;
                const p = userPredictions[m.id];
                return p && Number(p.home_ht) === 0 && Number(p.away_ht) === 0;
            }).length;

            if (currentCount >= maxAllowed) {
                // Show the error toast instead of alert
                setSyncError(`Max 0-0 ruststanden bereikt voor ${match.stage} (${maxAllowed})`);

                // Revert UI and clear error after delay
                setTimeout(() => setSyncError(null), 4000);
                loadData();
                return;
            }
        }

        setIsSyncing(true);
        setSyncError(null); // Clear any previous errors if a save starts

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
                    [matchId]: { ...prev[matchId], id: record.id }
                }));
            }
            setLastSaved(new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }));
        } catch (err) {
            setSyncError("Fout bij opslaan. Probeer het opnieuw.");
            setTimeout(() => setSyncError(null), 4000);
        } finally {
            setTimeout(() => setIsSyncing(false), 500);
        }
    };

    const handleInputChange = (matchId, field, value) => {
        // 1. If the field is empty, keep it as an empty string for the UI.
        // 2. Otherwise, ensure it's a positive integer.
        const numValue = value === '' ? '' : Math.max(0, parseInt(value) || 0);

        const match = matches.find(m => m.id === matchId);

        setUserPredictions(prev => {
            // Initialize with empty strings instead of 0s if it's a brand new prediction
            const current = prev[matchId] || {
                home_ft: '', away_ft: '',
                home_ht: '', away_ht: '',
                toto: '3'
            };

            const updated = { ...current, [field]: numValue };

            // Auto-update TOTO based on FT scores
            // We only trigger this if both FT values are actually numbers (not empty)
            if (field === 'home_ft' || field === 'away_ft') {
                const h = parseInt(updated.home_ft);
                const a = parseInt(updated.away_ft);

                if (!isNaN(h) && !isNaN(a)) {
                    if (h > a) updated.toto = '1';
                    else if (a > h) updated.toto = '2';
                    else updated.toto = '3';
                }
            }

            return { ...prev, [matchId]: updated };
        });
    };

    const handleManualSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        const visibleMatchIds = matches
            .filter(m => activeStages.includes(m.stage) && isStageEditable(m.stage, matches))
            .map(m => m.id);

        try {
            await Promise.all(visibleMatchIds.map(id => {
                if (userPredictions[id]) return autoSave(id, userPredictions[id]);
                return Promise.resolve();
            }));
        } finally {
            setIsSyncing(false);
        }
    };

    const groupedMatches = matches.reduce((acc, match) => {
        const stage = match.stage || 'Overig';
        if (!acc[stage]) acc[stage] = [];
        acc[stage].push(match);
        return acc;
    }, {});

    // --- Inside PredictionsPage component ---

    const getTeamCode = (name) => name ? name.substring(0, 3).toUpperCase() : '...';

    const formatDateTime = (dateStr, isMobile) => {
        const d = new Date(dateStr);
        const datePart = d.toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: isMobile ? 'short' : 'long',
            timeZone: 'Europe/Amsterdam'
        });
        const timePart = d.toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Amsterdam'
        });
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
                                        {/* Time Section: Simplified for mobile */}
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

                                        {/* Inputs Section */}
                                        <div className="cell-inputs">
                                            <div className="input-group-container">
                                                {/* This label only appears on mobile cards */}
                                                <span className="mobile-only group-label">Ruststand</span>

                                                <div className="score-input-wrapper">
                                                    <button
                                                        className="stepper-btn minus mobile-only"
                                                        onClick={() => {
                                                            if (isLocked) return;
                                                            const current = parseInt(userPredictions[m.id]?.home_ht) || 0;
                                                            const newVal = Math.max(0, current - 1); // Safety floor at 0

                                                            handleInputChange(m.id, 'home_ht', newVal);
                                                            autoSave(m.id, { ...userPredictions[m.id], home_ht: newVal });
                                                        }}
                                                    >−</button>

                                                    <input
                                                        type="number"
                                                        className="in-ht"
                                                        value={userPredictions[m.id]?.home_ht ?? ''}
                                                        onChange={(e) => handleInputChange(m.id, 'home_ht', e.target.value)}
                                                        onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                    />

                                                    <button
                                                        className="stepper-btn plus mobile-only"
                                                        onClick={() => {
                                                            if (isLocked) return;
                                                            const current = parseInt(userPredictions[m.id]?.home_ht) || 0;
                                                            const newVal = Math.max(0, current + 1); // Safety floor at 0

                                                            handleInputChange(m.id, 'home_ht', newVal);
                                                            autoSave(m.id, { ...userPredictions[m.id], home_ht: newVal });
                                                        }}
                                                    >+</button>

                                                    <span className="score-dash">-</span>

                                                    <button
                                                        className="stepper-btn minus mobile-only"
                                                        onClick={() => {
                                                            if (isLocked) return;
                                                            const current = parseInt(userPredictions[m.id]?.away_ht) || 0;
                                                            const newVal = Math.max(0, current - 1); // Safety floor at 0

                                                            handleInputChange(m.id, 'away_ht', newVal);
                                                            autoSave(m.id, { ...userPredictions[m.id], away_ht: newVal });
                                                        }}
                                                    >−</button>

                                                    <input
                                                        type="number"
                                                        className="in-ht"
                                                        value={userPredictions[m.id]?.away_ht ?? ''}
                                                        onChange={(e) => handleInputChange(m.id, 'away_ht', e.target.value)}
                                                        onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                    />

                                                    <button
                                                        className="stepper-btn plus mobile-only"
                                                        onClick={() => {
                                                            if (isLocked) return;
                                                            const current = parseInt(userPredictions[m.id]?.away_ht) || 0;
                                                            const newVal = Math.max(0, current + 1); // Safety floor at 0

                                                            handleInputChange(m.id, 'away_ht', newVal);
                                                            autoSave(m.id, { ...userPredictions[m.id], away_ht: newVal });
                                                        }}
                                                    >+</button>
                                                </div>
                                            </div>

                                            <div className="input-group-container">
                                                <div className="input-group-container">
                                                    {/* This label only appears on mobile cards */}
                                                    <span className="mobile-only group-label">Eindstand</span>

                                                    <div className="score-input-wrapper">
                                                        <button
                                                            className="stepper-btn minus mobile-only"
                                                            onClick={() => {
                                                                if (isLocked) return;
                                                                const current = parseInt(userPredictions[m.id]?.home_ft) || 0;
                                                                const newVal = Math.max(0, current - 1); // Safety floor at 0

                                                                handleInputChange(m.id, 'home_ft', newVal);
                                                                autoSave(m.id, { ...userPredictions[m.id], home_ft: newVal });
                                                            }}
                                                        >−</button>

                                                        <input
                                                            type="number"
                                                            className="in-ft"
                                                            value={userPredictions[m.id]?.home_ft ?? ''}
                                                            onChange={(e) => handleInputChange(m.id, 'home_ft', e.target.value)}
                                                            onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                        />

                                                        <button
                                                            className="stepper-btn plus mobile-only"
                                                            onClick={() => {
                                                                if (isLocked) return;
                                                                const current = parseInt(userPredictions[m.id]?.home_ft) || 0;
                                                                const newVal = Math.max(0, current + 1); // Safety floor at 0

                                                                handleInputChange(m.id, 'home_ft', newVal);
                                                                autoSave(m.id, { ...userPredictions[m.id], home_ft: newVal });
                                                            }}
                                                        >+</button>

                                                        <span className="score-dash">-</span>

                                                        <button
                                                            className="stepper-btn minus mobile-only"
                                                            onClick={() => {
                                                                if (isLocked) return;
                                                                const current = parseInt(userPredictions[m.id]?.away_ft) || 0;
                                                                const newVal = Math.max(0, current - 1); // Safety floor at 0

                                                                handleInputChange(m.id, 'away_ft', newVal);
                                                                autoSave(m.id, { ...userPredictions[m.id], away_ft: newVal });
                                                            }}
                                                        >−</button>

                                                        <input
                                                            type="number"
                                                            className="in-ft"
                                                            value={userPredictions[m.id]?.away_ft ?? ''}
                                                            onChange={(e) => handleInputChange(m.id, 'away_ft', e.target.value)}
                                                            onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                        />

                                                        <button
                                                            className="stepper-btn plus mobile-only"
                                                            onClick={() => {
                                                                if (isLocked) return;
                                                                const current = parseInt(userPredictions[m.id]?.away_ft) || 0;
                                                                const newVal = Math.max(0, current + 1); // Safety floor at 0

                                                                handleInputChange(m.id, 'away_ft', newVal);
                                                                autoSave(m.id, { ...userPredictions[m.id], away_ft: newVal });
                                                            }}
                                                        >+</button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="score-box toto">
                                                <span className="label-tag">TOTO</span>
                                                <div className="toto-group">
                                                    {[1, 3, 2].map((val) => (
                                                        <button
                                                            key={val}
                                                            disabled={isLocked}
                                                            className={`toto-cube ${userPredictions[m.id]?.toto === String(val) ? 'active' : ''}`}
                                                            onClick={() => {
                                                                if (isLocked) return;

                                                                // Create the updated object first
                                                                const currentPred = userPredictions[m.id] || { home_ft: 0, away_ft: 0, home_ht: 0, away_ht: 0 };
                                                                const updated = { ...currentPred, toto: String(val) };

                                                                // Update local state first for responsiveness
                                                                setUserPredictions(prev => ({ ...prev, [m.id]: updated }));

                                                                // autoSave will now catch if this results in an illegal 0-0 HT
                                                                autoSave(m.id, updated);
                                                            }}
                                                        >
                                                            {val === 3 ? 'X' : val}
                                                        </button>
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
                        <><span className="sync-icon">✔</span><span>{lastSaved
                            ? `Laatst opgeslagen om ${lastSaved}`
                            : 'Opgeslagen'}</span></>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PredictionsPage;
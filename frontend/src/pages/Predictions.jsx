import React, { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const PredictionsPage = () => {
    const [matches, setMatches] = useState([]);
    const [userPredictions, setUserPredictions] = useState({});
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);

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

        setIsSyncing(true);

        // Ensure we are sending exactly what PocketBase expects
        const data = {
            user: userId,
            match: matchId,
            pred_home_ht: Number(updatedData.home_ht) || 0,
            pred_away_ht: Number(updatedData.away_ht) || 0,
            pred_home_ft: Number(updatedData.home_ft) || 0,
            pred_away_ft: Number(updatedData.away_ft) || 0,
            pred_toto: String(updatedData.toto || '3')
        };

        try {
            if (updatedData.id) {
                // Update existing prediction
                await pb.collection('predictions').update(updatedData.id, data);
            } else {
                // Create new prediction
                const record = await pb.collection('predictions').create(data);
                // Update local state with the new ID so the NEXT save is an update
                setUserPredictions(prev => ({
                    ...prev,
                    [matchId]: { ...prev[matchId], id: record.id }
                }));
            }
            setLastSaved(new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }));
        } catch (err) {
            console.error("Opslaan mislukt", err);
        } finally {
            setTimeout(() => setIsSyncing(false), 500);
        }
    };

    const handleInputChange = (matchId, field, value) => {
        const numValue = parseInt(value) || 0;
        setUserPredictions(prev => {
            const current = prev[matchId] || { home_ft: 0, away_ft: 0, home_ht: 0, away_ht: 0, toto: '3' };
            const updated = { ...current, [field]: numValue };

            if (field === 'home_ft' || field === 'away_ft') {
                if (updated.home_ft > updated.away_ft) updated.toto = '1';
                else if (updated.away_ft > updated.home_ft) updated.toto = '2';
                else updated.toto = '3';
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

                                        <div className="cell-time">
                                            <div className="date-nl">
                                                {new Date(m.match_date).toLocaleDateString('nl-NL', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    timeZone: 'Europe/Amsterdam'
                                                })}
                                            </div>
                                        </div>

                                        <div className="cell-city">{m.match_city}</div>

                                        <div className="cell-team text-right">{m.expand?.home_team?.name || '...'}</div>
                                        <div className="cell-team text-left">{m.expand?.away_team?.name || '...'}</div>

                                        <div className="cell-inputs">
                                            <div className="score-box ht">
                                                <span className="label-tag">HT</span>
                                                <input type="number" className="in-ht" disabled={isLocked}
                                                    onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                    value={userPredictions[m.id]?.home_ht ?? 0}
                                                    onChange={(e) => handleInputChange(m.id, 'home_ht', e.target.value)} />
                                                <span className="dash">-</span>
                                                <input type="number" className="in-ht" disabled={isLocked}
                                                    onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                    value={userPredictions[m.id]?.away_ht ?? 0}
                                                    onChange={(e) => handleInputChange(m.id, 'away_ht', e.target.value)} />
                                            </div>

                                            <div className="score-box ft">
                                                <span className="label-tag">FT</span>
                                                <input type="number" className="in-ft" disabled={isLocked}
                                                    onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                    value={userPredictions[m.id]?.home_ft ?? 0}
                                                    onChange={(e) => handleInputChange(m.id, 'home_ft', e.target.value)} />
                                                <span className="colon">:</span>
                                                <input type="number" className="in-ft" disabled={isLocked}
                                                    onBlur={() => !isLocked && autoSave(m.id, userPredictions[m.id])}
                                                    value={userPredictions[m.id]?.away_ft ?? 0}
                                                    onChange={(e) => handleInputChange(m.id, 'away_ft', e.target.value)} />
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
                                                                const updated = { ...userPredictions[m.id], toto: String(val) };
                                                                setUserPredictions(prev => ({ ...prev, [m.id]: updated }));
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

            <div className={`floating-sync-bar ${isSyncing ? 'syncing' : 'synced'}`} onClick={handleManualSync}>
                <div className="sync-content">
                    {isSyncing ? (
                        <><div className="sync-loader"></div><span>Opslaan...</span></>
                    ) : (
                        <><span className="sync-icon">✔</span><span>Opgeslagen {lastSaved && `om ${lastSaved}`}</span></>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PredictionsPage;
import React, { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const AdminMatchResults = () => {
    const [matches, setMatches] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);

    // Updated Role Check: matches your 'role' column
    const user = pb.authStore.model;
    const isAdmin = user?.role === 'admin';

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];
    const [activeStages, setActiveStages] = useState(stageOrder);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const matchRecords = await pb.collection('matches').getFullList({
                sort: 'match_date',
                expand: 'home_team,away_team',
            });
            setMatches(matchRecords);
        } catch (err) {
            console.error("Error loading matches:", err);
        }
    };

    const calculateToto = (home, away) => {
        if (home > away) return '1';
        if (away > home) return '2';
        return '3';
    };

    const autoSaveResult = async (matchId, updatedMatch) => {
        if (!isAdmin) return; // Prevent non-admins from triggering API calls

        setIsSyncing(true);
        const data = {
            home_ht: updatedMatch.home_ht || 0,
            away_ht: updatedMatch.away_ht || 0,
            home_ft: updatedMatch.home_ft || 0,
            away_ft: updatedMatch.away_ft || 0,
            match_toto: updatedMatch.match_toto || calculateToto(updatedMatch.home_ft, updatedMatch.away_ft)
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

    const handleResultChange = (matchId, field, value) => {
        if (!isAdmin) return;
        const numValue = parseInt(value) || 0;

        setMatches(prev => prev.map(m => {
            if (m.id === matchId) {
                const updated = { ...m, [field]: numValue };
                if (field === 'home_ft' || field === 'away_ft') {
                    updated.match_toto = calculateToto(updated.home_ft, updated.away_ft);
                }
                return updated;
            }
            return m;
        }));
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
                <h1 className="tournament-title">
                    {isAdmin ? "Beheer Uitslagen" : "Officiële Uitslagen"}
                </h1>

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
                    if (!stageMatches || !activeStages.includes(stageName)) return null;

                    return (
                        <div key={stageName} className="stage-group">
                            <h2 className="stage-header-title">{stageName}</h2>
                            <div className="matches-table-wrapper">
                                {stageMatches.map(m => (
                                    <div key={m.id} className="match-row-wide">
                                        <div className="cell-time">
                                            <div className="date-nl">
                                                {new Date(m.match_date).toLocaleDateString('nl-NL', {
                                                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
                                                })}
                                            </div>
                                        </div>

                                        <div className="cell-city">{m.match_city}</div>

                                        <div className="cell-team text-right">{m.expand?.home_team?.name || '...'}</div>
                                        <div className="cell-team text-left">{m.expand?.away_team?.name || '...'}</div>

                                        <div className="cell-inputs">
                                            <div className="score-box ht">
                                                <span className="label-tag">HT</span>
                                                <input type="number" className="in-ht" disabled={!isAdmin}
                                                    onBlur={() => isAdmin && autoSaveResult(m.id, m)}
                                                    value={m.home_ht ?? 0}
                                                    onChange={(e) => handleResultChange(m.id, 'home_ht', e.target.value)} />
                                                <span className="dash">-</span>
                                                <input type="number" className="in-ht" disabled={!isAdmin}
                                                    onBlur={() => isAdmin && autoSaveResult(m.id, m)}
                                                    value={m.away_ht ?? 0}
                                                    onChange={(e) => handleResultChange(m.id, 'away_ht', e.target.value)} />
                                            </div>

                                            <div className="score-box ft">
                                                <span className="label-tag">FT</span>
                                                <input type="number" className="in-ft" disabled={!isAdmin}
                                                    onBlur={() => isAdmin && autoSaveResult(m.id, m)}
                                                    value={m.home_ft ?? 0}
                                                    onChange={(e) => handleResultChange(m.id, 'home_ft', e.target.value)} />
                                                <span className="colon">:</span>
                                                <input type="number" className="in-ft" disabled={!isAdmin}
                                                    onBlur={() => isAdmin && autoSaveResult(m.id, m)}
                                                    value={m.away_ft ?? 0}
                                                    onChange={(e) => handleResultChange(m.id, 'away_ft', e.target.value)} />
                                            </div>

                                            <div className="score-box toto">
                                                <span className="label-tag">TOTO</span>
                                                <div className="toto-group">
                                                    {[1, 3, 2].map((val) => (
                                                        <button
                                                            key={val}
                                                            disabled={!isAdmin}
                                                            className={`toto-cube ${m.match_toto === String(val) ? 'active' : ''}`}
                                                            onClick={() => {
                                                                if (!isAdmin) return;
                                                                const updated = { ...m, match_toto: String(val) };
                                                                setMatches(prev => prev.map(match => match.id === m.id ? updated : match));
                                                                autoSaveResult(m.id, updated);
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
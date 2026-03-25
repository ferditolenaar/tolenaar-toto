import React, { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const AdminMatchResults = () => {
    const [matches, setMatches] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);

    const user = pb.authStore.model;
    const isAdmin = user?.role === 'admin';

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve activeStage inale', 'Troostfinale', 'Finale'];
    const [activeStages, setActiveStages] = useState(stageOrder);

    useEffect(() => { loadData(); }, []);

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
                    {isAdmin ? "Beheer Uitslagen" : "Officiële Uitslagen"}
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
                                {stageMatches.map(m => (
                                    <div key={m.id} className="match-row-wide">
                                        <div className="cell-time desktop-date desktop-only">
                                            {formatDateTime(m.match_date, false)}
                                        </div>
                                        <div className="cell-city desktop-only">{m.match_city}</div>

                                        <div className="mobile-team-container">
                                            <div className="cell-team">
                                                <span className="desktop-only">{m.expand?.home_team?.name}</span>
                                                <span className="mobile-only">{m.expand?.home_team?.code}</span>
                                            </div>
                                            <span className="mobile-only team-vs">vs</span>
                                            <div className="cell-team">
                                                <span className="desktop-only">{m.expand?.away_team?.name}</span>
                                                <span className="mobile-only">{m.expand?.away_team?.code}</span>
                                            </div>
                                        </div>

                                        <div className="cell-inputs">
                                            {/* RUSTSTAND (HT) */}
                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">Ruststand</span>
                                                <div className="score-input-wrapper">
                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'home_ht', -1)}>−</button>
                                                    <span className="label-tag desktop-only">HT</span>
                                                    <input type="number" className="in-ht" value={m.home_ht ?? ''} onChange={(e) => processUpdate(m.id, 'home_ht', e.target.value)} disabled={!isAdmin} />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'home_ht', 1)}>+</button>

                                                    <span className="score-dash">-</span>

                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'away_ht', -1)}>−</button>
                                                    <input type="number" className="in-ht" value={m.away_ht ?? ''} onChange={(e) => processUpdate(m.id, 'away_ht', e.target.value)} disabled={!isAdmin} />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'away_ht', 1)}>+</button>
                                                </div>
                                            </div>

                                            {/* EINDSTAND (FT) */}
                                            <div className="input-group-container">
                                                <span className="mobile-only group-label">Eindstand</span>
                                                <div className="score-input-wrapper">
                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'home_ft', -1)}>−</button>
                                                    <span className="label-tag desktop-only">FT</span>
                                                    <input type="number" className="in-ft" value={m.home_ft ?? ''} onChange={(e) => processUpdate(m.id, 'home_ft', e.target.value)} disabled={!isAdmin} />
                                                    <button className="stepper-btn plus mobile-only" onClick={() => handleStep(m.id, 'home_ft', 1)}>+</button>

                                                    <span className="score-dash">:</span>

                                                    <button className="stepper-btn minus mobile-only" onClick={() => handleStep(m.id, 'away_ft', -1)}>−</button>
                                                    <input type="number" className="in-ft" value={m.away_ft ?? ''} onChange={(e) => processUpdate(m.id, 'away_ft', e.target.value)} disabled={!isAdmin} />
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
                                                                className={`toto-cube ${m.match_toto === String(val) ? 'active' : ''}`}
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
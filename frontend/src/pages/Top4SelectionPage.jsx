import React, { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

const Top4SelectionPage = () => {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);

    const [preSelection, setPreSelection] = useState({ rank_1: '', rank_2: '', rank_3: '', rank_4: '', id: null });
    const [postSelection, setPostSelection] = useState({ rank_1: '', rank_2: '', rank_3: '', rank_4: '', id: null });

    const [isPreLocked, setIsPreLocked] = useState(false);
    const [isPostOpen, setIsPostOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [teamList, matches, tournament] = await Promise.all([
                    pb.collection('teams').getFullList({ sort: 'name', requestKey: null }),
                    pb.collection('matches').getFullList({ sort: 'match_date', requestKey: null }),
                    pb.collection('tournaments').getFirstListItem('is_active=true', { requestKey: null })
                ]);

                setTeams(teamList);

                const now = new Date();
                if (matches.length > 0) {
                    const firstMatch = new Date(matches[0].match_date);
                    setIsPreLocked(now > new Date(firstMatch.getTime() - 30 * 60000));

                    const groupMatches = matches.filter(m => m.stage === 'Groepsfase');
                    if (groupMatches.length > 0) {
                        const lastGroup = new Date(groupMatches[groupMatches.length - 1].match_date);
                        setIsPostOpen(now > new Date(lastGroup.getTime() + 120 * 60000));
                    }
                }

                const existing = await pb.collection('top_four_predictions').getFullList({
                    filter: `user="${pb.authStore.model.id}" && tournament="${tournament.id}"`,
                    requestKey: null
                });

                const pre = existing.find(p => p.phase === 'pre_tournament');
                if (pre) setPreSelection({ rank_1: pre.rank_1, rank_2: pre.rank_2, rank_3: pre.rank_3, rank_4: pre.rank_4, id: pre.id });

                const post = existing.find(p => p.phase === 'post_group_stage');
                if (post) setPostSelection({ rank_1: post.rank_1, rank_2: post.rank_2, rank_3: post.rank_3, rank_4: post.rank_4, id: post.id });

                setLoading(false);
            } catch (err) {
                console.error("Fetch error", err);
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleAutoSave = async (updatedSelection, phaseKey) => {
        setIsSyncing(true);
        try {
            const tournament = await pb.collection('tournaments').getFirstListItem('is_active=true');
            const data = {
                user: pb.authStore.model.id,
                tournament: tournament.id,
                phase: phaseKey,
                rank_1: updatedSelection.rank_1,
                rank_2: updatedSelection.rank_2,
                rank_3: updatedSelection.rank_3,
                rank_4: updatedSelection.rank_4
            };

            if (updatedSelection.id) {
                await pb.collection('top_four_predictions').update(updatedSelection.id, data);
            } else {
                const res = await pb.collection('top_four_predictions').create(data);
                if (phaseKey === 'pre_tournament') setPreSelection(p => ({...p, id: res.id}));
                else setPostSelection(p => ({...p, id: res.id}));
            }
            setLastSaved(new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }));
        } catch (err) {
            console.error("Save failed", err);
        } finally {
            setTimeout(() => setIsSyncing(false), 500);
        }
    };

    const renderPhaseCard = (title, subtitle, selection, setSelection, isLocked, isDisabled, phaseKey) => {
        const labels = ["🥇 1e Plaats", "🥈 2e Plaats", "🥉 3e Plaats", "🏅 4e Plaats"];
        
        return (
            <div className={`top4-column ${isLocked || isDisabled ? 'section-disabled' : ''}`}>
                <div className="card-header">
                    <h3>{title}</h3>
                    <p className="status-msg">{subtitle}</p>
                </div>
                
                <div className="top4-card-selection">
                    {[1, 2, 3, 4].map((num) => {
                        const rankKey = `rank_${num}`;
                        return (
                            <div key={num} className="dropdown-group">
                                <label className="rank-label">{labels[num - 1]}</label>
                                <select
                                    className="top4-select"
                                    value={selection[rankKey]}
                                    disabled={isLocked || isDisabled}
                                    onChange={(e) => {
                                        const newS = { ...selection, [rankKey]: e.target.value };
                                        setSelection(newS);
                                        handleAutoSave(newS, phaseKey);
                                    }}
                                >
                                    <option value="">-- Selecteer Team --</option>
                                    {teams.map(team => (
                                        <option key={team.id} value={team.id} disabled={Object.values(selection).includes(team.id) && selection[rankKey] !== team.id}>
                                            {team.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (loading) return <div className="loader">Gegevens laden...</div>;

    return (
        <div className="container-centered page-container">
            <header className="page-header">
                <h1 className="tournament-title">Top 4 Voorspellen</h1>
                <p className="admin-subtitle">Onderdeel C: Kies twee keer de top 4: voor en tijdens het toernooi</p>
            </header>

            <div className="top4-side-by-side">
                {renderPhaseCard(
                    "Fase 1: Pre-Tournament", 
                    isPreLocked ? "🔒 Voorspelling gesloten" : "Kies vóór de start van het WK.",
                    preSelection, setPreSelection, isPreLocked, false, 'pre_tournament'
                )}

                {renderPhaseCard(
                    "Fase 2: Post-Group Stage", 
                    !isPostOpen ? "⏳ Beschikbaar na groepsfase" : "Kies vóór de knock-outs.",
                    postSelection, setPostSelection, false, !isPostOpen, 'post_group_stage'
                )}
            </div>

            <div className={`floating-sync-bar ${isSyncing ? 'syncing' : 'synced'}`}>
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

export default Top4SelectionPage;
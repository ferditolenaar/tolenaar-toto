import React, { useEffect, useState, useMemo } from 'react';
import pb from '../lib/pocketbase';
import { Link } from 'react-router-dom';
import '../MasterGrid.css';
import '../Features.css';

export default function MasterMatrix() {
    const [data, setData] = useState({ matches: [], users: [], predictions: [] });
    const [activeStage, setActiveStage] = useState('Groepsfase');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];

    const [visibleStage, setVisibleStage] = useState(stageOrder[0]);

    // Stages for the filter buttons
    const navStages = [
        'Groepsfase',
        'Zestiende Finale',
        'Achtste Finale',
        'Kwartfinale',
        'Halve Finale'
    ];

    const user = pb.authStore.model;
    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        const fetchMatrixData = async () => {
            try {
                setLoading(true);
                const [allMatches, allUsers, allPreds] = await Promise.all([
                    pb.collection('matches').getFullList({
                        sort: 'match_date',
                        expand: 'home_team,away_team',
                    }),
                    pb.collection('users').getFullList({ sort: 'order' }),
                    pb.collection('predictions').getFullList({ requestKey: null })
                ]);
                // Keep your duplicated user set for testing large grids
                setData({
                    matches: allMatches,
                    users: allUsers,
                    predictions: allPreds
                });
            } catch (err) {
                console.error("Matrix fetch error", err);
            } finally {
                setLoading(false);
            }
        };
        fetchMatrixData();
    }, []);

    const filteredMatches = useMemo(() => {
        let matches = [];
        if (activeStage === 'Finales') {
            matches = data.matches.filter(m => m.stage === 'Finale' || m.stage === 'Troostfinale');
        } else {
            matches = data.matches.filter(m => m.stage?.trim() === activeStage.trim());
        }
        return matches
    }, [data.matches, activeStage]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        let stageId = entry.target.id;
                        if (['Troostfinale', 'Finale'].includes(stageId)) {
                            stageId = 'Halve Finale';
                        }
                        setVisibleStage(stageId);
                    }
                });
            },
            { rootMargin: "-10px 0px -80% 0px", threshold: 0 }
        );

        stageOrder.forEach((stage) => {
            const el = document.getElementById(stage);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [filteredMatches]);

    const filteredUsers = useMemo(() => {
        return [...data.users]
            .filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()))
            // Sort by 'order' primarily, then lastName
            .sort((a, b) => (a.order || 0) - (b.order || 0) || a.lastName.localeCompare(b.lastName));
    }, [data.users, searchTerm]);

    const handleOrderChange = async (userId, newOrder) => {
        const val = parseInt(newOrder) || 0;
        try {
            // 1. Update PocketBase
            await pb.collection('users').update(userId, { order: val });

            // 2. Update local state to trigger the useMemo sort
            setData(prev => ({
                ...prev,
                users: prev.users.map(u => u.id === userId ? { ...u, order: val } : u)
            }));
        } catch (err) {
            console.error("Failed to update order:", err);
        }
    };

    const handlePaidToggle = async (userId, currentStatus) => {
        const newStatus = !currentStatus;
        try {
            // 1. Update PocketBase
            await pb.collection('users').update(userId, { paid: newStatus });

            // 2. Update local state
            setData(prev => ({
                ...prev,
                users: prev.users.map(u => u.id === userId ? { ...u, paid: newStatus } : u)
            }));
        } catch (err) {
            console.error("Failed to update paid status:", err);
        }
    };

    return (
        <div className="matrix-main-layout">
            <header className="page-header matrix-header-compact">
                <h1 className="tournament-title">Matrix Overzicht</h1>
                <div className="matrix-controls-centered">
                    <div className="search-wrapper-centered">
                        <input
                            type="text"
                            placeholder="Zoek een deelnemer..."
                            className="matrix-search-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            <div className="matrix-scroll-container tournament-card">
                <table className="master-matrix">
                    <thead>
                        <tr>
                            {/* FIXED: Top-Left Anchor Cell */}
                            <th className="sticky-col matrix-header-cell">Match</th>

                            {filteredUsers.map((user, index) => (
                                <th key={`${user.id}-${index}`} className={`user-header ${user.paid ? 'status-paid' : 'status-unpaid'}`}>
                                    <div className="header-initials">
                                        {isAdmin && (
                                            <div className="admin-controls-wrapper">
                                                {/* Order Input */}
                                                <input
                                                    type="number"
                                                    className="admin-order-input"
                                                    defaultValue={user.order || 0}
                                                    onBlur={(e) => handleOrderChange(user.id, e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleOrderChange(user.id, e.target.value)}
                                                />
                                                {/* Paid Checkbox */}
                                                <label className="admin-paid-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={user.paid || false}
                                                        onChange={() => handlePaidToggle(user.id, user.paid)}
                                                    />
                                                    <span className="checkbox-label">Betaald</span>
                                                </label>
                                            </div>
                                        )}
                                        <span className="f-name">{user.firstName}</span>
                                        <br />
                                        <span className="l-name">{user.lastName}</span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.matches.map(match => (
                            <tr key={match.id} id={match.stage}>
                                <td className="sticky-col match-cell">
                                    <div className="matrix-match-info">
                                        <span className="m-code">{match.expand?.home_team?.code} - {match.expand?.away_team?.code}</span>
                                        {match.result && <span className="m-res">({match.result})</span>}
                                    </div>
                                </td>

                                {filteredUsers.map((user, index) => {
                                    const pred = data.predictions.find(p => p.match === match.id && p.user === user.id);

                                    // 1. Check HT Correctness (Match home_ht/away_ht vs Pred pred_home_ht/pred_away_ht)
                                    const htCorrect = pred &&
                                        pred.pred_home_ht === match.home_ht &&
                                        pred.pred_away_ht === match.away_ht;

                                    // 2. Check FT Correctness
                                    const ftCorrect = pred &&
                                        pred.pred_home_ft === match.home_ft &&
                                        pred.pred_away_ft === match.away_ft;

                                    // 3. Check Toto Correctness (match.result vs pred.pred_toto)
                                    const totoCorrect = pred && pred.pred_toto === match.match_toto;

                                    return (
                                        <td key={`cell-${match.id}-${index}`} className="pred-cell-matrix">
                                            <div className="matrix-score-grid">
                                                <div className="score-row">
                                                    {/* Displaying Home-Away format for HT */}
                                                    <span className={`s-mini ht ${htCorrect ? 'is-correct' : ''}`}>
                                                        {pred ? `${pred.pred_home_ht}-${pred.pred_away_ht}` : '-'}
                                                    </span>
                                                    {/* Displaying Home-Away format for FT */}
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
    );
}
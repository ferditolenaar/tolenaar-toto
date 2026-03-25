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

    // Stages for the filter buttons
    const navStages = [
        'Groepsfase',
        'Zestiende Finale',
        'Achtste Finale',
        'Kwartfinale',
        'Halve Finale'
    ];

    useEffect(() => {
        const fetchMatrixData = async () => {
            try {
                setLoading(true);
                const [allMatches, allUsers, allPreds] = await Promise.all([
                    pb.collection('matches').getFullList({
                        sort: 'match_date',
                        expand: 'home_team,away_team',
                    }),
                    pb.collection('users').getFullList({ sort: 'lastName' }),
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

    const [visibleStage, setVisibleStage] = useState(stageOrder[0]);

    const filteredMatches = useMemo(() => {
        let matches = [];
        if (activeStage === 'Finales') {
            matches = data.matches.filter(m => m.stage === 'Finale' || m.stage === 'Troostfinale');
        } else {
            matches = data.matches.filter(m => m.stage?.trim() === activeStage.trim());
        }
        return matches;
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
        return data.users.filter(u =>
            `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [data.users, searchTerm]);

    if (loading) return <div className="loading-state">Matrix aan het genereren...</div>;

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
                                <th key={`${user.id}-${index}`} className="user-header" title={`${user.firstName} ${user.lastName}`}>
                                    <div className="header-initials">
                                        <span className="f-name">{user.firstName}</span>
                                        <br />
                                        <span className="l-name">{user.lastName}</span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredMatches.map(match => (
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
import React, { useEffect, useState, useMemo, useRef } from 'react'; // Added useRef
import pb from '../lib/pocketbase';
import { Link } from 'react-router-dom';
import '../MasterGrid.css';
import '../Features.css';

export default function MasterMatrix() {
    const [data, setData] = useState({ matches: [], users: [], predictions: [] });
    const [activeStage, setActiveStage] = useState('Groepsfase');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // 1. Create a Ref Map to store references to the user header cells
    const userRefs = useRef(new Map());

    const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];

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

    // 2. Sorting logic moved to a separate Memo (Not filtering, just sorting)
    const sortedUsers = useMemo(() => {
        return [...data.users].sort((a, b) => 
            (a.order || 0) - (b.order || 0) || 
            (a.lastName || "").localeCompare(b.lastName || "")
        );
    }, [data.users]);

    // 3. The Scrolling Logic
    useEffect(() => {
        if (!searchTerm.trim()) return;

        // Find the first user that matches the search term
        const targetUser = sortedUsers.find(u => 
            `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (targetUser && userRefs.current.has(targetUser.id)) {
            const element = userRefs.current.get(targetUser.id);
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest', // Don't scroll vertically
                inline: 'center'  // Center the found person in the view
            });
        }
    }, [searchTerm, sortedUsers]);

    const handleOrderChange = async (userId, newOrder) => {
        const val = parseInt(newOrder) || 0;
        try {
            await pb.collection('users').update(userId, { order: val });
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
            await pb.collection('users').update(userId, { paid: newStatus });
            setData(prev => ({
                ...prev,
                users: prev.users.map(u => u.id === userId ? { ...u, paid: newStatus } : u)
            }));
        } catch (err) {
            console.error("Failed to update paid status:", err);
        }
    };

    if (loading) return <div>Laden...</div>;

    const isAdmin = pb.authStore.model?.role === 'admin';

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
                            <th className="sticky-col matrix-header-cell">Match</th>

                            {/* Use sortedUsers (all of them) instead of filteredUsers */}
                            {sortedUsers.map((user) => (
                                <th 
                                    key={user.id} 
                                    // 4. Assign the ref to the header cell
                                    ref={el => userRefs.current.set(user.id, el)}
                                    className={`user-header ${user.paid ? 'status-paid' : 'status-unpaid'}`}
                                >
                                    <div className="header-initials">
                                        {isAdmin && (
                                            <div className="admin-controls-wrapper">
                                                <input
                                                    type="number"
                                                    className="admin-order-input"
                                                    defaultValue={user.order || 0}
                                                    onBlur={(e) => handleOrderChange(user.id, e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleOrderChange(user.id, e.target.value)}
                                                />
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

                                {sortedUsers.map((user) => {
                                    const pred = data.predictions.find(p => p.match === match.id && p.user === user.id);
                                    
                                    const htCorrect = pred &&
                                        pred.pred_home_ht === match.home_ht &&
                                        pred.pred_away_ht === match.away_ht;

                                    const ftCorrect = pred &&
                                        pred.pred_home_ft === match.home_ft &&
                                        pred.pred_away_ft === match.away_ft;

                                    const totoCorrect = pred && pred.pred_toto === match.match_toto;

                                    return (
                                        <td key={`cell-${match.id}-${user.id}`} className="pred-cell-matrix">
                                            <div className="matrix-score-grid">
                                                <div className="score-row">
                                                    <span className={`s-mini ht ${htCorrect ? 'is-correct' : ''}`}>
                                                        {pred ? `${pred.pred_home_ht}-${pred.pred_away_ht}` : '-'}
                                                    </span>
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
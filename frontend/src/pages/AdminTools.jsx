import { useState, useEffect } from 'react';
import pb from '../lib/pocketbase';
import '../Features.css';

export default function AdminTools() {
    const [status, setStatus] = useState('Standby');
    const [tournaments, setTournaments] = useState([]);
    const [selectedTournament, setSelectedTournament] = useState('');
    const [teamJsonInput, setTeamJsonInput] = useState('');
    const [matchJsonInput, setMatchJsonInput] = useState('');
    const [teams, setTeams] = useState([]);
    const [officialResults, setOfficialResults] = useState({ rank_1: '', rank_2: '', rank_3: '', rank_4: '', id: null });

    // 1. Fetch teams to populate the admin dropdowns
    useEffect(() => {
        const loadTeams = async () => {
            const records = await pb.collection('teams').getFullList({ sort: 'name' });
            setTeams(records);
        };
        loadTeams();
    }, []);

    // 2. Fetch existing official results when tournament changes
    useEffect(() => {
        if (!selectedTournament) return;
        const fetchOfficial = async () => {
            try {
                const res = await pb.collection('tournament_top4').getFirstListItem(`tournament="${selectedTournament}"`);
                setOfficialResults({
                    rank_1: res.rank_1,
                    rank_2: res.rank_2,
                    rank_3: res.rank_3,
                    rank_4: res.rank_4,
                    id: res.id
                });
            } catch (e) {
                setOfficialResults({ rank_1: '', rank_2: '', rank_3: '', rank_4: '', id: null });
            }
        };
        fetchOfficial();
    }, [selectedTournament]);

    const saveOfficialResults = async () => {
        setStatus('Resultaten opslaan...');
        try {
            const data = {
                tournament: selectedTournament,
                rank_1: officialResults.rank_1,
                rank_2: officialResults.rank_2,
                rank_3: officialResults.rank_3,
                rank_4: officialResults.rank_4,
            };

            if (officialResults.id) {
                await pb.collection('tournament_top4').update(officialResults.id, data);
            } else {
                const res = await pb.collection('tournament_top4').create(data);
                setOfficialResults(prev => ({ ...prev, id: res.id }));
            }
            setStatus('✅ Top 4 resultaten succesvol opgeslagen!');
        } catch (err) {
            setStatus(`Error: ${err.message}`);
        }
    };

    useEffect(() => {
        const fetchTournaments = async () => {
            try {
                const records = await pb.collection('tournaments').getFullList({ sort: '-year' });
                setTournaments(records);
                if (records.length > 0) setSelectedTournament(records[0].id);
            } catch (err) {
                console.error("Failed to load tournaments", err);
            }
        };
        fetchTournaments();
    }, []);

    const linkTeams = async () => {
        if (!selectedTournament) return setStatus('Error: Selecteer eerst een toernooi');

        setStatus('Bezig met koppelen...');
        let createdCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        try {
            // 1. Get every team you've ever created
            const teams = await pb.collection('teams').getFullList();

            // 2. Loop through them one by one
            for (const team of teams) {
                try {
                    // Attempt to create the link
                    await pb.collection('tournament_teams').create({
                        tournament: selectedTournament,
                        team: team.id,
                        group_name: "" // You can fill this in manually in PB later
                    });
                    createdCount++;
                } catch (err) {
                    // If PocketBase returns an error (like "Unique constraint failed")
                    // we just count it as a skip and KEEP GOING.
                    skippedCount++;
                    console.log(`Skipping ${team.name}: already linked or error.`);
                }
            }

            setStatus(`Klaar! Nieuw: ${createdCount}, Reeds gekoppeld/Overgeslagen: ${skippedCount}`);
        } catch (err) {
            // This catch only triggers if the initial 'teams' fetch fails
            setStatus(`Kritieke fout: ${err.message}`);
        }
    };

    const importTeams = async () => {
        if (!teamJsonInput) return setStatus('Error: Paste Team JSON first');
        setStatus('Importing teams...');
        try {
            const data = JSON.parse(teamJsonInput);
            for (const team of data) {
                await pb.collection('teams').create({ name: team.name, code: team.code });
            }
            setStatus(`Success: ${data.length} Teams Created!`);
            setTeamJsonInput('');
        } catch (err) { setStatus(`Error: ${err.message}`); }
    };

    const importMatches = async () => {
        let createdCount = 0;
        let skippedCount = 0;

        if (!matchJsonInput || !selectedTournament) return setStatus('Error: Missing input/tournament');
        setStatus('Importing matches...');

        try {
            const data = JSON.parse(matchJsonInput);
            const teams = await pb.collection('teams').getFullList();
            const teamMap = {};
            teams.forEach(t => teamMap[t.name] = t.id);

            for (const m of data) {
                try {
                    // 1. Validation: Check if teams exist in our map
                    const homeId = teamMap[m.home];
                    const awayId = teamMap[m.away];

                    if (!homeId) throw new Error(`Team niet gevonden: ${m.home}`);

                    // 2. Create the record
                    await pb.collection('matches').create({
                        tournament: selectedTournament,
                        home_team: homeId,
                        away_team: awayId || null,
                        match_date: m.match_date,
                        match_stadium: m.match_stadium || "",
                        match_city: m.match_city || "",
                        status: 'scheduled',
                        stage: m.stage
                    });

                    createdCount++;
                } catch (error) {
                    // This catch handles individual match failures (duplicates, missing teams, etc.)
                    skippedCount++;
                    console.warn(`Skipped match on ${m.match_date}:`, error.message);
                }
            }

            setStatus(`Klaar! Nieuw: ${createdCount}, Overgeslagen: ${skippedCount}`);
            setMatchJsonInput('');
        } catch (globalError) {
            // This catch handles high-level errors (JSON parsing or initial PB fetch)
            setStatus(`Kritieke fout: ${globalError.message}`);
        }
    };

    return (
        <div className="container-centered page-container">
            <header className="page-header">
                <h1>Admin Tools</h1>
                <p>Status: <strong style={{ color: status.includes('Error') ? '#dc3545' : '#28a745' }}>{status}</strong></p>
            </header>

            {/* Dedicated Control Row - Keeps things organized without moving the title */}
            <div className="admin-control-bar">
                <div className="tournament-selector-box">
                    <label>Geselecteerd Toernooi</label>
                    <select
                        value={selectedTournament}
                        onChange={(e) => setSelectedTournament(e.target.value)}
                        className="admin-select"
                    >
                        {tournaments.map(t => (
                            <option key={t.id} value={t.id}>
                                {t.name} ({t.year})
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="feature-grid">
                <div className="feature-card full-width">
                    <h3>🏆 Official Tournament Results</h3>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1rem' }}>
                        Selecteer de uiteindelijke winnaars om de klassementen te berekenen.
                    </p>

                    <div className="admin-top4-grid">
                        {[1, 2, 3, 4].map((num) => (
                            <div key={num} className="admin-input-group">
                                <label>{num}e Plaats</label>
                                <select
                                    value={officialResults[`rank_${num}`]}
                                    onChange={(e) => setOfficialResults({ ...officialResults, [`rank_${num}`]: e.target.value })}
                                    className="admin-select"
                                >
                                    <option value="">-- Kies Team --</option>
                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>

                    <button onClick={saveOfficialResults} className="submit-btn" style={{ background: '#f59e0b', marginTop: '15px' }}>
                        Update Official Top 4
                    </button>
                </div>
                {/* Team Management Card */}
                <div className="feature-card">
                    <h3>Team Management</h3>
                    <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Importeer teams via JSON.</p>
                    <textarea
                        className="admin-textarea"
                        value={teamJsonInput}
                        onChange={(e) => setTeamJsonInput(e.target.value)}
                        placeholder='[{"name":"Nederland","code":"NED"}]'
                    />
                    <button onClick={importTeams} className="submit-btn">Import Teams</button>
                </div>

                {/* Fixture Management Card */}
                <div className="feature-card">
                    <h3>Fixture Management</h3>
                    <p style={{ fontSize: '0.9rem', color: '#64748b' }}>Importeer wedstrijden via JSON.</p>
                    <textarea
                        className="admin-textarea"
                        value={matchJsonInput}
                        onChange={(e) => setMatchJsonInput(e.target.value)}
                        placeholder='[{"home":"Nederland","away":"Frankrijk"}]'
                    />
                    <button onClick={importMatches} className="submit-btn" style={{ background: '#10b981' }}>Import Matches</button>
                </div>

                {/* Maintenance Card */}
                <div className="feature-card full-width">
                    <h3>Onderhoud (Maintenance)</h3>
                    <p style={{ marginBottom: '1rem' }}>Koppel alle bestaande teams aan het geselecteerde toernooi.</p>
                    <button onClick={linkTeams} className="submit-btn" style={{ background: '#64748b', width: 'auto' }}>
                        Run Team Linker
                    </button>
                </div>
            </div>
        </div>
    );
}
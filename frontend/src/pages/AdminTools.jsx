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
    const [batchUserId, setBatchUserId] = useState('');
    const [batchStatus, setBatchStatus] = useState('');
    const [users, setUsers] = useState([]);
    const [matches, setMatches] = useState([]);
    const [batchMatchId, setBatchMatchId] = useState('');
    const [batchTotoFilter, setBatchTotoFilter] = useState('');

    // 1. Fetch teams to populate the admin dropdowns
    useEffect(() => {
        const loadTeams = async () => {
            const teamList = await pb.collection('teams').getFullList({ sort: 'name', requestKey: null });

            const actualCountries = teamList.filter(team => {
                const name = team.name.toLowerCase();
                return !name.includes('3e') &&
                    !name.includes('1e') &&
                    !name.includes('2e') &&
                    !name.includes('wedstrijd') &&
                    !name.includes('nummer') &&
                    !name.includes('winnaar'); // for Dutch placeholders
            });

            setTeams(actualCountries);

        };
        const loadUsers = async () => {
            try {
                const userList = await pb.collection('users').getFullList({ sort: 'firstName', requestKey: null });
                setUsers(userList);
            } catch (err) {
                console.error("Failed to load users", err);
            }
        };
        loadTeams();
        loadUsers();
    }, []);

    // 2. Fetch existing official results when tournament changes
    useEffect(() => {
        if (!selectedTournament) return;
        const fetchOfficial = async () => {
            try {
                const res = await pb.collection('tournament_top4').getFirstListItem(`tournament="${selectedTournament}"`, { requestKey: null });
                setOfficialResults({
                    rank_1: res.rank_1,
                    rank_2: res.rank_2,
                    rank_3: res.rank_3,
                    rank_4: res.rank_4,
                    id: res.id
                });
            } catch {
                setOfficialResults({ rank_1: '', rank_2: '', rank_3: '', rank_4: '', id: null });
            }
        };
        fetchOfficial();
    }, [selectedTournament]);

    // Fetch matches
    useEffect(() => {
        const fetchMatches = async () => {
            try {
                const records = await pb.collection('matches').getFullList({
                    sort: 'match_date',
                    expand: 'home_team,away_team',
                    requestKey: null
                });
                setMatches(records);
            } catch (err) {
                console.error("Failed to load matches", err);
            }
        };
        fetchMatches();
    }, []);

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
                const records = await pb.collection('tournaments').getFullList({ sort: '-year', requestKey: null });
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
                } catch {
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

        if (!matchJsonInput) return setStatus('Error: Missing input');
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

    const handleBatchUpdateUserPredictions = async () => {
        if (!batchUserId) {
            setBatchStatus("Fout: Selecteer een deelnemer.");
            return;
        }
        setBatchStatus("Bezig met updaten...");
        
        const user = users.find(u => u.id === batchUserId);
        const userName = user ? `${user.firstName} ${user.lastName}`.trim() : "Onbekend";
        let cutoffDate = null;
        if (batchMatchId) {
            const selectedMatch = matches.find(m => m.id === batchMatchId);
            if (selectedMatch) {
                cutoffDate = new Date(selectedMatch.match_date).getTime();
            }
        }

        try {
            const records = await pb.collection("predictions").getFullList({
                filter: `user = "${batchUserId}"`,
                requestKey: null
            });

            let updatedCount = 0;

            for (const record of records) {
                const matchForPred = matches.find(m => m.id === record.match);
                if (!matchForPred) continue;

                if (cutoffDate !== null) {
                    const matchDate = new Date(matchForPred.match_date).getTime();
                    if (matchDate < cutoffDate) {
                        continue;
                    }
                }

                // If a specific TOTO filter is selected, only process predictions that currently have this TOTO value
                if (batchTotoFilter !== "" && String(record.pred_toto) !== String(batchTotoFilter)) {
                    continue;
                }

                let targetToto = "3";
                if (record.pred_home_ft > record.pred_away_ft) {
                    targetToto = "1";
                } else if (record.pred_home_ft < record.pred_away_ft) {
                    targetToto = "2";
                }

                if (record.pred_toto !== targetToto) {
                    await pb.collection("predictions").update(record.id, {
                        pred_toto: targetToto
                    }, { requestKey: null });
                    updatedCount++;
                }
            }
            setBatchStatus(`Succesvol ${updatedCount} van de ${records.length} voorspellingen geüpdatet voor ${userName}.`);
        } catch (error) {
            setBatchStatus(`Fout bij updaten van voorspellingen: ${error.message}`);
        }
    };

    return (
        <div className="container-centered page-container">
            <header className="page-header tournament-theme">
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
                {/* Batch Update Predictions Card */}
                <div className="feature-card full-width">
                    <h3>🔄 Batch Update TOTO</h3>
                    <p style={{ fontSize: "0.9rem", color: "#64748b", marginBottom: "1rem" }}>
                        Deze tool controleert alle voorspellingen van een specifieke gebruiker. 
                        Als de 1x2 TOTO selectie niet overeenkomt met de voorspelde uitslag, wordt dit automatisch gecorrigeerd.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
                        <select
                            className="admin-select"
                            value={batchUserId}
                            onChange={(e) => setBatchUserId(e.target.value)}
                            style={{ padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "white" }}
                        >
                            <option value="">-- Selecteer een deelnemer --</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.firstName} {u.lastName} {u.email ? `(${u.email})` : ""}
                                </option>
                            ))}
                        </select>

                        <select
                            className="admin-select"
                            value={batchMatchId}
                            onChange={(e) => setBatchMatchId(e.target.value)}
                            style={{ padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "white" }}
                        >
                            <option value="">-- Vanaf begin toernooi (Alle wedstrijden) --</option>
                            {matches.map(m => (
                                <option key={m.id} value={m.id}>
                                    {m.expand?.home_team?.name || "Onbekend"} vs {m.expand?.away_team?.name || "Onbekend"} - {new Date(m.match_date).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                                </option>
                            ))}
                        </select>

                        <select
                            className="admin-select"
                            value={batchTotoFilter}
                            onChange={(e) => setBatchTotoFilter(e.target.value)}
                            style={{ padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "white" }}
                        >
                            <option value="">-- Huidige TOTO filter (Alle) --</option>
                            <option value="1">Alleen als huidige TOTO 1 is (Thuis)</option>
                            <option value="2">Alleen als huidige TOTO 2 is (Uit)</option>
                            <option value="3">Alleen als huidige TOTO 3 is (Gelijk)</option>
                        </select>

                        <button onClick={handleBatchUpdateUserPredictions} className="submit-btn" style={{ background: "#3b82f6", margin: 0 }}>
                            Update TOTO
                        </button>
                    </div>
                    {batchStatus && (
                        <p style={{ fontSize: "0.9rem", fontWeight: "bold", color: batchStatus.includes("Fout") ? "#dc3545" : "#10b981" }}>
                            {batchStatus}
                        </p>
                    )}
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
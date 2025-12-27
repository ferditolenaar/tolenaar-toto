import { useEffect, useState } from 'react';
import pb from '../lib/pocketbase';
import { Link } from 'react-router-dom';
import '../Features.css';

export default function StartPage() {
  const [matches, setMatches] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Phase logic states
  const [isPreTournamentLocked, setIsPreTournamentLocked] = useState(false);
  const [isPostGroupActive, setIsPostGroupActive] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const today = new Date();

        // 1. Fetch Top 5 Leaderboard
        const topUsers = await pb.collection('users').getFullList({
          sort: '-total_points',
          limit: 5,
          requestKey: null
        });
        setLeaderboard(topUsers);

        // 2. Fetch Matches to determine Tournament Phase
        const allMatches = await pb.collection('matches').getFullList({ 
          sort: 'match_date',
          expand: 'home_team,away_team',
          requestKey: null 
        });

        if (allMatches.length > 0) {
          // Phase 1 Lock: 30 mins before the first match of the tournament
          const firstMatchTime = new Date(allMatches[0].match_date).getTime();
          setIsPreTournamentLocked(today.getTime() > (firstMatchTime - 30 * 60000));

          // Phase 2 Open: After the last 'Groepsfase' match
          const groupMatches = allMatches.filter(m => m.stage === 'Groepsfase');
          if (groupMatches.length > 0) {
            const lastGroupMatchTime = new Date(groupMatches[groupMatches.length - 1].match_date).getTime();
            // Opens 2 hours after last group match starts
            setIsPostGroupActive(today.getTime() > (lastGroupMatchTime + 120 * 60000));
          }
          
          // Filter matches for the "Upcoming" card (same logic as before)
          const todayStr = today.toISOString().split('T')[0];
          let currentDayMatches = allMatches.filter(m => m.match_date.includes(todayStr));
          
          if (currentDayMatches.length === 0) {
            const nextMatch = allMatches.find(m => new Date(m.match_date) > today);
            if (nextMatch) {
              const nextDate = nextMatch.match_date.split(' ')[0];
              currentDayMatches = allMatches.filter(m => m.match_date.includes(nextDate));
            }
          }
          setMatches(currentDayMatches);
        }
      } catch (err) {
        console.error("Data fetch error", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="container-centered page-container">
      <header className="page-header">
        <h1>WK 2026 Toto</h1>
        <p>Welkom bij <strong>DeRoTo</strong>. Voorspel de uitslagen en win!</p>
      </header>

      {/* NEW SECTION: TOP 4 PREDICTIONS */}
      <div className="top4-banner-grid">
        <div className={`feature-card top4-card ${isPreTournamentLocked ? 'locked' : 'active'}`}>
           <div className="card-header">
              <h3>🏆 Top 4: Pre-Tournament</h3>
              <p>{isPreTournamentLocked ? "🔒 Gesloten (Start WK)" : "Voorspel de top 4 vóór het WK begint!"}</p>
           </div>
           <Link to="/top4" className={`card-action-btn ${isPreTournamentLocked ? 'gray-btn' : 'gold-btn'}`}>
             {isPreTournamentLocked ? "Bekijk Voorspelling" : "Nu Invullen"}
           </Link>
        </div>

        {isPostGroupActive && (
          <div className="feature-card top4-card active highlight-card">
            <div className="card-header">
                <h3>🔥 Top 4: Post-Group Stage</h3>
                <p>De groepsfase is voorbij. Wie haalt de laatste vier?</p>
            </div>
            <Link to="/top4" className="card-action-btn gold-btn">
              Voorspellen
            </Link>
          </div>
        )}
      </div>

      <div className="feature-grid">
        {/* CARD 1: TOP DEELNEMERS */}
        <div className="feature-card">
          <div className="card-header">
            <h3>📊 Top Deelnemers</h3>
            <p>De huidige stand van zaken.</p>
          </div>
          <div className="card-content">
            <div className="leaderboard-mini">
              {leaderboard.map((user, index) => (
                <div key={user.id} className="mini-row">
                  <span className="mini-rank">{index + 1}</span>
                  <span className="mini-name">{user.username || user.name || 'Anoniem'}</span>
                  <span className="mini-points">{user.total_points || 0}</span>
                </div>
              ))}
            </div>
          </div>
          <Link to="/stand" className="card-action-btn blue-btn">Volledige Stand</Link>
        </div>

        {/* CARD 2: AANKOMENDE WEDSTRIJDEN */}
        <div className="feature-card">
          <div className="card-header">
            <h3>⚽ Aankomende Wedstrijden</h3>
            <p>Eerstvolgende speeldag.</p>
          </div>
          <div className="card-content">
            <div className="matches-mini">
              {matches.length > 0 ? matches.map((match) => (
                <div key={match.id} className="mini-match-row">
                  <span className="mini-teams">
                    {match.expand?.home_team?.name} vs {match.expand?.away_team?.name}
                  </span>
                  <span className="mini-time">
                    {new Date(match.match_date).toLocaleTimeString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )) : <p className="empty-txt">Geen wedstrijden gevonden.</p>}
            </div>
          </div>
          <Link to="/voorspellen" className="card-action-btn green-btn">Voorspellen</Link>
        </div>
      </div>
    </div>
  );
}
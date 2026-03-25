import { useEffect, useState } from 'react';
import pb from '../lib/pocketbase';
import { Link } from 'react-router-dom';
import '../Features.css';

export default function StartPage() {
  const [matches, setMatches] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState('GROEP'); // Default
  
  const [predictionStats, setPredictionStats] = useState({
    total: 0,
    predicted: 0,
    missing: 0,
    isFinished: false,
    stageName: "Laden...",
    phase: 'GROEP',
    isLocked: false
  });

  // Phase logic states
  const [isPreTournamentLocked, setIsPreTournamentLocked] = useState(false);
  const [isPostGroupActive, setIsPostGroupActive] = useState(false);
  const [shouldShowTop4, setShouldShowTop4] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const today = new Date();
        // test at very start of groepfase: const today = new Date('2026-06-11T19:00:00Z');
        //const today = new Date('2026-06-11T18:30:00Z');
        // test during groepfase: const today = new Date('2026-11-25T12:00:00');
        //const today = new Date('2026-06-15T18:30:00Z');
        // test right after groepfase: const today = new Date('2026-12-15T12:00:00');
        //const today = new Date('2026-06-28T04:30:00Z');
        // test right after groepfase: const today = new Date('2026-12-15T12:00:00');
        //const today = new Date('2026-06-28T04:30:00Z');
        // test right after 16e: const today = new Date('2026-12-15T12:00:00');
        //const today = new Date('2026-07-04T03:40:00Z');
        // test right after 8e: const today = new Date('2026-12-15T12:00:00');
        //const today = new Date('2026-07-07T22:00:00Z');
        // test right after kwart: const today = new Date('2026-12-15T12:00:00');
        //const today = new Date('2026-07-12T03:00:00Z');
        // test right after halve: const today = new Date('2026-12-15T12:00:00');
        //const today = new Date('2026-07-15T22:00:00Z');
        const todayTime = today.getTime();
        const userId = pb.authStore.model?.id;

        // 1. Fetch Leaderboard
        const topUsers = await pb.collection('users').getFullList({
          sort: '-total_points',
          limit: 5,
          requestKey: null
        });
        setLeaderboard(topUsers);

        // 2. Fetch All Matches
        const allMatches = await pb.collection('matches').getFullList({
          sort: 'match_date',
          expand: 'home_team,away_team',
          requestKey: null
        });

        if (allMatches.length > 0) {
          // --- PHASE CALCULATIONS ---
          const firstMatchTime = new Date(allMatches[0].match_date).getTime();
          const isLocked = todayTime > (firstMatchTime - 30 * 60000);
          setIsPreTournamentLocked(isLocked);

          const groupMatches = allMatches.filter(m => m.stage === 'Groepsfase');
          const lastGroupMatchTime = new Date(groupMatches[groupMatches.length - 1]?.match_date).getTime();
          const postGroupActive = todayTime > (lastGroupMatchTime + 120 * 60000);
          setIsPostGroupActive(postGroupActive);

          const firstKnockout = allMatches.find(m => m.stage !== 'Groepsfase');
          const knockoutStarted = firstKnockout ? todayTime > new Date(firstKnockout.match_date).getTime() : false;

          // --- PREDICTION STATS LOGIC ---
          if (userId) {
            // Find the next match. If none found (pre-tournament), it defaults to the first match.
            const nextMatch = allMatches.find(m => new Date(m.match_date).getTime() > todayTime) || allMatches[0];

            // CRITICAL: Initialize with defaults so it's never undefined
            let activeStageFilter = ['Groepsfase'];
            let stageLabel = "Groepsfase";
            let phaseKey = 'GROEP';

            if (nextMatch) {
              if (nextMatch.stage === 'Finale' || nextMatch.stage === 'Troostfinale') {
                activeStageFilter = ['Finale', 'Troostfinale'];
                stageLabel = "Finales";
                phaseKey = 'KNOCKOUT';
              } else {
                activeStageFilter = [nextMatch.stage];
                stageLabel = nextMatch.stage;
                if (nextMatch.stage !== 'Groepsfase') phaseKey = 'KNOCKOUT';
              }
            }

            // 3. Fetch predictions based on the determined filter
            const stageFilterQuery = activeStageFilter.map(s => `match.stage = "${s}"`).join(' || ');
            const userPredictions = await pb.collection('predictions').getFullList({
              filter: `user = "${userId}" && (${stageFilterQuery})`,
              requestKey: null
            });

            const currentStageMatches = allMatches.filter(m => activeStageFilter.includes(m.stage));
            const firstMatchOfStage = currentStageMatches.reduce((earliest, current) => {
              return new Date(current.match_date) < new Date(earliest.match_date) ? current : earliest;
            }, currentStageMatches[0]);
            const stageLocked = firstMatchOfStage ? todayTime > new Date(firstMatchOfStage.match_date).getTime() : false;

            const total = currentStageMatches.length;
            const predicted = userPredictions.length;
            const missing = total - predicted;

            setPredictionStats({
              total: total,
              predicted: predicted,
              missing: missing,
              isFinished: missing <= 0,
              stageName: stageLabel,
              phase: phaseKey,
              isLocked: stageLocked
            });

            // 4. Set Top 4 visibility
            // Shows if we are in GROEP phase OR the post-group window, as long as knockouts haven't started.
            setShouldShowTop4((phaseKey === 'GROEP' || postGroupActive) && !knockoutStarted);
          }

          // --- UPCOMING MATCHES CARD ---
          const todayStr = today.toISOString().split('T')[0];
          let currentDayMatches = allMatches.filter(m => m.match_date.includes(todayStr));

          if (currentDayMatches.length === 0) {
            const nextM = allMatches.find(m => new Date(m.match_date) > today);
            if (nextM) {
              const nextDate = nextM.match_date.split(' ')[0];
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
      <header className="page-header tournament-theme">
        <h1>WK 2026 TOTO</h1>
        <p>Voorspel de uitslagen van het grootste sportevenement ter wereld en win!</p>
      </header>

      {/* --- ACTION CENTER --- */}
      <div className="section-spacing-compact">
        <div className="feature-card tournament-card action-center">
          <div className="action-grid">

            {/* 1. Top 4 Section - Uses the state variable */}
            {shouldShowTop4 && (
              <>
                <div className="action-item">
                  <div className="card-header-sm">
                    <h3>🏆 {isPostGroupActive ? "Knock-out Top 4" : "Top 4 Status"}</h3>
                    <p className="status-txt">
                      {isPreTournamentLocked && !isPostGroupActive ? "🔒 Gesloten" : "Kies je winnaars"}
                    </p>
                  </div>
                  <Link to="/top4" className="card-action-btn-sm gold-btn">
                    {isPreTournamentLocked && !isPostGroupActive ? "Bekijk" : "Nu Invullen"}
                  </Link>
                </div>
                <div className="vertical-divider"></div>
              </>
            )}

            {/* 2. Match Progress - Uses the state variable */}
            <div className="action-item">
              <div className="card-header-sm">
                <h3>⚽ {predictionStats.stageName}</h3>
                <p className="status-txt">
                  {predictionStats.isLocked ? (
                    "🔒 Voorspellingen gesloten"
                  ) : (
                    predictionStats.isFinished ? "✅ Alles ingevuld!" : `${predictionStats.missing} nog in te vullen`
                  )}
                </p>
              </div>

              {/* Progress bar stays visible so they can see their completion rate even when locked */}
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${(predictionStats.predicted / predictionStats.total) * 100}%` }}></div>
              </div>

              <Link
                to="/voorspellen"
                className={`card-action-btn-sm ${predictionStats.isLocked ? 'gray-btn' : 'green-btn'}`}
              >
                {predictionStats.isLocked ? "Bekijk Voorspellingen" : (predictionStats.isFinished ? "Aanpassen" : "Voorspellen")}
              </Link>
            </div>

          </div>
        </div>
      </div>

      {/* 3. Main Dashboard Grid */}
      <div className="feature-grid section-spacing">
        <div className="feature-card tournament-card">
          <div className="card-header">
            <h3>📊 Top Deelnemers</h3>
            <p>Huidige live stand van de toto.</p>
          </div>
          <div className="card-content">
            <div className="leaderboard-mini">
              {leaderboard.map((user, index) => (
                <div key={user.id} className="mini-row">
                  <span className={`mini-rank rank-${index + 1}`}>{index + 1}</span>
                  <span className="mini-name">{`${user.firstName} ${user.lastName}`}</span>
                  <span className="mini-points">{user.total_points || 0}</span>
                </div>
              ))}
            </div>
          </div>
          <Link to="/stand" className="card-action-btn blue-btn">Bekijk Volledige Stand</Link>
        </div>

        <div className="feature-card tournament-card">
          <div className="card-header">
            <h3>⚽ Aankomende Wedstrijden</h3>
            <p>Eerstvolgende speeldag in de VS, Canada & Mexico.</p>
          </div>
          <div className="card-content">
            <div className="matches-mini">
              {matches.length > 0 ? matches.map((match) => (
                <div key={match.id} className="mini-match-row">
                  <span className="mini-teams">
                    {match.expand?.home_team?.name} <span className="vs">vs</span> {match.expand?.away_team?.name}
                  </span>
                  <span className="mini-time">
                    {new Date(match.match_date).toLocaleTimeString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )) : <p className="empty-txt">Geen wedstrijden op de planning.</p>}
            </div>
          </div>
          <Link to="/voorspellen" className="card-action-btn green-btn">Direct Voorspellen</Link>
        </div>
      </div>
    </div>
  );
}
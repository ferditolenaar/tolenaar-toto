import { useEffect, useMemo, useState } from 'react';
import pb from '../lib/pocketbase';
import { isMatchStarted } from '../lib/matchUtils';
import { computePrizeMap, MEDAL_PRIZES, OTHER_PRIZES } from '../lib/prizes';
import PrizeBadges from '../components/PrizeBadges';
import { Link } from 'react-router-dom';
import '../Features.css';

export default function StartPage() {
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState('GROEP'); // Default

  const [top4Stats, setTop4Stats] = useState({
    predicted: 0,
    total: 4,
    isFinished: false
  });

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
  const [isTournamentStarted, setIsTournamentStarted] = useState(false);
  const [isPostGroupActive, setIsPostGroupActive] = useState(false);
  const [isPostTop4Locked, setIsPostTop4Locked] = useState(false);
  const [shouldShowTop4, setShouldShowTop4] = useState(false);
  const [showPredictionStatus, setShowPredictionStatus] = useState(false);
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [activeRoundStage, setActiveRoundStage] = useState(null);

  const prizeMap = useMemo(() => computePrizeMap(standings), [standings]);
  const top5 = standings.slice(0, 5);

  const stageOrder = ['Groepsfase', 'Zestiende Finale', 'Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Troostfinale', 'Finale'];
  const STAGE_GRACE_MS = 2 * 60 * 60 * 1000;

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

        // 1. Fetch Leaderboard (full standings, needed to compute prize badges correctly)
        const allUsers = await pb.collection('users').getFullList({
          filter: 'paid = true',
          sort: '-total_points',
          requestKey: null
        });
        setStandings(allUsers.map(user => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          partA: user.score_part_a || 0,
          partB: user.score_part_b || 0,
          partC: user.score_part_c || 0,
          points: user.total_points || 0,
          incomplete: !!user.incomplete
        })));

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
          setIsTournamentStarted(todayTime >= firstMatchTime);

          const groupMatches = allMatches.filter(m => m.stage === 'Groepsfase');
          const lastGroupMatchTime = new Date(groupMatches[groupMatches.length - 1]?.match_date).getTime();
          const postGroupActive = todayTime > (lastGroupMatchTime + 120 * 60000);
          setIsPostGroupActive(postGroupActive);

          const firstKnockout = allMatches.find(m => m.stage !== 'Groepsfase');
          const knockoutStarted = firstKnockout ? isMatchStarted(firstKnockout.match_date) : false;

          // Post-group top4 closes 30 min before the first Zestiende Finale match
          const sixteenthMatches = allMatches
            .filter(m => m.stage === 'Zestiende Finale')
            .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
          const postTop4Cutoff = sixteenthMatches.length >= 1
            ? new Date(sixteenthMatches[0].match_date).getTime() - 30 * 60000
            : null;
          setIsPostTop4Locked(postTop4Cutoff !== null && todayTime >= postTop4Cutoff);

          const stageWindows = stageOrder
            .filter(stage => allMatches.some(m => m.stage === stage))
            .map(stage => {
              const stageMatches = allMatches
                .filter(m => m.stage === stage)
                .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
              const startTime = new Date(stageMatches[0].match_date).getTime();
              const endTime = new Date(stageMatches[stageMatches.length - 1].match_date).getTime();
              return { stage, matches: stageMatches, startTime, endTime };
            });

          const isStageFinished = (window) => todayTime >= window.endTime + STAGE_GRACE_MS;
          const isStageBeforeStart = (window) => todayTime < window.startTime;

          const activeStageWindow = stageWindows.find(w => !isStageFinished(w));

          let predictionResult = {
            total: 0,
            predicted: 0,
            missing: 0,
            isFinished: false,
            stageName: "Laden...",
            phase: 'GROEP',
            isLocked: false
          };
          let predictionVisible = false;

          if (userId && activeStageWindow) {
            // If the current stage has already started, predict for the next stage instead
            let predictionWindow = activeStageWindow;
            if (isMatchStarted(activeStageWindow.matches[0].match_date)) {
              const idx = stageWindows.indexOf(activeStageWindow);
              predictionWindow = stageWindows[idx + 1] || null;
            }

            if (predictionWindow) {
              const stageName = predictionWindow.stage;
              const userPredictions = await pb.collection('predictions').getFullList({
                filter: `user = "${userId}" && match.stage = "${stageName}"`,
                requestKey: null
              });

              const total = predictionWindow.matches.length;
              const predicted = userPredictions.length;
              const missing = total - predicted;
              const stageLocked = todayTime >= new Date(predictionWindow.matches[0].match_date).getTime() - 30 * 60000;

              predictionResult = {
                total,
                predicted,
                missing,
                isFinished: missing <= 0,
                stageName,
                phase: stageName === 'Groepsfase' ? 'GROEP' : 'KNOCKOUT',
                isLocked: stageLocked
              };
              predictionVisible = true;
            }
          }

          setPredictionStats(predictionResult);
          setShowPredictionStatus(predictionVisible);

          // 4. Top 4: always show; phase switches to post_group once tournament begins; locks when Zestiende Finale starts
          setShouldShowTop4(true);

          if (userId) {
            try {
              const top4Phase = todayTime >= firstMatchTime ? 'post_group_stage' : 'pre_tournament';
              const top4Record = await pb.collection('top_four_predictions').getFirstListItem(
                `user = "${userId}" && phase = "${top4Phase}"`,
                { requestKey: null }
              );

              const filledCount = [
                top4Record.rank_1,
                top4Record.rank_2,
                top4Record.rank_3,
                top4Record.rank_4
              ].filter(val => val && val !== "").length;

              setTop4Stats({
                predicted: filledCount,
                total: 4,
                isFinished: filledCount === 4
              });
            } catch (err) {
              setTop4Stats({ predicted: 0, total: 4, isFinished: false });
            }
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

          // Determine if a round is currently active (between its start and end+grace)
          const currentWindow = stageWindows.find(w => {
            return todayTime >= w.startTime && todayTime <= (w.endTime + STAGE_GRACE_MS);
          });
          if (currentWindow) {
            setIsRoundActive(true);
            setActiveRoundStage(currentWindow.stage);
          } else {
            setIsRoundActive(false);
            setActiveRoundStage(null);
          }
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

      {/* Announcement panel - placed directly under the header and above the status/action center */}
      <div className="feature-card tournament-card full-width announcement-panel">
        <div className="card-header">
          <h3>Belangrijke Mededeling</h3>
          <p>Sluit je aan bij de WhatsApp-groep en bekijk de who's who!</p>
        </div>
        <div className="card-content announcement-links">
          <a href="https://chat.whatsapp.com/EceGRuBnPxsIIANQWEYs2R" className="whatsapp-link" target="_blank" rel="noopener noreferrer">
            <svg className="link-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M20.52 3.48A11.94 11.94 0 0012.02.03C6.03.03 1.02 5.03 1.02 11.02c0 1.94.5 3.84 1.45 5.52L.01 23l6.7-1.74A11.9 11.9 0 0012.02 23c5.99 0 10.99-4.99 10.99-10.99 0-3-1.17-5.77-3.49-7.53zM12.02 20.1c-1.45 0-2.87-.39-4.11-1.12l-.3-.18-3.97 1.03 1.06-3.81-.19-.31A8.06 8.06 0 013.96 11.02c0-4.48 3.64-8.12 8.12-8.12 4.48 0 8.12 3.64 8.12 8.12 0 4.48-3.64 8.12-8.12 8.12z"/></svg>
            WhatsApp groep
          </a>
          <a href="https://drive.google.com/file/d/1bmBYDTLYzzCJm81rUaAgrzMvRZ2msCTx/view?usp=drive_link" className="whoswho-link" target="_blank" rel="noopener noreferrer">
            <svg className="link-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z"/></svg>
            Who's Who
          </a>
          <a href="https://docs.google.com/document/d/1uRLJMidO9vLGW6nSTeGaCJuV461MPGfqpk3Clzj3p40/edit?usp=drive_link" className="rules-link" target="_blank" rel="noopener noreferrer">
            <svg className="link-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M19 3H5a2 2 0 00-2 2v14l4-2 4 2 4-2 4 2V5a2 2 0 00-2-2z"/></svg>
            Regels
          </a>
        </div>
      </div>

      {/* --- ACTION CENTER --- */}
      {(shouldShowTop4 || showPredictionStatus) && (
        <div className="section-spacing-compact">
          <div className="feature-card tournament-card action-center">
            <div className="action-grid">

              {/* 1. Top 4 Section - Uses the state variable */}
              {shouldShowTop4 && (
                <div className="action-item">
                  <div className="card-header-sm">
                    <h3>🏆 {isTournamentStarted ? "Knock-out Top 4" : "Top 4 Voorspelling"}</h3>
                    <p className="status-txt">
                      {isPostTop4Locked || (isPreTournamentLocked && !isTournamentStarted) ? (
                        "🔒 Gesloten"
                      ) : (
                        top4Stats.isFinished
                          ? "✅ Alles ingevuld!"
                          : `${top4Stats.total - top4Stats.predicted} nog in te vullen`
                      )}
                    </p>
                  </div>

                  {/* Matching Progress Bar */}
                  <div className="progress-container">
                    <div
                      className="progress-bar gold-bar"
                      style={{ width: `${(top4Stats.predicted / top4Stats.total) * 100}%` }}
                    ></div>
                  </div>

                  <Link to="/top4" className="card-action-btn-sm green-btn">
                    {isPostTop4Locked || (isPreTournamentLocked && !isTournamentStarted)
                      ? "Bekijk"
                      : (top4Stats.isFinished ? "Aanpassen" : "Voorspel Top 4")}
                  </Link>
                </div>
              )}

              {shouldShowTop4 && showPredictionStatus && <div className="vertical-divider"></div>}

              {showPredictionStatus && (
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
                    className="card-action-btn-sm green-btn"
                  >
                    {predictionStats.isLocked ? "Bekijk Voorspellingen" : (predictionStats.isFinished ? "Aanpassen" : "Voorspel Wedstrijden")}
                  </Link>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* 3. Main Dashboard Grid */}
      <div className="feature-grid section-spacing">
        <div className="feature-card tournament-card">
          <div className="card-header">
            <h3>📊 Top 5 Deelnemers</h3>
            <p>Huidige live stand van de toto.</p>
          </div>
          <div className="card-content">
            <div className="leaderboard-mini">
              {top5.map((user, index) => {
                const prizes = prizeMap[user.id] || [];
                const tierClass = prizes.includes('top-gold') ? 'tier-gold'
                  : prizes.includes('top-silver') ? 'tier-silver'
                  : prizes.includes('top-bronze') ? 'tier-bronze'
                  : '';
                return (
                  <div key={user.id} className="mini-row">
                    <span className={`mini-rank rank-${index + 1} ${tierClass}`}>{index + 1}</span>
                    <span className="mini-medals">
                      <PrizeBadges prizeMap={prizeMap} userId={user.id} only={MEDAL_PRIZES} />
                    </span>
                    <span className="mini-name">
                      {`${user.firstName} ${user.lastName}`}
                      <PrizeBadges prizeMap={prizeMap} userId={user.id} only={OTHER_PRIZES} />
                    </span>
                    <span className="mini-points">{user.points || 0}</span>
                  </div>
                );
              })}
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
              {matches.length > 0 ? matches.map((match) => {
                const matchTime = new Date(match.match_date).getTime();
                const now = new Date().getTime();
                const isFinished = now > (matchTime + 2 * 60 * 60 * 1000);
                const isOngoing = now > matchTime && !isFinished;
                const hasResult = match.home_ft !== undefined && match.home_ft !== null && match.home_ft !== '';

                return (
                  <div key={match.id} className="mini-match-row">
                    <span className="mini-teams">
                      {match.expand?.home_team?.name} <span className="vs">vs</span> {match.expand?.away_team?.name}
                    </span>
                    {isFinished && hasResult ? (
                      <span className="mini-time" style={{ fontWeight: 'bold' }}>
                        {match.home_ft} - {match.away_ft}
                      </span>
                    ) : isOngoing ? (
                      <span className="live-dot-indicator">
                        <span className="live-dot"></span>
                        <span className="live-label">LIVE</span>
                      </span>
                    ) : (
                      <span className="mini-time">
                        {new Date(match.match_date).toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                );
              }) : <p className="empty-txt">Geen wedstrijden op de planning.</p>}
            </div>
          </div>
          <Link to={isRoundActive ? "/uitslagen" : "/voorspellen"} className={`card-action-btn ${isRoundActive ? 'blue-btn' : 'green-btn'}`}>{isRoundActive ? "Bekijk Uitslagen" : "Direct Voorspellen"}</Link>
        </div>
      </div>
    </div>
  );
}
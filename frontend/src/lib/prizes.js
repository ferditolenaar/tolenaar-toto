// The startpage shows all top-N tiers (gold cup + silver/bronze/plain medals) between the
// rank number and the name, while the other prizes sit after the name.
export const MEDAL_PRIZES = ['top-gold', 'top-silver', 'top-bronze', 'top-medal'];
export const OTHER_PRIZES = ['middle', 'second-last', 'winner-a', 'winner-b', 'winner-c'];

// Compute prize winners from a list of standings entries.
// Each entry needs: { id, points, partA, partB, partC, incomplete }.
export function computePrizeMap(standings) {
    const map = {};
    const add = (id, prize) => {
        map[id] = map[id] || [];
        if (!map[id].includes(prize)) map[id].push(prize);
    };

    const complete = standings.filter(u => !u.incomplete);
    const completeByPoints = [...complete].sort((a, b) => b.points - a.points);

    // Top 5 by total points, among complete users only: a gold/silver/bronze/medal/medal
    // ladder. A tied group shares a single tier and consumes one ladder slot per member,
    // pushing later tiers down - e.g. two people tied for 1st both get gold and the next
    // group gets bronze (silver is skipped). Nobody wins while the leader is at 0 points.
    const TIERS = ['top-gold', 'top-silver', 'top-bronze', 'top-medal', 'top-medal'];
    if (completeByPoints.length > 0 && completeByPoints[0].points > 0) {
        let slot = 0;
        let i = 0;
        while (i < completeByPoints.length && slot < TIERS.length) {
            const score = completeByPoints[i].points;
            const group = [];
            while (i < completeByPoints.length && completeByPoints[i].points === score) {
                group.push(completeByPoints[i]);
                i++;
            }
            const tier = TIERS[slot];
            group.forEach(u => add(u.id, tier));
            slot += group.length;
        }
    }

    // Middle: position is determined across everyone (complete and incomplete). If the
    // slot lands on an incomplete user, they can't win it - instead the nearest complete
    // users above and below that position split the prize.
    const fullByPoints = [...standings].sort((a, b) => b.points - a.points);
    if (fullByPoints.length >= 3) {
        const midIdx = Math.floor((fullByPoints.length - 1) / 2);
        const midUser = fullByPoints[midIdx];
        if (!midUser.incomplete) {
            add(midUser.id, 'middle');
        } else {
            for (let i = midIdx - 1; i >= 0; i--) {
                if (!fullByPoints[i].incomplete) { add(fullByPoints[i].id, 'middle'); break; }
            }
            for (let i = midIdx + 1; i < fullByPoints.length; i++) {
                if (!fullByPoints[i].incomplete) { add(fullByPoints[i].id, 'middle'); break; }
            }
        }
    }

    // Second-last: determined among complete users only, so incomplete users at the
    // bottom of the field are skipped entirely.
    if (completeByPoints.length >= 2) {
        add(completeByPoints[completeByPoints.length - 2].id, 'second-last');
    }

    // Category winners, among complete users only. Ties share the prize; a category with
    // nobody above 0 (e.g. C before the final has been scored) has no winner yet.
    [['partA', 'winner-a'], ['partB', 'winner-b'], ['partC', 'winner-c']].forEach(([key, prize]) => {
        if (complete.length === 0) return;
        const topScore = Math.max(...complete.map(u => u[key]));
        if (topScore > 0) {
            complete.filter(u => u[key] === topScore).forEach(u => add(u.id, prize));
        }
    });

    return map;
}

// `only`, when given, restricts rendering to prize keys in that list - lets callers
// split the badges into separate groups (e.g. medals vs. other prizes) around other content.
const PrizeBadges = ({ prizeMap, userId, only }) => {
    const prizes = prizeMap[userId];
    if (!prizes) return null;
    const show = (key) => prizes.includes(key) && (!only || only.includes(key));
    return (
        <>
            {show('top-gold') && <span className="prize-icon prize-cup-gold">🏆</span>}
            {show('top-silver') && <span className="prize-icon prize-medal-silver">🥈</span>}
            {show('top-bronze') && <span className="prize-icon prize-medal-bronze">🥉</span>}
            {show('top-medal') && <span className="prize-icon prize-medal-plain">🏅</span>}
            {show('middle') && <span className="prize-icon prize-cup-sm">🏅</span>}
            {show('second-last') && <span className="prize-icon prize-cup-sm">🏅</span>}
            {show('winner-a') && <span className="prize-icon prize-letter">A</span>}
            {show('winner-b') && <span className="prize-icon prize-letter">B</span>}
            {show('winner-c') && <span className="prize-icon prize-letter">C</span>}
        </>
    );
};

export default PrizeBadges;

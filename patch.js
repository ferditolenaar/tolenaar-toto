const fs = require('fs');
const tick = String.fromCharCode(96);
const d_o = String.fromCharCode(36);

function p(path, s, r) {
    let c = fs.readFileSync(path, 'utf8');
    if (c.includes(s)) {
        fs.writeFileSync(path, c.replace(s, r));
        console.log('Patched', path, 'success');
    } else {
        console.log('Not found in', path);
    }
}

p('frontend/src/pages/Predictions.jsx',
  'const saveTrackerRef = React.useRef({});\n\n    useEffect(() => { loadData(); }, []);',
  'const saveTrackerRef = React.useRef({});\n    const hasScrolledRef = React.useRef(false);\n\n    useEffect(() => {\n        if (matches.length > 0 && !hasScrolledRef.current) {\n            hasScrolledRef.current = true;\n            const now = new Date().getTime();\n            let targetMatch = matches.find(m => new Date(m.match_date).getTime() > now);\n            if (!targetMatch) {\n                targetMatch = matches[matches.length - 1];\n            }\n            if (targetMatch) {\n                setTimeout(() => {\n                    const matchEl = document.getElementById("match-" + targetMatch.id);\n                    if (matchEl) {\n                        matchEl.scrollIntoView({ behavior: "smooth", block: "center" });\n                    }\n                }, 100);\n            }\n        }\n    }, [matches]);\n\n    useEffect(() => { loadData(); }, []);'
);

const s2 = '<div key={m.id} className={' + tick + 'match-row-wide ' + d_o + '{isLocked ? \'row-disabled\' : \'\'}' + tick + '}>';
const r2 = '<div key={m.id} id={' + tick + 'match-' + d_o + '{m.id}' + tick + '} className={' + tick + 'match-row-wide ' + d_o + '{isLocked ? \'row-disabled\' : \'\'}' + tick + '}>';
p('frontend/src/pages/Predictions.jsx', s2, r2);

p('frontend/src/pages/AdminMatchResult.jsx',
  'const [activeStages, setActiveStages] = useState(stageOrder);\n\n    useEffect(() => { loadData(); }, []);',
  'const [activeStages, setActiveStages] = useState(stageOrder);\n    const hasScrolledRef = React.useRef(false);\n\n    useEffect(() => {\n        if (matches.length > 0 && !hasScrolledRef.current) {\n            hasScrolledRef.current = true;\n            const now = new Date().getTime();\n            let targetMatch = matches.find(m => new Date(m.match_date).getTime() > now);\n            if (!targetMatch) {\n                targetMatch = matches[matches.length - 1];\n            }\n            if (targetMatch) {\n                setTimeout(() => {\n                    const matchEl = document.getElementById("match-" + targetMatch.id);\n                    if (matchEl) {\n                        matchEl.scrollIntoView({ behavior: "smooth", block: "center" });\n                    }\n                }, 100);\n            }\n        }\n    }, [matches]);\n\n    useEffect(() => { loadData(); }, []);'
);

const s4 = '<div key={m.id} className="match-row-wide">';
const r4 = '<div key={m.id} id={' + tick + 'match-' + d_o + '{m.id}' + tick + '} className="match-row-wide">';
p('frontend/src/pages/AdminMatchResult.jsx', s4, r4);

p('frontend/src/pages/AdminMatchResult.jsx', "'Halve activeStage inale'", "'Halve Finale'");

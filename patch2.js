const fs = require('fs');

function p_regex(path, regex, replaceStr) {
    let c = fs.readFileSync(path, 'utf8');
    if (regex.test(c)) {
        fs.writeFileSync(path, c.replace(regex, replaceStr));
        console.log('Patched regex', path, 'success');
    } else {
        console.log('Not found regex in', path);
    }
}

p_regex('frontend/src/pages/Predictions.jsx',
  /const saveTrackerRef = React\.useRef\(\{\}\);\s+useEffect\(\(\) => \{ loadData\(\); \}, \[\]\);/,
  'const saveTrackerRef = React.useRef({});\n    const hasScrolledRef = React.useRef(false);\n\n    useEffect(() => {\n        if (matches.length > 0 && !hasScrolledRef.current) {\n            hasScrolledRef.current = true;\n            const now = new Date().getTime();\n            let targetMatch = matches.find(m => new Date(m.match_date).getTime() > now);\n            if (!targetMatch) {\n                targetMatch = matches[matches.length - 1];\n            }\n            if (targetMatch) {\n                setTimeout(() => {\n                    const matchEl = document.getElementById("match-" + targetMatch.id);\n                    if (matchEl) {\n                        matchEl.scrollIntoView({ behavior: "smooth", block: "center" });\n                    }\n                }, 100);\n            }\n        }\n    }, [matches]);\n\n    useEffect(() => { loadData(); }, []);'
);

p_regex('frontend/src/pages/AdminMatchResult.jsx',
  /const \[activeStages, setActiveStages\] = useState\(stageOrder\);\s+useEffect\(\(\) => \{ loadData\(\); \}, \[\]\);/,
  'const [activeStages, setActiveStages] = useState(stageOrder);\n    const hasScrolledRef = React.useRef(false);\n\n    useEffect(() => {\n        if (matches.length > 0 && !hasScrolledRef.current) {\n            hasScrolledRef.current = true;\n            const now = new Date().getTime();\n            let targetMatch = matches.find(m => new Date(m.match_date).getTime() > now);\n            if (!targetMatch) {\n                targetMatch = matches[matches.length - 1];\n            }\n            if (targetMatch) {\n                setTimeout(() => {\n                    const matchEl = document.getElementById("match-" + targetMatch.id);\n                    if (matchEl) {\n                        matchEl.scrollIntoView({ behavior: "smooth", block: "center" });\n                    }\n                }, 100);\n            }\n        }\n    }, [matches]);\n\n    useEffect(() => { loadData(); }, []);'
);

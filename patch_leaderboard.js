const fs = require('fs');

function patchLeaderboard() {
    let content = fs.readFileSync('frontend/src/pages/LeaderboardPage.jsx', 'utf8');

    if (content.includes("import React, { useState, useEffect } from 'react';")) {
        content = content.replace(
            "import React, { useState, useEffect } from 'react';",
            "import React, { useState, useEffect, useRef } from 'react';"
        );
    }

    const search1 = "const [loading, setLoading] = useState(true);";
    const replace1 = "const [loading, setLoading] = useState(true);\n" +
    "    const currentUserId = pb.authStore.model?.id;\n" +
    "    const hasScrolledRef = useRef(false);\n\n" +
    "    useEffect(() => {\n" +
    "        if (standings.length > 0 && !hasScrolledRef.current && currentUserId) {\n" +
    "            hasScrolledRef.current = true;\n" +
    "            setTimeout(() => {\n" +
    "                const userRow = document.getElementById(\"user-row-\" + currentUserId);\n" +
    "                if (userRow) {\n" +
    "                    userRow.scrollIntoView({ behavior: \"smooth\", block: \"center\" });\n" +
    "                }\n" +
    "            }, 100);\n" +
    "        }\n" +
    "    }, [standings, currentUserId]);";

    if (content.includes(search1)) {
        content = content.replace(search1, replace1);
    }

    const search2 = "<tr key={user.id} className={index === 0 ? 'top-rank' : ''}>";
    const replace2 = "<tr key={user.id} id={\"user-row-\" + user.id} className={(index === 0 ? 'top-rank' : '') + (user.id === currentUserId ? ' current-user-row' : '')}>";

    if (content.includes(search2)) {
        content = content.replace(search2, replace2);
    }

    fs.writeFileSync('frontend/src/pages/LeaderboardPage.jsx', content);
    console.log("Leaderboard patched successfully");
}

patchLeaderboard();

const fs = require('fs');
let c = fs.readFileSync('frontend/src/pages/AdminTools.jsx', 'utf8');

const search = "const [officialResults, setOfficialResults] = useState({ rank_1: '', rank_2: '', rank_3: '', rank_4: '', id: null });";
const replace = search + "\n    const [batchUserEmail, setBatchUserEmail] = useState('');\n    const [batchStatus, setBatchStatus] = useState('');";

if (c.includes(search)) {
    fs.writeFileSync('frontend/src/pages/AdminTools.jsx', c.replace(search, replace));
    console.log('Fixed state missing!');
} else {
    console.log('Search string not found!');
}

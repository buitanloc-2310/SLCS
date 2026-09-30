import fs from 'node:fs';
const api=fs.readFileSync('src/index.js','utf8');
const ui=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/styles.css','utf8');
const tests=[
 ['force-open API clears stale schedule',api.includes("status==='published'&&b.force_open===true")&&api.includes("opens_at=NULL,closes_at=NULL")],
 ['admin open-now sends force_open',ui.includes("force_open:true")],
 ['effective status checks schedule',ui.includes("key:'scheduled'")&&ui.includes("key:'ended'")&&ui.includes("key:'open'")],
 ['open KPI is effective',ui.includes("openCount=exams.filter(x=>effective(x).key==='open').length")],
 ['premium assessment admin UI',css.includes('Assessment Admin Center V41')&&css.includes('.assessment-admin-hero')&&css.includes('.assessment-row')],
 ['mobile assessment admin UI',css.includes('@media(max-width:560px)')&&css.includes('.assessment-row-actions')]
];
let pass=0;for(const [name,yes] of tests){console.log(yes?'PASS':'FAIL',name);if(yes)pass++}console.log(`ASSESSMENT V41: ${pass}/${tests.length} PASS`);process.exit(pass===tests.length?0:1);

import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('public/app.js'),ui=read('public/ui-system.js'),css=read('public/design-system.css'),idx=read('public/index.html'),pkg=read('package.json');
const checks=[
 ['V35 cache assets',/(?:\?v=(?:(?:35|36|37|38|39)\.0\.0|40\.0\.[01])|\?build=20260930-v42-final)/.test(idx)],
 ['UI runtime module',/from '\/ui-system\.js(?:\?v=40\.0\.[01]|\?build=20260930-v42-final)?'/.test(app)&&ui.includes('syncUiContext')],
 ['Route/area context',ui.includes('dataset.area')&&ui.includes('dataset.route')],
 ['Unified admin palette',css.includes('var(--site-primary')&&css.includes('var(--site-bg')&&css.includes('var(--site-text')],
 ['Responsive product shell',css.includes('@media(max-width:680px)')&&css.includes('100dvh')],
 ['Keyboard focus accessibility',css.includes('.keyboard-nav')&&ui.includes("e.key==='Tab'")],
 ['Reduced motion accessibility',css.includes('prefers-reduced-motion')],
 ['Assessment/Admin/Live layout areas',css.includes('data-area="assessment"')&&css.includes('data-area="admin"')&&css.includes('data-area="live"')],
 ['Website editor protected chrome',css.includes('.site-editor')&&css.includes('#111827')],
 ['V35 package version',pkg.includes('35.0.0-p2-ui-architecture-completion') || pkg.includes('36.0.0-p2-learning-core') || pkg.includes('37.0.0-p2-assessment-max') || pkg.includes('38.0.0-p2-website-studio-max') || pkg.includes('39.0.0-p2-operations-center') || pkg.includes('40.0.0-p2-production') || pkg.includes('\"version\": \"1.0.0\"')]
];
let n=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)n++}console.log(`V35 UI/ARCHITECTURE: ${n}/${checks.length} PASS`);if(n!==checks.length)process.exit(1);

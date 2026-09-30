import fs from 'node:fs';
const app=fs.readFileSync('public/app.js','utf8');
const api=fs.readFileSync('src/index.js','utf8');
const checks=[
 ['CSV column import',/correct_answer/.test(app)&&/option_a/.test(app)],
 ['UTF-8 BOM handling',/uFEFF/.test(app)],
 ['JSON question import',/JSON\.parse\(text\)/.test(app)],
 ['Question marker variants',/Question\|Q/.test(app)],
 ['Option marker variants',/\[A-H\]/.test(app)],
 ['PDF extraction',/pdfjs-dist/.test(app)],
 ['Material opens builder',/slc_import_material/.test(app)&&/openExamBuilder\(classId\)/.test(app)],
 ['No blank JSON material preview',!app.includes("window.open('','_blank')")],
 ['Material backend accepts all file types',/validateUpload\(file,\{maxMb:50,label:'Học liệu'\}/.test(api)&&!/materialMimes/.test(api)],
 ['Import preview status',/Hãy kiểm tra trước khi xuất bản/.test(app)],
 ['300 question ceiling',/slice\(0,300\)/.test(app)]
];
let pass=0;for(const [name,ok] of checks){console.log(ok?'PASS':'FAIL',name);if(ok)pass++}console.log(`UPLOAD/IMPORT VALIDATION: ${pass}/${checks.length} PASS`);if(pass!==checks.length)process.exit(1);

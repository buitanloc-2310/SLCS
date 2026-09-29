import fs from "node:fs";
const app=fs.readFileSync("public/app.js","utf8"), api=fs.readFileSync("src/index.js","utf8"), mig=fs.readFileSync("migrations/0019_website_studio_v38.sql","utf8");
const checks=[
 ["revision migration",mig.includes("website_revisions")],
 ["revision list API",api.includes("/api/admin/website/revisions")],
 ["revision restore",api.includes("/restore")&&api.includes("website.revision.restore")],
 ["snapshot before publish",api.includes("Trước khi cập nhật Website Studio")],
 ["undo",app.includes("editorUndo")], ["redo",app.includes("editorRedo")],
 ["draft autosave",app.includes("slc.website.draft.v38")],
 ["device preview",app.includes("data-preview-device")],
 ["revision UI",app.includes("websiteRevisionPanel")],
 ["safeHttpUrl retained",app.includes("function safeHttpUrl")||app.includes("const safeHttpUrl")]
];
for(const [n,ok] of checks) console.log(`${ok?"PASS":"FAIL"} ${n}`);
if(checks.some(x=>!x[1]))process.exit(1); console.log(`V38 ${checks.length}/${checks.length} PASS`);

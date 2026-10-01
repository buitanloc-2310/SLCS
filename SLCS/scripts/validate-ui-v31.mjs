import fs from 'node:fs';
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/auth-shell.css','utf8');
const api=fs.readFileSync('src/index.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const keys=['site_primary_color','site_primary_dark','site_background_color','site_surface_color','site_text_color','site_muted_color','site_border_color','site_soft_color','site_danger_color','site_radius','site_button_radius','site_input_radius','site_content_width','site_font_scale','site_shadow_opacity','site_header_style','site_auth_footer','site_reduce_motion'];
let fail=0;
for(const k of keys){const ok=app.includes(k)&&api.includes(k); console.log(ok?'PASS':'FAIL',k); if(!ok)fail++}
for(const token of ['--site-primary','--site-bg','--site-surface','--site-text','--site-border','--site-radius','--site-button-radius','--site-input-radius','--site-content-width']){const ok=css.includes(token); console.log(ok?'PASS':'FAIL','css '+token); if(!ok)fail++}
for(const check of [['cache bust',html.includes('v=31.0.0')||html.includes('build=20261001-final-hardening')],['school admin website save',api.includes("requireRole(request,env,['super_admin','school_admin'])")],['editor layout section',app.includes('editor-layout')]]){console.log(check[1]?'PASS':'FAIL',check[0]);if(!check[1])fail++}
if(fail){console.error(`UI V31: ${fail} failed`);process.exit(1)}console.log('UI V31 GOVERNANCE: PASS');

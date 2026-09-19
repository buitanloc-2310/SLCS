let mounted=null;
const e=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const safeUrl=u=>{try{const x=new URL(String(u||''),location.origin);return /^https?:$/.test(x.protocol)?x.href:''}catch{return ''}};
const md=text=>{
  // Normalize accidental transport escaping (\\* / repeated marker fragments) before rendering.
  // This fixes visible strings such as **\\*\\*****... without stripping legitimate Markdown.
  let raw=String(text??'').replace(/\\([*_`~])/g,'$1');
  raw=raw.replace(/\*{5,}/g,m=>m.length%2?'***':'**');
  // Drop marker-only debris left by double-escaped transports; never strip markers around text.
  raw=raw.replace(/(^|\s)\*{2,4}(?=\s|$)/g,'$1');
  let x=e(raw);
  const blocks=[];
  x=x.replace(/```([\s\S]*?)```/g,(_,code)=>{const i=blocks.push(`<pre><code>${code.trim()}</code></pre>`)-1;return `@@CODE${i}@@`});
  x=x.replace(/^###\s+(.+)$/gm,'<h4>$1</h4>').replace(/^##\s+(.+)$/gm,'<h3>$1</h3>').replace(/^#\s+(.+)$/gm,'<h2>$1</h2>');
  x=x.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,'<em>$1</em>');
  x=x.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  x=x.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,(_,label,url)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  const lines=x.split('\n'),out=[];let list='';
  const close=()=>{if(list){out.push(`</${list}>`);list=''}};
  for(const line of lines){
    const ul=line.match(/^\s*[-•]\s+(.+)/),ol=line.match(/^\s*\d+[.)]\s+(.+)/),quote=line.match(/^&gt;\s*(.+)/);
    if(ul){if(list!=='ul'){close();out.push('<ul>');list='ul'}out.push(`<li>${ul[1]}</li>`);continue}
    if(ol){if(list!=='ol'){close();out.push('<ol>');list='ol'}out.push(`<li>${ol[1]}</li>`);continue}
    close(); if(quote)out.push(`<blockquote>${quote[1]}</blockquote>`); else if(line.trim())out.push(`<p>${line}</p>`); else out.push('<br>');
  } close(); x=out.join('');
  return x.replace(/@@CODE(\d+)@@/g,(_,i)=>blocks[Number(i)]||'');
};

export function unmountSkyFirstAI(){mounted?.remove();mounted=null;document.querySelector('#sfnAiLauncher')?.remove()}

export function mountSkyFirstAI({user,api,classId=null,className=''}){
  unmountSkyFirstAI();
  if(!user) return;
  const launcher=document.createElement('button');launcher.id='sfnAiLauncher';launcher.className='sfn-ai-launcher';launcher.innerHTML='<span>✦</span><b>Sky First AI</b>';launcher.setAttribute('aria-label','Mở Sky First AI');
  const panel=document.createElement('section');panel.className='sfn-ai-panel';panel.hidden=true;panel.innerHTML=`<header><div><span>SKY FIRST NETWORK AI</span><b>Sky First AI</b></div><div class="ai-window-actions"><a class="ai-workspace-link" href="https://skyfirst.io.vn/ai" target="_blank" rel="noopener" title="Mở Sky First AI">↗ AI</a><button data-ai-expand aria-label="Mở rộng" title="Mở rộng">↗</button><button data-ai-close aria-label="Đóng" title="Thu nhỏ">×</button></div></header><nav>${['ask','research','create','analyze','act'].map((x,i)=>`<button data-ai-mode="${x}" class="${i?'':'active'}">${({ask:'Hỏi',research:'Nghiên cứu',create:'Tạo',analyze:'Phân tích',act:'Thực hiện'})[x]}</button>`).join('')}</nav><div class="sfn-ai-context">${classId?`Đang hỗ trợ trong <b>${e(className||'lớp học')}</b>`:'Trợ lý cá nhân trong Sky First School'}</div><div class="sfn-ai-messages"><div class="sfn-ai-msg ai"><b>Sky First AI</b><p>Mình có thể hỗ trợ học tập, nghiên cứu, tạo nội dung và phân tích theo đúng quyền của bạn.</p></div></div><form><div class="ai-compose-tools"><button type="button" data-ai-attach title="Đính kèm tệp">＋</button><input type="file" data-ai-file hidden multiple accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,image/png,image/jpeg,image/webp"><div data-ai-files class="ai-file-chips"></div></div><textarea rows="2" placeholder="Bạn muốn Sky First AI giúp gì?"></textarea><div><small>AI có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.</small><button>Gửi</button></div></form>`;
  document.body.append(launcher,panel);mounted=panel;
  let mode='ask',busy=false,conversationId='';const messages=panel.querySelector('.sfn-ai-messages'),input=panel.querySelector('textarea');
  const open=()=>{panel.hidden=false;launcher.hidden=true;setTimeout(()=>input.focus(),30)};const close=()=>{panel.hidden=true;panel.classList.remove('ai-expanded');launcher.hidden=false};launcher.onclick=open;panel.querySelector('[data-ai-close]').onclick=close;panel.querySelector('[data-ai-expand]').onclick=()=>{const on=panel.classList.toggle('ai-expanded');panel.querySelector('[data-ai-expand]').textContent=on?'↙':'↗';panel.querySelector('[data-ai-expand]').title=on?'Thu nhỏ cửa sổ':'Mở rộng'};
  const setMode=x=>{mode=x;panel.querySelectorAll('[data-ai-mode]').forEach(b=>b.classList.toggle('active',b.dataset.aiMode===x));input.placeholder=({ask:'Hỏi Sky First AI…',research:'Bạn muốn nghiên cứu điều gì?',create:'Bạn muốn tạo nội dung gì?',analyze:'Bạn muốn phân tích điều gì?',act:'Mô tả việc bạn muốn thực hiện…'})[x]||'Bạn muốn hỏi gì?'};
  panel.querySelectorAll('[data-ai-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.aiMode));
  const fileInput=panel.querySelector('[data-ai-file]'),fileChips=panel.querySelector('[data-ai-files]');let pendingFiles=[];
  panel.querySelector('[data-ai-attach]').onclick=()=>fileInput.click();
  fileInput.onchange=()=>{pendingFiles=[...fileInput.files].slice(0,5);fileChips.innerHTML=pendingFiles.map((f,i)=>`<span>${e(f.name)} <button type="button" data-rm="${i}">×</button></span>`).join('');fileChips.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{pendingFiles.splice(Number(b.dataset.rm),1);fileChips.innerHTML=pendingFiles.map((f,i)=>`<span>${e(f.name)} <button type="button" data-rm="${i}">×</button></span>`).join('')})};
  input.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing){ev.preventDefault();panel.querySelector('form').requestSubmit()}});input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,160)+'px'});
  const add=(who,text,cls)=>{const x=document.createElement('div');x.className=`sfn-ai-msg ${cls}`;x.innerHTML=`<b>${e(who)}</b><div class="ai-rich-text">${cls==='me'?`<p>${e(text).replace(/\n/g,'<br>')}</p>`:md(text)}</div>`;messages.append(x);messages.scrollTop=messages.scrollHeight;return x};
  const addSources=sources=>{const clean=(sources||[]).map(s=>({...s,url:safeUrl(s.url)})).filter(s=>s.url);if(!clean.length)return;const box=document.createElement('div');box.className='sfn-ai-sources';box.innerHTML='<b>Nguồn đã dùng</b>'+clean.map((s,i)=>`<a href="${e(s.url)}" target="_blank" rel="noopener noreferrer"><span>${e(s.origin==='internal'?'Nội bộ':s.origin==='official'?'Sky First':'Web')}</span>${i+1}. ${e(s.title||s.url)}</a>`).join('');messages.append(box);messages.scrollTop=messages.scrollHeight};
  const addAction=action=>{if(!action?.id)return;const box=document.createElement('div');box.className='sfn-ai-action';box.innerHTML=`<b>Cần bạn xác nhận</b><p>${e(action.summary||'Sky First AI đã chuẩn bị một thao tác.')}</p><div><button data-cancel>Hủy</button><button data-confirm>Xác nhận</button></div>`;messages.append(box);messages.scrollTop=messages.scrollHeight;box.querySelector('[data-cancel]').onclick=async()=>{try{await api(`/api/ai/actions/${encodeURIComponent(action.id)}/cancel`,{method:'POST',body:'{}'})}catch{}box.remove();add('Sky First AI','Đã hủy thao tác.','ai')};box.querySelector('[data-confirm]').onclick=async()=>{const c=box.querySelector('[data-confirm]');c.disabled=true;c.textContent='Đang thực hiện…';try{const r=await api(`/api/ai/actions/${encodeURIComponent(action.id)}/confirm`,{method:'POST',body:'{}'});box.remove();add('Sky First AI',r.message||'Đã thực hiện thao tác.','ai')}catch(err){c.disabled=false;c.textContent='Xác nhận';add('Sky First AI',err?.message||'Chưa thể thực hiện thao tác.','ai error')}}};
  panel.querySelector('form').onsubmit=async ev=>{ev.preventDefault();let text=input.value.trim();if(!text&&!pendingFiles.length||busy)return;if(pendingFiles.length){const readable=pendingFiles.filter(f=>/^(text\/|application\/(json|csv))/.test(f.type)||/\.(txt|md|csv)$/i.test(f.name));const chunks=[];for(const f of readable){try{chunks.push(`\n\n[Tệp ${f.name}]\n${(await f.text()).slice(0,120000)}`)}catch{}}text+=(pendingFiles.length?`\n\nTệp đính kèm: ${pendingFiles.map(f=>f.name).join(', ')}`:'')+chunks.join('');}if(!text.trim())return;busy=true;input.value='';pendingFiles=[];fileInput.value='';fileChips.innerHTML='';add('Bạn',text.replace(/\n\n\[Tệp[\s\S]*/,'')||'Đã gửi tệp','me');const wait=add('Sky First AI',mode==='research'?'Đang tìm và tổng hợp nguồn phù hợp…':'Đang suy nghĩ…','ai waiting');let phase=setTimeout(()=>{const p=wait.querySelector('p');if(p)p.textContent=mode==='research'?'Đang kiểm tra và tổng hợp thông tin…':'Đang chuẩn bị câu trả lời…'},2600);try{const r=await api('/api/ai/chat',{method:'POST',body:JSON.stringify({message:text,mode,class_id:classId||null,conversation_id:conversationId||null}),timeout:50000});conversationId=r.conversation_id||conversationId;clearTimeout(phase);wait.remove();add('Sky First AI',r.answer||'Mình chưa có câu trả lời phù hợp.','ai');addSources(r.sources);addAction(r.pending_action)}catch(err){clearTimeout(phase);wait.remove();add('Sky First AI',err?.message||'Tạm thời chưa thể phản hồi. Vui lòng thử lại sau.','ai error')}finally{busy=false}};
  const applyCapabilities=c=>{const allowed=new Set(c.modes||['ask']);panel.querySelectorAll('[data-ai-mode]').forEach(b=>{if(!allowed.has(b.dataset.aiMode))b.remove()});if(!allowed.has(mode))setMode('ask');if(c.available===false){const x=panel.querySelector('.sfn-ai-context');x.textContent='Sky First AI đang được chuẩn bị. Các chức năng khác vẫn hoạt động bình thường.'}};
  const capKey=`sfn-ai-cap:${user.role||'user'}`;let cached=null;try{cached=JSON.parse(sessionStorage.getItem(capKey)||'null')}catch{}
  if(cached&&Date.now()-Number(cached.t||0)<300000)applyCapabilities(cached.v||{});
  else api('/api/ai/capabilities',{timeout:8000}).then(c=>{applyCapabilities(c);try{sessionStorage.setItem(capKey,JSON.stringify({t:Date.now(),v:c}))}catch{}}).catch(()=>{});
}

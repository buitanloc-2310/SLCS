/** Shared UI runtime. No business/API logic lives here. */
const ROUTE_GROUPS={
  home:'home',classes:'learning','exam-center':'assessment',calendar:'learning',resources:'learning',notifications:'account',support:'support',account:'account',admin:'admin','admin-organizations':'admin','admin-operations':'admin',login:'public',request:'public',lookup:'public',privacy:'public',security:'public',terms:'public'
};
export function routeName(){return (location.hash.replace(/^#/,'').split('/')[0]||'home').replace(/[^a-z0-9-]/gi,'')||'home'}
export function syncUiContext(){
  const route=routeName();
  const group=route==='class'?'learning':route==='live'?'live':route==='exam'?'assessment':route==='school-studio'?'admin':(ROUTE_GROUPS[route]||'app');
  document.documentElement.dataset.route=route;
  document.documentElement.dataset.area=group;
  document.body?.setAttribute('data-route',route);
  document.body?.setAttribute('data-area',group);
}
export function installUiRuntime(){
  syncUiContext();
  addEventListener('hashchange',syncUiContext,{passive:true});
  addEventListener('keydown',e=>{if(e.key==='Tab')document.documentElement.classList.add('keyboard-nav')},{passive:true});
  addEventListener('pointerdown',()=>document.documentElement.classList.remove('keyboard-nav'),{passive:true});
}

// Shared accessibility for every rendered page and modal.
let fieldSequence=0,dialogSequence=0;
function enhanceUi(root=document){
  root.querySelectorAll('.field').forEach((field,i)=>{
    const label=field.querySelector('label'),control=field.querySelector('input,select,textarea');
    if(label&&control&&!label.htmlFor&&!label.contains(control)){
      if(!control.id)control.id=`slc-field-${++fieldSequence}`;
      label.htmlFor=control.id;
    }
  });
  root.querySelectorAll('.slc-modal-backdrop:not([data-accessible])').forEach(wrap=>{
    wrap.dataset.accessible='1';const modal=wrap.querySelector('.slc-modal');if(!modal)return;
    const previous=document.activeElement;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const title=modal.querySelector('h2');if(title){title.id=`slc-dialog-${++dialogSequence}`;modal.setAttribute('aria-labelledby',title.id)}
    const focusable=()=>[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&!x.hidden);
    const initial=modal.querySelector('input:not([type=file]),textarea,select')||focusable()[0];initial?.focus();
    wrap.addEventListener('keydown',e=>{
      if(e.key==='Escape'){const cancel=modal.querySelector('[data-no],[data-ok]');if(cancel){e.preventDefault();cancel.click()}}
      if(e.key==='Tab'){const items=focusable();if(!items.length){e.preventDefault();return}const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
    });
    const closeObserver=new MutationObserver(()=>{if(!wrap.isConnected){closeObserver.disconnect();if(previous?.isConnected)previous.focus()}});closeObserver.observe(document.body,{childList:true});
  });
}
const uiObserver=new MutationObserver(()=>enhanceUi());
uiObserver.observe(document.body,{childList:true,subtree:true});
enhanceUi();
addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const toggle=document.querySelector('.menu-toggle[aria-expanded="true"]');if(toggle){toggle.click();toggle.focus()}
  }
});

// A skip link must focus content without changing the SPA route hash.
document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();const main=document.getElementById('mainContent');if(main){main.focus({preventScroll:true});main.scrollIntoView({block:'start'})}});

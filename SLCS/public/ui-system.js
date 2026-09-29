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

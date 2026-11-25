'use strict';
// Site content edited by the manager (لوحة الإدارة ← الإعدادات ← محتوى الموقع، أو زر «تحرير هذه الصفحة»).
// Each page has a list of small operations (change a text, a link or a picture; delete, duplicate or move an
// element; add a new section) that this file replays on every visit, in order. Custom pages (p.html?id=…) are
// pages whose whole content is added sections. Text is only ever set with textContent and every link is checked,
// so saved content can never inject markup or scripts. Loaded with defer, after the page's own scripts.
// The last version is kept in localStorage and refreshed from the server (public action 'content') at most every minute.
(function(){
const KEY='basira_content',DKEY='basira_content_draft:',TKEY='basira_crm_token',REFRESH=60000;
const me=document.currentScript;
const ROOT=new URL('..',me&&me.src?me.src:location.href).href;           // the site root (…/assets/content.js → …/)
const EN=document.documentElement.lang==='en';
const norm=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();

// ---- which page this is: index.html, about.html, en/about.html, p/<id>, en/p/<id> ----
function pageKey(){
  let rel=location.href.split('#')[0].split('?')[0];
  rel=rel.startsWith(ROOT)?rel.slice(ROOT.length):location.pathname.replace(/^\//,'');
  if(!rel||rel.endsWith('/'))rel+='index.html';
  rel=decodeURIComponent(rel);
  if(/(^|\/)p\.html$/.test(rel)){const id=(new URLSearchParams(location.search).get('id')||'').toLowerCase().replace(/[^a-z0-9-]/g,'');return (rel.startsWith('en/')?'en/':'')+'p/'+id}
  return rel;
}
const PAGE=pageKey();

// ---- links: https, mailto:, tel: or a path on this site; nothing else ----
function safeUrl(u){u=String(u==null?'':u).trim();if(!u)return '';
  if(u.length>600||/[\s"'<>`\\]/.test(u))return null;
  if(/^https:\/\//i.test(u)||/^mailto:[^:]+$/i.test(u)||/^tel:\+?[0-9 ]{6,20}$/i.test(u))return u;
  if(/^[a-z][a-z0-9+.-]*:/i.test(u)||/^\/\//.test(u))return null;
  return u}

// ---- finding an element again: by id, by the id of what we created (data-cid), or by a path from the nearest
// ancestor that has one, checked by its tag and the start of its original text (so a moved or reflowed page still finds it) ----
function rawFp(el){if(el.tagName==='IMG'){const s=(el.getAttribute('src')||'').split('?')[0];return 'img:'+s.slice(s.lastIndexOf('/')+1).slice(-60)}
  return norm(el.textContent).slice(0,60)}
const fp=el=>el.dataset&&el.dataset.cf!=null?el.dataset.cf:rawFp(el);
const byCid=c=>document.querySelector('[data-cid="'+String(c).replace(/[^A-Za-z0-9_.-]/g,'')+'"]');
function anchorOf(el){let a=el.parentElement;while(a&&a!==document.body&&!a.id&&!(a.dataset&&a.dataset.cid))a=a.parentElement;return a||document.body}
function locate(el){
  if(el.id&&document.querySelectorAll('#'+CSS.escape(el.id)).length===1)return {i:el.id};
  if(el.dataset.cid)return {c:el.dataset.cid};
  const A=anchorOf(el),p=[];let n=el;
  while(n&&n!==A){p.unshift([...n.parentElement.children].indexOf(n));n=n.parentElement}
  const L={p,g:el.tagName,f:fp(el)};
  if(A.id)L.a=A.id;else if(A.dataset&&A.dataset.cid)L.ac=A.dataset.cid;
  return L}
function resolve(L){if(!L)return null;
  if(L.i)return document.getElementById(L.i);
  if(L.c)return byCid(L.c);
  const A=L.a?document.getElementById(L.a):L.ac?byCid(L.ac):document.body;if(!A)return null;
  let n=A;for(const i of L.p||[]){n=n&&n.children[i];if(!n)break}
  if(n&&n!==A&&n.tagName===L.g&&fp(n)===L.f)return n;
  // the page changed around it: look for the same element (tag and original text) under the same ancestor
  const hit=[...A.getElementsByTagName(L.g)].filter(x=>fp(x)===L.f);
  if(hit.length===1)return hit[0];
  if(hit.length>1){const want=(L.p||[]).join('.');return hit.find(x=>{let q=[],m=x;while(m&&m!==A){q.unshift([...m.parentElement.children].indexOf(m));m=m.parentElement}return q.join('.')===want})||hit[0]}
  return null}

// the box that holds a page's sections: <main>, or its single inner .wrap
function mainBox(){const m=document.querySelector('main')||document.body;
  const k=[...m.children].filter(x=>!x.matches('script,template,dialog'));
  return k.length===1&&k[0].matches('div')?k[0]:m}

// ---- new sections, built only from text, checked links and pictures ----
const h=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null&&txt!=='')e.textContent=txt;return e};
function paras(box,txt,cls){String(txt||'').split(/\n{2,}|\r\n\r\n/).map(norm).filter(Boolean).forEach(t=>box.append(h('p',cls||'',t)))}
function link(txt,u,cls){const a=h('a',cls,txt),s=safeUrl(u);a.href=s||'#';if(/^https:\/\//.test(s||'')&&!s.startsWith(ROOT)){a.target='_blank';a.rel='noopener'}return a}
function pic(u,alt,cls){const s=safeUrl(u);if(!s)return null;const i=h('img',cls);i.src=s;i.alt=alt||'';i.loading='lazy';i.decoding='async';return i}
const TYPES=['text','media','cards','faq','cta','gallery','image','notice','stats','steps','links'];
function render(b,nested){
  b=b||{};const t=TYPES.includes(b.type)?b.type:'text';
  const sec=h('section','sec cblk cbt-'+t+(b.tone==='alt'?' alt':'')+(b.align==='center'?' cblk-center':''));
  const w=nested?h('div','cblk-in'):h('div','wrap cblk-in');sec.append(w);
  if(b.kicker)w.append(h('p','eyebrow',b.kicker));
  if(b.h)w.append(h(b.h1?'h1':'h2','',b.h));
  const items=Array.isArray(b.items)?b.items:[];
  if(t==='text'){paras(w,b.p,'cblk-p')}
  else if(t==='media'){const g=h('div','cblk-media'+(b.side==='end'?' end':''));const im=pic(b.img,b.alt,'cblk-mimg');if(im)g.append(im);const tx=h('div','cblk-mtxt');paras(tx,b.p,'cblk-p');
    if(b.btn&&b.link)tx.append(link(b.btn,b.link,'btn pri'));g.append(tx);w.append(g)}
  else if(t==='cards'){paras(w,b.p,'lead');const g=h('div','cblk-cards');items.forEach(x=>{const c=h(x.link?'a':'div','cblk-card');if(x.link){const s=safeUrl(x.link);c.href=s||'#'}
    const im=pic(x.img,x.t,'cblk-cimg');if(im)c.append(im);if(x.t)c.append(h('b','',x.t));if(x.s)c.append(h('span','',x.s));g.append(c)});w.append(g)}
  else if(t==='faq'){paras(w,b.p,'lead');const g=h('div','cblk-faq');items.forEach(x=>{const d=h('details'),s=h('summary','',x.q);d.append(s);paras(d,x.a);g.append(d)});w.append(g)}
  else if(t==='cta'){const g=h('div','cblk-cta');paras(g,b.p,'cblk-p');const r=h('div','cta');if(b.btn)r.append(link(b.btn,b.link,'btn pri'));if(b.btn2)r.append(link(b.btn2,b.link2,'btn'));g.append(r);w.append(g)}
  else if(t==='gallery'){paras(w,b.p,'lead');const g=h('div','cblk-gal');items.forEach(x=>{const f=h('figure');const im=pic(x.img,x.alt||x.cap,'');if(!im)return;f.append(im);if(x.cap)f.append(h('figcaption','',x.cap));g.append(f)});w.append(g)}
  else if(t==='image'){const f=h('figure','cblk-fig');const im=pic(b.img,b.alt,'');if(im)f.append(im);if(b.cap)f.append(h('figcaption','',b.cap));w.append(f);paras(w,b.p,'cblk-p')}
  else if(t==='notice'){const g=h('div','cblk-note');paras(g,b.p,'');if(b.btn&&b.link)g.append(link(b.btn,b.link,'btn sm'));w.append(g)}
  else if(t==='stats'){paras(w,b.p,'lead');const g=h('div','cblk-stats');items.forEach(x=>{const d=h('div');d.append(h('b','num',x.n),h('span','',x.t));g.append(d)});w.append(g)}
  else if(t==='steps'){paras(w,b.p,'lead');const g=h('ol','cblk-steps');items.forEach(x=>{const li=h('li');li.append(h('b','',x.t));if(x.s)li.append(h('span','',x.s));g.append(li)});w.append(g)}
  else if(t==='links'){paras(w,b.p,'lead');const g=h('div','cblk-links');items.forEach(x=>{if(x.t)g.append(link(x.t,x.link,'chip'))});w.append(g)}
  return sec}

// ---- replaying the operations ----
function insertAt(node,ref,where){
  if(ref&&where==='b')ref.before(node);else if(ref&&where==='a')ref.after(node);else if(ref&&where==='in')ref.append(node);else mainBox().append(node)}
function applyOp(op){
  if(op.o==='add'){if(byCid(op.id))return true;const ref=op.r?resolve(op.r):null;if(op.r&&!ref)return false;
    const box=ref?(op.w==='in'?ref:ref.parentElement):mainBox();const node=render(op.b,!!(box&&box.closest('.wrap')));node.dataset.cid=op.id;insertAt(node,ref,op.w);return true}
  const el=resolve(op.t);if(!el)return false;
  switch(op.o){
    case 'text':if(el.dataset.cf==null)el.dataset.cf=rawFp(el);el.textContent=String(op.v==null?'':op.v);return true;
    case 'href':{const s=safeUrl(op.v);if(s==null)return false;const a=el.closest('a')||el;a.setAttribute('href',s||'#');return true}
    case 'img':{const s=safeUrl(op.v);if(!s||el.tagName!=='IMG')return false;if(el.dataset.cf==null)el.dataset.cf=rawFp(el);
      if(el.parentElement&&el.parentElement.tagName==='PICTURE')el.parentElement.querySelectorAll('source').forEach(x=>x.remove());
      el.removeAttribute('srcset');el.src=s;if(op.alt!=null)el.alt=String(op.alt);return true}
    case 'del':el.remove();return true;
    case 'move':{const r=resolve(op.r);if(!r||r===el||el.contains(r))return false;if(op.w==='a')r.after(el);else r.before(el);return true}
    case 'dup':{if(byCid(op.id))return true;const c=el.cloneNode(true);c.removeAttribute('id');
      c.querySelectorAll('[id]').forEach(x=>x.removeAttribute('id'));c.querySelectorAll('[data-cid]').forEach(x=>x.dataset.cid=op.id+'.'+x.dataset.cid);
      c.dataset.cid=op.id;el.after(c);return true}
  }
  return false}
let failed=[];
function applyOps(ops){failed=[];(ops||[]).forEach((op,i)=>{let ok=false;try{ok=applyOp(op)}catch(e){ok=false}if(!ok)failed.push(i)});return failed}

// ---- custom pages (p.html): title, description, and their sections ----
function customPage(P){if(!/^(en\/)?p\//.test(PAGE))return;
  const main=document.querySelector('main');if(!main)return;
  main.querySelectorAll('.cp-wait').forEach(x=>x.remove());
  if(!P){if(!main.querySelector('.cp-none')){const s=h('section','sec cp-none'),w=h('div','wrap');w.append(h('h1','',EN?'Page not found':'الصفحة غير موجودة'),h('p','lead',EN?'This page may have been moved or removed.':'ربما نُقلت هذه الصفحة أو حُذفت.'));
    const a=link(EN?'Back to the home page':'العودة إلى الصفحة الرئيسية',EN?'index.html':'index.html','btn pri');w.append(a);s.append(w);main.append(s)}
    document.title=(EN?'Page not found':'الصفحة غير موجودة')+' | '+(EN?'Basira for Transactions':'بصيرة للمعاملات');return}
  const t=norm(P.title)||'';document.title=(t?t+' | ':'')+(EN?'Basira for Transactions':'بصيرة للمعاملات');
  const md=document.querySelector('meta[name="description"]');if(md&&P.desc)md.setAttribute('content',norm(P.desc).slice(0,300));
  if(!document.getElementById('cpHead')){const s=h('section','sec cp-head');s.id='cpHead';const w=h('div','wrap');w.append(h('h1','',t));if(P.lead)w.append(h('p','lead',P.lead));s.append(w);main.prepend(s)}}

// links to custom pages in the footer of every page of the same language
function footerLinks(data){const f=document.querySelector('footer');if(!f||f.querySelector('.cp-links'))return;
  const mine=Object.keys(data&&data.pages||{}).filter(k=>/^(en\/)?p\//.test(k)&&(k.startsWith('en/')===EN)&&data.pages[k].menu&&norm(data.pages[k].title));
  if(!mine.length)return;
  const nav=h('nav','fcol cp-links');nav.setAttribute('aria-label',EN?'More pages':'صفحات أخرى');nav.append(h('b','',EN?'More pages':'صفحات أخرى'));
  mine.sort((a,b)=>(+data.pages[a].sort||0)-(+data.pages[b].sort||0)).forEach(k=>{const a=h('a','',norm(data.pages[k].title));a.href=ROOT+(EN?'en/':'')+'p.html?id='+encodeURIComponent(k.replace(/^(en\/)?p\//,''));nav.append(a)});
  const grid=f.querySelector('.fgrid');if(grid)grid.append(nav);else{nav.classList.add('wrap');f.prepend(nav)}}

// ---- state ----
function readCache(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}}
function writeCache(c){try{localStorage.setItem(KEY,JSON.stringify(c))}catch(e){}}
function readDraft(k){try{return JSON.parse(sessionStorage.getItem(DKEY+(k||PAGE))||'null')}catch(e){return null}}
const editing=/[?&]edit=1(&|$)/.test(location.search)&&(()=>{try{return !!sessionStorage.getItem(TKEY)}catch(e){return false}})();
let cache=readCache(),applied=false;
const pageOf=data=>data&&data.pages&&data.pages[PAGE]||null;
function show(data,ops){applied=true;const P=pageOf(data);
  if(/^(en\/)?p\//.test(PAGE))customPage(editing&&readDraft()?Object.assign({},P||{},readDraft().meta||{}):P);
  applyOps(ops!=null?ops:(P&&P.ops));footerLinks(data);
  document.documentElement.classList.add('content-ready');document.dispatchEvent(new CustomEvent('content:applied'))}

window.CONTENT={PAGE,ROOT,locate,resolve,render,applyOps,safeUrl,mainBox,rawFp,fp,TYPES,
  get failed(){return failed.slice()},get data(){return cache&&cache.data||null},get ver(){return cache&&cache.ver||''},
  readDraft,remember(ver,data){cache={ver,data,at:Date.now()};writeCache(cache)},editing};

const api=(window.BASIRA_CONFIG||{}).API;
function fetchLatest(){if(!api)return Promise.resolve(null);
  return fetch(api,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'content',ver:cache&&cache.ver||''})})
    .then(r=>r.json()).then(j=>{if(!j||!j.ok)return null;
      if(j.same){cache.at=Date.now();writeCache(cache);return {same:true}}
      cache={ver:j.ver||'',data:j.data||null,at:Date.now()};writeCache(cache);return {same:false}}).catch(()=>null)}

let touched=false;['pointerdown','keydown','wheel','touchstart'].forEach(e=>addEventListener(e,()=>touched=true,{once:true,passive:true}));
const t0=Date.now();
function start(){
  if(editing){const d=readDraft();show(cache&&cache.data,d?d.ops:null);
    const s=document.createElement('script');s.src=ROOT+'assets/content-edit.js?v=20261125a';document.body.append(s);return}
  if(cache&&cache.data)show(cache.data);else if(/^(en\/)?p\//.test(PAGE)&&!api)customPage(null);
  if(cache&&cache.at&&Date.now()-cache.at<REFRESH&&applied)return;
  fetchLatest().then(r=>{
    if(!r){if(!applied&&/^(en\/)?p\//.test(PAGE))customPage(null);return}
    if(r.same)return;
    if(!applied){show(cache.data);return}
    // a newer version arrived after the page showed the older one: show it now if the visitor has not started reading
    let k='';try{k=sessionStorage.getItem('basira_content_rl')||''}catch(e){}
    if(!touched&&Date.now()-t0<5000&&k!==cache.ver){try{sessionStorage.setItem('basira_content_rl',cache.ver)}catch(e){}location.reload()}})}
// after the page's own DOMContentLoaded work (menus, prices, lists), so the editor and the visitor see the same page
let started=false;const go=()=>{if(started)return;started=true;start()};
if(document.readyState==='complete')go();else{document.addEventListener('DOMContentLoaded',go);addEventListener('load',go)}
})();

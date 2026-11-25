'use strict';
// محتوى الصفحة الرئيسية كما تعدّله الإدارة (لوحة الإدارة ← المحتوى): الأسئلة الشائعة، خطوات العمل، بطاقات الصفحة الرئيسية
// (ترتيبها وإخفاؤها وأسماؤها وبطاقات إضافية) وكتل نصية/صور إضافية. يُحمَّل في آخر الصفحة بعد app.js.
// كل النصوص تُكتب بـ textContent فقط، والصور والروابط بـ https أو روابط داخلية، ولا يُضاف أي HTML من البيانات.
// With nothing saved, the page keeps its own content. The saved copy is applied at once from this browser, then the server is asked for a newer one.
(function(){
const KEY='basira_content',EN=document.documentElement.lang==='en',LG=EN?'en':'ar';
const el=(t,c,txt)=>{const n=document.createElement(t);if(c)n.className=c;if(txt!=null)n.textContent=txt;return n};
const tx=o=>o&&typeof o==='object'?String(o[LG]||o[LG==='en'?'ar':'en']||''):'';
const link=u=>{u=String(u||'');return /^(https:\/\/[^\s"'<>`]+|#[A-Za-z0-9=_-]+|[a-z0-9-]+\.html(#[A-Za-z0-9=_-]+)?)$/.test(u)?u:''};
const img=u=>/^https:\/\/[^\s"'<>`]+$/.test(String(u||''))?u:'';
const $=s=>document.querySelector(s);
// ---- what the page itself holds (also used by the admin screen to show the original text) ----
function read(d){const t=(n,s)=>{const x=n.querySelector(s);return x?x.textContent.trim():''};
  const tiles=sel=>[...d.querySelectorAll(sel+' > a.tile')].map(a=>({k:a.getAttribute('href'),t:t(a,'b'),s:t(a,'span')}));
  return {faq:[...d.querySelectorAll('#faq .faq > details')].map(x=>({q:t(x,'summary'),a:t(x,'p')})),
    how:[...d.querySelectorAll('#how .steps > .step')].map(x=>({t:t(x,'b'),d:t(x,'span')})),
    tiles:{main:tiles('#tiles .tiles'),quick:tiles('#tiles .qlinks')}}}
function tileEl(x,quick){const a=el('a','tile'+(quick?' ql':''));a.href=x.k;if(/^https:/.test(x.k)){a.target='_blank';a.rel='noopener noreferrer'}
  const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');s.setAttribute('viewBox','0 0 32 32');s.setAttribute('aria-hidden','true');
  const p=document.createElementNS(ns,'path');p.setAttribute('d','M5 16h19M17 8l8 8-8 8');s.append(p);
  a.append(s,el('b',null,tx(x.t)),el('span',null,tx(x.s)));return a}
function applyTiles(box,list,quick){if(!box||!Array.isArray(list))return;
  const have=new Map([...box.querySelectorAll(':scope > a.tile')].map(a=>[a.getAttribute('href'),a]));const used=new Set(),out=[];
  list.forEach(x=>{const k=link(x.k);if(!k)return;let a=have.get(k);used.add(k);
    if(!a){if(!x.custom)return;a=tileEl(x,quick)}
    else{const t=tx(x.t),s=tx(x.s),b=a.querySelector('b'),sp=a.querySelector('span');if(t&&b)b.textContent=t;if(s&&sp)sp.textContent=s}
    a.hidden=x.on===false;out.push(a)});
  // tiles the page has but the saved list does not know (added to the site later): kept at the end, shown
  have.forEach((a,k)=>{if(!used.has(k))out.push(a)});
  out.forEach(a=>box.append(a))}
function applyFaq(list){const box=$('#faq .faq');if(!box||!Array.isArray(list))return;
  box.replaceChildren(...list.filter(x=>x.on!==false).map(x=>{const d=el('details'),q=tx(x.q);d.append(el('summary',null,q));
    String(tx(x.a)).split(/\n+/).filter(Boolean).forEach(p=>d.append(el('p',null,p)));return d}))}
function applyHow(list){const box=$('#how .steps');if(!box||!Array.isArray(list))return;
  box.replaceChildren(...list.filter(x=>x.on!==false).map(x=>{const d=el('div','step');d.append(el('b',null,tx(x.t)),el('span',null,tx(x.d)));return d}))}
function applyBlocks(list){document.querySelectorAll('.cblk').forEach(n=>n.remove());if(!Array.isArray(list))return;
  const wrap=$('#tiles > .wrap');if(!wrap)return;
  list.filter(b=>b&&b.on!==false&&(tx(b.t)||tx(b.x))).forEach(b=>{
    const s=el('section','cblk');s.id='cb-'+String(b.id||'').replace(/[^a-z0-9]/g,'');
    const body=el('div','cb-body');if(tx(b.t))body.append(el('h3',null,tx(b.t)));
    String(tx(b.x)).split(/\n+/).filter(Boolean).forEach(p=>body.append(el('p',null,p)));
    const l=link(b.link);if(l){const a=el('a','btn pri sm',tx(b.lt)||(EN?'Learn more':'اعرف المزيد'));a.href=l;if(/^https:/.test(l)){a.target='_blank';a.rel='noopener noreferrer'}body.append(a)}
    const u=img(b.img);if(u){const i=el('img');i.src=u;i.alt=tx(b.t);i.loading='lazy';i.decoding='async';i.referrerPolicy='no-referrer';i.onerror=()=>i.remove();s.classList.add('has-img');s.append(i)}
    s.append(body);
    if(b.pos==='bottom'){const ref=wrap.querySelector('.acctbar')||wrap.lastElementChild;wrap.insertBefore(s,ref)}
    else{const ref=wrap.querySelector('h2');ref?ref.after(s):wrap.prepend(s)}})}
function apply(c){if(!c||typeof c!=='object')return;
  try{if(c.faq)applyFaq(c.faq);if(c.how)applyHow(c.how);
    if(c.tiles){applyTiles($('#tiles .tiles'),c.tiles.main,false);applyTiles($('#tiles .qlinks'),c.tiles.quick,true)}
    applyBlocks(c.blocks)}catch(e){}}
let saved=null;try{saved=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
function remember(ver,c){saved=ver?{ver,c}:null;try{saved?localStorage.setItem(KEY,JSON.stringify(saved)):localStorage.removeItem(KEY)}catch(e){}}
window.SITE_CONTENT={read,apply,remember,get ver(){return saved?saved.ver:''},get current(){return saved?saved.c:null}};
if(saved)apply(saved.c);
const t0=Date.now();let touched=false;['pointerdown','keydown','input'].forEach(e=>addEventListener(e,()=>{touched=true},{once:true,capture:true}));
const api=(window.BASIRA_CONFIG||{}).API;
if(api&&!document.documentElement.hasAttribute('data-nocontent'))fetch(api,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'content',ver:saved?saved.ver:''})})
  .then(r=>r.json()).then(j=>{if(!j||!j.ok||j.same)return;const was=saved?saved.ver:'';if((j.ver||'')===was)return;
    remember(j.ver||'',j.content||null);
    // a newer version: show it now when the visitor has only just arrived, otherwise on the next page view
    if(!touched&&Date.now()-t0<8000){let once=false;try{once=sessionStorage.getItem(KEY+'_r')===j.ver;sessionStorage.setItem(KEY+'_r',j.ver)}catch(e){}if(!once)location.reload()}}).catch(()=>{});
})();

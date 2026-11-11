'use strict';
// Services list: filter the published services as the visitor types (Arabic or English name, group, or code).
// Groups with no match are hidden; with no match at all the visitor can ask Basira on WhatsApp about what they need.
(function(){
const box=document.querySelector('[data-svc-filter]');if(!box)return;
const q=box.querySelector('input'),clr=box.querySelector('[data-clear]'),st=box.querySelector('[data-status]'),none=box.querySelector('[data-nores]'),ask=box.querySelector('[data-ask]');
const items=[...document.querySelectorAll('.svc-group li[data-q]')],groups=[...document.querySelectorAll('.svc-group')],jump=document.querySelector('.svc-jump');
const norm=s=>String(s).toLowerCase().replace(/[ً-ْـ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g,' ').trim();
items.forEach(li=>li._q=norm(li.dataset.q));
function run(){const v=norm(q.value),words=v.split(' ').filter(Boolean);let n=0;
  items.forEach(li=>{const hit=!words.length||words.every(w=>li._q.includes(w));li.hidden=!hit;if(hit)n++});
  groups.forEach(g=>{g.hidden=!!words.length&&!g.querySelector('li[data-q]:not([hidden])')});
  if(jump)jump.hidden=!!words.length;clr.hidden=!words.length;
  st.textContent=words.length?n+' '+box.dataset.count:'';
  none.hidden=!(words.length&&!n);
  if(words.length&&!n){none.querySelector('span').textContent=box.dataset.none.replace('%q%',q.value.trim());
    ask.href='https://wa.me/97472232609?text='+encodeURIComponent((document.documentElement.lang==='en'?'Hello, do you offer this service: ':'السلام عليكم، هل تقدمون هذه الخدمة: ')+q.value.trim())}
  try{history.replaceState(null,'',words.length?'#q='+encodeURIComponent(q.value.trim()):location.pathname)}catch(e){}}
q.addEventListener('input',run);
q.addEventListener('keydown',e=>{if(e.key==='Escape'){q.value='';run()}});
clr.addEventListener('click',()=>{q.value='';run();q.focus()});
function fromHash(){const m=location.hash.match(/^#q=(.+)$/);if(m){try{q.value=decodeURIComponent(m[1])}catch(e){}run()}}
fromHash();addEventListener('hashchange',fromHash);
})();

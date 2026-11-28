'use strict';
// لوحة الإدارة ← «محتوى الموقع» (للمدير فقط): إضافة وتعديل وحذف وإخفاء وترتيب (سحب وإفلات أو أسهم) لـ
// الأسئلة الشائعة، خطوات العمل، بطاقات الصفحة الرئيسية (الأقسام والروابط السريعة)، وكتل نص وصورة إضافية، بالعربية والإنجليزية.
// الخدمات والباقات والأسعار والنصوص والإعلانات والآراء لها شاشاتها، وتُفتح من هنا بزر واحد.
// Admin only: add, edit, delete, hide and reorder (drag and drop or arrows) the FAQ, the work steps, the home cards and extra
// text/picture blocks, in Arabic and English. Saved with 'saveContent'; public pages apply it through assets/content.js.
// Uses helpers from crm.js ($, toast, ask, S, REMOTE, isAdmin, VIEWS).
(function(){
const EN=window.CRM_LANG==='en',L=(a,e)=>EN?e:a;
const tabs=document.getElementById('tabs'),anchor=document.getElementById('tabSite')||document.getElementById('tabTheme');if(!tabs||!anchor)return;
const btn=document.createElement('button');btn.type='button';btn.dataset.tab='content';btn.id='tabContent';btn.hidden=true;btn.dataset.g=anchor.dataset.g||'set';btn.setAttribute('data-notr','');btn.textContent=L('محتوى الموقع','Site content');
anchor.after(btn);
new MutationObserver(()=>btn.hidden=anchor.hidden).observe(anchor,{attributes:true,attributeFilter:['hidden']});btn.hidden=anchor.hidden;
const e=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SEC=[['faq',L('الأسئلة الشائعة','FAQ')],['how',L('خطوات العمل','Work steps')],['tm',L('بطاقات الرئيسية','Home cards')],['tq',L('الروابط السريعة','Quick links')],['blocks',L('كتل إضافية','Extra blocks')],['more',L('شاشات أخرى','Other screens')]];
const NOTE={faq:L('تظهر الأسئلة بالترتيب الذي تراه هنا في قسم «أسئلة شائعة».','Questions appear in the order shown here in the FAQ section.'),
  how:L('الخطوات تظهر مرقّمة تلقائياً حسب الترتيب. الأفضل ألا تزيد على ست خطوات ليبقى الشكل متوازناً.','Steps are numbered automatically in this order. Six steps or fewer keeps the layout balanced.'),
  tm:L('البطاقات الكبيرة في أعلى الصفحة الرئيسية «كيف نخدمك اليوم؟».','The large cards at the top of the home page.'),
  tq:L('بطاقات «روابط تهمّك» أسفل الصفحة الرئيسية.','The «Useful links» cards lower on the home page.'),
  blocks:L('كتل نص وصورة ورابط تُضاف إلى الصفحة الرئيسية في أعلاها أو أسفلها.','Text, picture and link blocks added to the top or bottom of the home page.')};
const LIMIT={faq:40,how:12,tm:24,tq:24,blocks:20};
const v=document.createElement('section');v.id='v-content';v.className='view';v.hidden=true;v.setAttribute('data-notr','');
v.innerHTML=`<div class="bar"><h2>${L('محتوى الموقع','Site content')}</h2><span class="sp"></span><a class="btn sm ghost" href="index.html" target="_blank" rel="noopener">${L('معاينة الموقع ↗','Preview the site ↗')}</a></div>
<p class="mute sm">${L('أضف وعدّل واحذف وأخفِ ورتّب محتوى الصفحة الرئيسية بالعربية والإنجليزية. اسحب العنصر من مقبضه ⠿ أو استعمل الأسهم. تظهر التعديلات لكل الزوار بعد «حفظ ونشر». الحقل الإنجليزي الفارغ يظهر بالعربية.','Add, edit, delete, hide and reorder the home page content in Arabic and English. Drag an item by its ⠿ handle or use the arrows. Changes reach every visitor after «Save and publish». An empty English field shows the Arabic text.')}</p>
<div class="cmseg" id="cmSeg" role="tablist">${SEC.map(([k,t])=>`<button type="button" role="tab" data-cs="${k}">${t}</button>`).join('')}</div>
<div class="panel" id="cmBody"></div>
<p class="err" id="cmErr" role="alert"></p>
<div class="bar cmbar"><button class="btn sm pri" type="button" id="cmSave">${L('حفظ ونشر','Save and publish')}</button><button class="btn sm ghost" type="button" id="cmUndo">${L('تراجع عن التعديلات','Discard changes')}</button><button class="btn sm ghost" type="button" id="cmReset">${L('العودة إلى المحتوى الأصلي','Back to the original content')}</button><span class="mute sm" id="cmState"></span></div>`;
(document.getElementById('v-site')||document.getElementById('v-theme')||document.querySelector('.view:last-of-type')).after(v);
const $=id=>document.getElementById(id);
let D=null,C=null,SAVED=null,cur='faq',dirty=false,loading=false;
const clone=o=>JSON.parse(JSON.stringify(o));
const pair=(a,b)=>({ar:a||'',en:b||''});
// ---- the page's own content (parsed from index.html and en/index.html), used as the starting point for «customise» ----
async function defaults(){const out={};
  for(const [l,u] of [['ar','index.html'],['en','en/index.html']])try{const h=await (await fetch(u,{cache:'no-cache'})).text();out[l]=window.SITE_CONTENT.read(new DOMParser().parseFromString(h,'text/html'))}catch(err){out[l]={faq:[],how:[],tiles:{main:[],quick:[]}}}
  return out}
function fromDefault(sec){const a=D.ar,b=D.en;
  if(sec==='faq')return a.faq.map((x,i)=>({q:pair(x.q,(b.faq[i]||{}).q),a:pair(x.a,(b.faq[i]||{}).a),on:true}));
  if(sec==='how')return a.how.map((x,i)=>({t:pair(x.t,(b.how[i]||{}).t),d:pair(x.d,(b.how[i]||{}).d),on:true}));
  const g=sec==='tm'?'main':'quick';return a.tiles[g].map(x=>{const y=b.tiles[g].find(z=>z.k===x.k)||{};return {k:x.k,on:true,custom:false,t:pair(x.t,y.t),s:pair(x.s,y.s)}})}
function defTile(sec,k){const g=sec==='tm'?'main':'quick';return {ar:D.ar.tiles[g].find(z=>z.k===k)||{},en:D.en.tiles[g].find(z=>z.k===k)||{}}}
async function fetchSaved(){const api=(window.BASIRA_CONFIG||{}).API;if(!api||(typeof REMOTE!=='undefined'&&!REMOTE))return window.SITE_CONTENT.current;
  try{const j=await (await fetch(api,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'content'})})).json();return j&&j.ok?(j.content||null):window.SITE_CONTENT.current}catch(err){return window.SITE_CONTENT.current}}
function fromSaved(c){c=c||{};const t=c.tiles||{};return {faq:Array.isArray(c.faq)?c.faq:null,how:Array.isArray(c.how)?c.how:null,tm:Array.isArray(t.main)?t.main:null,tq:Array.isArray(t.quick)?t.quick:null,blocks:Array.isArray(c.blocks)?c.blocks:[]}}
async function load(){if(loading||!window.SITE_CONTENT)return;loading=true;$('cmState').textContent=L('جارٍ التحميل…','Loading…');
  const [d,s]=await Promise.all([defaults(),fetchSaved()]);D=d;SAVED=fromSaved(s);C=clone(SAVED);dirty=false;loading=false;render()}
function mark(){dirty=true;state()}
function state(){$('cmState').textContent=dirty?L('تعديلات غير منشورة','Unpublished changes'):'';$('cmSave').disabled=!dirty;$('cmUndo').disabled=!dirty}
// ---- one item ----
const FIELDS={
  faq:[['q',L('السؤال','Question'),0,220],['a',L('الإجابة','Answer'),1,1500]],
  how:[['t',L('عنوان الخطوة','Step title'),0,80],['d',L('الشرح','Text'),1,260]],
  tm:[['t',L('العنوان','Title'),0,60],['s',L('الوصف القصير','Short text'),1,140]],
  tq:[['t',L('العنوان','Title'),0,60],['s',L('الوصف القصير','Short text'),1,140]],
  blocks:[['t',L('العنوان','Title'),0,100],['x',L('النص','Text'),2,1500]]};
const label=(sec,it)=>{const f=FIELDS[sec][0][0],o=it[f]||{};return (EN?o.en||o.ar:o.ar||o.en)||L('(بدون عنوان)','(untitled)')};
function fieldHtml(sec,i,[k,lab,rows,max],it){return ['ar','en'].map(l=>{const val=(it[k]||{})[l]||'',ph=sec==='tm'||sec==='tq'?((defTile(sec,it.k)[l]||{})[k]||''):'',id=`cm_${sec}_${i}_${k}_${l}`;
  const inp=rows?`<textarea id="${id}" data-f="${k}.${l}" rows="${rows===2?4:3}" maxlength="${max}" dir="${l==='en'?'ltr':'rtl'}" placeholder="${e(ph)}">${e(val)}</textarea>`:`<input id="${id}" data-f="${k}.${l}" maxlength="${max}" dir="${l==='en'?'ltr':'rtl'}" value="${e(val)}" placeholder="${e(ph)}">`;
  return `<label for="${id}"><span>${lab} · ${l==='ar'?L('عربي','Arabic'):L('إنجليزي','English')}</span>${inp}</label>`}).join('')}
function itemHtml(sec,it,i,n){
  const extra=sec==='blocks'?`<label><span>${L('مكان الظهور','Placement')}</span><select data-f="pos"><option value="top" ${it.pos!=='bottom'?'selected':''}>${L('أعلى الصفحة الرئيسية','Top of the home page')}</option><option value="bottom" ${it.pos==='bottom'?'selected':''}>${L('أسفل الصفحة الرئيسية','Bottom of the home page')}</option></select></label>
    <div class="cmimg"><span>${L('الصورة (اختيارية)','Picture (optional)')}</span>${it.img?`<img src="${e(it.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}<div class="cmimgbar"><input data-f="img" dir="ltr" maxlength="500" placeholder="https://" value="${e(it.img||'')}" aria-label="${L('رابط الصورة','Picture link')}"><label class="btn xs ghost">${L('رفع صورة','Upload')}<input type="file" accept="image/png,image/jpeg,image/webp" data-up hidden></label>${it.img?`<button class="btn xs ghost" type="button" data-act="noimg">${L('إزالة','Remove')}</button>`:''}</div></div>
    <label><span>${L('رابط الزر (اختياري)','Button link (optional)')}</span><input data-f="link" dir="ltr" maxlength="500" placeholder="https://… ${L('أو','or')} #faq ${L('أو','or')} about.html" value="${e(it.link||'')}"></label>
    ${['ar','en'].map(l=>`<label><span>${L('نص الزر','Button text')} · ${l==='ar'?L('عربي','Arabic'):L('إنجليزي','English')}</span><input data-f="lt.${l}" maxlength="40" dir="${l==='en'?'ltr':'rtl'}" value="${e((it.lt||{})[l]||'')}"></label>`).join('')}`:'';
  const tileKey=sec==='tm'||sec==='tq'?`<label><span>${L('الرابط','Link')}</span><input data-f="k" dir="ltr" maxlength="500" value="${e(it.k||'')}" ${it.custom?'':'readonly'}></label>`:'';
  return `<li class="cmitem ${it.on===false?'off':''}" data-i="${i}"><div class="cmhead"><span class="cmgrip" data-grip title="${L('اسحب لإعادة الترتيب','Drag to reorder')}" aria-hidden="true">⠿</span><b class="cmn num">${i+1}</b><span class="cmlab">${e(label(sec,it))}${it.custom?` <small class="k">${L('إضافية','Added')}</small>`:''}</span>
   <label class="cmon"><input type="checkbox" data-f="on" ${it.on!==false?'checked':''}> ${L('ظاهر','Shown')}</label>
   <button class="btn xs ghost" type="button" data-act="up" ${i===0?'disabled':''} aria-label="${L('أعلى','Move up')}">↑</button><button class="btn xs ghost" type="button" data-act="down" ${i===n-1?'disabled':''} aria-label="${L('أسفل','Move down')}">↓</button>
   <button class="btn xs ghost" type="button" data-act="del" aria-label="${L('حذف','Delete')}">🗑</button></div>
   <div class="cmgrid">${tileKey}${FIELDS[sec].map(f=>fieldHtml(sec,i,f,it)).join('')}${extra}</div></li>`}
function listHtml(sec){const list=C[sec];
  if(list===null)return `<p class="cmnote">${L('هذا القسم يعرض الآن محتوى الصفحة الأصلي. اضغط «تخصيص» لتحميل المحتوى الحالي وتعديله وإضافة غيره وحذفه وترتيبه.','This section shows the page’s original content. Press «Customise» to load it, then edit, add, delete and reorder.')}</p><button class="btn sm pri" type="button" data-act="custom">${L('تخصيص هذا القسم','Customise this section')}</button>`;
  const full=list.length>=LIMIT[sec];
  return `<div class="bar"><span class="mute sm">${NOTE[sec]} <b class="num">${list.length}</b>/${LIMIT[sec]}</span><span class="sp"></span>
   <button class="btn sm pri" type="button" data-act="add" ${full?'disabled':''}>${sec==='faq'?L('إضافة سؤال','Add a question'):sec==='how'?L('إضافة خطوة','Add a step'):sec==='blocks'?L('إضافة كتلة','Add a block'):L('إضافة بطاقة','Add a card')}</button>
   ${sec==='blocks'?'':`<button class="btn sm ghost" type="button" data-act="orig">${L('العودة إلى الأصلي','Back to the original')}</button>`}</div>
   ${list.length?`<ul class="cmlist" data-sec="${sec}">${list.map((it,i)=>itemHtml(sec,it,i,list.length)).join('')}</ul>`:`<div class="empty">${L('لا يوجد شيء هنا بعد. اضغط «إضافة».','Nothing here yet. Press «Add».')}</div>`}`}
function moreHtml(){const go=(tab,t,d)=>`<button type="button" class="cmgo" data-go="${tab}"><b>${t}</b><span>${d}</span></button>`;
  return `<p class="cmnote">${L('هذه المحتويات لها شاشاتها الخاصة بنفس إمكانيات الإضافة والتعديل والحذف والإخفاء والترتيب:','These have their own screens with the same add, edit, delete, hide and reorder tools:')}</p><div class="cmgos">
  ${go('cat',L('الخدمات والباقات والأسعار','Services, packages and prices'),L('الجهات والخدمات والباقات: إضافة وتعديل وحذف وإخفاء وترتيب','Authorities, services and packages: add, edit, delete, hide, reorder'))}
  ${go('site',L('نصوص الموقع','Site texts'),L('العنوان الرئيسي والنبذة وبيانات التواصل','Main title, about text and contact details'))}
  ${go('ads',L('الإعلانات','Ads'),L('إعلانات الصفحة الرئيسية بصورها وروابطها','Home page ads with pictures and links'))}
  ${go('rev',L('آراء العملاء','Client reviews'),L('قبول الآراء وإخفاؤها','Approve and hide reviews'))}
  ${go('theme',L('ألوان الموقع','Site colours'),L('اللون الأساسي واللون الذهبي','Primary and accent colours'))}</div>`}
function render(){if(!isAdmin()||!C)return;
  document.querySelectorAll('#cmSeg [data-cs]').forEach(b=>{const on=b.dataset.cs===cur;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
  $('cmBody').innerHTML=cur==='more'?moreHtml():listHtml(cur);state();$('cmErr').textContent=''}
// ---- events ----
$('cmSeg').addEventListener('click',ev=>{const b=ev.target.closest('[data-cs]');if(!b)return;cur=b.dataset.cs;render()});
function path(o,p,val){const k=p.split('.');let x=o;for(let i=0;i<k.length-1;i++)x=x[k[i]]=x[k[i]]||{};x[k[k.length-1]]=val}
function item(ev){const li=ev.target.closest('.cmitem');return li?{li,i:+li.dataset.i,list:C[cur]}:null}
$('cmBody').addEventListener('input',ev=>{const f=ev.target.dataset&&ev.target.dataset.f;const o=item(ev);if(!f||!o||ev.target.type==='checkbox'||ev.target.tagName==='SELECT')return;
  path(o.list[o.i],f,ev.target.value);const lab=o.li.querySelector('.cmlab');if(lab&&f.split('.')[0]===FIELDS[cur][0][0]){const t=lab.querySelector('small');lab.firstChild.textContent=label(cur,o.list[o.i])}
  if(f==='img'&&ev.target.closest('.cmimg')){}mark()});
$('cmBody').addEventListener('change',async ev=>{const o=item(ev);if(!o)return;const t=ev.target;
  if(t.dataset.up!==undefined){const file=t.files&&t.files[0];t.value='';if(file)await upload(o,file);return}
  if(t.dataset.f==='on'){o.list[o.i].on=t.checked;o.li.classList.toggle('off',!t.checked);mark();return}
  if(t.dataset.f==='pos'){o.list[o.i].pos=t.value;mark();return}
  if(t.dataset.f==='img'){render();}});
function swap(list,i,j){if(j<0||j>=list.length||i===j)return;list.splice(j,0,list.splice(i,1)[0]);mark();render()}
$('cmBody').addEventListener('click',async ev=>{const g=ev.target.closest('[data-go]');if(g){const t=document.querySelector(`#tabs [data-tab="${g.dataset.go}"]`);if(t&&!t.hidden)t.click();else toast(L('هذه الشاشة غير متاحة لك.','This screen is not available to you.'));return}
  const b=ev.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='custom'){C[cur]=fromDefault(cur);mark();render();return}
  if(a==='orig'){if(!await ask(L('العودة إلى المحتوى الأصلي لهذا القسم؟ تُحذف تعديلاتك عليه عند النشر.','Go back to the original content of this section? Your changes to it are dropped when you publish.'),{ok:L('نعم، عُد إلى الأصلي','Yes, go back')}))return;C[cur]=null;mark();render();return}
  if(a==='add'){const n=cur==='faq'?{q:pair(),a:pair(),on:true}:cur==='how'?{t:pair(),d:pair(),on:true}:cur==='blocks'?{id:'b'+Math.random().toString(36).slice(2,9),pos:'top',on:true,t:pair(),x:pair(),img:'',link:'',lt:pair()}:{k:'#',on:true,custom:true,t:pair(),s:pair()};
    if(n.k==='#')n.k='';C[cur].push(n);mark();render();const last=$('cmBody').querySelector('.cmitem:last-child');if(last){last.scrollIntoView({block:'center',behavior:'smooth'});const f=last.querySelector('input:not([readonly]):not([type=checkbox]),textarea');if(f)f.focus()}return}
  const o=item(ev);if(!o)return;
  if(a==='up')swap(o.list,o.i,o.i-1);if(a==='down')swap(o.list,o.i,o.i+1);
  if(a==='noimg'){o.list[o.i].img='';mark();render()}
  if(a==='del'){if(!await ask(L(`حذف «${label(cur,o.list[o.i])}»؟ إن أردت إيقافه مؤقتاً فألغِ تحديد «ظاهر» بدلاً من حذفه.`,`Delete «${label(cur,o.list[o.i])}»? To pause it for a while, untick «Shown» instead.`),{ok:L('حذف','Delete')}))return;o.list.splice(o.i,1);mark();render()}});
// drag and drop by the handle (desktop); arrows do the same on phones
let dragI=null;
$('cmBody').addEventListener('pointerdown',ev=>{const g=ev.target.closest('[data-grip]');if(g){const li=g.closest('.cmitem');li.draggable=true}});
$('cmBody').addEventListener('dragstart',ev=>{const li=ev.target.closest&&ev.target.closest('.cmitem');if(!li||!li.draggable)return;dragI=+li.dataset.i;li.classList.add('dragging');try{ev.dataTransfer.setData('text/plain',String(dragI));ev.dataTransfer.effectAllowed='move'}catch(err){}});
$('cmBody').addEventListener('dragend',()=>{dragI=null;$('cmBody').querySelectorAll('.cmitem').forEach(x=>{x.draggable=false;x.classList.remove('dragging','dropto')})});
$('cmBody').addEventListener('dragover',ev=>{const li=ev.target.closest('.cmitem');if(dragI==null||!li)return;ev.preventDefault();$('cmBody').querySelectorAll('.dropto').forEach(x=>x!==li&&x.classList.remove('dropto'));li.classList.add('dropto')});
$('cmBody').addEventListener('drop',ev=>{const li=ev.target.closest('.cmitem');if(dragI==null||!li)return;ev.preventDefault();const to=+li.dataset.i,from=dragI;dragI=null;if(C[cur])swap(C[cur],from,to)});
// ---- pictures: PNG, JPEG or WebP, shrunk in the browser to fit 800 KB, then stored by the server in its own Drive folder ----
const MAXKB=800;
async function shrink(file){const url=URL.createObjectURL(file);try{const im=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
  let w=im.naturalWidth,h=im.naturalHeight;const sc=Math.min(1,1400/Math.max(w,h));w=Math.round(w*sc);h=Math.round(h*sc);
  for(let q=.9;q>=.4;q-=.1){const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',q));if(blob&&blob.size<=MAXKB*1000)return blob;if(q<=.45){w=Math.round(w*.8);h=Math.round(h*.8);q=.95}}
  return null}finally{URL.revokeObjectURL(url)}}
const b64=blob=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(blob)});
async function upload(o,file){$('cmErr').textContent='';
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)){$('cmErr').textContent=L('الصورة PNG أو JPEG أو WebP فقط.','The picture must be PNG, JPEG or WebP.');return}
  if(typeof REMOTE!=='undefined'&&!REMOTE){$('cmErr').textContent=L('رفع الصور يحتاج اتصال الخادم. يمكنك لصق رابط https للصورة.','Uploading needs the server. You can paste an https picture link instead.');return}
  try{toast(L('جارٍ رفع الصورة…','Uploading the picture…'));const blob=await shrink(file);if(!blob){$('cmErr').textContent=L('تعذر تصغير الصورة. اختر صورة أصغر.','Could not shrink the picture. Choose a smaller one.');return}
    const j=await S.api('contentImg',{image:{data:await b64(blob)}});o.list[o.i].img=j.url;mark();render();toast(L('رُفعت الصورة. اضغط «حفظ ونشر» لتظهر في الموقع.','Picture uploaded. Press «Save and publish» to show it on the site.'))}
  catch(err){$('cmErr').textContent=L('تعذر رفع الصورة: ','Could not upload the picture: ')+(typeof errText==='function'?errText(err.message):err.message)}}
// ---- save ----
const okLink=u=>!u||/^(https:\/\/[^\s"'<>`]+|#[A-Za-z0-9=_-]{1,40}|[a-z0-9-]{1,40}\.html(#[A-Za-z0-9=_-]{1,40})?)$/.test(u);
function check(){const bad=(m,sec,i)=>{cur=sec;render();const li=$('cmBody').querySelector(`.cmitem[data-i="${i}"]`);if(li)li.scrollIntoView({block:'center'});$('cmErr').textContent=m;return false};
  for(const [sec,list] of [['faq',C.faq],['how',C.how],['tm',C.tm],['tq',C.tq],['blocks',C.blocks]]){if(!list)continue;
    for(let i=0;i<list.length;i++){const it=list[i],n=L(`العنصر ${i+1}`,`Item ${i+1}`);
      if(sec==='faq'&&(!(it.q.ar||it.q.en)||!(it.a.ar||it.a.en)))return bad(L(`${n} في «الأسئلة الشائعة»: اكتب السؤال والإجابة (بلغة واحدة على الأقل).`,`${n} in the FAQ: write the question and the answer (at least one language).`),sec,i);
      if(sec==='how'&&!(it.t.ar||it.t.en))return bad(L(`${n} في «خطوات العمل»: اكتب عنوان الخطوة.`,`${n} in the steps: write the step title.`),sec,i);
      if((sec==='tm'||sec==='tq')&&it.custom&&(!(it.t.ar||it.t.en)||!it.k||!okLink(it.k)))return bad(L(`${n} في البطاقات: اكتب العنوان ورابطاً صحيحاً (https:// أو #قسم أو صفحة.html).`,`${n} in the cards: write a title and a valid link (https://, #section or page.html).`),sec,i);
      if(sec==='blocks'){if(!(it.t.ar||it.t.en||it.x.ar||it.x.en))return bad(L(`${n} في الكتل: اكتب عنواناً أو نصاً.`,`${n} in the blocks: write a title or a text.`),sec,i);
        if(!okLink(it.link))return bad(L(`${n} في الكتل: رابط الزر غير صحيح.`,`${n} in the blocks: the button link is not valid.`),sec,i);
        if(it.img&&!/^https:\/\/[^\s"'<>`]+$/.test(it.img))return bad(L(`${n} في الكتل: رابط الصورة يجب أن يبدأ بـ https://`,`${n} in the blocks: the picture link must start with https://`),sec,i)}}}
  return true}
function payload(){const tile=sec=>C[sec]&&C[sec].map(x=>{const d=x.custom?null:defTile(sec,x.k),o=clone(x);
  if(d)['ar','en'].forEach(l=>{if(o.t[l]===(d[l].t||''))o.t[l]='';if(o.s[l]===(d[l].s||''))o.s[l]=''});return o});
  return {faq:C.faq,how:C.how,tiles:C.tm||C.tq?{main:tile('tm')||[],quick:tile('tq')||[]}:null,blocks:C.blocks}}
$('cmSave').onclick=async()=>{$('cmErr').textContent='';if(!check())return;const p=payload();
  if(typeof REMOTE!=='undefined'&&!REMOTE){window.SITE_CONTENT.remember('local',p);SAVED=clone(C);dirty=false;state();toast(L('حُفظ على هذا الجهاز فقط (الخادم غير متصل).','Saved on this device only (no server).'));return}
  $('cmSave').disabled=true;
  try{const j=await S.api('saveContent',{content:p});window.SITE_CONTENT.remember(j.ver,j.content);SAVED=clone(C);dirty=false;toast(L('شكراً لك، حُفظ محتوى الموقع ونُشر.','Thank you, the site content is saved and published.'));render()}
  catch(err){$('cmErr').textContent=L('تعذر الحفظ: ','Could not save: ')+(typeof errText==='function'?errText(err.message):err.message);state()}};
$('cmUndo').onclick=async()=>{if(!dirty)return;if(!await ask(L('التراجع عن كل التعديلات غير المنشورة؟','Discard all unpublished changes?'),{ok:L('تراجع','Discard')}))return;C=clone(SAVED);dirty=false;render()};
$('cmReset').onclick=async()=>{if(!await ask(L('العودة إلى المحتوى الأصلي لكل الأقسام؟ تُحذف كل تعديلات المحتوى المنشورة (الأسئلة والخطوات والبطاقات والكتل). الخدمات والأسعار والنصوص لا تتأثر.','Go back to the original content for every section? All published content changes (FAQ, steps, cards, blocks) are removed. Services, prices and texts are not affected.'),{ok:L('نعم، عُد إلى الأصلي','Yes, go back')}))return;
  try{if(typeof REMOTE==='undefined'||REMOTE)await S.api('saveContent',{content:null});window.SITE_CONTENT.remember('',null);SAVED=fromSaved(null);C=clone(SAVED);dirty=false;toast(L('عاد المحتوى الأصلي.','The original content is back.'));render()}catch(err){$('cmErr').textContent=err.message}};
window.addEventListener('beforeunload',ev=>{if(dirty){ev.preventDefault();ev.returnValue=''}});
if(typeof VIEWS!=='undefined')VIEWS.content=()=>{if(!C)load();else render()};
})();

'use strict';
// Visual page editor for the manager. Opened from لوحة الإدارة ← محتوى الموقع (or any page with ?edit=1 while signed in
// as an admin). Click anything on the page to change its text, link or picture, duplicate it, delete it, or drag it to a
// new place; open «الأقسام» to reorder or delete whole sections; «إضافة قسم» adds a ready-made section (text, picture and
// text, cards, questions, call to action, gallery, numbers, steps, links). Changes stay as a draft in this tab until
// «حفظ ونشر»; every published version is kept on the server and can be restored from the admin panel.
(function(){
const C=window.CONTENT;if(!C)return;
const CFG=window.BASIRA_CONFIG||{},TKEY='basira_crm_token',DKEY='basira_content_draft:',PAGE=C.PAGE;
const isCustom=/^(en\/)?p\//.test(PAGE);
const $=(s,r)=>(r||document).querySelector(s),$$=(s,r)=>[...(r||document).querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const short=(s,n)=>{s=norm(s);n=n||40;return s.length>n?s.slice(0,n)+'…':s};
const uid=()=>'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const ERR={auth:'انتهت جلسة الدخول. سجّل الدخول مرة أخرى من لوحة الإدارة.',admin_only:'هذه الميزة للمدير فقط.',must_change:'غيّر كلمة المرور من لوحة الإدارة أولاً.',
  conflict:'عُدّل المحتوى من جهاز آخر الآن.',bad_link:'أحد الروابط غير مقبول. استخدم رابطاً يبدأ بـ https:// أو رابط صفحة من الموقع.',invalid:'بعض البيانات غير صالحة.',
  too_large:'الحجم أكبر من المسموح.',bad_image:'الملف ليس صورة PNG أو JPEG أو WebP.',unknown_action:'الخادم لم يُحدَّث بعد لميزة إدارة المحتوى.',not_found:'لم يُعثر على النسخة.'};
const errText=e=>ERR[e]||('تعذر إكمال العملية: '+e);

// ---------- server ----------
async function call(body){if(!CFG.API)throw new Error('no_server');
  const r=await fetch(CFG.API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});const j=await r.json();
  if(!j.ok){const e=new Error(j.error||'error');e.data=j;throw e}return j}
const tok=()=>{try{return sessionStorage.getItem(TKEY)||''}catch(e){return ''}};
const api=(action,body)=>call(Object.assign({action,token:tok()},body||{}));

// ---------- draft ----------
const pub=()=>{const P=C.data&&C.data.pages&&C.data.pages[PAGE];return P||null};
let draft=C.readDraft()||{ops:JSON.parse(JSON.stringify((pub()||{}).ops||[])),meta:metaOf(pub()),base:C.ver};
function metaOf(P){P=P||{};return {title:P.title||'',lead:P.lead||'',desc:P.desc||'',menu:!!P.menu,sort:+P.sort||0}}
function saveDraft(){try{sessionStorage.setItem(DKEY+PAGE,JSON.stringify(draft))}catch(e){}refreshBar()}
function dropDraft(){try{sessionStorage.removeItem(DKEY+PAGE)}catch(e){}}
const pubOps=()=>JSON.stringify((pub()||{}).ops||[]);
const dirty=()=>JSON.stringify(draft.ops)!==pubOps()||(isCustom&&JSON.stringify(draft.meta)!==JSON.stringify(metaOf(pub())));
function push(op){const fail=C.applyOps([op]);if(fail.length){toast('تعذر تطبيق هذا التعديل على الصفحة.',1);return false}draft.ops.push(op);saveDraft();return true}
const reload=()=>{saveDraft();location.reload()};

// ---------- editor shell ----------
const css=document.createElement('link');css.rel='stylesheet';css.href=C.ROOT+'assets/content-edit.css?v=20261125a';document.head.append(css);
const root=document.createElement('div');root.id='ce-root';root.dir='rtl';root.lang='ar';root.setAttribute('data-notr','');document.body.append(root);
document.documentElement.classList.add('ce-on');
root.innerHTML=`
<div class="ce-bar" role="toolbar" aria-label="محرر الصفحة">
  <span class="ce-title"><b>محرر الصفحة</b><span class="ce-page" id="ceName"></span></span>
  <span class="ce-sp"></span>
  <button type="button" class="ce-b" id="ceSecs" title="ترتيب أقسام الصفحة وحذفها"><i aria-hidden="true">☰</i><span>الأقسام</span></button>
  <button type="button" class="ce-b" id="ceAdd" title="إضافة قسم جديد"><i aria-hidden="true">＋</i><span>إضافة قسم</span></button>
  ${isCustom?'<button type="button" class="ce-b" id="ceMeta" title="عنوان الصفحة وظهورها في القائمة"><i aria-hidden="true">⚙</i><span>إعدادات الصفحة</span></button>':''}
  <button type="button" class="ce-b" id="ceUndo" title="التراجع عن آخر تعديل"><i aria-hidden="true">↶</i><span>تراجع</span></button>
  <button type="button" class="ce-b" id="ceLog" title="كل تعديلات هذه الصفحة"><i aria-hidden="true">≡</i><span>السجل</span></button>
  <button type="button" class="ce-b" id="cePrev" aria-pressed="false" title="عرض الصفحة كما يراها الزائر"><i aria-hidden="true">◉</i><span>معاينة</span></button>
  <button type="button" class="ce-b ce-pri" id="cePub"><i aria-hidden="true">✓</i><span>حفظ ونشر</span><em id="ceN"></em></button>
  <a class="ce-b" id="ceExit" href="${esc(C.ROOT)}crm.html#content" title="العودة إلى لوحة الإدارة"><i aria-hidden="true">✕</i><span>خروج</span></a>
</div>
<div class="ce-hint" id="ceHint">اضغط على أي نص أو صورة أو جزء في الصفحة لتعديله أو حذفه أو تحريكه.</div>
<div class="ce-sel" id="ceSel" hidden></div><div class="ce-hov" id="ceHov" hidden></div><div class="ce-drop" id="ceDrop" hidden></div>
<div class="ce-tools" id="ceTools" hidden role="toolbar" aria-label="أدوات العنصر"></div>
<aside class="ce-panel" id="cePanel" hidden aria-live="polite"></aside>
<div class="ce-modal" id="ceModal" hidden><div class="ce-dlg" role="dialog" aria-modal="true" aria-labelledby="ceMT"><div class="ce-dh"><b id="ceMT"></b><button type="button" class="ce-x" id="ceMX" aria-label="إغلاق">✕</button></div><div class="ce-db" id="ceMB"></div></div></div>
<div class="ce-toast" id="ceToast" role="status" hidden></div>`;
const NAMES={'index.html':'الصفحة الرئيسية','about.html':'تعرّف إلى بصيرة','articles.html':'المقالات','partners.html':'الشركاء','legal.html':'المستندات القانونية','privacy.html':'الخصوصية',
  'renewals.html':'التجديدات','restaurants.html':'المطاعم','management.html':'الإدارة','standards.html':'المعايير','card.html':'البطاقة','404.html':'صفحة غير موجودة'};
function pageName(k){const en=k.startsWith('en/');const b=k.replace(/^en\//,'');
  if(/^p\//.test(b)){const m=isCustom&&k===PAGE?draft.meta:(C.data&&C.data.pages&&C.data.pages[k]||{});return (m.title||b.slice(2))+(en?' (English)':'')}
  return (NAMES[b]||document.title.split('|')[0].trim()||b)+(en?' (English)':'')}
$('#ceName').textContent=pageName(PAGE);
let tt;function toast(m,bad){const t=$('#ceToast');t.textContent=m;t.className='ce-toast'+(bad?' bad':'');t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,bad?6000:3500)}
function refreshBar(){const n=draft.ops.length,d=dirty();const e=$('#ceN');e.textContent=d?'•':'';$('#cePub').classList.toggle('ce-ready',d);$('#ceUndo').disabled=!n;
  $('#cePub').title=d?'تعديلات غير منشورة على هذه الصفحة':'لا تعديلات جديدة'}

// ---------- who is editing ----------
(async()=>{
  if(!CFG.API){toast('الخادم غير مضبوط في config.js، فلا يمكن الحفظ.',1);return}
  try{const j=await api('staffMe');if(!j.me||j.me.role!=='admin'){locked('التحرير متاح لحساب المدير فقط.');return}if(j.me.mustChange){locked(ERR.must_change);return}}
  catch(e){locked(errText(e.message));return}
  // make sure we edit on top of the newest published version
  try{const j=await call({action:'content',ver:C.ver});
    if(!j.same&&j.ver!==C.ver){C.remember(j.ver||'',j.data||null);if(!C.readDraft()){location.reload();return}
      draft.base=draft.base||C.ver;toast('نُشرت نسخة أحدث من جهاز آخر. تعديلاتك محفوظة وستُدمج عند النشر.')}}
  catch(e){if(e.message==='unknown_action')toast(ERR.unknown_action,1)}
})();
function locked(m){document.documentElement.classList.remove('ce-on');root.innerHTML=`<div class="ce-bar"><b>محرر الصفحة</b><span class="ce-sp"></span><span>${esc(m)}</span><a class="ce-b ce-pri" href="${esc(C.ROOT)}crm.html">لوحة الإدارة</a><a class="ce-b" href="${esc(location.pathname+location.search.replace(/([?&])edit=1(&|$)/,'$1').replace(/[?&]$/,''))}">عرض الصفحة</a></div>`;
  removeEventListener('click',onClick,true);document.removeEventListener('mouseover',onHover,true);document.removeEventListener('submit',stop,true)}

// ---------- what is on the page as built (to tell fixed content from content the site fills in by itself) ----------
let RAW=null;fetch(location.href.split('#')[0].replace(/([?&])edit=1(&|$)/,'$1'),{cache:'no-cache'}).then(r=>r.text()).then(t=>RAW=new DOMParser().parseFromString(t,'text/html')).catch(()=>{});
function inBlock(el){return el.closest('[data-cid]')}
function isFixed(el){if(!RAW||inBlock(el))return true;if(el.id)return !!RAW.getElementById(el.id);
  const L=C.locate(el),A=L.a?RAW.getElementById(L.a):RAW.body;if(!A)return false;
  if([...A.getElementsByTagName(L.g)].some(x=>C.rawFp(x)===L.f))return true;
  // same place and shape as in the built page (its text was set by «نصوص الموقع»)
  let n=A,live=L.a?document.getElementById(L.a):document.body;
  for(const i of L.p){if(!n||!live||n.children.length!==live.children.length)return false;n=n.children[i];live=live.children[i]}
  return !!n&&n.tagName===L.g}

// ---------- selecting ----------
let sel=null,preview=false;
const ui=el=>el&&el.closest&&el.closest('#ce-root');
const usable=el=>el&&el.nodeType===1&&el!==document.body&&el!==document.documentElement&&!ui(el)&&!el.closest('header.top,.basmala,script,style,dialog,template,.skip')&&el.tagName!=='MAIN';
const block=el=>el&&el.closest('.cblk[data-cid]');
const addOf=el=>{const b=block(el);return b?draft.ops.find(o=>o.o==='add'&&o.id===b.dataset.cid):null};
function box(el,tgt){const r=el.getBoundingClientRect();Object.assign(tgt.style,{top:r.top+'px',left:r.left+'px',width:r.width+'px',height:r.height+'px'});tgt.hidden=false}
function onHover(e){if(preview||ui(e.target)||!usable(e.target)){$('#ceHov').hidden=true;return}box(pick(e.target),$('#ceHov'))}
// a click on a word inside a button or a heading selects the whole button or heading
function pick(el){const b=block(el);if(b)return b;
  const t=el.closest('a,button,label,summary,li,h1,h2,h3,h4,p,img,figure,td,th,dt,dd');return t&&usable(t)&&!t.contains(document.querySelector('main'))?t:el}
function stop(e){if(!preview&&!ui(e.target)){e.preventDefault();e.stopImmediatePropagation()}}
function onClick(e){if(preview||ui(e.target))return;e.preventDefault();e.stopImmediatePropagation();if(editingText)return;if(!usable(e.target)){unselect();return}select(pick(e.target))}
addEventListener('click',onClick,true);document.addEventListener('mouseover',onHover,true);document.addEventListener('submit',stop,true);
['pointerdown','mousedown'].forEach(t=>addEventListener(t,e=>{if(!preview&&!ui(e.target)&&e.target.closest('a,button,summary,select,input,textarea'))e.preventDefault()},true));
addEventListener('scroll',()=>{if(sel)place();$('#ceHov').hidden=true},{passive:true});addEventListener('resize',()=>sel&&place());
function unselect(){sel=null;$('#ceSel').hidden=true;$('#ceTools').hidden=true}
const isText=el=>el.tagName!=='IMG'&&norm(el.textContent)&&![...el.children].some(c=>!/^(BR|B|STRONG|EM|I|SMALL|SPAN|BDI|SUP|SUB|MARK|ABBR|TIME)$/.test(c.tagName)||c.children.length);
const mixed=el=>[...el.children].some(c=>c.tagName!=='BR');
function select(el){sel=el;const T=$('#ceTools'),b=block(el),fixed=isFixed(el),a=el.closest('a'),img=el.tagName==='IMG'?el:(el.matches('figure')?el.querySelector('img'):null);
  const btn=(id,ic,lab,ttl)=>`<button type="button" class="ce-t" data-a="${id}" title="${esc(ttl||lab)}"><i aria-hidden="true">${ic}</i><span>${esc(lab)}</span></button>`;
  let h=`<span class="ce-tn">${esc(label(el))}</span>`;
  if(b)h+=btn('block','✎','تعديل القسم');
  else if(!fixed)h+=`<span class="ce-note">يُولَّد هذا الجزء تلقائياً (مثل الخدمات والأسعار من «الإعدادات ← الخدمات والأسعار»). يمكنك نقله أو حذفه أو تعديل القسم الأكبر.</span>`;
  else{if(isText(el)||(norm(el.textContent)&&!img&&el.children.length<=3&&!el.querySelector('img,ul,ol,div,section,table')))h+=btn('text','✎','تعديل النص');
    if(a)h+=btn('href','🔗','تعديل الرابط');if(img)h+=btn('img','🖼','تغيير الصورة')}
  if(fixed||b){h+=btn('dup','⧉','إضافة مثله','إضافة نسخة من هذا العنصر بعده لتعدّلها');}
  h+=btn('up','↑','لأعلى','تحريكه قبل العنصر السابق')+btn('down','↓','لأسفل','تحريكه بعد العنصر التالي')+`<button type="button" class="ce-t ce-grab" data-a="drag" title="اسحبه وأفلته في المكان الذي تريد"><i aria-hidden="true">⠿</i><span>اسحب</span></button>`;
  h+=btn('after','＋','قسم بعده','إضافة قسم جديد بعد هذا الجزء')+btn('parent','⤒','الجزء الأكبر','اختيار الجزء الذي يحتوي هذا العنصر')+btn('del','🗑','حذف');
  T.innerHTML=h;T.hidden=false;place();$('#ceHint').hidden=true}
function label(el){const b=block(el);if(b){const o=addOf(el);return 'قسم مضاف: '+(TL[(o&&o.b.type)||'text']||'')}
  const n={H1:'العنوان الرئيسي',H2:'عنوان',H3:'عنوان فرعي',H4:'عنوان فرعي',P:'فقرة',A:'رابط',BUTTON:'زر',IMG:'صورة',LI:'عنصر قائمة',SECTION:'قسم',UL:'قائمة',OL:'قائمة',FIGURE:'صورة',ARTICLE:'بطاقة',TABLE:'جدول',DETAILS:'سؤال',SUMMARY:'سؤال'}[el.tagName]||'جزء';
  const t=short(el.tagName==='IMG'?el.alt:el.textContent,28);return t?n+': '+t:n}
function place(){if(!sel||!document.contains(sel)){unselect();return}box(sel,$('#ceSel'));const T=$('#ceTools'),r=sel.getBoundingClientRect();
  if(innerWidth<760){T.classList.add('dock');T.style.top=T.style.left='';return}T.classList.remove('dock');
  const th=T.offsetHeight||44,top=r.top-th-8>56?r.top-th-8:Math.min(r.bottom+8,innerHeight-th-8);
  T.style.top=Math.max(56,top)+'px';T.style.left=Math.max(8,Math.min(r.left+r.width/2-T.offsetWidth/2,innerWidth-T.offsetWidth-8))+'px'}

$('#ceTools').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b||!sel)return;const a=b.dataset.a,el=sel;
  if(a==='text')editText(el);else if(a==='href')editHref(el.closest('a'));else if(a==='img')editImg(el.tagName==='IMG'?el:el.querySelector('img'));
  else if(a==='dup')dup(el);else if(a==='up'||a==='down')step(el,a==='up');else if(a==='after')addSection(el);
  else if(a==='parent'){let p=el.parentElement;while(p&&!usable(p))p=null;if(p&&p.tagName!=='MAIN'&&p!==document.body)select(p);else toast('هذا أكبر جزء يمكن اختياره هنا.')}
  else if(a==='del')del(el);else if(a==='block')editBlock(el)});
$('#ceTools').addEventListener('pointerdown',e=>{const g=e.target.closest('.ce-grab');if(g&&sel){e.preventDefault();drag(sel,e,'page')}});

// ---------- the operations ----------
let editingText=null;
function editText(el){if(mixed(el)&&!confirm('سيُستبدل النص كاملاً بنص بلا تنسيق (مثل الخط العريض داخله). متابعة؟'))return;
  const before=el.textContent,html=el.innerHTML,fixedL=C.locate(el);editingText=el;$('#ceTools').hidden=true;
  try{el.contentEditable='plaintext-only'}catch(e){}if(el.contentEditable!=='plaintext-only')el.contentEditable='true';
  el.classList.add('ce-typing');el.focus();const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);
  const one=/^(A|BUTTON|H1|H2|H3|H4|H5|B|STRONG|SPAN|LABEL|SUMMARY|LI|TD|TH|DT)$/.test(el.tagName);
  const done=keep=>{el.removeEventListener('keydown',key);el.removeEventListener('blur',blur);el.removeAttribute('contenteditable');el.classList.remove('ce-typing');editingText=null;
    const v=norm(el.innerText!=null?el.innerText:el.textContent).slice(0,6000);
    if(!keep||!v){el.innerHTML=html;if(keep&&!v)toast('النص لا يكون فارغاً. لحذف العنصر استخدم «حذف».',1);select(el);return}
    el.innerHTML=html;if(norm(before)===v){select(el);return}
    push({o:'text',t:fixedL,v});select(el)};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='Enter'&&(one||e.ctrlKey||e.metaKey)){e.preventDefault();done(true)}};
  const blur=()=>done(true);el.addEventListener('keydown',key);el.addEventListener('blur',blur)}
function editHref(a){if(!a)return;form('تعديل الرابط',[{k:'v',t:'url',l:'الرابط',hint:'رابط صفحة من الموقع (مثل about.html أو index.html#services)، أو رابط يبدأ بـ https://، أو mailto: للبريد، أو tel: للهاتف.'}],{v:a.getAttribute('href')||''},
  d=>{const v=C.safeUrl(d.v);if(v==null||!v)return 'الرابط غير مقبول.';push({o:'href',t:C.locate(a),v});select(sel||a)})}
function editImg(img){if(!img)return;form('تغيير الصورة',[{k:'v',t:'img',l:'الصورة'},{k:'alt',t:'text',l:'وصف الصورة (يقرؤه قارئ الشاشة ومحركات البحث)'}],{v:img.getAttribute('src')||'',alt:img.alt||''},
  d=>{const v=C.safeUrl(d.v);if(!v)return 'اختر صورة أو اكتب رابطاً يبدأ بـ https://.';push({o:'img',t:C.locate(img),v,alt:norm(d.alt).slice(0,200)});select(img)})}
function dup(el){const o=addOf(el);
  if(o&&block(el)===el){const n={o:'add',id:uid(),r:{c:o.id},w:'a',b:JSON.parse(JSON.stringify(o.b))};if(push(n)){const x=document.querySelector('[data-cid="'+n.id+'"]');x&&select(x);toast('أُضيفت نسخة من القسم بعده. عدّلها كما تريد.')}return}
  const id=uid();if(push({o:'dup',t:C.locate(el),id})){const x=document.querySelector('[data-cid="'+id+'"]');if(x){select(x);x.scrollIntoView({block:'nearest',behavior:'smooth'})}toast('أُضيفت نسخة بعده. اضغط على نصوصها لتعديلها.')}}
const sibs=el=>[...el.parentElement.children].filter(x=>x!==el&&!x.matches('script,style,template,dialog,#ce-root')&&x.offsetParent!==null||x===el);
function step(el,up){const s=sibs(el),i=s.indexOf(el),r=s[up?i-1:i+1];if(!r){toast(up?'هذا أول عنصر في مكانه.':'هذا آخر عنصر في مكانه.');return}
  if(push({o:'move',t:C.locate(el),r:C.locate(r),w:up?'b':'a'})){select(el);el.scrollIntoView({block:'nearest',behavior:'smooth'})}}
function del(el){const o=addOf(el);if(!confirm('حذف «'+label(el)+'» من الصفحة؟ يمكنك التراجع قبل النشر، أو استرجاع نسخة سابقة بعد النشر.'))return;
  if(o&&block(el)===el){const i=draft.ops.indexOf(o);// a section added in this draft and never published: just forget it
    if(!JSON.parse(pubOps()).some(x=>x.o==='add'&&x.id===o.id)&&!draft.ops.slice(i+1).some(x=>JSON.stringify(x).includes('"'+o.id+'"'))){draft.ops.splice(i,1);el.remove();saveDraft();unselect();toast('حُذف القسم.');return}}
  if(push({o:'del',t:C.locate(el)})){unselect();toast('حُذف. للتراجع اضغط «تراجع».')}}
$('#ceUndo').onclick=()=>{if(!draft.ops.length)return;draft.ops.pop();reload()};

// ---------- drag and drop (mouse and touch) ----------
function drag(el,e,mode,list,onDrop){const D=$('#ceDrop'),items=()=>list?list():sibs(el).filter(x=>x!==el);let target=null,where='b',raf=0;
  el.classList.add('ce-dragging');document.documentElement.classList.add('ce-dragmode');
  const ghost=document.createElement('div');ghost.className='ce-ghost';ghost.textContent=mode==='page'?label(el):norm(el.textContent).slice(0,40);root.append(ghost);
  const move=ev=>{const x=ev.clientX,y=ev.clientY;ghost.style.transform=`translate(${x+12}px,${y+12}px)`;
    if(y<70)scrollBy(0,-14);else if(y>innerHeight-60)scrollBy(0,14);
    let best=null,bd=1e9;items().forEach(s=>{const r=s.getBoundingClientRect();if(!r.width&&!r.height)return;const cx=r.left+r.width/2,cy=r.top+r.height/2,d=Math.hypot((x-cx)*.5,y-cy);if(d<bd){bd=d;best=s}});
    if(!best){D.hidden=true;target=null;return}target=best;const r=best.getBoundingClientRect(),row=Math.abs(y-(r.top+r.height/2))>r.height/4||r.width>innerWidth*.6;
    where=row?(y<r.top+r.height/2?'b':'a'):((x<r.left+r.width/2)!==(getComputedStyle(best.parentElement).direction==='rtl')?'b':'a');
    if(row)Object.assign(D.style,{top:(where==='b'?r.top-3:r.bottom-1)+'px',left:r.left+'px',width:r.width+'px',height:'4px'});
    else Object.assign(D.style,{top:r.top+'px',left:((where==='b')!==(getComputedStyle(best.parentElement).direction==='rtl')?r.left-3:r.right-1)+'px',width:'4px',height:r.height+'px'});D.hidden=false};
  const up=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);ghost.remove();D.hidden=true;
    el.classList.remove('ce-dragging');document.documentElement.classList.remove('ce-dragmode');
    if(!target)return;if(onDrop)return onDrop(target,where);
    if(push({o:'move',t:C.locate(el),r:C.locate(target),w:where})){select(el);toast('نُقل العنصر.')}};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);move(e)}

// ---------- panels: sections and history ----------
const P=$('#cePanel');let panel='';
function openPanel(k){if(panel===k){P.hidden=true;panel='';return}panel=k;P.hidden=false;k==='secs'?secs():history()}
$('#ceSecs').onclick=()=>openPanel('secs');$('#ceAdd').onclick=()=>addSection(sel&&document.contains(sel)?sel:null);$('#ceLog').onclick=()=>openPanel('log');
const kids=()=>[...C.mainBox().children].filter(x=>!x.matches('script,style,template,dialog,#ce-root,.cp-wait')&&!(x.hidden&&!x.id));
function secName(x){const o=x.dataset.cid&&draft.ops.find(p=>p.o==='add'&&p.id===x.dataset.cid);if(o)return (o.b.h||o.b.p||TL[o.b.type]||'قسم مضاف');
  const hd=x.matches('h1,h2,h3')?x:x.querySelector('h1,h2,h3');return norm(hd?hd.textContent:x.textContent)||x.id||x.tagName.toLowerCase()}
function secs(){const L=kids();
  P.innerHTML=`<div class="ce-ph"><b>أقسام الصفحة</b><button type="button" class="ce-x" data-close aria-label="إغلاق">✕</button></div>
  <p class="ce-mute">اسحب ⠿ لتغيير الترتيب، أو استخدم الأسهم. الحذف يُخفي القسم عن الزوار بعد النشر.</p>
  <ol class="ce-list" id="ceSL">${L.map((x,i)=>`<li data-i="${i}"><button type="button" class="ce-h" data-g title="اسحب لتغيير الترتيب" aria-label="اسحب">⠿</button><button type="button" class="ce-nm" data-go>${esc(short(secName(x),46))}${x.dataset.cid?' <em>مضاف</em>':''}</button>
  <span class="ce-rb"><button type="button" data-u aria-label="لأعلى">↑</button><button type="button" data-d aria-label="لأسفل">↓</button><button type="button" data-x aria-label="حذف">🗑</button></span></li>`).join('')}</ol>
  <button type="button" class="ce-b ce-wide" data-add>＋ إضافة قسم جديد في آخر الصفحة</button>`;
  P.querySelector('[data-close]').onclick=()=>openPanel('secs');P.querySelector('[data-add]').onclick=()=>addSection(null);
  $$('#ceSL li',P).forEach(li=>{const x=L[+li.dataset.i];
    li.querySelector('[data-go]').onclick=()=>{x.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>select(x),350)};
    li.querySelector('[data-u]').onclick=()=>{step(x,true);secs()};li.querySelector('[data-d]').onclick=()=>{step(x,false);secs()};
    li.querySelector('[data-x]').onclick=()=>{del(x);secs()};
    li.querySelector('[data-g]').onpointerdown=e=>{e.preventDefault();const rows=()=>$$('#ceSL li',P).filter(r=>r!==li);
      drag(li,e,'list',rows,(t,w)=>{const y=L[+t.dataset.i];if(y&&y!==x&&push({o:'move',t:C.locate(x),r:C.locate(y),w}))toast('تغيّر ترتيب الأقسام.');secs()})}})}
const DESC={text:'نص',href:'رابط',img:'صورة',del:'حذف',move:'نقل',dup:'إضافة نسخة',add:'قسم جديد'};
function opText(o){const t=o.t||o.r||{};const f=short(t.f||t.i||'',30);
  if(o.o==='text')return 'تعديل نص إلى «'+short(o.v,40)+'»';if(o.o==='href')return 'تعديل رابط إلى '+short(o.v,40);if(o.o==='img')return 'تغيير صورة';
  if(o.o==='add')return 'قسم جديد: '+(TL[o.b&&o.b.type]||'')+(o.b&&o.b.h?' «'+short(o.b.h,30)+'»':'');return (DESC[o.o]||o.o)+(f?' «'+f+'»':'')}
function history(){const F=new Set(C.failed);
  P.innerHTML=`<div class="ce-ph"><b>تعديلات هذه الصفحة</b><button type="button" class="ce-x" data-close aria-label="إغلاق">✕</button></div>
  <p class="ce-mute">${draft.ops.length?'التعديلات بالترتيب. احذف أي تعديل لإلغائه.':'لا تعديلات على هذه الصفحة بعد.'}</p>
  <ol class="ce-list ce-log">${draft.ops.map((o,i)=>`<li${F.has(i)?' class="ce-fail" title="لم يعد هذا التعديل ينطبق، فقد تغيّر هذا الجزء من الصفحة"':''}><span class="ce-nm">${esc(opText(o))}${F.has(i)?' <em>لا ينطبق</em>':''}</span><span class="ce-rb"><button type="button" data-x="${i}" aria-label="إلغاء هذا التعديل">✕</button></span></li>`).join('')}</ol>
  ${dirty()?'<button type="button" class="ce-b ce-wide" data-reset>إلغاء كل التعديلات غير المنشورة</button>':''}`;
  P.querySelector('[data-close]').onclick=()=>openPanel('log');
  $$('[data-x]',P).forEach(b=>b.onclick=()=>{const i=+b.dataset.x,o=draft.ops[i];
    if(o&&(o.id)&&draft.ops.slice(i+1).some(x=>JSON.stringify(x).includes('"'+o.id+'"'))&&!confirm('توجد تعديلات لاحقة مرتبطة بهذا التعديل وستتوقف عن العمل. متابعة؟'))return;
    draft.ops.splice(i,1);reload()});
  const r=P.querySelector('[data-reset]');if(r)r.onclick=()=>{if(!confirm('إلغاء كل التعديلات التي لم تُنشر على هذه الصفحة؟'))return;dropDraft();location.reload()}}

// ---------- preview ----------
$('#cePrev').onclick=()=>{preview=!preview;$('#cePrev').setAttribute('aria-pressed',preview);document.documentElement.classList.toggle('ce-preview',preview);
  $('#cePrev span').textContent=preview?'العودة للتحرير':'معاينة';if(preview){unselect();P.hidden=true;panel=''}};

// ---------- forms (links, pictures, sections, page settings) ----------
const M=$('#ceModal');let onClose=null;
$('#ceMX').onclick=()=>closeM();M.addEventListener('click',e=>{if(e.target===M)closeM()});addEventListener('keydown',e=>{if(e.key==='Escape'&&!M.hidden)closeM()});
function closeM(){M.hidden=true;$('#ceMB').innerHTML='';onClose&&onClose();onClose=null}
function openM(title,html){$('#ceMT').textContent=title;$('#ceMB').innerHTML=html;M.hidden=false;const f=$('#ceMB input,#ceMB textarea,#ceMB select');f&&f.focus()}
function field(f,v){const id='cf_'+f.k+'_'+Math.random().toString(36).slice(2,6);v=v==null?'':v;
  if(f.t==='area')return `<label class="ce-f" for="${id}"><span>${esc(f.l)}</span><textarea id="${id}" name="${f.k}" rows="${f.rows||4}" maxlength="${f.max||3000}">${esc(v)}</textarea>${f.hint?`<small>${esc(f.hint)}</small>`:''}</label>`;
  if(f.t==='select')return `<label class="ce-f" for="${id}"><span>${esc(f.l)}</span><select id="${id}" name="${f.k}">${f.o.map(([a,b])=>`<option value="${esc(a)}"${String(v)===a?' selected':''}>${esc(b)}</option>`).join('')}</select></label>`;
  if(f.t==='check')return `<label class="ce-f ce-chk"><input type="checkbox" name="${f.k}"${v?' checked':''}><span>${esc(f.l)}</span></label>`;
  if(f.t==='img')return `<div class="ce-f ce-imgf"><span>${esc(f.l)}</span><div class="ce-imgrow"><img alt="" class="ce-thumb"${v?` src="${esc(v)}"`:''}><div><label class="ce-b ce-up">رفع صورة من جهازك<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-up="${f.k}"></label>
    <input name="${f.k}" dir="ltr" inputmode="url" placeholder="أو الصق رابط صورة https://" value="${esc(v)}" maxlength="600"><small class="ce-ups" data-st="${f.k}"></small></div></div></div>`;
  return `<label class="ce-f" for="${id}"><span>${esc(f.l)}</span><input id="${id}" name="${f.k}" value="${esc(v)}" maxlength="${f.max||(f.t==='url'?600:300)}"${f.t==='url'?' dir="ltr" inputmode="url"':''}>${f.hint?`<small>${esc(f.hint)}</small>`:''}</label>`}
function wireImages(box){$$('[data-up]',box).forEach(inp=>inp.onchange=async()=>{const k=inp.dataset.up,st=box.querySelector(`[data-st="${k}"]`),url=box.querySelector(`input[name="${k}"]`),th=inp.closest('.ce-imgf').querySelector('.ce-thumb');
  const f=inp.files&&inp.files[0];if(!f)return;st.textContent='جارٍ تجهيز الصورة ورفعها…';
  try{const data=await shrink(f);const j=await api('contentImage',{image:{data}});url.value=j.url;th.src=j.url;st.textContent='رُفعت الصورة.'}catch(e){st.textContent=errText(e.message)}finally{inp.value=''}});
  $$('.ce-imgf input[name]',box).forEach(i=>i.oninput=()=>{const th=i.closest('.ce-imgf').querySelector('.ce-thumb'),v=C.safeUrl(i.value);if(v&&/^https:\/\//.test(v))th.src=v})}
// pictures are resized in the browser (at most 1600 px wide) before upload, so pages stay fast on phones
function shrink(file){return new Promise((ok,no)=>{if(!/^image\/(png|jpeg|webp)$/.test(file.type))return no(new Error('bad_image'));
  const img=new Image(),rd=new FileReader();img.onload=()=>{const k=Math.min(1,1600/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);const type=file.type==='image/png'&&file.size<400000&&k===1?'image/png':'image/jpeg';
    c.toBlob(b=>{if(!b)return no(new Error('bad_image'));if(b.size>1500*1024)return no(new Error('too_large'));const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.readAsDataURL(b)},type,.86)};
  img.onerror=()=>no(new Error('bad_image'));rd.onload=()=>img.src=rd.result;rd.onerror=()=>no(new Error('bad_image'));rd.readAsDataURL(file)})}
function form(title,fields,vals,save){openM(title,`<form class="ce-form" novalidate>${fields.map(f=>field(f,vals[f.k])).join('')}<p class="ce-err" role="alert"></p><div class="ce-acts"><button class="ce-b ce-pri" type="submit">حفظ</button><button class="ce-b" type="button" data-cancel>إلغاء</button></div></form>`);
  const F=$('#ceMB form');wireImages(F);F.querySelector('[data-cancel]').onclick=closeM;
  F.onsubmit=e=>{e.preventDefault();const d={};fields.forEach(f=>{const x=F.elements[f.k];d[f.k]=f.t==='check'?x.checked:x.value});const er=save(d);if(er){F.querySelector('.ce-err').textContent=er;return}closeM()}}

// ---------- ready-made sections ----------
const TL={text:'نص',media:'صورة ونص',cards:'بطاقات',faq:'أسئلة وأجوبة',cta:'دعوة للتواصل',gallery:'معرض صور',image:'صورة كبيرة',notice:'تنبيه بارز',stats:'أرقام',steps:'خطوات',links:'روابط'};
const TD={text:'عنوان وفقرات',media:'صورة بجانب نص وزر',cards:'مجموعة بطاقات بعنوان وشرح وصورة ورابط',faq:'أسئلة تنفتح أجوبتها',cta:'رسالة مع زرين',gallery:'شبكة صور مع تعليقات',
  image:'صورة بعرض الصفحة',notice:'سطر مميز مع زر',stats:'أرقام كبيرة مع شرح',steps:'خطوات مرقّمة',links:'أزرار روابط سريعة'};
const TI={text:'¶',media:'◧',cards:'▦',faq:'?',cta:'➜',gallery:'▤',image:'▭',notice:'!',stats:'#',steps:'①',links:'🔗'};
const COMMON=[{k:'kicker',t:'text',l:'سطر صغير فوق العنوان (اختياري)',max:80},{k:'h',t:'text',l:'العنوان',max:160}];
const STYLE=[{k:'tone',t:'select',l:'الخلفية',o:[['','عادية'],['alt','مميزة']]},{k:'align',t:'select',l:'المحاذاة',o:[['','من البداية'],['center','في الوسط']]}];
const P_=(l,r)=>({k:'p',t:'area',l:l||'النص',rows:r||5,max:5000,hint:'اترك سطراً فارغاً بين الفقرات.'});
const SPEC={
  text:{f:[...COMMON,P_()]},
  media:{f:[...COMMON,P_(),{k:'img',t:'img',l:'الصورة'},{k:'alt',t:'text',l:'وصف الصورة'},{k:'side',t:'select',l:'مكان الصورة',o:[['','في البداية'],['end','في النهاية']]},{k:'btn',t:'text',l:'نص الزر (اختياري)'},{k:'link',t:'url',l:'رابط الزر'}]},
  cards:{f:[...COMMON,P_('مقدمة (اختيارية)',2)],items:[{k:'t',t:'text',l:'العنوان'},{k:'s',t:'area',l:'الشرح',rows:2,max:600},{k:'img',t:'img',l:'صورة (اختيارية)'},{k:'link',t:'url',l:'رابط عند الضغط (اختياري)'}],item:'بطاقة'},
  faq:{f:[...COMMON,P_('مقدمة (اختيارية)',2)],items:[{k:'q',t:'text',l:'السؤال',max:300},{k:'a',t:'area',l:'الجواب',rows:3,max:3000}],item:'سؤال'},
  cta:{f:[...COMMON,P_('الرسالة',3),{k:'btn',t:'text',l:'نص الزر الأول'},{k:'link',t:'url',l:'رابط الزر الأول',hint:'مثل https://wa.me/97472232609 أو index.html#request'},{k:'btn2',t:'text',l:'نص الزر الثاني (اختياري)'},{k:'link2',t:'url',l:'رابط الزر الثاني'}]},
  gallery:{f:[...COMMON,P_('مقدمة (اختيارية)',2)],items:[{k:'img',t:'img',l:'الصورة'},{k:'cap',t:'text',l:'تعليق (اختياري)'},{k:'alt',t:'text',l:'وصف الصورة'}],item:'صورة'},
  image:{f:[{k:'h',t:'text',l:'العنوان (اختياري)'},{k:'img',t:'img',l:'الصورة'},{k:'alt',t:'text',l:'وصف الصورة'},{k:'cap',t:'text',l:'تعليق تحت الصورة (اختياري)'},P_('نص تحت الصورة (اختياري)',2)]},
  notice:{f:[P_('نص التنبيه',2),{k:'btn',t:'text',l:'نص الزر (اختياري)'},{k:'link',t:'url',l:'رابط الزر'}]},
  stats:{f:[...COMMON,P_('مقدمة (اختيارية)',2)],items:[{k:'n',t:'text',l:'الرقم',max:20},{k:'t',t:'text',l:'الشرح',max:120}],item:'رقم'},
  steps:{f:[...COMMON,P_('مقدمة (اختيارية)',2)],items:[{k:'t',t:'text',l:'الخطوة'},{k:'s',t:'area',l:'الشرح',rows:2,max:600}],item:'خطوة'},
  links:{f:[...COMMON,P_('مقدمة (اختيارية)',2)],items:[{k:'t',t:'text',l:'نص الرابط'},{k:'link',t:'url',l:'الرابط'}],item:'رابط'}};
const SAMPLE={text:{h:'عنوان القسم',p:'اكتب هنا النص الذي تريد أن يقرأه زوار الموقع.'},media:{h:'عنوان القسم',p:'اكتب هنا شرحاً قصيراً بجانب الصورة.'},
  cards:{h:'عنوان القسم',items:[{t:'البطاقة الأولى',s:'شرح قصير'},{t:'البطاقة الثانية',s:'شرح قصير'},{t:'البطاقة الثالثة',s:'شرح قصير'}]},
  faq:{h:'الأسئلة الشائعة',items:[{q:'اكتب السؤال هنا',a:'واكتب جوابه هنا.'}]},cta:{h:'نسعد بخدمتك',p:'راسلنا الآن وسنرد عليك في أقرب وقت.',btn:'راسلنا على واتساب',link:'https://wa.me/'+(CFG.WHATSAPP||'97472232609')},
  gallery:{h:'معرض الصور',items:[]},image:{},notice:{p:'اكتب هنا تنبيهاً مهماً للزوار.'},stats:{h:'بالأرقام',items:[{n:'100',t:'عميل'},{n:'24',t:'ساعة للرد'}]},
  steps:{h:'كيف نعمل',items:[{t:'الخطوة الأولى',s:'شرح قصير'},{t:'الخطوة الثانية',s:'شرح قصير'}]},links:{h:'روابط سريعة',items:[{t:'الخدمات والأسعار',link:'index.html#services'}]}};
function addSection(after){const at=after?topOf(after):null;
  openM('إضافة قسم جديد',`<p class="ce-mute">${at?'سيُضاف القسم بعد «'+esc(short(secName(at),40))+'».':'سيُضاف القسم في آخر الصفحة.'} اختر نوعه:</p><div class="ce-types">${Object.keys(TL).map(k=>`<button type="button" class="ce-type" data-k="${k}"><i aria-hidden="true">${TI[k]}</i><b>${TL[k]}</b><span>${TD[k]}</span></button>`).join('')}</div>`);
  $$('.ce-type',M).forEach(b=>b.onclick=()=>blockForm(b.dataset.k,JSON.parse(JSON.stringify(SAMPLE[b.dataset.k]||{})),b2=>{
    const op={o:'add',id:uid(),r:at?C.locate(at):null,w:at?'a':'end',b:b2};
    if(push(op)){const x=document.querySelector('[data-cid="'+op.id+'"]');if(x){x.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>select(x),400)}toast('أُضيف القسم. اضغط «حفظ ونشر» ليظهر للزوار.');if(panel==='secs')secs()}}))}
// a new section goes after the top-level part that holds the chosen element
function topOf(el){const B=C.mainBox();let n=el;while(n&&n.parentElement&&n.parentElement!==B)n=n.parentElement;return n&&n.parentElement===B?n:el}
function editBlock(el){const o=addOf(el);if(!o){toast('هذا القسم منشور من نسخة سابقة ولا يمكن تعديله هنا.',1);return}
  blockForm(o.b.type,JSON.parse(JSON.stringify(o.b)),b2=>{o.b=b2;const old=document.querySelector('[data-cid="'+o.id+'"]');
    if(old){const n=C.render(b2,!!old.parentElement.closest('.wrap'));n.dataset.cid=o.id;old.replaceWith(n);select(n)}saveDraft();toast('عُدّل القسم.')})}
function blockForm(type,b,done){const S=SPEC[type];b.type=type;
  const itemsHtml=()=>(b.items||[]).map((it,i)=>`<li class="ce-item" data-i="${i}"><div class="ce-ih"><button type="button" class="ce-h" data-g aria-label="اسحب لتغيير الترتيب">⠿</button><b>${esc(S.item)} ${i+1}</b><span class="ce-sp"></span>
    <button type="button" data-iu aria-label="لأعلى">↑</button><button type="button" data-id aria-label="لأسفل">↓</button><button type="button" data-ic aria-label="نسخ">⧉</button><button type="button" data-ix aria-label="حذف">🗑</button></div>
    ${S.items.map(f=>field(Object.assign({},f,{k:'it_'+i+'_'+f.k}),it[f.k])).join('')}</li>`).join('');
  openM((b.h?'تعديل':'إضافة')+' قسم: '+TL[type],`<form class="ce-form" novalidate>${S.f.map(f=>field(f,b[f.k])).join('')}
    ${S.items?`<h4 class="ce-sub">العناصر</h4><ol class="ce-items" id="ceIt">${itemsHtml()}</ol><button type="button" class="ce-b ce-wide" data-ia>＋ إضافة ${esc(S.item)}</button>`:''}
    <details class="ce-more"><summary>الشكل</summary>${STYLE.map(f=>field(f,b[f.k])).join('')}</details>
    <p class="ce-err" role="alert"></p><div class="ce-acts"><button class="ce-b ce-pri" type="submit">${b.h||b.p?'حفظ القسم':'إضافة القسم'}</button><button class="ce-b" type="button" data-cancel>إلغاء</button></div></form>`);
  const F=$('#ceMB form');wireImages(F);F.querySelector('[data-cancel]').onclick=closeM;
  const read=()=>{const o={type};[...S.f,...STYLE].forEach(f=>{const x=F.elements[f.k];if(x){const v=norm(f.t==='area'?x.value.replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n'):x.value);if(f.t==='area')o[f.k]=x.value.replace(/\r/g,'').split(/\n{2,}/).map(norm).filter(Boolean).join('\n\n');else if(v)o[f.k]=v}});
    if(S.items)o.items=$$('.ce-item',F).map(li=>{const i=li.dataset.i,it={};S.items.forEach(f=>{const x=F.elements['it_'+i+'_'+f.k];const v=f.t==='area'?x.value.replace(/\r/g,'').trim():norm(x.value);if(v)it[f.k]=v});return it}).filter(it=>Object.keys(it).length);
    Object.keys(o).forEach(k=>{if(o[k]===''||o[k]==null)delete o[k]});return o};
  const redraw=()=>{const keep=read();Object.assign(b,keep);$('#ceIt').innerHTML=itemsHtml();wireImages($('#ceIt'));wireItems()};
  function wireItems(){if(!S.items)return;$$('.ce-item',F).forEach(li=>{const i=+li.dataset.i;
    li.querySelector('[data-iu]').onclick=()=>{b=Object.assign(b,read());if(i>0){[b.items[i-1],b.items[i]]=[b.items[i],b.items[i-1]]}$('#ceIt').innerHTML=itemsHtml();wireImages($('#ceIt'));wireItems()};
    li.querySelector('[data-id]').onclick=()=>{b=Object.assign(b,read());if(i<b.items.length-1){[b.items[i+1],b.items[i]]=[b.items[i],b.items[i+1]]}$('#ceIt').innerHTML=itemsHtml();wireImages($('#ceIt'));wireItems()};
    li.querySelector('[data-ic]').onclick=()=>{b=Object.assign(b,read());b.items.splice(i+1,0,JSON.parse(JSON.stringify(b.items[i]||{})));$('#ceIt').innerHTML=itemsHtml();wireImages($('#ceIt'));wireItems()};
    li.querySelector('[data-ix]').onclick=()=>{b=Object.assign(b,read());b.items.splice(i,1);$('#ceIt').innerHTML=itemsHtml();wireImages($('#ceIt'));wireItems()};
    li.querySelector('[data-g]').onpointerdown=e=>{e.preventDefault();drag(li,e,'list',()=>$$('.ce-item',F).filter(r=>r!==li),(t,w)=>{b=Object.assign(b,read());const it=b.items.splice(i,1)[0];let j=+t.dataset.i;if(j>i)j--;b.items.splice(w==='a'?j+1:j,0,it);
      $('#ceIt').innerHTML=itemsHtml();wireImages($('#ceIt'));wireItems()})}})}
  wireItems();const ia=F.querySelector('[data-ia]');if(ia)ia.onclick=()=>{b=Object.assign(b,read());(b.items=b.items||[]).push({});$('#ceIt').innerHTML=itemsHtml();wireImages($('#ceIt'));wireItems();const l=$$('.ce-item',F).pop();l&&l.querySelector('input,textarea').focus()};
  F.onsubmit=e=>{e.preventDefault();const o=read(),er=F.querySelector('.ce-err');
    const urls=[o.img,o.link,o.link2,...(o.items||[]).flatMap(x=>[x.img,x.link])].filter(Boolean);if(urls.some(u=>C.safeUrl(u)==null))return er.textContent=ERR.bad_link;
    if(['media','image'].includes(type)&&!o.img)return er.textContent='اختر صورة للقسم.';
    if(type==='gallery'&&!(o.items||[]).some(x=>x.img))return er.textContent='أضف صورة واحدة على الأقل.';
    if(!o.h&&!o.p&&!(o.items||[]).length&&!o.img)return er.textContent='اكتب عنواناً أو نصاً للقسم.';
    if((o.btn&&!o.link)||(o.btn2&&!o.link2))return er.textContent='اكتب رابط الزر.';
    closeM();done(o)}}

// ---------- custom page settings ----------
const meta=$('#ceMeta');if(meta)meta.onclick=()=>form('إعدادات الصفحة',[{k:'title',t:'text',l:'عنوان الصفحة',max:120},{k:'lead',t:'area',l:'سطر تعريفي تحت العنوان (اختياري)',rows:2,max:400},
  {k:'desc',t:'area',l:'وصف الصفحة لمحركات البحث (اختياري)',rows:2,max:300},{k:'menu',t:'check',l:'إظهار رابطها في أسفل كل صفحات الموقع'},{k:'sort',t:'text',l:'ترتيبها بين الصفحات (رقم)',max:3}],draft.meta,d=>{
  if(!norm(d.title))return 'اكتب عنوان الصفحة.';draft.meta={title:norm(d.title),lead:norm(d.lead),desc:norm(d.desc),menu:!!d.menu,sort:Math.max(0,Math.min(999,parseInt(d.sort,10)||0))};
  const hd=document.getElementById('cpHead');if(hd){hd.querySelector('h1').textContent=draft.meta.title;let l=hd.querySelector('.lead');if(draft.meta.lead){if(!l){l=document.createElement('p');l.className='lead';hd.querySelector('.wrap').append(l)}l.textContent=draft.meta.lead}else if(l)l.remove()}
  $('#ceName').textContent=pageName(PAGE);saveDraft()});

// ---------- publishing ----------
$('#cePub').onclick=publish;
async function publish(){if(!dirty()){toast('لا تعديلات جديدة للنشر.');return}const b=$('#cePub');b.disabled=true;$('#cePub span').textContent='جارٍ النشر…';
  try{let base=C.ver,data=C.data;
    for(let tries=0;tries<2;tries++){
      const out=JSON.parse(JSON.stringify(data||{v:1,pages:{},menu:[]}));out.pages=out.pages||{};
      const old=out.pages[PAGE]||{};out.pages[PAGE]=Object.assign({},old,isCustom?draft.meta:{}, {ops:draft.ops});
      try{const j=await api('contentSave',{data:out,base,note:pageName(PAGE)});C.remember(j.ver,j.data);dropDraft();draft={ops:(j.data.pages[PAGE]||{}).ops||[],meta:metaOf(j.data.pages[PAGE]),base:j.ver};
        refreshBar();toast('شكراً لك، نُشرت التعديلات وتظهر الآن لكل زوار الموقع.');if(panel==='log')history();return}
      catch(e){if(e.message!=='conflict'||tries)throw e;
        // someone published meanwhile: take their version and put this page's changes on top of it
        const j=await call({action:'content'});const theirs=JSON.stringify(((j.data||{}).pages||{})[PAGE]&&j.data.pages[PAGE].ops||[]);
        if(theirs!==pubOps()&&!confirm('نُشرت تعديلات أخرى على هذه الصفحة نفسها من جهاز آخر الآن. هل تريد استبدالها بتعديلاتك؟')){C.remember(j.ver||'',j.data||null);dropDraft();location.reload();return}
        base=j.ver||'';data=j.data;C.remember(base,data)}}}
  catch(e){toast(errText(e.message),1)}
  finally{b.disabled=false;$('#cePub span').textContent='حفظ ونشر'}}
addEventListener('beforeunload',e=>{if(dirty()){saveDraft()}});
refreshBar();
if(C.failed.length)toast('بعض التعديلات السابقة لم تعد تنطبق لأن الصفحة تغيّرت. راجعها في «السجل».',1);
})();

'use strict';
// إدارة محتوى الموقع (admin.html): محرر مرئي لكل صفحات بصيرة.
// تُفتح الصفحة كما هي في إطار للمعاينة (دون تشغيل سكربتاتها)، ويحدد المدير أي عنصر فيعدّل نصه أو صورته أو رابطه،
// أو ينقله لأعلى ولأسفل، أو يكرره، أو يحذفه، أو يخفيه، أو يضيف بعده عنصراً أو قسماً جديداً. عند «حفظ ونشر» تُكتب الصفحة
// والصور الجديدة في المستودع بإيداع واحد عبر GitHub API، فيُعاد نشر الموقع تلقائياً، ثم يتحقق المحرر من ظهور التعديل على الموقع.
// الدخول بمفتاح GitHub (fine-grained) بصلاحية Contents: Read and write على المستودع basira فقط، ويُحفظ على جهاز المدير وحده.
(function(){
const O='baseeratactions',R='basira',B='main',GH='https://api.github.com',RP=`/repos/${O}/${R}`;
const SITE=new URL('./',location.href).href;
const TK='basira_cms_token';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const NAMES={'index.html':'الصفحة الرئيسية','about.html':'تعرّف إلى بصيرة','articles.html':'مقالات وأدلة','article-management.html':'مقال: الإدارة والإشراف',
  'article-menu-prices.html':'مقال: أسعار قوائم الطعام','article-renewals.html':'مقال: التجديدات','article-restaurant-licence.html':'مقال: رخصة المطعم',
  'legal.html':'المستندات القانونية','privacy.html':'سياسة الخصوصية','management.html':'الإدارة والإشراف','partners.html':'الشركاء والإحالات',
  'renewals.html':'التجديدات','restaurants.html':'للمطاعم','standards.html':'معاييرنا','login.html':'الدخول إلى المنصة','portal.html':'حسابي (العملاء)',
  'crm.html':'لوحة الإدارة','contract.html':'العقد','card.html':'البطاقة التعريفية','404.html':'صفحة «غير موجودة»','diwan/index.html':'الديوان'};
const SYSTEM=/^(en\/)?(login|portal|crm|contract|card|404)\.html$|^diwan\//;
const CORE=/^(en\/)?(index|crm|portal|login|404)\.html$|^admin\.html$|^diwan\//;
const pageName=p=>{const en=p.startsWith('en/'),k=en?p.slice(3):p;return (NAMES[k]||k.replace(/\.html$/,''))+(en?' (English)':'')};
const doha=d=>{const x=new Date(d);if(isNaN(x))return '';return x.toLocaleString('sv-SE',{timeZone:'Asia/Qatar',hour12:false}).slice(0,16)};

let TOKEN='',USER=null,PAGES=[],cur=null,doc=null,sel=null,editing=null,editStart='',undoS=[],redoS=[],dirty=false;
const pending=new Map();   // صور جديدة لم تُرفع: id -> {name, b64}
let uploaded=new Map();    // صور رُفعت في هذه الجلسة: id -> مسار نسبي من الصفحة

// ---------------- GitHub ----------------
async function gh(path,opt={}){
  const r=await fetch(GH+path,{...opt,cache:'no-store',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+TOKEN,'X-GitHub-Api-Version':'2022-11-28',...(opt.body?{'Content-Type':'application/json'}:{})}});
  if(!r.ok){let j={};try{j=await r.json()}catch(e){}const e=new Error(j.message||r.statusText||'HTTP '+r.status);e.status=r.status;throw e}
  return r.status===204?null:r.json()}
const encPath=p=>p.split('/').map(encodeURIComponent).join('/');
const b64dec=s=>new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g,'')),c=>c.charCodeAt(0)));
const b64enc=str=>{const u=new TextEncoder().encode(str);let b='';for(let i=0;i<u.length;i+=0x8000)b+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(b)};
async function getFile(path,ref=B){try{const f=await gh(`${RP}/contents/${encPath(path)}?ref=${encodeURIComponent(ref)}`);return {sha:f.sha,text:b64dec(f.content)}}
  catch(e){if(e.status===404)return null;throw e}}
// إيداع واحد لعدة ملفات. files: [{path, b64} | {path, del:true} | {path, edit:text=>text}]، guards: [{path, sha|null}] = الملف لم يتغير منذ فتحه
async function commit(files,message,guards=[]){
  for(let attempt=0;attempt<4;attempt++){
    const ref=await gh(`${RP}/git/ref/heads/${B}`),head=ref.object.sha;
    const hc=await gh(`${RP}/git/commits/${head}`);
    for(const g of guards){const f=await getFile(g.path,head);if((f?f.sha:null)!==(g.sha||null)){const e=new Error('conflict');e.conflict=g.path;throw e}}
    const tree=[],shas={};
    for(const f of files){
      if(f.del){tree.push({path:f.path,mode:'100644',type:'blob',sha:null});continue}
      let b64=f.b64;
      if(f.edit){const now=await getFile(f.path,head);const t=f.edit(now?now.text:'');if(t==null)continue;b64=b64enc(t)}
      const bl=await gh(`${RP}/git/blobs`,{method:'POST',body:JSON.stringify({content:b64,encoding:'base64'})});
      tree.push({path:f.path,mode:'100644',type:'blob',sha:bl.sha});shas[f.path]=bl.sha}
    const t=await gh(`${RP}/git/trees`,{method:'POST',body:JSON.stringify({base_tree:hc.tree.sha,tree})});
    const c=await gh(`${RP}/git/commits`,{method:'POST',body:JSON.stringify({message,tree:t.sha,parents:[head]})});
    try{await gh(`${RP}/git/refs/heads/${B}`,{method:'PATCH',body:JSON.stringify({sha:c.sha,force:false})});return {commit:c,shas}}
    catch(e){if((e.status===422||e.status===409)&&attempt<3){await sleep(800);continue}throw e}}}
const errText=e=>e&&e.conflict?'تغيّرت هذه الصفحة في المستودع بعد فتحها (ربما من جهاز آخر). أعد فتح الصفحة ثم كرر التعديل.':
  e&&e.status===401?'انتهت صلاحية مفتاح الدخول أو أُلغي. سجّل الدخول من جديد.':
  e&&(e.status===403||e.status===404)?'المفتاح لا يملك صلاحية الكتابة على المستودع basira (Contents: Read and write).':
  'تعذر الاتصال بـ GitHub: '+(e&&e.message||e);

// ---------------- واجهة عامة ----------------
let toastT;function toast(m,ms=3200){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,ms)}
function status(html,kind=''){const s=$('#status');s.className='status'+(html?' show':'')+(kind?' '+kind:'');s.innerHTML=html||''}
// نافذة حوار: يعيد قيمة الزر المضغوط (أو '' عند الإغلاق)
function modal(title,body,buttons,onOpen){return new Promise(res=>{const d=$('#dlg');$('#dlgT').textContent=title;$('#dlgB').innerHTML=body;$('#dlgErr').textContent='';
  $('#dlgA').innerHTML=buttons.map(b=>`<button class="btn ${b.cls||''}" value="${esc(b.v)}" ${b.v==='cancel'?'formnovalidate':''}>${esc(b.t)}</button>`).join('');
  const f=$('#dlgF');let done=false;
  f.onsubmit=async ev=>{const v=ev.submitter?ev.submitter.value:'';if(b0(v)&&b0(v).check){ev.preventDefault();const m=await b0(v).check();if(m){$('#dlgErr').textContent=m;return}d.close(v)}};
  const b0=v=>buttons.find(b=>b.v===v);
  d.onclose=()=>{if(done)return;done=true;res(d.returnValue==='cancel'?'':d.returnValue)};d.returnValue='';d.showModal();if(onOpen)onOpen(d)})}
const ask=(title,text,yes='تأكيد',cls='pri')=>modal(title,`<p>${text}</p>`,[{v:'cancel',t:'إلغاء'},{v:'yes',t:yes,cls}]).then(v=>v==='yes');

// ---------------- الدخول ----------------
function store(){try{return localStorage.getItem(TK)||sessionStorage.getItem(TK)||''}catch(e){return ''}}
function keep(t,rem){try{localStorage.removeItem(TK);sessionStorage.removeItem(TK);if(t)(rem?localStorage:sessionStorage).setItem(TK,t)}catch(e){}}
async function login(t){TOKEN=t;const repo=await gh(RP);if(!repo.permissions||!repo.permissions.push){const e=new Error('nopush');e.status=403;throw e}
  try{USER=await gh('/user')}catch(e){USER=null}}
$('#patLink').href='https://github.com/settings/personal-access-tokens/new?name='+encodeURIComponent('Basira site editor')+'&description='+encodeURIComponent('Edit the content of the Basira website')+'&target_name='+O+'&expires_in=none&contents=write';
$('#loginF').onsubmit=async ev=>{ev.preventDefault();const t=$('#tok').value.trim();$('#loginErr').textContent='';
  if(!/^(github_pat_|ghp_|gho_|ghu_)[A-Za-z0-9_]{20,}$/.test(t))return $('#loginErr').textContent='الصق مفتاح GitHub كاملاً، ويبدأ عادة بـ github_pat_';
  $('#loginBtn').disabled=true;$('#loginBtn').textContent='جارٍ التحقق…';
  try{await login(t);keep(t,$('#remember').checked);start()}catch(e){TOKEN='';$('#loginErr').textContent=e.status===401?'المفتاح غير صحيح أو منتهي الصلاحية.':errText(e)}
  finally{$('#loginBtn').disabled=false;$('#loginBtn').textContent='دخول'}};
async function boot(){const t=store();if(t){try{await login(t);return start()}catch(e){keep('');TOKEN=''}}$('#login').hidden=false;$('#tok').focus()}

// ---------------- الصفحات ----------------
async function loadPages(){const tr=await gh(`${RP}/git/trees/${B}?recursive=1`);
  PAGES=tr.tree.filter(x=>x.type==='blob'&&/\.html$/.test(x.path)&&!/^(en\/)?services\//.test(x.path)&&x.path!=='admin.html'&&!/^(\.github|scripts|node_modules)\//.test(x.path)).map(x=>x.path);
  const order=p=>(p==='index.html'?0:p==='en/index.html'?1:0)+(SYSTEM.test(p)?20:0)+(p.startsWith('en/')?10:0);
  PAGES.sort((a,b)=>order(a)-order(b)||pageName(a).localeCompare(pageName(b),'ar'));
  const g=(lab,list)=>list.length?`<optgroup label="${lab}">${list.map(p=>`<option value="${esc(p)}">${esc(pageName(p))}</option>`).join('')}</optgroup>`:'';
  $('#page').innerHTML=g('صفحات الموقع بالعربية',PAGES.filter(p=>!p.startsWith('en/')&&!SYSTEM.test(p)))+g('صفحات الموقع بالإنجليزية',PAGES.filter(p=>p.startsWith('en/')&&!SYSTEM.test(p)))+
    g('صفحات النظام (تُبنى أجزاء كبيرة منها تلقائياً)',PAGES.filter(p=>SYSTEM.test(p)))+
    '<optgroup label="صفحات الخدمات"><option disabled>تُدار من لوحة الإدارة ← الخدمات والأسعار</option></optgroup>'}
async function start(){$('#login').hidden=true;$('#app').hidden=false;
  try{await loadPages()}catch(e){status(esc(errText(e)),'bad');return}
  const want=new URLSearchParams(location.search).get('page');
  const p=PAGES.includes(want)?want:'index.html';$('#page').value=p;openPage(p);welcome()}
$('#page').onchange=async()=>{const p=$('#page').value;if(dirty&&!(await ask('تعديلات غير منشورة','في هذه الصفحة تعديلات لم تُنشر بعد. هل تريد تركها والانتقال؟ (تبقى محفوظة كمسودة على هذا الجهاز)','الانتقال'))){$('#page').value=cur.path;return}openPage(p)};

const HOLD='text/x-cms-hold';
// تجهيز نسخة المعاينة: السكربتات لا تعمل، وسياسة أمان الصفحة معطلة داخل المعاينة فقط، والأسئلة الشائعة مفتوحة
function prep(html,path){const d=new DOMParser().parseFromString(html,'text/html');
  const base=d.createElement('base');base.href=new URL(path,SITE).href;base.setAttribute('data-cms-x','');d.head.prepend(base);
  d.querySelectorAll('script').forEach(s=>{s.setAttribute('data-cms-type',s.hasAttribute('type')?s.getAttribute('type'):'__none__');s.setAttribute('type',HOLD)});
  d.querySelectorAll('meta[http-equiv]').forEach(m=>m.setAttribute('http-equiv','x-cms-'+m.getAttribute('http-equiv')));
  d.querySelectorAll('details:not([open])').forEach(x=>{x.setAttribute('open','');x.setAttribute('data-cms-open','')});
  return '<!doctype html>\n'+d.documentElement.outerHTML}
const EDIT_CSS=`
[data-cms-hov]{outline:2px dashed #c9a24d!important;outline-offset:2px;cursor:pointer}
[data-cms-sel]{outline:3px solid #2f855a!important;outline-offset:2px;box-shadow:0 0 0 6px rgba(47,133,90,.15)!important}
[contenteditable="true"]{outline:3px solid #c9a24d!important;outline-offset:3px;background:rgba(201,162,77,.08)!important;cursor:text!important}
[data-cms-hidden][hidden]{display:block!important;opacity:.38;outline:2px dashed #b4372f;outline-offset:2px}
li[data-cms-hidden][hidden]{display:list-item!important}
div[id]:empty,ul[id]:empty,ol[id]:empty,tbody[id]:empty{min-height:34px;border:1px dashed rgba(127,127,127,.45);border-radius:8px}
div[id]:empty::before,ul[id]:empty::before,ol[id]:empty::before{content:"⚙ يُعبَّأ تلقائياً عند عرض الموقع";display:block;padding:6px 10px;font-size:13px;opacity:.65}
img[data-cms-ph]{min-height:140px;background:repeating-linear-gradient(45deg,#eef2f0,#eef2f0 10px,#e2e8e5 10px,#e2e8e5 20px)}
html{scroll-behavior:auto!important}*{animation-duration:0s!important;transition:none!important}`;

async function openPage(path,override){
  $('#loading').hidden=false;status('');finishEdit(true);doc=null;
  try{
    let f=await getFile(path);if(!f)throw Object.assign(new Error('الصفحة غير موجودة'),{status:0});
    cur={path,sha:f.sha,original:f.text,lang:/^en\//.test(path)||/<html[^>]*lang="en"/i.test(f.text)?'en':'ar'};
    let html=f.text,draft=null;
    if(override!=null)html=override;
    else{try{draft=JSON.parse(localStorage.getItem('basira_cms_draft:'+path)||'null')}catch(e){}
      if(draft&&draft.html&&draft.html!==f.text){
        if(draft.sha===f.sha&&await ask('مسودة غير منشورة',`لديك تعديلات محفوظة على هذا الجهاز لم تُنشر بعد (آخر تعديل ${esc(doha(draft.at))}). هل تريد استكمالها؟`,'استكمال المسودة'))html=draft.html;
        else if(draft.sha!==f.sha)dropDraft()}}
    undoS=[];redoS=[];pending.clear();uploaded=new Map();
    await loadFrame(prep(html,path));
    setDirty(html!==f.text);
    history.replaceState(null,'','?page='+encodeURIComponent(path));
    $('#liveLink').href=SITE+path;
    select(null);
  }catch(e){status(esc(errText(e)),'bad')}
  finally{$('#loading').hidden=true;updUndo()}}
function loadFrame(srcdoc){return new Promise(res=>{const fr=$('#frame');fr.onload=()=>{doc=fr.contentDocument;wire();res()};fr.srcdoc=srcdoc})}
function wire(){const st=doc.createElement('style');st.setAttribute('data-cms-x','');st.textContent=EDIT_CSS;doc.head.append(st);
  let hov=null;
  doc.addEventListener('mouseover',e=>{const t=pick(e.target);if(hov&&hov!==t)hov.removeAttribute('data-cms-hov');if(t&&t!==editing&&!(editing&&editing.contains(t))){t.setAttribute('data-cms-hov','');hov=t}});
  doc.addEventListener('mouseout',e=>{if(hov&&!hov.contains(e.relatedTarget)){hov.removeAttribute('data-cms-hov');hov=null}});
  doc.addEventListener('click',e=>{if(editing&&editing.contains(e.target))return;e.preventDefault();e.stopPropagation();if(editing)finishEdit();select(pick(e.target))},true);
  doc.addEventListener('dblclick',e=>{const t=pick(e.target);if(t&&canText(t)){e.preventDefault();select(t);startEdit()}},true);
  doc.addEventListener('submit',e=>e.preventDefault(),true);
  doc.addEventListener('keydown',e=>{if(!editing)return;
    if(e.key==='Escape'){e.preventDefault();finishEdit()}
    else if(e.key===' '&&editing.closest('summary,button,a')){e.preventDefault();doc.execCommand('insertText',false,' ')}
    else if(e.key==='Enter'){e.preventDefault();if(!/^(H[1-6]|SUMMARY|A|BUTTON|B|STRONG|SPAN|LABEL|TH|TD|DT)$/.test(editing.tagName))doc.execCommand('insertLineBreak')}},true);
  doc.addEventListener('paste',e=>{if(!editing)return;e.preventDefault();doc.execCommand('insertText',false,(e.clipboardData||{getData:()=>''}).getData('text/plain'))},true);
  doc.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();e.shiftKey?doRedo():doUndo()}});}

// ---------------- التحديد ----------------
const INLINE=/^(B|STRONG|I|EM|SPAN|SMALL|U|BR|MARK|SUB|SUP|ABBR|TIME|BDI|BDO|Q|CITE|CODE|S|DEL|INS|WBR)$/;
function pick(t){if(!t)return null;if(t.nodeType!==1)t=t.parentElement;if(!t||t===doc.documentElement)return null;
  const s=t.closest('svg');if(s)t=s;
  while(t&&INLINE.test(t.tagName)&&t.parentElement&&!/^(BODY|MAIN)$/.test(t.parentElement.tagName))t=t.parentElement;
  return t===doc.body?null:t}
const BLOCKS='p,div,section,article,aside,header,footer,nav,main,ul,ol,li,h1,h2,h3,h4,h5,h6,table,details,figure,form,blockquote,dl,dialog';
function canText(el){return !!el&&!el.matches('svg,img,input,select,textarea,iframe,video,audio,hr,br,script,style')&&el.textContent.trim()!==''&&!el.querySelector(BLOCKS)}
const KIND=el=>{const t=el.tagName;
  if(t==='IMG')return 'صورة';if(t==='SVG'||t==='svg')return 'رسم أو أيقونة';if(t==='A')return el.classList.contains('btn')?'زر':'رابط';
  if(t==='H1')return 'العنوان الرئيسي';if(/^H[2-6]$/.test(t))return 'عنوان';if(t==='P')return 'فقرة';if(t==='SECTION')return 'قسم';
  if(t==='UL'||t==='OL')return 'قائمة';if(t==='LI')return 'بند';if(t==='DETAILS')return 'سؤال وجواب';if(t==='SUMMARY')return 'السؤال';
  if(t==='HEADER')return 'رأس الصفحة';if(t==='FOOTER')return 'تذييل الصفحة';if(t==='NAV')return 'قائمة روابط';if(t==='FIGURE')return 'صورة مع تعليق';
  if(t==='TABLE')return 'جدول';if(t==='TR')return 'صف جدول';if(t==='TD'||t==='TH')return 'خانة جدول';if(t==='BUTTON')return 'زر';if(t==='FORM')return 'نموذج';
  if(t==='MAIN')return 'المحتوى الرئيسي';return 'جزء'};
const label=el=>{const k=KIND(el);let s=(el.matches('section,div,main,article,details,ul,ol')?(el.querySelector('h1,h2,h3,summary')||{}).textContent:el.textContent)||el.getAttribute('alt')||el.id||'';
  s=String(s).replace(/\s+/g,' ').trim();return k+(s?': '+(s.length>34?s.slice(0,34)+'…':s):'')};
function select(el){if(sel)sel.removeAttribute('data-cms-sel');sel=el&&el.isConnected?el:null;if(sel){sel.setAttribute('data-cms-sel','');sel.removeAttribute('data-cms-hov')}render()}
const prevEl=el=>{let p=el.previousElementSibling;while(p&&p.hasAttribute('data-cms-x'))p=p.previousElementSibling;return p};
const nextEl=el=>{let n=el.nextElementSibling;while(n&&n.hasAttribute('data-cms-x'))n=n.nextElementSibling;return n};

// ---------------- اللوحة الجانبية ----------------
function welcome(){if(sel)return;$('#pbody').innerHTML=`<div class="welcome"><h2>${esc(cur?pageName(cur.path):'')}</h2>
  <p class="hint">اضغط على أي نص أو صورة أو قسم في المعاينة لتحديده، ثم اختر ما تريد من هنا.</p>
  <ol><li><b>تعديل نص:</b> اضغط مرتين على النص، أو حدده ثم «تعديل النص».</li><li><b>صورة:</b> حدد الصورة ثم «استبدال الصورة».</li>
  <li><b>إضافة:</b> حدد عنصراً ثم اختر من «إضافة بعده»، أو «قسم جديد».</li><li><b>ترتيب وحذف:</b> الأسهم ⬆ ⬇ و«تكرار» و«حذف» و«إخفاء».</li>
  <li><b>نشر:</b> اضغط «حفظ ونشر» فتظهر التعديلات على الموقع خلال دقيقة تقريباً.</li></ol>
  <div class="row"><button class="btn sm" type="button" data-act="sections">ترتيب أقسام الصفحة</button><button class="btn sm" type="button" data-act="meta">عنوان الصفحة ووصفها</button></div></div>`}
function render(){const P=$('#pbody');if(!doc)return;if(!sel){welcome();return}
  const el=sel,tag=el.tagName,anc=[];let a=el;while(a&&a!==doc.body&&anc.length<6){anc.unshift(a);a=a.parentElement}
  const link=el.closest('a'),isImg=tag==='IMG',img=isImg?el:(el.matches('figure,picture,a')?el.querySelector('img'):null);
  const hidden=el.hasAttribute('hidden');
  let h=`<h2>${esc(KIND(el))}</h2><div class="crumbs" aria-label="موقع العنصر">${anc.map((x,i)=>`<button type="button" data-anc="${i}" class="${x===el?'cur':''}" title="${esc(label(x))}">${esc(KIND(x))}</button>`).join('')}</div>`;
  if(canText(el))h+=`<button class="btn pri wide" type="button" data-act="edit" style="margin-top:0">✎ تعديل النص</button>`;
  else if(!img)h+=`<p class="hint">لتعديل نص هنا اضغط على النص نفسه داخل هذا الجزء.</p>`;
  h+=`<div class="acts">
    <button class="btn" type="button" data-act="up" ${prevEl(el)?'':'disabled'}>⬆ لأعلى</button>
    <button class="btn" type="button" data-act="down" ${nextEl(el)?'':'disabled'}>⬇ لأسفل</button>
    <button class="btn" type="button" data-act="dup">⧉ تكرار</button>
    <button class="btn" type="button" data-act="hide">${hidden?'👁 إظهار':'🚫 إخفاء'}</button>
    <button class="btn danger" type="button" data-act="del">🗑 حذف</button>
    <button class="btn" type="button" data-act="parent" ${el.parentElement&&el.parentElement!==doc.body?'':'disabled'}>↥ الجزء الأكبر</button></div>`;
  if(hidden)h+=`<p class="hint">هذا العنصر مخفي عن زوار الموقع ويظهر هنا باهتاً فقط.</p>`;
  if(img)h+=`<div class="box"><label>الصورة</label><img class="imgprev" src="${esc(img.src||img.currentSrc)}" alt="">
    <div class="row"><button class="btn sm pri" type="button" data-act="img">استبدال الصورة</button></div>
    <label for="pAlt">وصف الصورة (يقرؤه محرك البحث وقارئ الشاشة)</label><input id="pAlt" value="${esc(img.getAttribute('alt')||'')}" maxlength="200">
    <p class="hint">PNG أو JPEG أو WebP أو SVG. تُصغَّر الصورة تلقائياً لتبقى سريعة التحميل.</p></div>`;
  if(link)h+=`<div class="box"><label for="pHref">عنوان الرابط</label><input id="pHref" dir="ltr" value="${esc(link.getAttribute('href')||'')}" placeholder="https://… أو about.html أو #request">
    <label class="chk"><input type="checkbox" id="pBlank" ${link.target==='_blank'?'checked':''}> يفتح في نافذة جديدة</label>
    ${link.classList.contains('btn')?'':`<p class="hint">رابط داخل صفحة (${esc(KIND(link))}).</p>`}</div>`;
  h+=`<h3>إضافة</h3><div class="where"><label><input type="radio" name="where" value="after" checked> بعد العنصر المحدد</label><label><input type="radio" name="where" value="inside" ${el.matches('img,svg,hr,br,input')?'disabled':''}> داخله في آخره</label></div>
    <div class="addgrid">${Object.entries(TPL_NAMES).map(([k,t])=>`<button class="btn" type="button" data-add="${k}">${t}</button>`).join('')}</div>
    <p class="hint">«قسم» يضاف قسماً كاملاً بعد القسم الحالي في الصفحة.</p>
    <details class="adv"><summary>تحرير متقدم (HTML)</summary><textarea id="pHtml" spellcheck="false"></textarea><div class="row"><button class="btn sm" type="button" data-act="html">تطبيق</button></div></details>`;
  P.innerHTML=h;
  P.querySelectorAll('[data-anc]').forEach(b=>b.onclick=()=>select(anc[+b.dataset.anc]));
  const alt=$('#pAlt');if(alt){alt.onfocus=snap;alt.oninput=()=>{img.setAttribute('alt',alt.value);setDirty(true)}}
  const hr=$('#pHref');if(hr){hr.onfocus=snap;hr.onchange=()=>{const v=hr.value.trim();if(/^\s*javascript:/i.test(v)){toast('هذا الرابط غير مسموح.');return}link.setAttribute('href',v);setDirty(true)};
    $('#pBlank').onchange=e=>{snap();if(e.target.checked){link.target='_blank';link.rel='noopener'}else{link.removeAttribute('target');link.removeAttribute('rel')}setDirty(true)}}
  const ph=$('#pHtml');if(ph){ph.value=cleanNode(el).outerHTML}
  P.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add,(P.querySelector('input[name=where]:checked')||{}).value||'after'))}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||b.closest('#menu'))return;act(b.dataset.act)});

// ---------------- العمليات ----------------
function snapshot(){return {h:doc.head.innerHTML,b:doc.body.innerHTML,sel:sel?path(sel):null}}
function path(el){const p=[];while(el&&el!==doc.body){p.unshift([...el.parentElement.children].indexOf(el));el=el.parentElement}return p}
function byPath(p){let el=doc.body;for(const i of p){el=el&&el.children[i];}return el||null}
function snap(){undoS.push(snapshot());if(undoS.length>60)undoS.shift();redoS=[];updUndo()}
function restore(s){if(doc.head.innerHTML!==s.h)doc.head.innerHTML=s.h;doc.body.innerHTML=s.b;sel=null;select(s.sel?byPath(s.sel):null)}
function doUndo(){if(editing)finishEdit();const s=undoS.pop();if(!s)return;redoS.push(snapshot());restore(s);setDirty(true);updUndo()}
function doRedo(){const s=redoS.pop();if(!s)return;undoS.push(snapshot());restore(s);setDirty(true);updUndo()}
function updUndo(){$('#undo').disabled=!undoS.length;$('#redo').disabled=!redoS.length}
$('#undo').onclick=doUndo;$('#redo').onclick=doRedo;
function setDirty(v){dirty=v;$('#save').disabled=!v;$('#save').textContent=v?'حفظ ونشر •':'حفظ ونشر';if(v)saveDraft()}
let draftT;function saveDraft(){clearTimeout(draftT);draftT=setTimeout(()=>{if(!cur||!dirty)return;try{const html=serialize(false);if(html.length<2e6)localStorage.setItem('basira_cms_draft:'+cur.path,JSON.stringify({sha:cur.sha,html,at:Date.now()}))}catch(e){}},600)}
function dropDraft(){try{localStorage.removeItem('basira_cms_draft:'+cur.path)}catch(e){}}
function uniqIds(n){[n,...n.querySelectorAll('[id]')].forEach(x=>{if(x.id){let i=2,b=x.id.replace(/-\d+$/,'');while(doc.getElementById(b+'-'+i))i++;x.id=b+'-'+i}})}

function startEdit(){if(!sel||!canText(sel))return;finishEdit();snap();editing=sel;editStart=sel.innerHTML;sel.setAttribute('contenteditable','true');sel.focus();
  const r=doc.createRange();r.selectNodeContents(sel);r.collapse(false);const s=doc.getSelection();s.removeAllRanges();s.addRange(r);$('#etb').hidden=false}
function finishEdit(silent){if(!editing)return;const el=editing;editing=null;el.removeAttribute('contenteditable');$('#etb').hidden=true;
  el.querySelectorAll('[style=""]').forEach(x=>x.removeAttribute('style'));
  if(el.innerHTML===editStart){undoS.pop();updUndo()}else if(!silent)setDirty(true);
  if(!silent)render()}
$('#etb').addEventListener('mousedown',e=>e.preventDefault());
$('#etb').onclick=async e=>{const b=e.target.closest('button');if(!b||!editing)return;const c=b.dataset.cmd;
  if(c==='done')return finishEdit();
  if(c==='link'){const s=doc.getSelection(),r=s.rangeCount?s.getRangeAt(0).cloneRange():null;if(!r||r.collapsed){toast('حدد الكلمات التي تريد تحويلها إلى رابط أولاً.');return}
    let url='';const v=await modal('إضافة رابط','<label for="lnk">عنوان الرابط</label><input id="lnk" dir="ltr" placeholder="https://… أو about.html أو #request">',[{v:'cancel',t:'إلغاء'},{v:'ok',t:'إضافة',cls:'pri',check:()=>{url=$('#lnk').value.trim();return !url||/^\s*javascript:/i.test(url)?'اكتب رابطاً صحيحاً.':''}}],d=>setTimeout(()=>d.querySelector('#lnk').focus(),30));
    if(v!=='ok')return;editing.focus();s.removeAllRanges();s.addRange(r);doc.execCommand('createLink',false,url);return}
  doc.execCommand(c,false,null)};

async function act(a){$('#menu').hidden=true;$('#menuBtn').setAttribute('aria-expanded','false');
  if(a==='sections')return sections();if(a==='meta')return meta();if(a==='history')return hist();if(a==='replace')return replaceAll();
  if(a==='newpage')return newPage();if(a==='delpage')return delPage();if(a==='help'){select(null);return}
  if(a==='logout'){if(dirty&&!(await ask('تسجيل الخروج','لديك تعديلات غير منشورة (تبقى مسودة على هذا الجهاز). هل تريد الخروج؟','خروج')))return;keep('');location.replace('admin.html');return}
  const el=sel;if(!el)return;
  if(a==='edit')return startEdit();
  if(a==='parent')return select(el.parentElement);
  if(a==='img')return pickImage(el.tagName==='IMG'?el:el.querySelector('img'));
  if(a==='html'){const v=$('#pHtml').value;const t=doc.createElement('template');t.innerHTML=v;
    t.content.querySelectorAll('script,iframe,object,embed').forEach(x=>x.remove());t.content.querySelectorAll('*').forEach(x=>[...x.attributes].forEach(at=>{if(/^on/i.test(at.name)||/^\s*javascript:/i.test(at.value))x.removeAttribute(at.name)}));
    const nodes=[...t.content.childNodes];if(!t.content.firstElementChild){toast('لا يوجد عنصر صالح في النص.');return}
    snap();const first=t.content.firstElementChild;el.replaceWith(...nodes);setDirty(true);select(first);toast('طُبّق التعديل.');return}
  snap();
  if(a==='up'){const p=prevEl(el);if(p)p.before(el)}
  else if(a==='down'){const n=nextEl(el);if(n)n.after(el)}
  else if(a==='dup'){const c=el.cloneNode(true);c.removeAttribute('data-cms-sel');uniqIds(c);el.after(c);select(c);setDirty(true);toast('أُضيفت نسخة بعد العنصر، عدّلها كما تريد.');return}
  else if(a==='hide'){if(el.hasAttribute('hidden')){el.removeAttribute('hidden');el.removeAttribute('data-cms-hidden')}else{el.setAttribute('hidden','');el.setAttribute('data-cms-hidden','')}}
  else if(a==='del'){const big=el.matches('section,main>*,header,footer,nav,table')||el.textContent.length>240;
    if(big&&!(await ask('حذف '+KIND(el),`سيُحذف «${esc(label(el))}» بكل ما فيه. يمكنك التراجع قبل النشر، أو الاستعادة من سجل التعديلات بعده.`,'حذف','danger fill'))){undoS.pop();updUndo();return}
    const up=el.parentElement;el.remove();setDirty(true);select(up&&up!==doc.body?up:null);return}
  setDirty(true);render();el.scrollIntoView({block:'nearest'})}

// ---------------- القوالب ----------------
const TPL_NAMES={p:'فقرة',h2:'عنوان',h3:'عنوان فرعي',btn:'زر',ul:'قائمة نقاط',img:'صورة',faq:'سؤال وجواب',sec:'قسم: عنوان ونص',split:'قسم: صورة ونص',cards:'قسم: بطاقات'};
const PH='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#e6efe9"/><text x="400" y="235" font-family="Tajawal,Arial" font-size="34" text-anchor="middle" fill="#2f855a">اضغط «استبدال الصورة»</text></svg>');
function tpl(k){const en=cur.lang==='en',T=(a,e)=>en?e:a;
  const img=`<img src="${PH}" alt="" data-cms-ph="" loading="lazy">`;
  const inner={sec:`<h2>${T('عنوان القسم','Section title')}</h2><p class="lead">${T('اكتب هنا نص القسم. اضغط مرتين على أي نص لتعديله.','Write the section text here. Double-click any text to edit it.')}</p>`,
    split:`<div class="cms-split"><div><h2>${T('عنوان القسم','Section title')}</h2><p>${T('نص يشرح الصورة أو الخدمة.','Text that explains the picture or the service.')}</p><p class="cms-cta"><a class="btn pri" href="${en?'index.html':''}#request">${T('اطلب خدمة','Request a service')}</a></p></div><figure class="cms-fig">${img}</figure></div>`,
    cards:`<h2>${T('عنوان القسم','Section title')}</h2><div class="cms-cards">${[1,2,3].map(i=>`<div class="cms-card"><h3>${T('بطاقة '+i,'Card '+i)}</h3><p>${T('وصف قصير للبطاقة.','A short description.')}</p></div>`).join('')}</div>`};
  if(inner[k]){const root=contentRoot(),full=root.tagName==='MAIN'&&root.querySelector(':scope > section.sec');
    return {section:true,html:full?`<section class="sec cms-sec"><div class="wrap">${inner[k]}</div></section>`:`<section class="cms-block">${inner[k]}</section>`}}
  return {html:{p:`<p>${T('فقرة جديدة. اضغط مرتين لتعديل النص.','New paragraph. Double-click to edit.')}</p>`,h2:`<h2>${T('عنوان جديد','New heading')}</h2>`,h3:`<h3>${T('عنوان فرعي','Sub-heading')}</h3>`,
    btn:`<p class="cms-cta"><a class="btn pri" href="${en?'index.html':''}#request">${T('اطلب خدمة','Request a service')}</a></p>`,ul:`<ul><li>${T('البند الأول','First point')}</li><li>${T('البند الثاني','Second point')}</li></ul>`,
    img:`<figure class="cms-fig">${img}<figcaption>${T('تعليق على الصورة (اختياري)','Caption (optional)')}</figcaption></figure>`,
    faq:`<details open data-cms-open=""><summary>${T('سؤال جديد؟','New question?')}</summary><p>${T('الجواب.','The answer.')}</p></details>`}[k]}}
function contentRoot(){let m=doc.querySelector('main')||doc.body;while(m.children.length===1&&/^(DIV|ARTICLE)$/.test(m.firstElementChild.tagName))m=m.firstElementChild;return m}
function ensureBlocksCss(){if(doc.querySelector('link[href*="cms-blocks.css"]'))return;const l=doc.createElement('link');l.rel='stylesheet';
  l.href='../'.repeat(cur.path.split('/').length-1)+'assets/cms-blocks.css?v=20261125a';const after=doc.querySelector('link[rel=stylesheet][href*="style.css"]');after?after.after(l):doc.head.append(l)}
function add(k,where){const t=tpl(k),tm=doc.createElement('template');tm.innerHTML=t.html;const n=tm.content.firstElementChild;snap();
  if(/cms-/.test(t.html))ensureBlocksCss();
  if(t.section){const root=contentRoot();let anchor=sel;while(anchor&&anchor.parentElement!==root)anchor=anchor.parentElement;
    if(anchor)anchor.after(n);else root.append(n)}
  else if(!sel)contentRoot().append(n);
  else if(where==='inside')sel.append(n);else sel.after(n);
  setDirty(true);select(n);n.scrollIntoView({block:'center'});
  if(n.querySelector('img[data-cms-ph]'))pickImage(n.querySelector('img[data-cms-ph]'));else toast('أُضيف '+TPL_NAMES[k]+'. اضغط مرتين على النص لتعديله.')}

// ---------------- الصور ----------------
let imgTarget=null;
function pickImage(img){if(!img)return;imgTarget=img;$('#imgFile').value='';$('#imgFile').click()}
$('#imgFile').onchange=async()=>{const f=$('#imgFile').files[0];if(!f||!imgTarget)return;
  try{const r=await processImage(f);snap();const id='i'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    const d=new Date(),name=`${d.toISOString().slice(0,10)}-${id}.${r.ext}`;pending.set(id,{name,b64:r.b64});
    const img=imgTarget;img.src=r.url;img.removeAttribute('srcset');img.removeAttribute('sizes');img.removeAttribute('data-cms-ph');img.setAttribute('data-cms-up',id);
    if(r.w&&r.h){img.setAttribute('width',r.w);img.setAttribute('height',r.h)}
    const pic=img.closest('picture');if(pic)pic.querySelectorAll('source').forEach(s=>s.remove());
    if(!img.getAttribute('alt')){const a=f.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').trim();if(a&&!/^(img|image|dsc|photo|screenshot|whatsapp)/i.test(a))img.setAttribute('alt',a)}
    setDirty(true);select(img);toast('تم تجهيز الصورة ('+Math.round(r.size/1024)+' ك.ب). تُرفع مع «حفظ ونشر».')}
  catch(e){toast(e.message||'تعذر قراءة الصورة.',5000)}};
function processImage(f){return new Promise((res,rej)=>{
  if(f.size>15*1024*1024)return rej(new Error('حجم الصورة كبير جداً (أكثر من 15 ميغابايت).'));
  const rd=new FileReader();rd.onerror=()=>rej(new Error('تعذر قراءة الملف.'));
  if(/svg|gif/.test(f.type)){if(f.size>1.5*1024*1024)return rej(new Error('ملفات SVG وGIF حتى 1.5 ميغابايت.'));
    rd.onload=()=>{const url=rd.result;res({url,b64:url.split(',')[1],ext:/svg/.test(f.type)?'svg':'gif',size:f.size})};return rd.readAsDataURL(f)}
  if(!/^image\/(png|jpeg|webp)$/.test(f.type))return rej(new Error('نوع الملف غير مدعوم. استخدم PNG أو JPEG أو WebP أو SVG.'));
  rd.onload=()=>{const im=new Image();im.onerror=()=>rej(new Error('تعذر فتح الصورة.'));im.onload=()=>{
    const MAX=1600,s=Math.min(1,MAX/Math.max(im.naturalWidth,im.naturalHeight)),w=Math.round(im.naturalWidth*s),h=Math.round(im.naturalHeight*s);
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(im,0,0,w,h);
    let url=c.toDataURL('image/webp',.84),ext='webp';if(!url.startsWith('data:image/webp')){url=c.toDataURL('image/jpeg',.86);ext='jpg'}
    const b64=url.split(',')[1],size=Math.round(b64.length*3/4);if(size>3*1024*1024)return rej(new Error('الصورة كبيرة حتى بعد التصغير.'));
    res({url,b64,ext,size,w,h})};im.src=rd.result};rd.readAsDataURL(f)})}

// ---------------- الحفظ ----------------
function cleanNode(node){const n=node.cloneNode(true);const all=[n,...n.querySelectorAll('*')];
  n.querySelectorAll&&n.querySelectorAll('[data-cms-x]').forEach(x=>x.remove());
  all.forEach(x=>{if(!x.getAttribute)return;['data-cms-sel','data-cms-hov','contenteditable'].forEach(a=>x.removeAttribute(a));if(x.getAttribute('style')==='')x.removeAttribute('style');
    if(x.hasAttribute('data-cms-type')){const t=x.getAttribute('data-cms-type');t==='__none__'?x.removeAttribute('type'):x.setAttribute('type',t);x.removeAttribute('data-cms-type')}
    if(x.tagName==='META'&&/^x-cms-/.test(x.getAttribute('http-equiv')||''))x.setAttribute('http-equiv',x.getAttribute('http-equiv').slice(6));
    if(x.hasAttribute('data-cms-open')){x.removeAttribute('open');x.removeAttribute('data-cms-open')}});
  return n}
function serialize(real=true,map=uploaded){const root=cleanNode(doc.documentElement);
  root.querySelectorAll('img[data-cms-up]').forEach(i=>{const p=map.get(i.getAttribute('data-cms-up'));if(p&&real){i.setAttribute('src',p);i.removeAttribute('data-cms-up')}});
  if(cur.s0==null)cur.s0=build(cleanNode(new DOMParser().parseFromString(prep(cur.original,cur.path),'text/html').documentElement));
  return patch(cur.original,cur.s0,build(root))}
// يعيد سطور الملف الأصلية كما هي، ولا يكتب إلا السطور التي تغيّرت فعلاً
function patch(o,s0,s1){if(s1===s0)return o;const O=o.split('\n'),A=s0.split('\n'),Bv=s1.split('\n');if(O.length!==A.length)return s1;
  let p=0;while(p<A.length&&p<Bv.length&&A[p]===Bv[p])p++;
  let q=0;while(q<A.length-p&&q<Bv.length-p&&A[A.length-1-q]===Bv[Bv.length-1-q])q++;
  const a=A.slice(p,A.length-q),b=Bv.slice(p,Bv.length-q),n=a.length,m=b.length,mid=[];
  if(n*m>4e6)mid.push(...b);else{const L=Array.from({length:n+1},()=>new Uint16Array(m+1));
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i][j]=a[i]===b[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
    let i=0,j=0;while(i<n&&j<m){if(a[i]===b[j]){mid.push(O[p+i]);i++;j++}else if(L[i+1][j]>=L[i][j+1])i++;else{mid.push(b[j]);j++}}while(j<m)mid.push(b[j++])}
  return [...O.slice(0,p),...mid,...O.slice(O.length-q)].join('\n')}
function build(root){const o=cur.original,dt=(o.match(/^\s*<!doctype[^>]*>/i)||['<!doctype html>'])[0].trim();
  const gap=(re,def)=>{const m=o.match(re);return m?m[1]:def};
  AMP=/="[^"<>]*&amp;/.test(o);const hd=root.querySelector('head'),bd=root.querySelector('body');
  return dt+gap(/^\s*<!doctype[^>]*>(\s*)</i,'\n')+startTag(root)+'>'+gap(/<html[^>]*>(\s*)<head/i,'\n')+ser(hd)+gap(/<\/head>(\s*)<body/i,'\n')+ser(bd).replace(/\s*<\/body>$/,gap(/(\s*)<\/body>/i,'\n')+'</body>')+gap(/<\/body>(\s*)<\/html>/i,'\n')+'</html>'+(/\n$/.test(o)?'\n':'')}
// كتابة HTML بأسلوب ملفات الموقع نفسها (خصائص منطقية دون ="" و& كما هي في الروابط) حتى لا يتغير في الملف إلا ما عُدّل فعلاً
const VOID=/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/,RAW=/^(script|style|xmp|iframe|noembed|noframes|plaintext|noscript)$/;
const escT=s=>s.replace(/&/g,'&amp;').replace(/\u00a0/g,'&nbsp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let AMP=false;const escA=s=>s.replace(AMP?/&/g:/&(?=[a-zA-Z][a-zA-Z0-9]*;|#[0-9]+;|#x[0-9a-fA-F]+;)/g,'&amp;').replace(/\u00a0/g,'&nbsp;').replace(/"/g,'&quot;');
function startTag(el){let s='<'+el.localName;for(const a of el.attributes)s+=' '+a.name+(a.value===''&&a.name!=='alt'&&a.name!=='value'&&a.name!=='content'&&a.name!=='href'&&a.name!=='src'?'':'="'+escA(a.value)+'"');return s}
function ser(el){const foreign=el.namespaceURI&&el.namespaceURI!=='http://www.w3.org/1999/xhtml',n=el.localName;
  if(foreign&&!el.childNodes.length)return startTag(el)+'/>';
  let s=startTag(el)+'>';if(!foreign&&VOID.test(n))return s;
  const kids=n==='template'&&el.content?el.content.childNodes:el.childNodes;
  for(const c of kids){if(c.nodeType===1)s+=ser(c);else if(c.nodeType===3)s+=(!foreign&&RAW.test(n))?c.data:escT(c.data);else if(c.nodeType===8)s+='<!--'+c.data+'-->'}
  return s+'</'+n+'>'}
$('#save').onclick=()=>save();
async function save(note){if(!cur)return;finishEdit();
  if(doc.querySelector('img[data-cms-ph]')){select(doc.querySelector('img[data-cms-ph]'));toast('أضف صورة للعنصر الجديد (استبدال الصورة) أو احذفه قبل النشر.',5000);return}
  const map=new Map(uploaded),files=[],pre='../'.repeat(cur.path.split('/').length-1);
  doc.querySelectorAll('img[data-cms-up]').forEach(i=>{const id=i.getAttribute('data-cms-up');if(map.has(id))return;const p=pending.get(id);if(!p)return;
    files.push({path:'assets/uploads/'+p.name,b64:p.b64});map.set(id,pre+'assets/uploads/'+p.name)});
  const html=serialize(true,map);
  if(html===cur.original&&!files.length){setDirty(false);toast('لا توجد تعديلات جديدة للنشر.');return}
  if(doc.querySelector('img[data-cms-up]')&&!files.length&&[...doc.querySelectorAll('img[data-cms-up]')].some(i=>!map.has(i.getAttribute('data-cms-up')))){toast('صورة لم تكتمل، أعد اختيارها.');return}
  files.push({path:cur.path,b64:b64enc(html)});
  const msg=(note||'إدارة المحتوى: تحديث «'+pageName(cur.path)+'»')+(files.length>1?` (${files.length-1} صورة جديدة)`:'')+(USER?`\n\nمن لوحة إدارة المحتوى بواسطة ${USER.login}`:'');
  $('#save').disabled=true;$('#save').textContent='جارٍ النشر…';status('جارٍ حفظ التعديلات في الموقع…');
  try{const r=await commit(files,msg,[{path:cur.path,sha:cur.sha}]);
    uploaded=map;cur.sha=r.shas[cur.path];cur.original=html;dropDraft();setDirty(false);
    verifyLive(cur.path,html,r.commit)}
  catch(e){status(esc(errText(e)),'bad');setDirty(true)}}
let liveRun=0;
async function verifyLive(path,html,c,what){const run=++liveRun,url=SITE+path,t0=Date.now(),norm=s=>String(s).replace(/\r\n/g,'\n').trim();
  const cl=c&&c.html_url?` · <a href="${esc(c.html_url)}" target="_blank" rel="noopener">تفاصيل الإيداع</a>`:'';
  status(`✓ حُفظ «${esc(what||pageName(path))}». جارٍ نشره على الموقع، عادة خلال دقيقة… <span class="mute">(يمكنك متابعة العمل)</span>`+cl);
  while(Date.now()-t0<6*60e3){await sleep(7000);if(run!==liveRun)return;
    try{const r=await fetch(url+(url.includes('?')?'&':'?')+'cms='+Date.now(),{cache:'no-store'});const t=r.ok?await r.text():null;
      if(html==null?r.status===404:t!=null&&norm(t)===norm(html)){const s=Math.round((Date.now()-t0)/1000);
        status(html==null?`✓ حُذفت الصفحة من الموقع.`+cl:`✓ التعديلات ظاهرة الآن على الموقع (بعد ${s} ثانية). <a href="${esc(url)}" target="_blank" rel="noopener">افتح الصفحة ↗</a>`+cl,'ok');return}}catch(e){}}
  if(run===liveRun)status(`حُفظت التعديلات في المستودع، والنشر يأخذ وقتاً أطول من المعتاد. <a href="${esc(url)}" target="_blank" rel="noopener">افتح الصفحة ↗</a> بعد دقائق.`+cl)}

// ---------------- ترتيب الأقسام ----------------
function sections(){finishEdit();select(null);const root=contentRoot();const list=[...root.children].filter(x=>!x.hasAttribute('data-cms-x')&&!/^(SCRIPT|STYLE|TEMPLATE|DIALOG)$/.test(x.tagName));
  $('#pbody').innerHTML=`<h2>ترتيب أقسام الصفحة</h2><p class="hint">رتّب الأقسام بالأسهم، أو أخفِها مؤقتاً، أو كررها، أو احذفها. اضغط اسم القسم للذهاب إليه.</p>
  <ul class="seclist">${list.map((x,i)=>`<li class="${x.hidden?'off':''}"><span class="nm" data-go="${i}" title="${esc(label(x))}">${esc(label(x))}${x.hidden?' <small>(مخفي)</small>':''}</span>
   <button class="btn xs" type="button" data-s="up" data-i="${i}" ${i?'':'disabled'} aria-label="لأعلى">⬆</button><button class="btn xs" type="button" data-s="down" data-i="${i}" ${i<list.length-1?'':'disabled'} aria-label="لأسفل">⬇</button>
   <button class="btn xs" type="button" data-s="hide" data-i="${i}" aria-label="${x.hidden?'إظهار':'إخفاء'}">${x.hidden?'👁':'🚫'}</button><button class="btn xs" type="button" data-s="dup" data-i="${i}" aria-label="تكرار">⧉</button><button class="btn xs danger" type="button" data-s="del" data-i="${i}" aria-label="حذف">🗑</button></li>`).join('')}</ul>
  <h3>قسم جديد في آخر الصفحة</h3><div class="addgrid">${['sec','split','cards'].map(k=>`<button class="btn" type="button" data-ns="${k}">${TPL_NAMES[k]}</button>`).join('')}</div>`;
  const P=$('#pbody');
  P.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{const x=list[+b.dataset.go];x.scrollIntoView({block:'start'});select(x)});
  P.querySelectorAll('[data-ns]').forEach(b=>b.onclick=()=>{sel=null;const last=list[list.length-1];if(last)select(last);add(b.dataset.ns,'after')});
  P.querySelectorAll('[data-s]').forEach(b=>b.onclick=async()=>{const x=list[+b.dataset.i],s=b.dataset.s;
    if(s==='del'){if(!(await ask('حذف قسم',`سيُحذف «${esc(label(x))}» بكل ما فيه.`,'حذف','danger fill')))return;snap();x.remove()}
    else{snap();if(s==='up')x.previousElementSibling.before(x);else if(s==='down')x.nextElementSibling.after(x);
      else if(s==='hide'){if(x.hidden){x.hidden=false;x.removeAttribute('data-cms-hidden')}else{x.hidden=true;x.setAttribute('data-cms-hidden','')}}
      else if(s==='dup'){const c=x.cloneNode(true);uniqIds(c);x.after(c)}}
    setDirty(true);sections()})}

// ---------------- عنوان الصفحة ووصفها ----------------
async function meta(){finishEdit();const t=doc.querySelector('title'),d=doc.querySelector('meta[name="description"]');
  const v=await modal('عنوان الصفحة ووصفها',`<p class="hint">يظهران في نتائج البحث وعند مشاركة الرابط.</p>
    <label for="mT">عنوان الصفحة</label><input id="mT" maxlength="90" value="${esc(t?t.textContent:'')}">
    <label for="mD">وصف الصفحة</label><textarea id="mD" maxlength="300" rows="3">${esc(d?d.getAttribute('content'):'')}</textarea>`,
    [{v:'cancel',t:'إلغاء'},{v:'ok',t:'تطبيق',cls:'pri',check:()=>$('#mT').value.trim()?'':'اكتب عنوان الصفحة.'}]);
  if(v!=='ok')return;const T=$('#mT').value.trim(),D=$('#mD').value.trim(),T0=t?t.textContent.trim():'',D0=d?(d.getAttribute('content')||'').trim():'';if(T===T0&&D===D0)return;snap();
  let tt=t;if(!tt){tt=doc.createElement('title');doc.head.append(tt)}tt.textContent=T;
  let dd=d;if(!dd){dd=doc.createElement('meta');dd.name='description';doc.head.append(dd)}dd.setAttribute('content',D);
  const ogt=doc.querySelector('meta[property="og:title"]'),ogd=doc.querySelector('meta[property="og:description"]');
  if(ogt&&T!==T0)ogt.setAttribute('content',T.replace(/\s*\|\s*[^|]*$/,'')||T);if(ogd&&D!==D0)ogd.setAttribute('content',D);
  setDirty(true);toast('طُبّق العنوان والوصف. اضغط «حفظ ونشر».')}

// ---------------- السجل والاستعادة ----------------
async function hist(){finishEdit();select(null);const P=$('#pbody');P.innerHTML='<h2>سجل التعديلات</h2><p class="hint">جارٍ التحميل…</p>';
  try{const list=await gh(`${RP}/commits?path=${encodeURIComponent(cur.path)}&sha=${B}&per_page=20`);
    P.innerHTML=`<h2>سجل التعديلات</h2><p class="hint">كل حفظ يُسجَّل هنا. «استعادة» تفتح تلك النسخة في المحرر، فإن أعجبتك اضغط «حفظ ونشر».</p>
    <ul class="hist">${list.map((c,i)=>`<li><div class="w"><b>${esc(c.commit.message.split('\n')[0])}</b><small dir="ltr">${esc(doha(c.commit.committer.date))}</small> <small>· ${esc((c.author&&c.author.login)||c.commit.author.name)}</small></div>${i?`<button class="btn xs" type="button" data-rv="${c.sha}">استعادة</button>`:'<small>الحالية</small>'}</li>`).join('')}</ul>`;
    P.querySelectorAll('[data-rv]').forEach(b=>b.onclick=async()=>{const c=list.find(x=>x.sha===b.dataset.rv);
      if(!(await ask('استعادة نسخة سابقة',`تُفتح نسخة ${esc(doha(c.commit.committer.date))} في المحرر. لن يتغير الموقع حتى تضغط «حفظ ونشر».`,'فتح النسخة')))return;
      const f=await getFile(cur.path,c.sha);if(!f){toast('الصفحة لم تكن موجودة في تلك النسخة.');return}
      await openPage(cur.path,f.text);setDirty(true);toast('هذه نسخة '+doha(c.commit.committer.date)+'. اضغط «حفظ ونشر» لاعتمادها.',6000)})}
  catch(e){P.innerHTML=`<h2>سجل التعديلات</h2><p class="err">${esc(errText(e))}</p>`}}

// ---------------- بحث واستبدال في كل الصفحات ----------------
function replaceText(html,find,rep){let n=0;const F=esc(find),Rp=esc(rep);
  const out=html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>)/i).map((seg,i)=>{if(i%2)return seg;
    const c=seg.split(F).length-1;if(!c)return seg;n+=c;return seg.split(F).join(Rp)}).join('');return {out,n}}
async function replaceAll(){if(dirty&&!(await ask('تعديلات غير منشورة','انشر تعديلات هذه الصفحة أو تراجع عنها قبل البحث والاستبدال في كل الصفحات.','متابعة دون نشر')))return;
  let found=[];const v=await modal('بحث واستبدال في كل الصفحات',`<p class="hint">يغيّر النص الظاهر فقط (لا يمس الروابط والشيفرة) في كل صفحات الموقع، مثل تغيير اسم أو عبارة في كل مكان. صفحات الخدمات تُدار من لوحة الخدمات.</p>
    <label for="rF">النص الحالي</label><input id="rF" maxlength="200"><label for="rR">النص الجديد</label><input id="rR" maxlength="200">
    <label for="rS">النطاق</label><select id="rS"><option value="all">كل الصفحات</option><option value="ar">الصفحات العربية</option><option value="en">الصفحات الإنجليزية</option></select>
    <div id="rOut"></div>`,[{v:'cancel',t:'إغلاق'},{v:'find',t:'معاينة',check:async()=>{const f=$('#rF').value;if(f.trim().length<2)return 'اكتب نصاً من حرفين على الأقل.';
      $('#rOut').innerHTML='<p class="hint">جارٍ البحث في الصفحات…</p>';const sc=$('#rS').value;found=[];
      const list=PAGES.filter(p=>sc==='all'||(sc==='en')===p.startsWith('en/'));
      for(let i=0;i<list.length;i+=6)await Promise.all(list.slice(i,i+6).map(async p=>{const fl=await getFile(p);if(!fl)return;const r=replaceText(fl.text,f,$('#rR').value);if(r.n)found.push({p,n:r.n,sha:fl.sha,out:r.out})}));
      $('#rOut').innerHTML=found.length?`<p><b>${found.reduce((a,x)=>a+x.n,0)}</b> موضعاً في <b>${found.length}</b> صفحة:</p><ul class="replist">${found.map(x=>`<li>${esc(pageName(x.p))} (${x.n})</li>`).join('')}</ul><p class="hint">اضغط «استبدال ونشر» للتنفيذ.</p>`:'<p class="hint">لم يُعثر على هذا النص.</p>';
      $('#dlgA').querySelector('[value=go]').disabled=!found.length;return 'x'}},{v:'go',t:'استبدال ونشر',cls:'pri',check:()=>found.length?'':'اضغط «معاينة» أولاً.'}],
    d=>{d.querySelector('[value=go]').disabled=true;setTimeout(()=>$('#rF').focus(),30)});
  $('#dlgErr').textContent='';
  if(v!=='go'||!found.length)return;
  status('جارٍ الاستبدال والنشر في '+found.length+' صفحة…');
  try{const r=await commit(found.map(x=>({path:x.p,b64:b64enc(x.out)})),`إدارة المحتوى: استبدال «${$('#rF').value}» بـ«${$('#rR').value}» في ${found.length} صفحة`+(USER?`\n\nبواسطة ${USER.login}`:''),found.map(x=>({path:x.p,sha:x.sha})));
    const mine=found.find(x=>x.p===cur.path);if(mine){dropDraft();await openPage(cur.path)}
    const first=mine||found[0];verifyLive(first.p,first.out,r.commit,`الاستبدال في ${found.length} صفحة`)}
  catch(e){status(esc(errText(e)),'bad')}}

// ---------------- صفحة جديدة وحذف صفحة ----------------
async function newPage(){if(dirty&&!(await ask('تعديلات غير منشورة','في هذه الصفحة تعديلات لم تُنشر. هل تريد المتابعة؟ (تبقى مسودة على هذا الجهاز)','متابعة')))return;
  let slug='',lang='ar',title='';
  const v=await modal('إنشاء صفحة جديدة',`<label for="nL">لغة الصفحة</label><select id="nL"><option value="ar">العربية</option><option value="en">English</option></select>
    <label for="nT">عنوان الصفحة</label><input id="nT" maxlength="80" placeholder="مثال: خدمات الشركات الناشئة">
    <label for="nS">اسم الملف في الرابط (حروف إنجليزية صغيرة وأرقام وشرطة)</label><input id="nS" dir="ltr" maxlength="50" placeholder="startups">
    <p class="hint">تُنشأ الصفحة بنفس رأس الموقع وتذييله وتصميمه، ثم تضيف إليها الأقسام كما تريد.</p>`,
    [{v:'cancel',t:'إلغاء'},{v:'ok',t:'إنشاء',cls:'pri',check:()=>{lang=$('#nL').value;title=$('#nT').value.trim();slug=$('#nS').value.trim().toLowerCase().replace(/\.html$/,'');
      if(!title)return 'اكتب عنوان الصفحة.';if(!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug))return 'اسم الملف: حروف إنجليزية صغيرة وأرقام وشرطة فقط.';
      const p=(lang==='en'?'en/':'')+slug+'.html';if(PAGES.includes(p)||/^(admin|index|crm|portal|login)$/.test(slug))return 'يوجد ملف بهذا الاسم، اختر اسماً آخر.';return ''}}]);
  if(v!=='ok')return;
  const path=(lang==='en'?'en/':'')+slug+'.html',srcP=(lang==='en'?'en/':'')+'privacy.html';
  status('جارٍ إنشاء الصفحة…');
  try{const src=await getFile(srcP);const d=new DOMParser().parseFromString(src.text,'text/html');
    const brand=lang==='en'?'Basira for Transactions':'بصيرة للمعاملات';
    d.title=title+' | '+brand;const md=d.querySelector('meta[name=description]');if(md)md.setAttribute('content',title);
    d.querySelectorAll('meta[property="og:title"]').forEach(m=>m.setAttribute('content',title));d.querySelectorAll('meta[property="og:description"]').forEach(m=>m.setAttribute('content',title));
    d.querySelectorAll('link[rel=canonical],meta[property="og:url"]').forEach(x=>{const a=x.hasAttribute('href')?'href':'content';x.setAttribute(a,x.getAttribute(a).replace(/privacy\.html/,slug+'.html'))});
    d.querySelectorAll('link[rel=alternate][hreflang]').forEach(x=>x.remove());
    d.querySelectorAll('script[type="application/ld+json"]').forEach(x=>x.remove());
    const main=d.querySelector('main');
    const L=(a,e)=>lang==='en'?e:a;
    main.innerHTML=`<div class="wrap doc"><h1>${esc(title)}</h1><p class="lead">${L('اكتب هنا مقدمة الصفحة. اضغط مرتين على أي نص لتعديله، وأضف الأقسام من اللوحة الجانبية.','Write the page introduction here. Double-click any text to edit it, and add sections from the side panel.')}</p></div>`;
    const html=(src.text.match(/^\s*<!doctype[^>]*>/i)||['<!doctype html>'])[0].trim()+'\n'+d.documentElement.outerHTML+'\n';
    const abs=(src.text.match(/<link rel="canonical" href="([^"]*?)privacy\.html"/)||[])[1];
    const files=[{path,b64:b64enc(html)}];
    if(abs)files.push({path:'sitemap.xml',edit:t=>t&&!t.includes(abs+slug+'.html<')?t.replace('</urlset>',`  <url><loc>${abs}${slug}.html</loc></url>\n</urlset>`):null});
    await commit(files,`إدارة المحتوى: صفحة جديدة «${title}»`+(USER?`\n\nبواسطة ${USER.login}`:''),[{path,sha:null}]);
    PAGES.push(path);await loadPages();$('#page').value=path;await openPage(path);
    verifyLive(path,html,null,'الصفحة الجديدة');toast('أُنشئت الصفحة. أضف محتواها ثم «حفظ ونشر». ولربطها من صفحة أخرى أضف زراً أو رابطاً إليها: '+slug+'.html',7000)}
  catch(e){status(esc(errText(e)),'bad')}}
async function delPage(){if(CORE.test(cur.path)){toast('هذه صفحة أساسية في الموقع ولا يمكن حذفها. يمكنك حذف أقسامها أو إخفاؤها.',5000);return}
  const name=cur.path.split('/').pop();
  const v=await modal('حذف الصفحة',`<p>ستُحذف صفحة «${esc(pageName(cur.path))}» من الموقع وتزول من خريطة الموقع. يمكن استعادتها لاحقاً من سجل المستودع.</p><label for="dC">للتأكيد اكتب اسم الملف: <b dir="ltr">${esc(name)}</b></label><input id="dC" dir="ltr">`,
    [{v:'cancel',t:'إلغاء'},{v:'ok',t:'حذف الصفحة',cls:'danger fill',check:()=>$('#dC').value.trim()===name?'':'اكتب اسم الملف كما هو.'}]);
  if(v!=='ok')return;const path=cur.path;
  try{const abs=(cur.original.match(/<link rel="canonical" href="([^"]*)"/)||[])[1];
    const files=[{path,del:true}];if(abs)files.push({path:'sitemap.xml',edit:t=>{if(!t||!t.includes(abs))return null;return t.replace(new RegExp('\\s*<url><loc>'+abs.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'</loc>[\\s\\S]*?</url>'),'')}});
    const r=await commit(files,`إدارة المحتوى: حذف صفحة «${pageName(path)}»`+(USER?`\n\nبواسطة ${USER.login}`:''),[{path,sha:cur.sha}]);
    dropDraft();setDirty(false);await loadPages();$('#page').value='index.html';await openPage('index.html');verifyLive(path,null,r.commit,pageName(path))}
  catch(e){status(esc(errText(e)),'bad')}}

// ---------------- أشرطة الواجهة ----------------
$('#menuBtn').onclick=e=>{const m=$('#menu');m.hidden=!m.hidden;$('#menuBtn').setAttribute('aria-expanded',String(!m.hidden));e.stopPropagation()};
$('#menu').onclick=e=>{const b=e.target.closest('[data-act]');if(b)act(b.dataset.act);else if(e.target.closest('a')){$('#menu').hidden=true}};
document.addEventListener('click',e=>{if(!e.target.closest('#menu,#menuBtn'))$('#menu').hidden=true});
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b));$('#stage').classList.toggle('mobile',!!b.dataset.w)});
$('#grip').onclick=()=>{const p=$('#panel');p.classList.contains('max')?(p.classList.remove('max'),p.classList.add('min')):p.classList.contains('min')?p.classList.remove('min'):p.classList.add('max')};
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(dirty)save()}});
window.BASIRA_CMS={serialize:()=>serialize(),get doc(){return doc},get cur(){return cur},select:el=>select(el),act,add,replaceText};
boot();
})();

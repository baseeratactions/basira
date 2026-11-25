'use strict';
// Admin: site content (الإعدادات ← محتوى الموقع). Lists every public page in both languages with the number of changes on
// it and a button that opens it in the visual editor (assets/content-edit.js); adds, edits and deletes custom pages
// (p.html?id=…); and lists the published versions so any earlier one can be restored, or everything reset to the original.
// Saved through the admin-only actions contentSave, contentHistory, contentRestore and contentReset; read through 'content'.
(function(){
const EN=window.CRM_LANG==='en',L=(a,e)=>EN?e:a;
const tabs=document.getElementById('tabs'),anchor=document.getElementById('tabTheme');if(!tabs||!anchor)return;
const btn=document.createElement('button');btn.type='button';btn.dataset.tab='content';btn.id='tabContent';btn.hidden=true;btn.dataset.g=anchor.dataset.g||'set';btn.setAttribute('data-notr','');btn.textContent=L('محتوى الموقع','Site content');
(document.getElementById('tabSite')||anchor).after(btn);
new MutationObserver(()=>{btn.hidden=anchor.hidden;if(!btn.hidden&&location.hash==='#content'&&!opened){opened=true;setTimeout(()=>typeof go==='function'&&go('content'),0)}}).observe(anchor,{attributes:true,attributeFilter:['hidden']});
let opened=false;btn.hidden=anchor.hidden;
const e=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PAGES=[['index.html','الصفحة الرئيسية','Home page'],['about.html','تعرّف إلى بصيرة','About Basira'],['restaurants.html','للمطاعم','For restaurants'],['management.html','الإدارة والإشراف','Management & supervision'],
  ['renewals.html','التجديدات','Renewals'],['partners.html','الشركاء','Partners'],['articles.html','المقالات','Articles'],['article-management.html','مقال: الإدارة','Article: management'],
  ['article-menu-prices.html','مقال: أسعار القوائم','Article: menu prices'],['article-renewals.html','مقال: التجديدات','Article: renewals'],['article-restaurant-licence.html','مقال: رخصة المطعم','Article: restaurant licence'],
  ['standards.html','المعايير','Standards'],['legal.html','المستندات القانونية','Legal documents'],['privacy.html','سياسة الخصوصية','Privacy policy']];
const v=document.createElement('section');v.id='v-content';v.className='view';v.hidden=true;v.setAttribute('data-notr','');
v.innerHTML=`<div class="bar"><h2>${L('محتوى الموقع','Site content')}</h2><span class="sp"></span><a class="btn sm ghost" href="index.html" target="_blank" rel="noopener">${L('عرض الموقع ↗','View the site ↗')}</a></div>
<p class="mute sm">${L('اختر صفحة واضغط «تحرير» لتعديل نصوصها وصورها وروابطها، أو حذف أي جزء أو إضافة مثله، أو سحب الأقسام لتغيير ترتيبها، أو إضافة أقسام جديدة. لا يظهر شيء للزوار قبل «حفظ ونشر» داخل المحرر.','Pick a page and press Edit to change its texts, pictures and links, delete or duplicate any part, drag sections into a new order, or add new sections. Nothing reaches visitors before “Save and publish” in the editor.')}</p>
<p class="err" id="ctErr" role="alert"></p>
<div class="panel"><div class="bar"><h3>${L('صفحات الموقع','Site pages')}</h3><span class="sp"></span><label class="sm">${L('اللغة','Language')} <select id="ctLang"><option value="">${L('العربية','Arabic')}</option><option value="en/">English</option></select></label></div>
<div class="ct-grid" id="ctPages"></div></div>
<div class="panel"><div class="bar"><h3>${L('صفحات إضافية','Extra pages')}</h3><span class="sp"></span><button type="button" class="btn sm pri" id="ctNew">${L('＋ صفحة جديدة','＋ New page')}</button></div>
<p class="mute sm">${L('صفحات تنشئها من الصفر بالأقسام الجاهزة، ويمكن إظهار روابطها أسفل كل صفحات الموقع.','Pages you build from scratch with ready-made sections; their links can appear at the bottom of every page.')}</p>
<form id="ctNF" class="ct-new" hidden novalidate>
 <label>${L('عنوان الصفحة','Page title')}<input name="title" maxlength="120" required></label>
 <label>${L('رابط الصفحة (حروف إنجليزية صغيرة وأرقام وشرطة)','Page address (small English letters, digits and dashes)')}<input name="slug" dir="ltr" maxlength="60" pattern="[a-z0-9-]{2,60}" placeholder="our-team" required></label>
 <label>${L('اللغة','Language')}<select name="lang"><option value="">${L('العربية','Arabic')}</option><option value="en/">English</option></select></label>
 <label class="chk"><input type="checkbox" name="menu" checked> ${L('إظهار رابطها أسفل صفحات الموقع','Show its link at the bottom of the site pages')}</label>
 <div class="bar"><button class="btn sm pri" type="submit">${L('إنشاء وفتح المحرر','Create and open the editor')}</button><button class="btn sm ghost" type="button" id="ctNC">${L('إلغاء','Cancel')}</button></div>
</form>
<div id="ctCustom"></div></div>
<div class="panel"><div class="bar"><h3>${L('النسخ المنشورة','Published versions')}</h3><span class="sp"></span><button type="button" class="btn sm ghost" id="ctReset">${L('العودة إلى المحتوى الأصلي','Back to the original content')}</button></div>
<p class="mute sm">${L('كل «حفظ ونشر» يحفظ نسخة كاملة. يمكنك استرجاع أي نسخة من آخر 15 نسخة.','Each “Save and publish” keeps a full version. You can restore any of the last 15.')}</p>
<div id="ctHist" class="mute sm">…</div></div>`;
(document.getElementById('v-site')||document.getElementById('v-theme')||document.querySelector('.view:last-of-type')).after(v);
const st=document.createElement('style');st.textContent=`.ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.ct-card{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--surface)}
.ct-card b{font-size:15px}.ct-card .ct-meta{color:var(--mute);font-size:13px}.ct-card .bar{gap:6px;flex-wrap:wrap}
.ct-badge{align-self:flex-start;display:inline-block;font-size:12px;border-radius:999px;padding:1px 9px;background:var(--chip,rgba(0,0,0,.06))}
.ct-new{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;align-items:end;margin:8px 0 14px}
.ct-new label{display:flex;flex-direction:column;gap:4px;font-weight:700;font-size:14px}.ct-new label.chk{flex-direction:row;align-items:center;font-weight:400}
.ct-hist{width:100%;border-collapse:collapse}.ct-hist td,.ct-hist th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:start;font-size:14px}
@media (max-width:640px){.ct-hist .ct-h-by{display:none}.ct-hist td,.ct-hist th{font-size:13px;padding:6px 4px}}`;document.head.append(st);
const $=id=>document.getElementById(id);let DATA=null,VER='',busy=false;
const api=(a,b)=>S.api(a,b||{});
const err=m=>{$('ctErr').textContent=m||''};
const msg=x=>({unknown_action:L('الخادم لم يُحدَّث بعد لميزة إدارة المحتوى. حدّث كود الخادم (Content.gs) ثم أعد النشر.','The server has not been updated for content management yet.'),conflict:L('عُدّل المحتوى من جهاز آخر الآن. أعد المحاولة.','The content was just changed on another device. Try again.'),
  not_found:L('لم يُعثر على النسخة.','Version not found.')}[x]||(typeof errText==='function'?errText(x):x));
async function fetchData(){const j=await (await fetch(CFG.API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'content'})})).json();
  if(!j.ok)throw new Error(j.error||'error');VER=j.ver||'';DATA=j.data||{v:1,pages:{},menu:[]};DATA.pages=DATA.pages||{};
  try{localStorage.setItem('basira_content',JSON.stringify({ver:VER,data:DATA,at:Date.now()}))}catch(x){}}
const edit=k=>{const m=/^(en\/)?p\/(.+)$/.exec(k);return m?(m[1]||'')+'p.html?id='+encodeURIComponent(m[2])+'&edit=1':k+'?edit=1'};
const view=k=>{const m=/^(en\/)?p\/(.+)$/.exec(k);return m?(m[1]||'')+'p.html?id='+encodeURIComponent(m[2]):k};
const count=k=>((DATA&&DATA.pages[k]||{}).ops||[]).length;
const nWord=n=>n?L(n===1?'تعديل واحد':n===2?'تعديلان':n<=10?n+' تعديلات':n+' تعديلاً',n+' change'+(n>1?'s':'')):L('بلا تعديلات','No changes');
function renderPages(){const lg=$('ctLang').value;
  $('ctPages').innerHTML=PAGES.map(([f,a,en])=>{const k=lg+f,n=count(k);
    return `<div class="ct-card"><b>${e(lg?en:a)}</b><span class="ct-meta" dir="ltr">${e(k)}</span><span class="ct-badge">${e(nWord(n))}</span>
    <div class="bar"><a class="btn sm pri" href="${e(edit(k))}">${L('تحرير','Edit')}</a><a class="btn sm ghost" href="${e(view(k))}" target="_blank" rel="noopener">${L('عرض','View')}</a></div></div>`}).join('')}
function renderCustom(){const ks=Object.keys(DATA.pages).filter(k=>/^(en\/)?p\//.test(k)).sort((a,b)=>(+DATA.pages[a].sort||0)-(+DATA.pages[b].sort||0));
  $('ctCustom').innerHTML=ks.length?`<div class="ct-grid">${ks.map(k=>{const P=DATA.pages[k],adds=(P.ops||[]).filter(o=>o.o==='add').length,url=new URL(view(k),location.href).href;
    return `<div class="ct-card"><b>${e(P.title||k)}</b><span class="ct-meta">${k.startsWith('en/')?'English':L('العربية','Arabic')} · ${adds} ${L('قسم','sections')} · ${P.menu?L('رابطها ظاهر أسفل الصفحات','Linked in the footer'):L('رابطها غير ظاهر','Not linked')}</span>
    <span class="ct-meta" dir="ltr">${e(url)}</span>
    <div class="bar"><a class="btn sm pri" href="${e(edit(k))}">${L('تحرير','Edit')}</a><a class="btn sm ghost" href="${e(view(k))}" target="_blank" rel="noopener">${L('عرض','View')}</a>
    <button type="button" class="btn sm ghost" data-copy="${e(url)}">${L('نسخ الرابط','Copy link')}</button><button type="button" class="btn sm ghost" data-del="${e(k)}">${L('حذف','Delete')}</button></div></div>`}).join('')}</div>`
    :`<p class="mute sm">${L('لا صفحات إضافية بعد.','No extra pages yet.')}</p>`;
  $('ctCustom').querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy).then(()=>toast(L('نُسخ الرابط.','Link copied.')))});
  $('ctCustom').querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent=L('تأكيد الحذف','Confirm delete');return}
    const out=JSON.parse(JSON.stringify(DATA));delete out.pages[b.dataset.del];await save(out,L('حذف صفحة: ','Delete page: ')+(DATA.pages[b.dataset.del].title||''),L('حُذفت الصفحة.','The page was deleted.'))})}
async function save(out,note,done){if(busy)return;busy=true;err();
  try{const j=await api('contentSave',{data:out,base:VER,note});VER=j.ver;DATA=j.data;try{localStorage.setItem('basira_content',JSON.stringify({ver:VER,data:DATA,at:Date.now()}))}catch(x){}
    toast(done||L('حُفظ.','Saved.'));renderPages();renderCustom();hist();return true}
  catch(x){err(L('تعذر الحفظ: ','Could not save: ')+msg(x.message));if(x.message==='conflict')load();return false}finally{busy=false}}
async function hist(){try{const j=await api('contentHistory');const R=j.rows||[];
  $('ctHist').innerHTML=R.length?`<div style="overflow-x:auto"><table class="ct-hist"><thead><tr><th>${L('التاريخ','Date')}</th><th class="ct-h-by">${L('بواسطة','By')}</th><th>${L('الملاحظة','Note')}</th><th></th></tr></thead><tbody>${R.map(r=>`<tr><td dir="ltr">${e(r.at)}</td><td class="ct-h-by">${e(r.by)}</td><td>${e(r.note)}</td><td>${r.ver===j.ver?`<span class="ct-badge">${L('الحالية','Current')}</span>`:`<button type="button" class="btn sm ghost" data-ver="${e(r.ver)}">${L('استرجاع','Restore')}</button>`}</td></tr>`).join('')}</tbody></table></div>`
    :L('لا نسخ منشورة بعد.','No published versions yet.');
  $('ctHist').querySelectorAll('[data-ver]').forEach(b=>b.onclick=async()=>{if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent=L('تأكيد الاسترجاع','Confirm restore');return}
    try{const r=await api('contentRestore',{ver:b.dataset.ver});VER=r.ver;DATA=r.data;try{localStorage.setItem('basira_content',JSON.stringify({ver:VER,data:DATA,at:Date.now()}))}catch(x){}toast(L('استُرجعت النسخة ونُشرت.','The version was restored and published.'));renderPages();renderCustom();hist()}catch(x){err(msg(x.message))}})}
  catch(x){$('ctHist').textContent=msg(x.message)}}
async function load(){err();if(typeof REMOTE!=='undefined'&&!REMOTE||!CFG.API){err(L('تعمل إدارة المحتوى مع خادم المكتب فقط.','Content management needs the office server.'));return}
  try{await fetchData()}catch(x){err(msg(x.message));DATA={v:1,pages:{},menu:[]}}renderPages();renderCustom();hist()}
$('ctLang').onchange=renderPages;
$('ctNew').onclick=()=>{$('ctNF').hidden=false;$('ctNF').elements.title.focus()};$('ctNC').onclick=()=>{$('ctNF').hidden=true};
$('ctNF').elements.title.oninput=ev=>{const s=$('ctNF').elements.slug;if(s.dataset.touched)return;const t=ev.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');s.value=t.length>=2?t.slice(0,60):''};
$('ctNF').elements.slug.oninput=ev=>{ev.target.dataset.touched='1';ev.target.value=ev.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'')};
$('ctNF').onsubmit=async ev=>{ev.preventDefault();const f=ev.target,title=f.elements.title.value.trim().replace(/\s+/g,' '),slug=f.elements.slug.value.trim(),lg=f.elements.lang.value,k=lg+'p/'+slug;
  if(!title)return err(L('اكتب عنوان الصفحة.','Write the page title.'));if(!/^[a-z0-9-]{2,60}$/.test(slug))return err(L('اكتب رابط الصفحة بحروف إنجليزية صغيرة وأرقام وشرطة فقط، مثل our-team.','Write the address with small English letters, digits and dashes, such as our-team.'));
  if(DATA.pages[k])return err(L('توجد صفحة بهذا الرابط. اختر رابطاً آخر.','A page with this address exists. Choose another.'));
  const out=JSON.parse(JSON.stringify(DATA));out.pages[k]={title,menu:f.elements.menu.checked,sort:Object.keys(DATA.pages).filter(x=>/^(en\/)?p\//.test(x)).length+1,ops:[]};
  if(await save(out,L('صفحة جديدة: ','New page: ')+title,L('أُنشئت الصفحة.','The page was created.'))){f.reset();f.hidden=true;location.href=edit(k)}};
$('ctReset').onclick=async()=>{const b=$('ctReset');if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent=L('تأكيد: إلغاء كل التعديلات والصفحات الإضافية','Confirm: remove every change and extra page');return}
  b.dataset.sure='';b.textContent=L('العودة إلى المحتوى الأصلي','Back to the original content');
  try{const r=await api('contentReset');VER=r.ver;DATA=r.data;try{localStorage.setItem('basira_content',JSON.stringify({ver:VER,data:DATA,at:Date.now()}))}catch(x){}toast(L('عاد الموقع إلى محتواه الأصلي. النسخ السابقة ما زالت قابلة للاسترجاع.','The site is back to its original content.'));renderPages();renderCustom();hist()}catch(x){err(msg(x.message))}};
if(typeof VIEWS!=='undefined')VIEWS.content=load;
})();

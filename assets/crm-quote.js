'use strict';
// عروض الأسعار في لوحة الإدارة.
// كل عرض يُصدَر ملف PDF أولاً على ترويسة بصيرة وختمها، ويُحفظ تلقائياً في ملف العميل:
//   ملف العميل (يُنشأ إن لم يكن موجوداً، ويُتعرَّف عليه برقم الجوال) · حسابه في «حسابي» · ملف الـPDF في ملفاته · سجل العرض وحالته · مهمة متابعة.
// ثم يُنزَّل الملف أو يُرسل (واتساب، البريد وحساب العميل، أو مشاركة الملف من الجوال)، ويُعتمد العرض فيتحول إلى معاملات.
// بيانات العرض تُحفظ نصاً مقروءاً في سجل العميل، فيُعاد بناء الملف منها في أي وقت.
(function(){
if(typeof DB==='undefined'||!window.QuotePDF)return;
const Q=window.QuotePDF;
KIND.quote=L('عرض سعر','Quote');
const CONS=new Set();(DATA.CONSULT||[]).forEach(c=>(c.items||[]).forEach(i=>CONS.add(i.c)));
const enName=c=>((D[c]||{}).en||{}).name||(()=>{for(const k of DATA.CONSULT||[])for(const i of k.items||[])if(i.c===c)return (i.en||{}).n||'';return ''})();
const PORTAL=new URL('portal.html',location.href).href.replace(/[?#].*$/,'');
const RX=/BQ-(\d{4})-(\d{4})/;
const ST={issued:L('صادر','Issued'),sent:L('مُرسَل','Sent'),accepted:L('معتمد','Approved'),rejected:L('مرفوض','Declined'),replaced:L('مستبدل بعرض أحدث','Replaced'),expired:L('منتهي الصلاحية','Expired')};
const STC={issued:'st-0',sent:'st-3',accepted:'st-5',rejected:'st-6',replaced:'st-6',expired:'st-4'};
const addDays=(isoD,n)=>{const d=new Date(isoD+'T00:00:00');d.setDate(d.getDate()+(+n||0));const p=x=>String(x).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
const ph8=v=>String(v||'').replace(/\D/g,'').replace(/^974(?=\d{8}$)/,'').slice(-8);

// ---- a quote kept as readable text in the client's log, and read back from it ----
function toText(q){const s=Q.totals(q);
  return [`عرض سعر ${q.no}`,`الإصدار: ${q.issued} · الصلاحية: ${q.validDays} يوماً · اللغة: ${q.lang}`+(q.replaces?` · بدلاً من: ${q.replaces}`:''),...(q.contact?[`المسؤول: ${String(q.contact).replace(/[\r\n]+/g,' ')}`]:[]),'البنود:',
    ...q.lines.map(l=>`- [${l.c||''}] ${String(l.n).replace(/[\r\n]+/g,' ')} × ${+l.q||1} × ${+l.p||0}${l.from?'+':''} = ${fmt((+l.p||0)*(+l.q||1))}`),
    `الرسوم الحكومية التقديرية: ${+q.gov||0}`,`الإجمالي التقديري: ${fmt(s.grand)} ر.ق`,...(q.notes?['ملاحظات:',q.notes]:[])].join('\n')}
function fromLog(l){const b=String(l.body||'');if(!/^عرض سعر BQ-\d{4}-\d{4}\n/.test(b))return null;
  const g=(re,d)=>{const m=re.exec(b);return m?m[1]:d};const lines=[];
  b.split('\n').forEach(x=>{const m=/^- \[([^\]]*)\] (.*) × (\d+(?:\.\d+)?) × (\d+(?:\.\d+)?)(\+)? = /.exec(x);if(m)lines.push({c:m[1],n:m[2],q:+m[3],p:+m[4],from:!!m[5]})});
  const ni=b.indexOf('\nملاحظات:\n');
  return {id:l.id,clientId:l.clientId,no:RX.exec(b)[0],issued:g(/الإصدار: (\d{4}-\d{2}-\d{2})/,dOnly(l.created)),validDays:+g(/الصلاحية: (\d+)/,14),lang:g(/اللغة: (ar|en)/,'ar'),
    replaces:g(/بدلاً من: (BQ-\d{4}-\d{4})/,''),contact:g(/\nالمسؤول: (.*)/,''),lines,gov:+g(/الرسوم الحكومية التقديرية: (\d+(?:\.\d+)?)/,0),notes:ni>=0?b.slice(ni+10):'',created:l.created}}
const quotesOf=clientId=>DB.Log.filter(l=>(!clientId||l.clientId===clientId)).map(fromLog).filter(Boolean).sort((a,b)=>a.no<b.no?1:-1);
const events=no=>DB.Log.filter(l=>!fromLog(l)&&String(l.subject||'').includes(no)).sort((a,b)=>a.created>b.created?1:-1);
function status(q){let s='issued';
  events(q.no).forEach(l=>{const t=String(l.subject);if(/^إرسال عرض السعر/.test(t)&&s==='issued')s='sent';else if(/^اعتماد عرض السعر/.test(t))s='accepted';else if(/^رفض عرض السعر/.test(t))s='rejected';else if(/^استبدال عرض السعر/.test(t))s='replaced'});
  if((s==='issued'||s==='sent')&&addDays(q.issued,q.validDays)<iso())s='expired';return s}
function nextNo(){const y=iso().slice(0,4);let m=0;DB.Log.forEach(l=>{const r=RX.exec(String(l.subject||'')+' '+String(l.body||'').slice(0,40));if(r&&r[1]===y)m=Math.max(m,+r[2])});return `BQ-${y}-${String(m+1).padStart(4,'0')}`}
// the document data for the PDF: the client as on file today, names in the quote's language
function docData(q,c){const en=q.lang==='en';
  return {lang:q.lang,no:q.no,date:dmy(q.issued),validUntil:dmy(addDays(q.issued,q.validDays)),validDays:q.validDays,
    client:{name:q.contact||'',co:c.name||'',phone:c.phone,email:c.email,cr:c.cr},
    lines:q.lines.map(l=>({c:l.c,n:en&&l.c&&enName(l.c)&&l.n===(SVC[l.c]||{}).n?enName(l.c):l.n,q:l.q,p:l.p,from:l.from})),gov:q.gov,notes:q.notes}}
async function logQ(row){try{return await saveRow('Log',Object.assign({kind:'quote',by:ME?ME.username:'CRM'},row))}catch(e){return await saveRow('Log',Object.assign({kind:'note',by:ME?ME.username:'CRM'},row))}}

// ---- the dialog ----
const dlg=document.createElement('dialog');dlg.id='dlgBQ';dlg.className='bqdlg';dlg.setAttribute('aria-labelledby','bqT');
dlg.innerHTML=`<form class="dlg crmform" id="fBQ" method="dialog" novalidate>
  <h3 id="bqT">${L('عرض سعر جديد','New quotation')}</h3>
  <p class="mute sm">${L('يُصدَر العرض ملف PDF على ترويسة بصيرة وختمها، ويُحفظ تلقائياً في ملف العميل وحسابه. إن لم يكن العميل مسجلاً يُفتح له ملف وحساب.','The quotation is issued as a PDF on Basira letterhead with the stamp, and saved to the client file and account. A new client gets a file and an account automatically.')}</p>
  <div id="bqForm">
  <fieldset class="bqset"><legend>${L('العميل','Client')}</legend><div class="g2">
    <label>${L('اسم العميل أو المنشأة','Client or company name')} *<input name="name" maxlength="160" required autocomplete="off"></label>
    <label>${L('الجوال','Mobile')} *<input name="phone" dir="ltr" inputmode="tel" maxlength="16" placeholder="+974 XXXX XXXX" required autocomplete="off"></label>
    <label>${L('البريد الإلكتروني','Email')}<input name="email" type="email" dir="ltr" maxlength="120" autocomplete="off"></label>
    <label>${L('اسم المسؤول (اختياري)','Contact person (optional)')}<input name="contact" maxlength="120" autocomplete="off"></label>
    <label>${L('السجل التجاري (اختياري)','Commercial registration (optional)')}<input name="cr" dir="ltr" maxlength="40" autocomplete="off"></label>
    <p class="sm mute" id="bqWho" aria-live="polite"></p></div></fieldset>
  <fieldset class="bqset"><legend>${L('البنود','Items')}</legend>
    <div class="bqpick"><select id="bqPick" aria-label="${L('أضف خدمة من قائمة الأسعار','Add a service from the price list')}"></select><button class="btn sm ghost" type="button" id="bqFree">${L('بند حر','Custom item')}</button></div>
    <div id="bqLines" class="bqlines"></div>
    <div class="g2"><label>${L('الرسوم الحكومية التقديرية (ر.ق، اختياري)','Estimated government fees (QAR, optional)')}<input name="gov" type="number" min="0" step="0.01" inputmode="decimal"></label>
    <label>${L('مدة الصلاحية (أيام)','Valid for (days)')}<input name="validDays" type="number" min="1" max="180" value="14" inputmode="numeric"></label>
    <label>${L('لغة العرض','Quotation language')}<select name="lang"><option value="ar">العربية</option><option value="en">English</option></select></label>
    <div class="bqsum" id="bqSum" aria-live="polite"></div>
    <label class="full">${L('ملاحظات تظهر في العرض (اختياري)','Notes shown on the quotation (optional)')}<textarea name="notes" rows="2" maxlength="1200"></textarea></label></div>
  </fieldset>
  <details class="bqprev" id="bqPrevD"><summary>${L('معاينة العرض','Preview')}</summary><div class="bqprevbox"><div id="bqPrev"></div></div></details>
  <span class="err" id="bqErr" role="alert"></span>
  <div class="contact"><button class="btn pri" type="submit" value="issue" id="bqGo">${L('إصدار العرض PDF وحفظه في حساب العميل','Issue PDF and save it to the client account')}</button><button class="btn ghost" type="button" id="bqX">${L('إلغاء','Cancel')}</button></div>
  </div>
  <div id="bqDone" hidden></div>
</form>`;
document.body.appendChild(dlg);
const F=$('fBQ'),E=F.elements;let lines=[],ctx={};
// the price list, grouped
(function(){const sel=$('bqPick');sel.innerHTML=`<option value="">${L('أضف خدمة من قائمة الأسعار…','Add a service from the price list…')}</option>`;const by={};CAT.forEach(s=>{(by[s.g]=by[s.g]||[]).push(s)});
  Object.entries(by).forEach(([g,l])=>{const og=document.createElement('optgroup');og.label=g;l.forEach(s=>{const o=document.createElement('option');o.value=s.c;o.textContent=`${s.c} · ${s.n} · ${fmt(s.p)}`;og.appendChild(o)});sel.appendChild(og)})})();
$('bqPick').onchange=e=>{const s=SVC[e.target.value];e.target.value='';if(!s)return;const ex=lines.find(l=>l.c===s.c);if(ex)ex.q++;else lines.push({c:s.c,n:s.n,q:1,p:+s.p||0,from:CONS.has(s.c)});draw()};
$('bqFree').onclick=()=>{lines.push({c:'',n:'',q:1,p:0});draw();const ins=$('bqLines').querySelectorAll('input[data-k="n"]');ins[ins.length-1].focus()};
function draw(){$('bqLines').innerHTML=lines.length?lines.map((l,i)=>`<div class="bqrow">
   <label class="bqn"><span class="sm mute">${l.c?`<span class="code">${esc(l.c)}</span>`:L('بند حر','Custom item')}</span><input data-k="n" data-i="${i}" value="${esc(l.n)}" maxlength="200" aria-label="${L('الخدمة','Service')}"></label>
   <label><span class="sm mute">${L('العدد','Qty')}</span><input data-k="q" data-i="${i}" type="number" min="1" step="1" value="${esc(l.q)}" inputmode="numeric"></label>
   <label><span class="sm mute">${L('سعر الوحدة','Unit price')}${l.from?' ('+L('يبدأ من','from')+')':''}</span><input data-k="p" data-i="${i}" type="number" min="0" step="0.01" value="${esc(l.p)}" inputmode="decimal"></label>
   <b class="num bqt">${fmt((+l.p||0)*(+l.q||1))}</b><button class="btn xs ghost danger" type="button" data-del="${i}" aria-label="${L('حذف البند','Remove item')}">✕</button></div>`).join('')
   :`<p class="mute sm">${L('اختر خدمة من القائمة أو أضف بنداً حراً.','Pick a service from the list or add a custom item.')}</p>`;sum()}
$('bqLines').addEventListener('input',e=>{const x=e.target.closest('[data-k]');if(!x)return;const l=lines[+x.dataset.i];l[x.dataset.k]=x.dataset.k==='n'?x.value:+x.value;
  const r=x.closest('.bqrow');r.querySelector('.bqt').textContent=fmt((+l.p||0)*(+l.q||1));sum()});
$('bqLines').addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b)return;lines.splice(+b.dataset.del,1);draw()});
['gov','validDays','lang','notes','name','contact','email','cr','phone'].forEach(k=>E[k].addEventListener('input',()=>{sum();if(k==='phone')who()}));
function cur(){return {lang:E.lang.value,validDays:Math.min(180,Math.max(1,+E.validDays.value||14)),gov:Math.max(0,+E.gov.value||0),notes:E.notes.value.trim(),
  lines:lines.filter(l=>String(l.n).trim()).map(l=>({c:l.c,n:String(l.n).trim(),q:Math.max(1,Math.round(+l.q||1)),p:Math.max(0,+l.p||0),from:!!l.from}))}}
function formClient(){return {name:E.name.value.trim(),phone:ph8(E.phone.value),email:E.email.value.trim(),contact:E.contact.value.trim(),cr:E.cr.value.trim()}}
function sum(){const q=cur(),s=Q.totals(q);$('bqSum').innerHTML=`<span>${L('أتعاب بصيرة','Basira fees')}: <b class="num">${s.from?L('يبدأ من ','from '):''}${fmt(s.fees)}</b></span>${s.gov?`<span>${L('الرسوم الحكومية','Government fees')}: <b class="num">${fmt(s.gov)}</b></span>`:''}<span>${L('الإجمالي التقديري','Estimated total')}: <b class="num">${fmt(s.grand)} ${L('ر.ق','QAR')}</b></span>`;
  if($('bqPrevD').open)preview()}
function findClient(phone){return phone&&DB.Clients.find(c=>ph8(c.phone)===phone)}
function who(){const p=ph8(E.phone.value),c=p.length===8&&findClient(p);
  $('bqWho').textContent=c?L(`عميل مسجّل: ${c.name} (${c.id}). سيُحفظ العرض في ملفه.`,`Existing client: ${c.name} (${c.id}). The quotation goes to their file.`):p.length===8?L('عميل جديد: سيُفتح له ملف وحساب في بصيرة عند الإصدار.','New client: a file and an account will be opened on issue.'):''}
function preview(){const c=formClient();const q=Object.assign(cur(),{no:ctx.no||nextNo(),issued:iso(),contact:c.contact});
  $('bqPrev').innerHTML=Q.html(docData(q,c));const box=$('bqPrev').parentElement,w=box.clientWidth||600,k=Math.min(1,w/794);
  const doc=$('bqPrev').firstElementChild;doc.style.transform=`scale(${k})`;doc.style.transformOrigin=document.dir==='rtl'?'top right':'top left';$('bqPrev').style.height=Math.ceil(doc.offsetHeight*k)+'px'}
$('bqPrevD').addEventListener('toggle',()=>{if($('bqPrevD').open)preview()});
$('bqX').onclick=()=>dlg.close();
// open: from a client file, a website request, a previous quotation (new version) or empty
function open(o){o=o||{};ctx={clientId:o.clientId||'',replaces:o.replaces||'',reqId:o.reqId||''};F.reset();$('bqErr').textContent='';$('bqDone').hidden=true;$('bqForm').hidden=false;$('bqPrevD').open=false;
  const c=o.clientId?cli(o.clientId):{};E.name.value=c.name||o.name||'';E.phone.value=c.phone||o.phone||'';E.email.value=c.email||o.email||'';E.contact.value=o.contact||'';E.cr.value=c.cr||'';
  lines=(o.lines||(o.codes||[]).filter(x=>SVC[x]).map(x=>({c:x,n:SVC[x].n,q:1,p:+SVC[x].p||0,from:CONS.has(x)}))).map(l=>Object.assign({},l));
  if(o.lang)E.lang.value=o.lang;else E.lang.value=EN?'en':'ar';if(o.gov)E.gov.value=o.gov;if(o.notes)E.notes.value=o.notes;if(o.validDays)E.validDays.value=o.validDays;
  $('bqT').textContent=o.replaces?L(`نسخة جديدة من العرض ${o.replaces}`,`New version of ${o.replaces}`):L('عرض سعر جديد','New quotation');
  draw();who();dlg.showModal()}
window.openQuote=open;

// ---- issue: client file → account → PDF → saved in the client's files → log → follow-up task ----
F.addEventListener('submit',async e=>{e.preventDefault();const err=$('bqErr');err.textContent='';
  const fc=formClient(),q=cur();
  if(!fc.name){err.textContent=L('اكتب اسم العميل.','Enter the client name.');E.name.focus();return}
  if(!/^[3567]\d{7}$/.test(fc.phone)){err.textContent=L('اكتب جوالاً قطرياً من 8 أرقام.','Enter an 8-digit Qatari mobile.');E.phone.focus();return}
  if(fc.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fc.email)){err.textContent=L('البريد الإلكتروني غير صحيح.','The email is not valid.');E.email.focus();return}
  if(!q.lines.length){err.textContent=L('أضف بنداً واحداً على الأقل.','Add at least one item.');return}
  const go=$('bqGo');go.disabled=true;const steps=[];const step=t=>{steps.push(t);$('bqDone').hidden=false;$('bqDone').innerHTML=`<ul class="bqsteps">${steps.map(s=>`<li>✓ ${esc(s)}</li>`).join('')}<li class="mute">…</li></ul>`};
  try{
    // 1. the client file, matched by mobile so a client is never registered twice
    let c=ctx.clientId?cli(ctx.clientId):findClient(fc.phone);let isNew=false;
    if(c&&c.id){const row=Object.assign({},c);let ch=false;['name','email','cr'].forEach(k=>{if(fc[k]&&!row[k]){row[k]=fc[k];ch=true}});if(ch)c=await saveRow('Clients',row);step(L(`ملف العميل ${c.id}`,`Client file ${c.id}`))}
    else{c=await saveRow('Clients',{name:fc.name,phone:fc.phone,email:fc.email,cr:fc.cr,type:fc.cr||fc.contact?'منشأة':'فرد',source:ctx.reqId?'الموقع':'أخرى',notes:(fc.contact?'المسؤول: '+fc.contact+'\n':'')+'فُتح الملف عند إعداد عرض سعر'});isNew=true;
      await saveRow('Log',{clientId:c.id,kind:'status',subject:'إضافة عميل جديد',body:'فُتح الملف تلقائياً عند إعداد عرض سعر',by:ME?ME.username:'CRM'});step(L(`فُتح ملف جديد للعميل ${c.id}`,`New client file ${c.id}`))}
    // 2. the client's account in «حسابي», where the quotation and every later file appear
    let cred=null;const acc=DB.Accounts.find(a=>a.clientId===c.id);
    if(REMOTE&&!acc){const pw=genPw();let un=fc.phone,r=null;
      for(const u of [fc.phone,fc.phone+'b',fc.phone+'c']){if(DB.Accounts.some(a=>a.username===u))continue;try{r=await S.api('clientAccount',{clientId:c.id,username:u,password:pw,status:'مفعّل'});un=(r.row&&r.row.username)||u;break}catch(x){if(!/exists|taken|موجود/i.test(String(x.message)))throw x}}
      if(r){cred={username:un,password:pw};step(L(`فُتح حساب للعميل في «حسابي»: ${un}`,`Client account opened: ${un}`))}}
    else if(acc)step(L(`حساب العميل في «حسابي»: ${acc.username}`,`Client account: ${acc.username}`));
    // 3. the PDF, first
    const no=nextNo(),full=Object.assign({},q,{no,issued:iso(),replaces:ctx.replaces,contact:fc.contact});ctx.no=no;
    const blob=await Q.pdf(docData(full,c));step(L(`أُعدّ ملف PDF للعرض ${no}`,`PDF ready for ${no}`));
    // 4. saved privately in the client's files (Google Drive of the office), visible to the client in their account
    const title=(full.lang==='en'?'Quotation ':'عرض سعر ')+no;
    if(REMOTE){await S.api('upload',{clientId:c.id,txnId:'',title,name:Q.fileName(full),mime:'application/pdf',data:await Q.b64(blob),notify:false});step(L('حُفظ الملف في ملفات العميل وحسابه','PDF saved to the client files and account'))}
    // 5. the quotation record, the replaced version and the follow-up task
    const s=Q.totals(full);
    await logQ({clientId:c.id,subject:`عرض سعر ${no} · ${s.from?'يبدأ من ':''}${fmt(s.grand)} ر.ق`,body:toText(full)});
    if(ctx.replaces)await logQ({clientId:c.id,subject:`استبدال عرض السعر ${ctx.replaces} بالعرض ${no}`,body:''});
    if(ctx.reqId){const r=DB.Requests.find(x=>x.id===ctx.reqId);if(r&&r.status==='جديد'){r.status='تم التواصل';try{await saveRow('Requests',r)}catch(x){}}}
    try{await saveRow('Tasks',{title:`متابعة عرض السعر ${no} مع العميل`,clientId:c.id,txnId:'',due:addDays(iso(),3),priority:'عادية',status:'جديدة',progress:0,assignee:ME?ME.username:'',notes:''});step(L('أُضيفت مهمة متابعة بعد 3 أيام','Follow-up task in 3 days'))}catch(x){}
    step(L('سُجّل العرض في ملف العميل','Quotation recorded in the client file'));
    await reload();
    done(DB.Log.map(fromLog).find(x=>x&&x.no===no)||Object.assign({clientId:c.id},full),blob,cred,isNew);
  }catch(x){err.textContent=L('تعذّر إكمال الإصدار: ','Could not finish: ')+errText(x.message||String(x))+L(' ما حُفظ لن يتكرر عند المحاولة مرة أخرى.',' Trying again will not duplicate what was saved.');$('bqDone').hidden=true}
  finally{go.disabled=false}});

// ---- sending ----
function message(q,cred){const c=cli(q.clientId),en=q.lang==='en',s=Q.totals(q),first=String(c.name||'').split(' ')[0];
  const acc=DB.Accounts.find(a=>a.clientId===q.clientId);
  const login=cred?(en?`\nUsername: ${cred.username}\nPassword: ${cred.password}`:`\nاسم المستخدم: ${cred.username}\nكلمة المرور: ${cred.password}`):acc?(en?`\nUsername: ${acc.username}`:`\nاسم المستخدم: ${acc.username}`):'';
  return en?`Dear ${c.name},\n\nPlease find our quotation ${q.no} from Basira for Transactions, with an estimated total of ${s.from?'from ':''}QAR ${fmt(s.grand)}, valid until ${dmy(addDays(q.issued,q.validDays))}.\n\nThe PDF is saved in your Basira account:\n${PORTAL}${login}\n\nTo approve the quotation, simply reply to this message.\n\nKind regards,\nBasira for Transactions`
    :`السلام عليكم ${first||c.name}،\n\nيسعدنا تقديم عرض السعر رقم ${q.no} من بصيرة للمعاملات، بإجمالي تقديري ${s.from?'يبدأ من ':''}${fmt(s.grand)} ر.ق، وهو صالح حتى ${dmy(addDays(q.issued,q.validDays))}.\n\nملف العرض PDF محفوظ في حسابك لدى بصيرة:\n${PORTAL}${login}\n\nلاعتماد العرض يكفي الرد على هذه الرسالة.\n\nمع التحية،\nفريق بصيرة للمعاملات`}
async function sent(q,via){await logQ({clientId:q.clientId,subject:`إرسال عرض السعر ${q.no} (${via})`,body:''});await reload()}
const blobs={};
async function getBlob(q){if(blobs[q.no])return blobs[q.no];toast(L('جارٍ إعداد ملف PDF…','Preparing the PDF…'));return blobs[q.no]=await Q.pdf(docData(q,cli(q.clientId)))}
async function act(kind,q,cred){const c=cli(q.clientId);
  try{
    if(kind==='pdf'){Q.save(await getBlob(q),Q.fileName(q));return}
    if(kind==='share'){const b=await getBlob(q);await Q.share(b,Q.fileName(q),message(q,cred));await sent(q,L('مشاركة الملف','file shared'));toast(L('سُجّل الإرسال','Sending recorded'));return}
    if(kind==='wa'){const w=window.open('https://wa.me/974'+ph8(c.phone)+'?text='+encodeURIComponent(message(q,cred)),'_blank');if(w)try{w.opener=null}catch(x){}await sent(q,L('واتساب','WhatsApp'));if(!w)toast(L('اسمح للموقع بفتح نافذة جديدة','Allow pop-ups'));return}
    if(kind==='mail'){if(!c.email){toast(L('لا يوجد بريد للعميل. أضفه من «تعديل البيانات».','The client has no email. Add it under Edit.'));return}
      if(!await ask(L(`إرسال العرض ${q.no} إلى ${c.email}؟ تصل الرسالة بالبريد وتظهر في حساب العميل.`,`Send ${q.no} to ${c.email}? It arrives by email and appears in the client account.`),{ok:L('إرسال','Send')}))return;
      if(REMOTE)await S.api('reply',{clientId:c.id,body:message(q,cred),email:true});else await S.mail({to:c.email,subject:(q.lang==='en'?'Quotation ':'عرض سعر ')+q.no,body:message(q,cred),clientId:c.id});
      await sent(q,L('البريد وحساب العميل','email and client account'));toast(L('أُرسل العرض','Quotation sent'));return}
    if(kind==='accept'){if(!await ask(L(`اعتماد العرض ${q.no}؟ تُنشأ معاملة لكل بند بأتعابه.`,`Approve ${q.no}? A transaction is created for each item at its fee.`),{ok:L('اعتماد','Approve')}))return;
      let first=true;for(const l of q.lines){const t=l.c&&SVC[l.c]?newTx(q.clientId,l.c,''):{clientId:q.clientId,code:l.c||'',service:'',status:'بانتظار المستندات',fee:'',govFee:'',paid:'',startDate:iso(),docs:'[]',notes:''};
        t.service=l.n+(l.q>1?` × ${l.q}`:'');t.fee=Math.round(l.p*l.q*100)/100;t.notes=`من عرض السعر ${q.no}`;if(first&&q.gov){t.govFee=q.gov;first=false}await saveRow('Transactions',t)}
      await logQ({clientId:q.clientId,subject:`اعتماد عرض السعر ${q.no}`,body:`أُنشئت ${q.lines.length} معاملة`});toast(L(`اعتُمد العرض وأُنشئت ${q.lines.length} معاملة`,`Approved: ${q.lines.length} transactions created`));await reload();return}
    if(kind==='reject'){if(!await ask(L(`تسجيل أن العميل لم يعتمد العرض ${q.no}؟`,`Record that the client declined ${q.no}?`),{ok:L('تسجيل','Record')}))return;
      await logQ({clientId:q.clientId,subject:`رفض عرض السعر ${q.no}`,body:''});await reload();return}
    if(kind==='copy'){open({clientId:q.clientId,contact:q.contact,lines:q.lines,gov:q.gov,notes:q.notes,lang:q.lang,validDays:q.validDays,replaces:q.no});return}
  }catch(x){if(x&&x.name==='AbortError')return;toast(errText(x.message||String(x)))}}
// after issuing: the result and the ways to send it
function done(q,blob,cred,isNew){blobs[q.no]=blob;$('bqForm').hidden=true;const c=cli(q.clientId),s=Q.totals(q);
  $('bqT').textContent=L(`صدر العرض ${q.no}`,`Quotation ${q.no} issued`);
  $('bqDone').hidden=false;$('bqDone').innerHTML=`<div class="bqok"><b>${esc(c.name)} · ${esc(c.id)}</b><span class="num">${s.from?L('يبدأ من ','from '):''}${fmt(s.grand)} ${L('ر.ق','QAR')} · ${L('صالح حتى','valid until')} <span dir="ltr">${dmy(addDays(q.issued,q.validDays))}</span></span>
    <span>${REMOTE?L('الملف محفوظ في ملفات العميل ويراه في حسابه.','The PDF is saved in the client files and visible in their account.'):L('الوضع المحلي: نزّل الملف واحفظه.','Local mode: download and keep the file.')}${isNew?' '+L('فُتح للعميل ملف جديد.','A new client file was opened.'):''}</span></div>
    ${cred?`<div class="bqcred"><b>${L('بيانات دخول العميل إلى «حسابي» (تظهر هذه المرة فقط، وتُرفق تلقائياً برسالة الإرسال):','Client sign-in for «My account» (shown once, included in the message):')}</b><span dir="ltr">${esc(cred.username)} / ${esc(cred.password)}</span></div>`:''}
    <div class="bqacts"><button class="btn pri" type="button" data-bq="pdf">${L('تنزيل PDF','Download PDF')}</button>${Q.canShare()?`<button class="btn pri" type="button" data-bq="share">${L('مشاركة الملف (واتساب وغيره)','Share the file (WhatsApp…)')}</button>`:''}
    <button class="btn ghost" type="button" data-bq="wa">${L('إرسال على واتساب','Send on WhatsApp')}</button><button class="btn ghost" type="button" data-bq="mail">${L('إرسال بالبريد وإلى حسابه','Send by email and to the account')}</button>
    <button class="btn ghost" type="button" data-bq="file">${L('فتح ملف العميل','Open client file')}</button><button class="btn ghost" type="button" data-bq="close">${L('إغلاق','Close')}</button></div>`;
  $('bqDone').onclick=e=>{const b=e.target.closest('[data-bq]');if(!b)return;const k=b.dataset.bq;if(k==='close'){dlg.close();return}if(k==='file'){dlg.close();go('client',q.clientId);return}act(k,q,cred)}}

// ---- the quotations panel in the client file ----
const panel=document.createElement('div');panel.className='panel';panel.id='cQuotesP';
panel.innerHTML=`<div class="bar bqbar"><h3>${L('عروض الأسعار','Quotations')}</h3><span class="sp"></span><button class="btn sm pri" type="button" id="cQuote">${L('عرض سعر جديد PDF','New quotation (PDF)')}</button></div><div class="tbl" id="cQuotes"></div>`;
const txP=$('cTx')&&$('cTx').closest('.panel');if(txP)txP.after(panel);
$('cQuote').onclick=()=>open({clientId:curClient});
// also from the client file header, the clients list and every website request
{const b=document.createElement('button');b.className='btn sm pri';b.type='button';b.id='cQuoteTop';b.textContent=L('عرض سعر PDF','Quotation (PDF)');b.onclick=()=>open({clientId:curClient});$('cTxn')&&$('cTxn').after(b)}
{const b=document.createElement('button');b.className='btn sm pri';b.type='button';b.id='newQuote';b.textContent=L('عرض سعر جديد','New quotation');b.onclick=()=>open({});$('newCli')&&$('newCli').after(b)}
$('reqT')&&$('reqT').addEventListener('click',e=>{const b=e.target.closest('[data-rquote]');if(!b)return;const r=DB.Requests.find(x=>x.id===b.dataset.rquote);if(!r)return;
  open({clientId:cli(r.clientId).id?r.clientId:'',name:r.name,phone:r.phone,email:r.email,codes:String(r.codes||'').split(/[\s,]+/),notes:'',reqId:r.id})});
function filesFor(q){return DB.Files.filter(f=>f.clientId===q.clientId&&String(f.title||'').includes(q.no))}
function renderQuotes(){const box=$('cQuotes');if(!box||!curClient)return;const list=quotesOf(curClient);
  box.innerHTML=list.length?table([L('رقم العرض','Quote no.'),L('التاريخ','Date'),L('البنود','Items'),L('الإجمالي التقديري','Estimated total'),L('الحالة','Status'),L('الملف والإجراءات','File and actions')],list.map(q=>{const s=Q.totals(q),st=status(q),f=filesFor(q)[0];
    return `<tr><td class="num">${esc(q.no)}${q.replaces?`<br><small class="mute">${L('بدلاً من','replaces')} ${esc(q.replaces)}</small>`:''}</td><td class="num"><span dir="ltr">${esc(dmy(q.issued))}</span><br><small class="mute">${L('حتى','until')} <span dir="ltr">${esc(dmy(addDays(q.issued,q.validDays)))}</span></small></td>
    <td>${q.lines.map(l=>esc(l.n)+(l.q>1?` × ${l.q}`:'')).join('<br>')}</td><td class="num">${s.from?L('يبدأ من ','from '):''}${fmt(s.grand)}</td><td><span class="st ${STC[st]}">${ST[st]}</span></td>
    <td><div class="acts">${f?`<a class="btn xs ghost" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener">${L('الملف المحفوظ','Saved file')}</a>`:''}<button class="btn xs ghost" type="button" data-qa="pdf" data-qn="${esc(q.no)}">${L('تنزيل PDF','PDF')}</button>
      ${Q.canShare()?`<button class="btn xs ghost" type="button" data-qa="share" data-qn="${esc(q.no)}">${L('مشاركة','Share')}</button>`:''}<button class="btn xs ghost" type="button" data-qa="wa" data-qn="${esc(q.no)}">${L('واتساب','WhatsApp')}</button><button class="btn xs ghost" type="button" data-qa="mail" data-qn="${esc(q.no)}">${L('بريد','Email')}</button>
      ${st==='issued'||st==='sent'||st==='expired'?`<button class="btn xs pri" type="button" data-qa="accept" data-qn="${esc(q.no)}">${L('اعتماد','Approve')}</button><button class="btn xs ghost danger" type="button" data-qa="reject" data-qn="${esc(q.no)}">${L('لم يُعتمد','Declined')}</button>`:''}
      <button class="btn xs ghost" type="button" data-qa="copy" data-qn="${esc(q.no)}">${L('نسخة معدّلة','Revise')}</button></div></td></tr>`})):`<p class="mute">${L('لا توجد عروض أسعار لهذا العميل بعد.','No quotations for this client yet.')}</p>`}
$('cQuotes').addEventListener('click',e=>{const b=e.target.closest('[data-qa]');if(!b)return;const q=quotesOf(curClient).find(x=>x.no===b.dataset.qn);if(q)act(b.dataset.qa,q)});
const _rc=renderClient;renderClient=function(){_rc();renderQuotes()};
window.BQ={quotesOf,status,fromLog,toText,nextNo};
// crm.html#quote opens a new quotation straight after sign-in (the link used by the Diwan)
let want=/^#quote$/.test(location.hash);try{const u=new URL(location.href);if(u.searchParams.get('open')==='quote'){want=true;u.searchParams.delete('open');history.replaceState(null,'',u.pathname+u.search+u.hash)}}catch(e){}
if(want){const t0=Date.now(),iv=setInterval(()=>{if(ME&&$('login').hidden&&DB.Clients){clearInterval(iv);open({})}else if(Date.now()-t0>120000)clearInterval(iv)},400)}
})();

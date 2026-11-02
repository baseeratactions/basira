'use strict';
// تسجيل حزمة بيانات عملاء جاهزة في النظام من لوحة الإدارة.
// الحزمة ملف مشفّر (AES-GCM) يختاره المدير من جهازه (لا يُنشر على الموقع)، ومفتاحه يصل في الرابط فقط (#import=...) ولا يُرسل إلى أي خادم.
// التسجيل يمر عبر أوامر الخادم العادية للمدير المسجّل دخوله (save · clientAccount · upload)، ويمكن تشغيله أكثر من مرة دون تكرار.
(function(){
  const KK='basira_imp_k';
  const T=(a,e)=>window.CRM_LANG==='en'?e:a;
  try{const m=/^#import=([A-Za-z0-9_-]{43})$/.exec(location.hash);if(m){sessionStorage.setItem(KK,m[1]);history.replaceState(null,'',location.pathname+location.search)}}catch(e){}
  const key=(()=>{try{return sessionStorage.getItem(KK)}catch(e){return null}})();
  if(!key)return;
  const box=document.createElement('div');
  box.dir='rtl';box.style.cssText='position:relative;max-width:560px;margin:12px auto;background:#fff;color:#1d2b27;border:1px solid #0e5e4a;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:14px 16px;font:14px/1.6 inherit';
  box.innerHTML=`<b style="color:#0e5e4a">${T('تسجيل بيانات العملاء وعروضهم','Register client data and quotes')}</b>
    <div id="impMsg" style="margin:6px 0">${T('سجّل الدخول كمدير، ثم اختر ملف البيانات (.bin) واضغط الزر.','Sign in as an admin, choose the data file (.bin), then press the button.')}</div>
    <input type="file" id="impFile" accept=".bin,application/octet-stream" style="margin:4px 0;max-width:100%">
    <div id="impLog" style="max-height:220px;overflow:auto;font-size:13px;white-space:pre-wrap"></div>
    <div style="display:flex;gap:8px;margin-top:8px"><button class="btn pri" id="impGo" type="button">${T('تسجيل البيانات','Register data')}</button>
    <button class="btn ghost" id="impX" type="button">${T('إغلاق','Close')}</button></div>`;
  document.body.prepend(box);
  const $i=id=>document.getElementById(id),msg=t=>$i('impMsg').textContent=t,out=t=>{$i('impLog').textContent+=t+'\n';$i('impLog').scrollTop=1e9};
  $i('impX').onclick=()=>box.remove();
  const b64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
  async function open(){
    const fl=$i('impFile').files[0];if(!fl)throw new Error(T('اختر ملف البيانات أولاً.','Choose the data file first.'));
    const buf=new Uint8Array(await fl.arrayBuffer()),k=await crypto.subtle.importKey('raw',b64(key),'AES-GCM',false,['decrypt']);
    let plain;try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12)},k,buf.slice(12))}catch(e){throw new Error(T('الملف لا يطابق هذا الرابط.','This file does not match the link.'))}
    return JSON.parse(new TextDecoder().decode(plain));
  }
  const same=(a,b)=>String(a||'').trim()===String(b||'').trim();
  async function run(){
    if(typeof Remote==='undefined'||!(window.BASIRA_CONFIG||{}).API)throw new Error(T('الخادم غير متصل','server not connected'));
    if(!Remote.tok()||Remote.tok()==='local')throw new Error(T('سجّل الدخول كمدير أولاً.','Sign in as an admin first.'));
    msg(T('جارٍ فك الحزمة…','Opening the package…'));
    const pkg=await open();
    let db=await Remote.list();const me=(typeof ME!=='undefined'&&ME)||{};
    if(me.role&&me.role!=='admin')throw new Error(T('هذا الإجراء للمدير فقط.','Admins only.'));
    const sum=[];
    for(const c of pkg.clients){
      msg(T('جارٍ تسجيل ','Registering ')+(c.row.name||c.tag)+'…');
      let cl=null;
      if(c.match.re){const re=new RegExp(c.match.re,'i');cl=db.Clients.find(x=>re.test([x.name,x.phone,x.email].join(' ')))}
      if(!cl)cl=db.Clients.find(x=>String(x.notes||'').includes('['+c.tag+']'))||(c.match.name&&db.Clients.find(x=>same(x.name,c.match.name)));
      if(cl){
        const row=Object.assign({},cl);
        Object.entries(c.fill||{}).forEach(([k,v])=>{if(!row[k])row[k]=v});
        Object.entries(c.row).forEach(([k,v])=>{if((c.overwrite||[]).includes(k)&&v)row[k]=v;else if(k==='notes'){if(!String(row.notes||'').includes('['+c.tag+']'))row.notes=(row.notes?row.notes+'\n':'')+v}else if(!row[k]&&v)row[k]=v});
        cl=await Remote.save('Clients',row);out('✓ '+cl.id+' '+cl.name+T(' (موجود، أُكملت بياناته)',' (existing, data completed)'));
      }else{cl=await Remote.save('Clients',Object.assign({},c.row));out('✓ '+cl.id+' '+cl.name+T(' (ملف جديد)',' (new file)'))}
      const txn={};
      for(const x of c.cancel||[]){   // a quote replaced by a newer one: its transaction is closed as cancelled
        const old=db.Transactions.find(r=>r.clientId===cl.id&&same(r.service,x.service)&&r.status!=='ملغاة');
        if(old){await Remote.save('Transactions',Object.assign({},old,{status:'ملغاة',notes:(old.notes?old.notes+' · ':'')+x.note}));out('  ✓ '+T('أُلغيت المعاملة ','cancelled ')+old.id)}
      }
      for(const t of c.txns){
        let x=db.Transactions.find(r=>r.clientId===cl.id&&same(r.service,t.service));
        if(!x){const row=Object.assign({},t,{clientId:cl.id,govFee:''});delete row.key;x=await Remote.save('Transactions',row);out('  ✓ '+T('معاملة ','transaction ')+x.id+' · '+(t.fee?Number(t.fee).toLocaleString('en-US')+' QAR':''))}
        txn[t.key]=x.id;
      }
      for(const k of c.tasks){
        if(db.Tasks.some(r=>r.clientId===cl.id&&same(r.title,k.title)))continue;
        await Remote.save('Tasks',{title:k.title,clientId:cl.id,txnId:txn[k.txn]||'',due:k.due,priority:k.priority,status:'جديدة',progress:0,assignee:'',notes:''});
      }
      out('  ✓ '+c.tasks.length+T(' مهام متابعة',' follow-up tasks'));
      for(const [d,s] of c.log){
        const subject=d+' · '+s;
        if(db.Log.some(r=>r.clientId===cl.id&&same(r.subject,subject)))continue;
        await Remote.save('Log',{clientId:cl.id,txnId:txn.main||'',kind:'note',subject,body:''});
      }
      let user='';
      const acc=db.Accounts.find(a=>a.clientId===cl.id);
      if(acc){user=acc.username;out('  ✓ '+T('حساب «حسابي» موجود: ','existing account: ')+user)}
      else if(c.account){const r=await Remote.api('clientAccount',{clientId:cl.id,username:c.account.username,password:c.account.password,status:'مفعّل'});user=r.row.username;out('  ✓ '+T('حساب «حسابي» جديد: ','new account: ')+user)}
      for(const f of c.files){
        if(db.Files.some(r=>r.clientId===cl.id&&same(r.title,f.title)))continue;
        msg(T('جارٍ رفع ','Uploading ')+f.title+'…');
        await Remote.api('upload',{clientId:cl.id,txnId:f.txn?txn[f.txn]||'':'',title:f.title,name:f.name,mime:f.mime,data:f.data,notify:false});
        out('  ✓ '+T('ملف: ','file: ')+f.title);
      }
      sum.push(cl.id+' '+cl.name+(user?' · '+user:''));
      db=await Remote.list();
    }
    try{sessionStorage.removeItem(KK)}catch(e){}
    msg(T('اكتمل التسجيل لـ ','Done for ')+sum.length+T(' عملاء. افتح «العملاء» لمراجعة الملفات.',' clients. Open Clients to review.'));
    $i('impGo').remove();
    if(typeof reload==='function')reload();
  }
  $i('impGo').onclick=async()=>{const b=$i('impGo');b.disabled=true;try{await run()}catch(e){msg('⚠ '+(e.message||e));out(T('يمكن الضغط مرة أخرى؛ ما سُجّل لن يتكرر.','You can press again; nothing is duplicated.'));b.disabled=false}};
})();

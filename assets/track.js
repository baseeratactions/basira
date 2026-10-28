'use strict';
// Visit and conversion counts: Umami Cloud, which sets no cookies and collects no personal data (totals only).
// Off until BASIRA_CONFIG.UMAMI_ID holds the site's Umami "Website ID". Counted: page views, the section opened,
// a service viewed, a quote prepared, a request sent, a registration, and taps on WhatsApp, call and email.
(function(){
const ID=(window.BASIRA_CONFIG||{}).UMAMI_ID||'',queue=[];
window.BTRACK=(name,data)=>{if(!ID)return;try{window.umami?window.umami.track(name,data):queue.push([name,data])}catch(e){}};
if(!ID)return;
const s=document.createElement('script');s.defer=true;s.src='https://cloud.umami.is/script.js';
s.dataset.websiteId=ID;s.dataset.excludeSearch='true';s.dataset.doNotTrack='true';
s.onload=()=>queue.splice(0).forEach(([n,d])=>window.BTRACK(n,d));document.head.appendChild(s);
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;const h=a.getAttribute('href')||'',from=a.id||a.className.split(' ').pop()||'link';
  if(/wa\.me\//.test(h))window.BTRACK('whatsapp',{from});else if(/^tel:/.test(h))window.BTRACK('call',{from});else if(/^mailto:/.test(h))window.BTRACK('email',{from})},true);
// the home page opens its sections by #hash: each one opened counts once per visit
const seen=new Set();addEventListener('hashchange',()=>{const v=location.hash.replace(/^#/,'').split('=')[0];if(v&&v!=='svc'&&!seen.has(v)){seen.add(v);window.BTRACK('section',{name:v})}});
})();

'use strict';
// Site colours chosen by the manager (لوحة الإدارة ← الإعدادات ← ألوان الموقع). Loaded in <head> of every page:
// applies the last known colours at once, then asks the server for the current choice and keeps it for next time.
(function(){
// Public pages (and «حسابي») use one fixed, easy-to-read green palette in light and dark mode (owner, 2026-10-19).
// Every text colour here passes WCAG AA (4.5:1) on the background it sits on; the admin colour picker only changes the admin panel.
const PUB={bg:'#f4f8f6',surface:'#ffffff',ink:'#17241e',mute:'#4b5a53',line:'#d5e3db',chip:'#e8f1ec',
  hero:'#e7f2ec',heroCard:'#ffffff',green:'#1d6b47',bar:'#1d5c40',barInk:'#ffffff',
  gold:'#8a6512',goldSoft:'#f6efdd',goldLine:'#b8913a',ok:'#1d6b47',okSoft:'#e3f1e9'};
const KEY='basira_theme',DEF={primary:'#2f855a',accent:'#c9a24d'};
const hex=s=>/^#[0-9a-f]{6}$/i.test(s||'');
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const toHex=a=>'#'+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>toHex(rgb(a).map((x,i)=>x+(rgb(b)[i]-x)*t));
const lum=h=>{const c=rgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
function css(t){const p=t.primary,a=t.accent,dk=mix(p,'#000000',.55),lt=mix(p,'#ffffff',.55),
    P=PUB,G=P.green;

  return `:root{--navy:${p};--pri:${p};--hero-em:${p};--amber:${a};--amber-soft:${mix(a,'#ffffff',.86)};--gold-line:${a};--gold-1:${mix(a,'#ffffff',.92)};--gold-2:${mix(a,'#ffffff',.65)}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--navy:${dk};--pri:${lt};--hero-em:${mix(p,'#ffffff',.7)};--amber:${mix(a,'#ffffff',.15)};--amber-soft:${mix(a,'#000000',.7)}}}
:root[data-theme="dark"]{--navy:${dk};--pri:${lt};--hero-em:${mix(p,'#ffffff',.7)};--amber:${mix(a,'#ffffff',.15)};--amber-soft:${mix(a,'#000000',.7)}}
.basmala{color:${p}!important}
body:not(.crm){--navy:${G};--pri:${G};--hero-em:${G};--navy-ink:#ffffff;--pri-ink:#ffffff;--bg:${P.bg};--surface:${P.surface};--ink:${P.ink};--mute:${P.mute};--line:${P.line};--chip:${P.chip};--hero-bg:${P.hero};--hero-card:${P.heroCard};--hero-ink:${P.ink};--pub-bar:${P.bar};--pub-ink:${P.barInk};--bar-line:rgba(255,255,255,.4);--bar-hover:rgba(255,255,255,.14);--bar-soft:rgba(255,255,255,.12);--amber:${P.gold};--amber-soft:${P.goldSoft};--amber-ink:#ffffff;--gold-1:#fbf6ea;--gold-2:#efdfb6;--gold-line:${P.goldLine};--gold-ink:#3b2a05;--ok:${P.ok};--ok-soft:${P.okSoft};color-scheme:light;background:var(--bg);color:var(--ink)}
body:not(.crm) .top,body:not(.crm) footer{background:var(--pub-bar,var(--navy));color:var(--pub-ink,var(--navy-ink))}
body:not(.crm) .burger span{background:currentColor}
body:not(.crm) .basmala{color:${G}!important}
body:not(.crm) .plan.elite .save{color:#f3d98f}
body:not(.crm) footer .fc b{color:#f3d98f}`}
function apply(t){if(!t||!hex(t.primary)||!hex(t.accent)||/^#(0e5e4a|0b6b53)$/i.test(t.primary))t=DEF;let el=document.getElementById('siteTheme');
  if(!el){el=document.createElement('style');el.id='siteTheme';document.head.appendChild(el)}el.textContent=css(t);
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=t.primary}
let saved=null;try{saved=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
apply(saved&&saved.t);
window.SITE_THEME={DEF,apply,contrast,mix,hex,
  remember(t){saved={t,at:Date.now()};try{localStorage.setItem(KEY,JSON.stringify(saved))}catch(e){}apply(t)},
  get current(){return (saved&&saved.t)||DEF}};
// refresh from the server at most every 10 minutes
function refresh(){const api=(window.BASIRA_CONFIG||{}).API;if(!api||(saved&&Date.now()-saved.at<6e5))return;
  fetch(api,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'theme'})}).then(r=>r.json()).then(j=>{if(j&&j.ok){const t=j.theme&&hex(j.theme.primary)?j.theme:DEF;window.SITE_THEME.remember(t)}}).catch(()=>{})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh);else refresh();
})();

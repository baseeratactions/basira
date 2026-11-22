'use strict';
// Share a service page: the phone's own share sheet where it exists, plus WhatsApp and copy-link everywhere.
(function(){
const box=document.querySelector('[data-share-box]');if(!box)return;
const EN=document.documentElement.lang==='en',url=location.origin+location.pathname,title=box.dataset.title||document.title,text=box.dataset.text||'';
const T=EN?{share:'Share',copy:'Copy link',copied:'Link copied ✓'}:{share:'مشاركة',copy:'نسخ الرابط',copied:'نُسخ الرابط ✓'};
const wa=box.querySelector('[data-share-wa]');if(wa)wa.href='https://wa.me/?text='+encodeURIComponent(text+'\n'+url);
const nat=box.querySelector('[data-share-native]');
if(nat){if(navigator.share)nat.hidden=false;nat.addEventListener('click',()=>{navigator.share({title,text,url}).catch(()=>{})})}
const cp=box.querySelector('[data-share-copy]');
if(cp)cp.addEventListener('click',()=>{const done=()=>{cp.textContent=T.copied;setTimeout(()=>cp.textContent=T.copy,1800)};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(done,()=>{});else{const i=document.createElement('input');i.value=url;document.body.appendChild(i);i.select();try{document.execCommand('copy');done()}catch(e){}i.remove()}});
})();

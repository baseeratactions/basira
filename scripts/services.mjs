// Builds one page per service, in Arabic (services/) and English (en/services/), plus a list page for each language,
// so every service can be found on Google and shared as a normal link. Each page carries Service, FAQ and breadcrumb data.
// Source: the catalogue saved in the admin panel (from the office server) with the same rules the site applies in
// assets/catalog.js; when the server cannot be reached, the built-in assets/data.js and assets/details.js.
// Run: node scripts/services.mjs   (the services workflow runs it daily and after every catalogue change in the code)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const SITE = 'https://baseeratactions.github.io/basira/';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const write = (f, s) => writeFileSync(new URL('../' + f, import.meta.url), s);
const V = 'v=20261028a';

// ---- the catalogue, exactly as visitors see it ----
const cfg = read('assets/config.js');
const API = (cfg.match(/API:\s*"([^"]*)"/) || [])[1] || '';
async function serverCatalog() {
  if (!API || process.env.OFFLINE) return null;
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'catalog', ver: '' }), signal: AbortSignal.timeout(45000) });
    const j = await r.json();
    return j && j.ok && j.ver && j.data && j.details ? { ver: j.ver, data: j.data, details: j.details } : null;
  } catch (e) { console.log('server catalogue not reached, using the built-in one:', e.message); return null; }
}
const saved = await serverCatalog();
const ctx = { console, JSON, Date, Object, Array, Set, String, Number };
ctx.window = ctx;
ctx.localStorage = { getItem: k => (k === 'basira_catalog' && saved ? JSON.stringify(saved) : null), setItem() {}, removeItem() {} };
ctx.sessionStorage = { getItem: () => null, setItem() {} };
ctx.addEventListener = () => {};
ctx.document = { readyState: 'loading', addEventListener() {} };
vm.createContext(ctx);
vm.runInContext(read('assets/data.js') + '\nwindow.__DATA=DATA;', ctx);
vm.runInContext(read('assets/details.js'), ctx);
vm.runInContext(read('assets/catalog.js'), ctx);
const DATA = ctx.__DATA, DET = ctx.DETAILS;
console.log(saved ? 'catalogue: admin panel version ' + saved.ver : 'catalogue: built-in');

// ---- one list of services in both languages ----
const ENT = DET._entities || {};
const svcs = [];
DATA.G.forEach(([g, gName, list]) => list.forEach(([c, n, inc, p, core]) => {
  const d = DET[c] || {}, e = d.en || {};
  svcs.push({ c, kind: 'gov', grp: g, p, core, from: false,
    ar: { n, inc, grp: gName, ...(d.ar || {}) }, en: { ...e, n: e.name || n, inc: e.inc || inc, grp: ENT[g] || gName } });
}));
DATA.SETUP.forEach(([c, n, inc, p]) => {
  const d = DET[c] || {}, e = d.en || {};
  svcs.push({ c, kind: 'setup', grp: 'ST', p, core: false, from: false,
    ar: { n, inc, grp: 'باقات التأسيس', ...(d.ar || {}) }, en: { ...e, n: e.name || n, inc: e.inc || inc, grp: ENT.ST || 'Company Setup Packages' } });
});
(DATA.CONSULT || []).forEach(k => k.items.forEach(it => {
  svcs.push({ c: it.c, kind: 'consult', grp: k.code, p: it.p, core: false, from: !!it.from,
    ar: { ...it.ar, unit: it.unit_ar || '', grp: k.ar }, en: { ...it.en, unit: it.unit_en || '', grp: k.en } });
}));
const groups = [];
svcs.forEach(s => { let g = groups.find(x => x.k === s.grp); if (!g) groups.push(g = { k: s.grp, kind: s.kind, ar: s.ar.grp, en: s.en.grp, items: [] }); g.items.push(s); });

// ---- page text ----
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = n => Number(n).toLocaleString('en-US');
const T = {
  ar: { dir: 'rtl', loc: 'ar_QA', cur: 'ر.ق', home: 'الرئيسية', list: 'الخدمات والأسعار', brand: 'بصيرة للمعاملات', legal: 'بصيرة للمعاملات ذ.م.م',
    fee: 'أتعاب بصيرة', from: 'يبدأ من', once: 'لمرة واحدة', core: 'ضمن الباقات', about: 'عن الخدمة', inc: 'ما نقوم به', docs: 'المستندات المطلوبة منك',
    time: 'المدة التقريبية', out: 'ما تستلمه', note: 'ملاحظة', gov: 'الرسوم الحكومية تُدفع منفصلة بإيصالها الرسمي، ولا تدخل في أتعاب بصيرة.',
    req: 'اطلب هذه الخدمة', wa: 'اسأل على واتساب', call: 'اتصل بنا', faq: 'أسئلة شائعة', more: 'خدمات أخرى في', all: 'كل الخدمات والأسعار',
    waMsg: (n, c) => `السلام عليكم، أرغب في الاستفسار عن خدمة: ${n} (${c}).`, acct: 'حسابي', other: 'English',
    qPrice: n => `كم تكلفة «${n}» لدى بصيرة؟`, aPrice: (s, L) => `أتعاب بصيرة ${s.from ? 'تبدأ من ' : ''}${fmt(s.p)} ${L.cur}${s.ar.unit ? ' ' + s.ar.unit : ''}${s.kind === 'gov' ? '، والرسوم الحكومية تُدفع منفصلة بإيصالها الرسمي' : ''}${s.from ? '، ويُؤكَّد السعر النهائي في عرض سعر مكتوب' : ''}.`,
    qDocs: n => `ما المستندات المطلوبة لـ«${n}»؟`, qTime: n => `كم تستغرق «${n}»؟`, qOut: () => 'ماذا أستلم في النهاية؟',
    qHow: () => 'كيف أطلب الخدمة؟', aHow: 'اضغط «اطلب هذه الخدمة» لتجهيز عرض سعر باسمك، أو راسلنا على واتساب ‎+974 7223 2609، وسنراجع مستنداتك ونؤكد لك الخطوات قبل البدء.',
    listTitle: 'الخدمات والأسعار | بصيرة للمعاملات', listH1: 'الخدمات والأسعار', listLead: 'كل خدمات بصيرة بأسعارها المعلنة: المعاملات الحكومية في قطر، وباقات التأسيس، والدراسات والاستشارات. اختر أي خدمة لترى ما نقوم به والمستندات المطلوبة والمدة.',
    title: (s) => `${s.ar.n} | ${s.ar.grp} | بصيرة للمعاملات`, desc: s => `${s.ar.n} في الدوحة مع بصيرة للمعاملات: ${s.ar.about || s.ar.inc}`.slice(0, 160) },
  en: { dir: 'ltr', loc: 'en_US', cur: 'QAR', home: 'Home', list: 'Services and prices', brand: 'Basira for Transactions', legal: 'Basira for Transactions LLC',
    fee: 'Basira fee', from: 'from', once: 'one-time', core: 'In packages', about: 'About the service', inc: 'What we do', docs: 'Documents you provide',
    time: 'Approximate time', out: 'What you receive', note: 'Note', gov: 'Government fees are paid separately with the official receipt and are not part of Basira’s fee.',
    req: 'Request this service', wa: 'Ask on WhatsApp', call: 'Call us', faq: 'Frequently asked questions', more: 'More services in', all: 'All services and prices',
    waMsg: (n, c) => `Hello, I would like to ask about this service: ${n} (${c}).`, acct: 'My account', other: 'العربية',
    qPrice: n => `How much does “${n}” cost with Basira?`, aPrice: (s, L) => `Basira’s fee is ${s.from ? 'from ' : ''}${fmt(s.p)} ${L.cur}${s.en.unit ? ' ' + s.en.unit : ''}${s.kind === 'gov' ? '; government fees are paid separately with the official receipt' : ''}${s.from ? '; the final price is confirmed in a written quotation' : ''}.`,
    qDocs: n => `Which documents are needed for “${n}”?`, qTime: n => `How long does “${n}” take?`, qOut: () => 'What do I receive at the end?',
    qHow: () => 'How do I request it?', aHow: 'Press “Request this service” to prepare a quote in your name, or message us on WhatsApp at +974 7223 2609. We review your documents and confirm the steps before we start.',
    listTitle: 'Services and prices | Basira for Transactions', listH1: 'Services and prices', listLead: 'Every Basira service with its published price: government transactions in Qatar, company setup packages, and studies and consulting. Open any service to see what we do, the documents needed and the time it takes.',
    title: (s) => `${s.en.n} | ${s.en.grp} | Basira for Transactions`, desc: s => `${s.en.n} in Doha with Basira for Transactions: ${s.en.about || s.en.inc}`.slice(0, 160) },
};
const LOGO = '<svg width="34" height="34" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="37" fill="none" stroke="#e0a12b" stroke-width="5"/><path d="M12 40 Q40 14 68 40 Q40 66 12 40Z" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="40" cy="40" r="10" fill="#e0a12b"/></svg>';
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Ccircle cx='40' cy='40' r='36' fill='%230e5e4a'/%3E%3Cpath d='M14 40 Q40 16 66 40 Q40 64 14 40Z' fill='none' stroke='white' stroke-width='5'/%3E%3Ccircle cx='40' cy='40' r='10' fill='%23c9a24d'/%3E%3C/svg%3E";
const CSP = "default-src 'self'; script-src 'self' https://cloud.umami.is https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com https://www.gstatic.com 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://translate.googleapis.com https://www.gstatic.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://cloud.umami.is https://api-gateway.umami.dev https://translate.googleapis.com https://translate-pa.googleapis.com; frame-src https://translate.google.com https://translate.googleapis.com; object-src 'none'; base-uri 'self'; form-action 'self'";

const priceText = (s, L, l) => `${s.from ? `<small>${L.from}</small> ` : ''}${fmt(s.p)} <small>${L.cur}${s[l].unit ? ' ' + esc(s[l].unit) : ''}</small>`;
const steps = s => String(s || '').split(/[،,]\s*/).map(x => x.trim()).filter(Boolean);

function page({ l, path, title, desc, alt, h1, body, ld }) {
  const L = T[l], A = l === 'en' ? '../../' : '../', ROOT = l === 'en' ? 'en/' : '';   // A: site root from this page; ROOT: the language's folder from the site root
  return `<!doctype html>
<html lang="${l}" dir="${L.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#2f855a">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="${A}assets/apple-touch-icon.png">
<link rel="manifest" href="${A}site.webmanifest">
<link rel="canonical" href="${SITE}${path}">
<link rel="alternate" hreflang="ar" href="${SITE}${alt.ar}">
<link rel="alternate" hreflang="en" href="${SITE}${alt.en}">
<link rel="alternate" hreflang="x-default" href="${SITE}${alt.ar}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${L.brand}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}assets/${l === 'en' ? 'og-en' : 'og'}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${L.loc}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@500;700&family=Tajawal:wght@400;500;700&display=swap">
<link rel="stylesheet" href="${A}assets/style.css?${V}">
<script src="${A}assets/theme.js?v=20261019m"></script>
<script src="${A}assets/lang.js?${V}" defer></script>
<script src="${A}assets/who.js?${V}" defer></script>
</head>
<body>
<a class="skip" href="#main">${l === 'en' ? 'Skip to main content' : 'تخطَّ إلى المحتوى الرئيسي'}</a>
<header class="top"><div class="wrap">
  <a class="brand" href="${A}${ROOT}index.html">${LOGO}${L.brand}</a>
  <div class="plainnav"><a href="${A}${ROOT}index.html">${L.home}</a><a href="index.html">${L.list}</a><a href="${A}${ROOT}portal.html" class="acct">${L.acct}</a><a href="${A}${l === 'en' ? 'services/' : 'en/services/'}${alt.file}" class="lang" lang="${l === 'en' ? 'ar' : 'en'}">${L.other}</a></div>
</div></header>
<main class="sec svcp" id="main"><div class="wrap">
${body}
</div></main>
<footer><div class="wrap fc"><b>${l === 'en' ? 'Contact' : 'للتواصل'}</b><a href="tel:+97472232609" dir="ltr">☎ +974 7223 2609</a><a href="https://wa.me/97472232609" target="_blank" rel="noopener">${l === 'en' ? 'WhatsApp' : 'واتساب'}</a><a href="mailto:baseeratactions@gmail.com" dir="ltr">✉ baseeratactions@gmail.com</a></div><div class="wrap"><span>${L.legal} · ${l === 'en' ? 'Doha, Qatar' : 'الدوحة، قطر'}</span><span><a href="${A}${ROOT}index.html">${l === 'en' ? 'Back to the website' : 'العودة إلى الموقع'}</a> · <a href="${A}${ROOT}legal.html">${l === 'en' ? 'Legal documents' : 'المستندات القانونية'}</a> · <a href="${A}${ROOT}privacy.html">${l === 'en' ? 'Privacy' : 'الخصوصية'}</a></span></div></footer>
<a class="wa-fab" href="https://wa.me/97472232609" target="_blank" rel="noopener" aria-label="${L.wa}" title="${L.wa}"><svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.6c-2 0-3.9-.5-5.6-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.4 1.4.6 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.4z"/></svg></a>
<script src="${A}assets/config.js?${V}"></script>
<script src="${A}assets/sitetext.js?v=20261019p2"></script>
<script src="${A}assets/track.js?${V}"></script>
</body></html>
`;
}

const ORG = { '@type': 'ProfessionalService', '@id': SITE + '#org', name: 'بصيرة للمعاملات', alternateName: 'Basira for Transactions', url: SITE, telephone: '+97472232609', address: { '@type': 'PostalAddress', addressLocality: 'Doha', addressCountry: 'QA' } };
const crumbsLd = items => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + url })) });

function servicePage(s, l) {
  const L = T[l], x = s[l], code = s.c, base = l === 'en' ? 'en/' : '';
  const g = groups.find(y => y.k === s.grp);
  const docs = Array.isArray(x.docs) ? x.docs : [];
  const faq = [[L.qPrice(x.n), L.aPrice(s, L)]];
  if (docs.length) faq.push([L.qDocs(x.n), docs.join(l === 'en' ? '; ' : '، ') + '.']);
  if (x.time) faq.push([L.qTime(x.n), x.time + (/[.!؟]$/.test(x.time) ? '' : '.')]);
  if (x.out) faq.push([L.qOut(), x.out + (/[.!؟]$/.test(x.out) ? '' : '.')]);
  faq.push([L.qHow(), L.aHow]);
  const waHref = 'https://wa.me/97472232609?text=' + encodeURIComponent(L.waMsg(x.n, code));
  const rel = g.items.filter(y => y.c !== code).slice(0, 8);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Service', name: x.n, serviceType: x.n, description: x.about || x.inc, identifier: code, url: SITE + base + 'services/' + code + '.html', areaServed: { '@type': 'Country', name: 'Qatar' }, provider: ORG, category: x.grp,
      offers: { '@type': 'Offer', priceCurrency: 'QAR', ...(s.from ? { priceSpecification: { '@type': 'PriceSpecification', minPrice: s.p, priceCurrency: 'QAR' } } : { price: s.p }), availability: 'https://schema.org/InStock', url: SITE + base + 'services/' + code + '.html' } },
    { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    crumbsLd([[L.home, base], [L.list, base + 'services/'], [x.n, base + 'services/' + code + '.html']]) ] };
  const body = `<nav class="bc" aria-label="${l === 'en' ? 'You are here' : 'مسار الصفحة'}"><ol><li><a href="../index.html">${L.home}</a></li><li><a href="index.html">${L.list}</a></li><li><a href="index.html#g-${s.grp}">${esc(x.grp)}</a></li><li aria-current="page">${esc(x.n)}</li></ol></nav>
<p class="eyebrow">${esc(x.grp)} · <span class="code">${code}</span></p>
<h1>${esc(x.n)}</h1>
${x.about ? `<p class="lead">${esc(x.about)}</p>` : ''}
<div class="svc-box"><div class="svc-price"><span>${L.fee}</span><b class="price num">${priceText(s, L, l)}</b>${s.kind === 'setup' ? `<small class="mute">${L.once}</small>` : ''}${s.core ? `<span class="tag">${L.core}</span>` : ''}</div>
${s.kind !== 'consult' ? `<p class="mute sm">${L.gov}</p>` : ''}
<div class="contact"><a class="btn pri" href="../index.html#svc=${code}">${L.req}</a><a class="btn wa" href="${esc(waHref)}" target="_blank" rel="noopener">${L.wa}</a><a class="btn ghost" href="tel:+97472232609">${L.call}</a></div></div>
<div class="svc-cols">
<section><h2>${L.inc}</h2><ol>${steps(x.inc).map(t => `<li>${esc(t)}</li>`).join('')}</ol></section>
${docs.length ? `<section><h2>${L.docs}</h2><ul>${docs.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
</div>
${x.time || x.out ? `<div class="svc-facts">${x.time ? `<div><b>${L.time}</b><span>${esc(x.time)}</span></div>` : ''}${x.out ? `<div><b>${L.out}</b><span>${esc(x.out)}</span></div>` : ''}</div>` : ''}
${x.note ? `<p class="dnote">${esc(x.note)}</p>` : ''}
<section class="svc-faq"><h2>${L.faq}</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
${rel.length ? `<section><h2>${L.more} ${esc(x.grp)}</h2><ul class="svc-list">${rel.map(y => `<li><a href="${y.c}.html">${esc(y[l].n)}</a><span class="price num">${priceText(y, L, l)}</span></li>`).join('')}</ul><p><a href="index.html">${L.all} ›</a></p></section>` : ''}`;
  return page({ l, path: base + 'services/' + code + '.html', title: L.title(s), desc: L.desc(s), alt: { ar: 'services/' + code + '.html', en: 'en/services/' + code + '.html', file: code + '.html' }, h1: x.n, body, ld });
}

function listPage(l) {
  const L = T[l], base = l === 'en' ? 'en/' : '';
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'OfferCatalog', name: L.listH1, url: SITE + base + 'services/', provider: ORG, itemListElement: groups.map(g => ({ '@type': 'OfferCatalog', name: g[l],
      itemListElement: g.items.map(s => ({ '@type': 'Offer', priceCurrency: 'QAR', ...(s.from ? { priceSpecification: { '@type': 'PriceSpecification', minPrice: s.p, priceCurrency: 'QAR' } } : { price: s.p }),
        itemOffered: { '@type': 'Service', name: s[l].n, url: SITE + base + 'services/' + s.c + '.html' } })) })) },
    crumbsLd([[L.home, base], [L.list, base + 'services/']]) ] };
  const body = `<nav class="bc" aria-label="${l === 'en' ? 'You are here' : 'مسار الصفحة'}"><ol><li><a href="../index.html">${L.home}</a></li><li aria-current="page">${L.list}</li></ol></nav>
<h1>${L.listH1}</h1>
<p class="lead">${L.listLead}</p>
<nav class="svc-jump" aria-label="${l === 'en' ? 'Groups' : 'المجموعات'}">${groups.map(g => `<a href="#g-${g.k}">${esc(g[l])}</a>`).join('')}</nav>
${groups.map(g => `<section id="g-${g.k}" class="svc-group"><h2>${esc(g[l])} <small class="mute">(${g.items.length})</small></h2><ul class="svc-list">${g.items.map(s => `<li><a href="${s.c}.html">${esc(s[l].n)}</a><span class="price num">${priceText(s, L, l)}</span></li>`).join('')}</ul></section>`).join('\n')}
<p class="mute sm">${L.gov}</p>`;
  return page({ l, path: base + 'services/', title: L.listTitle, desc: L.listLead.slice(0, 160), alt: { ar: 'services/', en: 'en/services/', file: 'index.html' }, h1: L.listH1, body, ld });
}

// ---- write the pages, remove pages of services that are no longer offered, update the sitemap ----
const urls = [];
for (const l of ['ar', 'en']) {
  const dir = (l === 'en' ? 'en/' : '') + 'services/';
  mkdirSync(new URL('../' + dir, import.meta.url), { recursive: true });
  const keep = new Set(['index.html']);
  write(dir + 'index.html', listPage(l)); urls.push([dir, '']);
  for (const s of svcs) { write(dir + s.c + '.html', servicePage(s, l)); keep.add(s.c + '.html'); urls.push([dir + s.c + '.html', s.c + '.html']); }
  for (const f of readdirSync(new URL('../' + dir, import.meta.url))) if (/^[A-Z]{2}-\d{2}\.html$/.test(f) && !keep.has(f)) unlinkSync(new URL('../' + dir + f, import.meta.url));
}
let sm = read('sitemap.xml').replace(/\s*<url><loc>[^<]*\/services\/[^<]*<\/loc>.*?<\/url>/gs, '');
sm = sm.replace(/\s*<\/urlset>/, '\n' + urls.map(([u, f]) => `  <url><loc>${SITE}${u}</loc>\n    <xhtml:link rel="alternate" hreflang="ar" href="${SITE}services/${f}"/>\n    <xhtml:link rel="alternate" hreflang="en" href="${SITE}en/services/${f}"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}services/${f}"/></url>`).join('\n') + '\n</urlset>\n');
write('sitemap.xml', sm);
console.log(`${svcs.length} services × 2 languages written`);

// الديوان: لوحة إدارة موحّدة لكل المنصات.
// - تقرأ سجل المنصات (platforms.json) وتكتشف تلقائياً أي موقع جديد منشور على حسابات الشركة في GitHub.
// - تتصل فقط بالخوادم المثبّتة في السجل، وتجمع المنصات التي تشترك في خادم واحد.
// - دخول واحد: نفس اسم المستخدم وكلمة المرور تُرسل لكل خادم، وتُحفظ أختام الجلسات في هذا التبويب فقط.
// - «لوحة الإدارة» تفتح إدارة المنصة بختم الجلسة نفسه (#sso=...) فلا يُطلب الدخول مرة ثانية.
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TOK = 'diwan_tokens', USR = 'diwan_user', DISC = 'diwan_disc_v1', THEME = 'diwan_theme';
const GH = 'https://api.github.com/';
const CLOSED_TX = ['منجزة', 'ملغاة'];
const ERR = {
  wrong_password: 'بيانات الدخول غير صحيحة لهذا الخادم',
  rate_limited: 'الحساب مقفل مؤقتاً بعد محاولات خاطئة، أعد المحاولة بعد 15 دقيقة',
  must_change: 'يلزم تعيين كلمة مرور جديدة أولاً من لوحة إدارة المنصة',
  not_setup: 'الخادم لم يُهيّأ بعد',
  auth: 'انتهت الجلسة، سجّل الدخول مرة أخرى',
  network: 'تعذّر الوصول إلى الخادم الآن'
};
const store = {
  get(k, d, s) { try { const v = (s || localStorage).getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v, s) { try { (s || localStorage).setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k, s) { try { (s || localStorage).removeItem(k); } catch (e) {} }
};

// ---------- تنسيق موحّد ----------
const TZ = 'Asia/Qatar';
const LOCAL = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?/;   // تواريخ الخوادم مكتوبة بتوقيت الدوحة أصلاً
function toDate(s) { if (s instanceof Date) return s; s = String(s || ''); return new Date(LOCAL.test(s) && !/T/.test(s) ? s.slice(0, 16).replace(' ', 'T') + (s.length > 10 ? '' : 'T00:00') + '+03:00' : s); }
function fmtDate(s) {   // 2026-10-25 14:05 بتوقيت الدوحة
  if (!s) return '';
  if (typeof s === 'string' && LOCAL.test(s) && !/T/.test(s)) return s.slice(0, 16);
  const d = toDate(s); if (isNaN(d)) return String(s);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(d).map(x => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute;
}
function ago(s) {
  const d = toDate(s); if (isNaN(d)) return '';
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 1) return 'الآن'; if (m < 60) return 'قبل ' + count(m, 'دقيقة', 'دقيقتين', 'دقائق');
  const h = Math.round(m / 60); if (h < 24) return 'قبل ' + count(h, 'ساعة', 'ساعتين', 'ساعات');
  const dd = Math.round(h / 24); return dd === 1 ? 'أمس' : 'قبل ' + count(dd, 'يوم', 'يومين', 'أيام');
}
// العدد مع المعدود: 1 منصة، منصتان، 3 منصات، 11 منصة
function count(n, one, two, few, many) {
  if (n === 1) return one; if (n === 2) return two;
  return num(n) + ' ' + (n % 100 >= 3 && n % 100 <= 10 ? few : (many || one.replace(/ (واحدة|واحد)$/, '')));
}
function fmtPhone(p) {   // +974 7223 2609
  const d = String(p || '').replace(/\D/g, ''); if (!d) return '';
  const n = d.slice(-8); return n.length === 8 ? '+974 ' + n.slice(0, 4) + ' ' + n.slice(4) : '+' + d;
}
const waPhone = p => { const n = String(p || '').replace(/\D/g, '').slice(-8); return n.length === 8 ? '974' + n : ''; };
const num = n => Number(n || 0).toLocaleString('en-US');
const today = () => fmtDate(new Date()).slice(0, 10);

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200); }

// ---------- الحالة ----------
const S = {
  reg: null,
  platforms: [],         // كل المنصات: المسجلة والمكتشفة
  backends: new Map(),   // api -> {api, label, platforms:[], token, me, data, err}
  tokens: store.get(TOK, {}, sessionStorage),
  filter: {plat: 'all', state: 'open', q: ''},
  qfilter: 'open',
  digest: null
};

// ---------- السجل والاكتشاف التلقائي ----------
async function getJSON(url, opt) { const r = await fetch(url, Object.assign({cache: 'no-store'}, opt)); if (!r.ok) throw new Error(r.status); return r.json(); }
async function getText(url) { const r = await fetch(url, {cache: 'no-store'}); if (!r.ok) throw new Error(r.status); return r.text(); }
const gh = p => getJSON(GH + p, {cache: 'default', headers: {Accept: 'application/vnd.github+json'}});
const pagesUrl = (owner, repo) => repo.toLowerCase() === owner.toLowerCase() + '.github.io' ? 'https://' + owner.toLowerCase() + '.github.io/' : 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/';
const keyOf = p => (p.repo + (p.path ? '/' + p.path : '')).toLowerCase();

async function discover(reg) {
  const cached = store.get(DISC, null);
  if (cached && Date.now() - cached.t < 10 * 60000) return cached.d;
  const out = {repos: {}, apps: [], ok: true};
  try {
    const lists = await Promise.all(reg.owners.map(o => gh('users/' + o + '/repos?per_page=100&type=owner').catch(() => { out.ok = false; return []; })));
    const repos = lists.flat().filter(r => r.has_pages && !r.archived && !r.fork);
    repos.forEach(r => { out.repos[r.full_name.toLowerCase()] = {repo: r.full_name, owner: r.owner.login, name: r.name, desc: r.description || '', pushed: r.pushed_at, branch: r.default_branch, site: r.homepage && /github\.io/.test(r.homepage) ? r.homepage : pagesUrl(r.owner.login, r.name)}; });
    await Promise.all(repos.map(async r => {
      const info = out.repos[r.full_name.toLowerCase()];
      // تطبيقات داخل المستودع: كل مجلد في أعلى المستودع فيه manifest.webmanifest
      try {
        const t = await gh('repos/' + r.full_name + '/git/trees/' + r.default_branch + '?recursive=1');
        (t.tree || []).forEach(x => { const m = /^([^/]+)\/manifest\.webmanifest$/.exec(x.path); if (m) out.apps.push({repo: r.full_name, path: m[1], site: info.site + m[1] + '/'}); });
      } catch (e) { out.ok = false; }
      // حالة آخر نشر
      try {
        const runs = await gh('repos/' + r.full_name + '/actions/runs?per_page=10&branch=' + r.default_branch);
        const pr = (runs.workflow_runs || []).find(w => /pages/i.test(w.name || '')) || (runs.workflow_runs || [])[0];
        if (pr) info.deploy = {status: pr.status, conclusion: pr.conclusion, at: pr.updated_at};
      } catch (e) {}
    }));
    await Promise.all(out.apps.map(async a => {
      try { const c = await gh('repos/' + a.repo + '/commits?per_page=1&path=' + encodeURIComponent(a.path)); a.pushed = c[0] && c[0].commit.committer.date; } catch (e) {}
    }));
  } catch (e) { out.ok = false; }
  if (out.ok) store.set(DISC, {t: Date.now(), d: out});
  return out;
}

async function siteTitle(url) {
  try { const h = await getText(url); const m = /<title>([^<]+)<\/title>/i.exec(h); return m ? m[1].split(/[|·\-–]/)[0].trim() : ''; } catch (e) { return ''; }
}
function colorFor(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return 'hsl(' + h + ' 45% 38%)'; }

async function buildPlatforms() {
  const reg = S.reg, disc = await discover(reg);
  const ignore = new Set((reg.ignore || []).map(x => x.toLowerCase()));
  const list = reg.platforms.map(p => Object.assign({source: 'registry'}, p, {pinned: /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(p.api || '') ? p.api : '', api: ''}));
  const known = new Set(list.map(keyOf));
  // مستودعات منشورة غير مسجلة
  Object.values(disc.repos).forEach(r => {
    const k = r.repo.toLowerCase();
    if (known.has(k) || ignore.has(k)) return;
    list.push({id: k.replace(/[^a-z0-9]+/g, '-'), repo: r.repo, name: '', kind: r.desc || 'منصة جديدة', site: r.site, icon: 'assets/icon-192.png', admin: '', config: 'assets/config.js', source: 'discovered', color: colorFor(k), probe: true});
  });
  // تطبيقات داخل المستودعات غير مسجلة
  disc.apps.forEach(a => {
    const k = (a.repo + '/' + a.path).toLowerCase();
    if (known.has(k) || ignore.has(k)) return;
    list.push({id: k.replace(/[^a-z0-9]+/g, '-'), repo: a.repo, path: a.path, name: '', kind: 'تطبيق جديد', site: a.site, icon: 'assets/icon-192.png', admin: '', config: 'assets/config.js', source: 'discovered', color: colorFor(k), probe: true});
  });
  // آخر تحديث وحالة النشر
  list.forEach(p => {
    const r = disc.repos[p.repo.toLowerCase()];
    const a = p.path && disc.apps.find(x => x.repo.toLowerCase() === p.repo.toLowerCase() && x.path === p.path);
    p.pushed = (a && a.pushed) || (r && r.pushed) || '';
    p.deploy = r && r.deploy;
    p.discOk = disc.ok;
  });
  await Promise.all(list.map(async p => {
    if (!p.name) p.name = (await siteTitle(p.site)) || (p.path || p.repo.split('/')[1]);
    // صحة الموقع
    try { const r = await fetch(p.site, {cache: 'no-store'}); p.up = r.ok; }
    catch (e) { try { await fetch(p.site, {mode: 'no-cors', cache: 'no-store'}); p.up = true; } catch (e2) { p.up = false; } }
    // الخادم من ملف الإعدادات
    // بيانات الدخول لا تُرسل إلا إلى خادم مثبّت في platforms.json لمنصة مسجلة.
    // ملف إعدادات المنصة يُقرأ للعرض فقط: منصة مكتشفة أو رابط خادم لا يطابق السجل لا يصله شيء.
    p.api = ''; p.cfgApi = '';
    if (p.config) {
      try { const t = await getText(p.site + p.config); const m = /\bAPI\s*:\s*["']([^"']*)["']/.exec(t); p.cfgApi = m ? m[1].trim() : ''; p.mode = p.cfgApi ? 'server' : 'local'; }
      catch (e) { p.mode = 'unknown'; }
    } else p.mode = p.feed ? 'static' : 'unknown';
    if (p.source === 'registry' && p.pinned) {
      if (p.cfgApi === p.pinned) p.api = p.pinned;
      else if (p.cfgApi) p.mode = 'mismatch';
    } else if (p.mode === 'server') p.mode = 'unpinned';
    // آخر خلاصة لمنصات المحتوى
    if (p.feed) { try { const f = await getJSON(p.site + p.feed); p.feedAt = f.published || f.date || ''; p.feedTitle = (f.title && (f.title.ar || f.title)) || ''; } catch (e) {} }
  }));
  S.platforms = list;
  // تجميع المنصات حسب الخادم
  const old = S.backends; S.backends = new Map();
  list.filter(p => p.api).forEach(p => {
    let b = S.backends.get(p.api);
    if (!b) { b = old.get(p.api) || {api: p.api}; b.platforms = []; S.backends.set(p.api, b); }
    b.platforms.push(p);
  });
  S.backends.forEach(b => { b.label = b.platforms.map(p => p.name).join(' و'); const t = S.tokens[b.api]; b.token = t && t.token; b.me = t && t.me; });
}

// ---------- الخوادم ----------
async function call(api, body) {
  let r;
  try { r = await fetch(api, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(body)}); }
  catch (e) { const x = new Error('network'); x.code = 'network'; throw x; }
  let j; try { j = await r.json(); } catch (e) { const x = new Error('network'); x.code = 'network'; throw x; }
  if (!j.ok) { const x = new Error(j.error || 'error'); x.code = j.error || 'error'; throw x; }
  return j;
}
const errText = e => ERR[e && e.code] || ERR[e && e.message] || 'تعذّر إكمال العملية';
function saveTokens() {
  const o = {}; S.backends.forEach(b => { if (b.token) o[b.api] = {token: b.token, me: b.me}; });
  S.tokens = o; store.set(TOK, o, sessionStorage);
}
async function loginBackend(b, u, pw) {
  try { const j = await call(b.api, {action: 'login', username: u, password: pw}); b.token = j.token; b.me = j.me; b.err = ''; return true; }
  catch (e) { b.token = ''; b.err = e.code || 'network'; return false; }
}
async function loadBackend(b) {
  if (!b.token) return;
  try { const j = await call(b.api, {action: 'list', token: b.token}); b.data = j.data; if (j.me) b.me = j.me; b.err = ''; }
  catch (e) { b.data = null; b.err = e.code || 'network'; if (e.code === 'auth') b.token = ''; }
}

// أي طلب أو معاملة تتبع أي منصة على خادم مشترك
function owner(b, rec, kind) {
  if (b.platforms.length === 1) return b.platforms[0];
  const codes = String((kind === 'tx' ? rec.code : rec.codes) || '');
  for (const p of b.platforms) {
    const c = p.claim; if (!c) continue;
    if (c.codes && codes.split(/[,\s]+/).some(x => new RegExp(c.codes).test(x))) return p;
    if (kind !== 'tx' && c.types && c.types.indexOf(String(rec.type || '').trim()) >= 0) return p;
  }
  return b.platforms.find(p => !p.claim) || b.platforms[0];
}
// ---------- عروض الأسعار (القاعدتان 28 و29) ----------
// كل عرض يُحفظ نصاً مقروءاً في سجل العميل (Log) بصيغة «عرض سعر BQ-YYYY-NNNN»، وملفه PDF في ملفات العميل، وله حساب في «حسابي».
const QRX = /BQ-(\d{4})-(\d{4})/;
const Q_ST = {issued: ['صادر', 'info'], sent: ['مُرسَل للعميل', 'warn'], accepted: ['معتمد', 'ok'], rejected: ['لم يُعتمد', 'plain'], replaced: ['استُبدل بعرض أحدث', 'plain'], expired: ['انتهت صلاحيته', 'bad']};
const Q_OPEN = ['issued', 'sent', 'expired'];
function addDays(d, n) { const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + (+n || 0)); return x.toISOString().slice(0, 10); }
function quoteFromLog(l) {
  const t = String(l.body || ''); if (!/^عرض سعر BQ-\d{4}-\d{4}\n/.test(t)) return null;
  const g = (re, d) => { const m = re.exec(t); return m ? m[1] : d; };
  let fees = 0, from = false, items = 0;
  t.split('\n').forEach(x => { const m = /^- \[[^\]]*\] .* × (\d+(?:\.\d+)?) × (\d+(?:\.\d+)?)(\+)? = /.exec(x); if (m) { fees += (+m[2] || 0) * Math.max(1, +m[1] || 1); items++; if (m[3]) from = true; } });
  const gov = +g(/الرسوم الحكومية التقديرية: (\d+(?:\.\d+)?)/, 0);
  return {no: QRX.exec(t)[0], clientId: l.clientId, issued: g(/الإصدار: (\d{4}-\d{2}-\d{2})/, String(l.created || '').slice(0, 10)), validDays: +g(/الصلاحية: (\d+)/, 14),
    lang: g(/اللغة: (ar|en)/, 'ar'), replaces: g(/بدلاً من: (BQ-\d{4}-\d{4})/, ''), total: Math.round((fees + gov) * 100) / 100, from, items, created: l.created};
}
function quoteStatus(q, log, td) {
  let s = 'issued', last = q.created;
  log.forEach(l => {
    const t = String(l.subject || ''); if (!t.includes(q.no) || /^عرض سعر BQ-/.test(String(l.body || ''))) return;
    if (/^إرسال عرض السعر/.test(t) && s === 'issued') { s = 'sent'; last = l.created; }
    else if (/^اعتماد عرض السعر/.test(t)) { s = 'accepted'; last = l.created; }
    else if (/^رفض عرض السعر/.test(t)) { s = 'rejected'; last = l.created; }
    else if (/^استبدال عرض السعر/.test(t)) { s = 'replaced'; last = l.created; }
  });
  q.until = addDays(q.issued, q.validDays);
  if ((s === 'issued' || s === 'sent') && q.until < td) s = 'expired';
  q.status = s; q.last = last;
}
function collectQuotes(b, d, td) {
  const p = b.platforms.find(x => x.quotes); if (!p) return [];
  const log = d.Log || [], cl = {}, acc = {};
  (d.Clients || []).forEach(c => { cl[c.id] = c; });
  (d.Accounts || []).forEach(a => { if (!acc[a.clientId] || a.status === 'مفعّل') acc[a.clientId] = a; });
  return log.map(quoteFromLog).filter(Boolean).map(q => {
    quoteStatus(q, log, td);
    const c = cl[q.clientId] || {}, a = acc[q.clientId];
    q.p = p; q.b = b; q.client = c.name || 'عميل'; q.phone = c.phone || '';
    q.account = a ? (a.status || 'مفعّل') : '';
    q.file = (d.Files || []).find(f => f.clientId === q.clientId && String(f.title || '').includes(q.no)) || null;
    return q;
  });
}

function collect() {
  const per = {}, items = [], quotes = [];
  S.platforms.forEach(p => per[p.id] = {newReq: 0, openTx: 0, late: 0, unread: 0, pending: 0, clients: 0, quotes: 0, has: false});
  const td = today();
  S.backends.forEach(b => {
    const d = b.data; if (!d) return;
    b.platforms.forEach(p => per[p.id].has = true);
    collectQuotes(b, d, td).forEach(q => { quotes.push(q); if (Q_OPEN.includes(q.status)) per[q.p.id].quotes++; });
    const clientPlat = {};
    (d.Requests || []).forEach(r => {
      const p = owner(b, r, 'req'); if (r.clientId) clientPlat[r.clientId] = p;
      if (r.status === 'جديد') per[p.id].newReq++;
      items.push({kind: 'req', p, b, rec: r, at: r.created, open: r.status === 'جديد', title: r.name, phone: r.phone, text: r.services, status: r.status || 'جديد', type: r.type});
    });
    (d.Transactions || []).forEach(t => {
      if (CLOSED_TX.indexOf(t.status) >= 0) return;
      const p = owner(b, t, 'tx'); per[p.id].openTx++;
      if (t.dueDate && String(t.dueDate).slice(0, 10) < td) per[p.id].late++;
    });
    const cname = {}; (d.Clients || []).forEach(c => { cname[c.id] = c; });
    const pf = id => clientPlat[id] || b.platforms.find(p => !p.claim) || b.platforms[0];
    (d.Clients || []).forEach(c => per[pf(c.id).id].clients++);
    (d.Accounts || []).forEach(a => { if (a.status === 'بانتظار التفعيل') per[pf(a.clientId).id].pending++; });
    // رسائل العملاء التي لم يُرد عليها: آخر رسالة في المحادثة من العميل
    const last = {};
    (d.Messages || []).forEach(m => { const k = m.clientId; if (!last[k] || String(m.created) >= String(last[k].created)) last[k] = m; });
    Object.values(last).forEach(m => {
      if (m.from !== 'client') return;
      const p = pf(m.clientId), c = cname[m.clientId] || {};
      per[p.id].unread++;
      items.push({kind: 'msg', p, b, rec: m, at: m.created, open: true, title: c.name || m.by || 'عميل', phone: c.phone, text: m.body, status: 'بانتظار الرد'});
    });
  });
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  quotes.sort((a, b) => (a.no < b.no ? 1 : -1));
  return {per, items, quotes};
}

// ---------- العرض ----------
function logoHtml(p) {
  const letter = esc((p.name || '؟').trim().charAt(0));
  if (!p.icon) return '<span class="logo" style="--brand:' + esc(p.color) + '">' + letter + '</span>';
  return '<span class="logo" style="--brand:' + esc(p.color) + '" data-letter="' + letter + '"><img src="' + esc(p.site + p.icon) + '" alt="" loading="lazy"></span>';
}
function adminLink(p, open) {
  if (!p.admin) return '';
  const b = p.api && S.backends.get(p.api);
  return p.site + p.admin + (open ? '?open=' + encodeURIComponent(open) : '') + (b && b.token ? '#sso=' + b.token : '');
}
function modeBadges(p) {
  const out = [];
  out.push(p.up ? '<span class="badge ok">الموقع يعمل</span>' : p.up === false ? '<span class="badge bad">الموقع لا يستجيب</span>' : '');
  if (p.mode === 'server') {
    const b = S.backends.get(p.api);
    if (b && b.data) out.push('<span class="badge ok">الخادم متصل</span>');
    else if (b && b.err) out.push('<span class="badge ' + (b.err === 'network' ? 'bad' : 'warn') + '">' + esc(b.err === 'network' ? 'الخادم لا يستجيب' : 'بانتظار الدخول') + '</span>');
    if (b && b.platforms.length > 1) out.push('<span class="badge info">خادم مشترك مع ' + esc(b.platforms.filter(x => x !== p).map(x => x.name).join(' و')) + '</span>');
  } else if (p.mode === 'local') out.push('<span class="badge warn">الوضع المحلي: بلا خادم</span>');
  else if (p.mode === 'unpinned') out.push('<span class="badge warn">خادم غير معتمد في السجل</span>');
  else if (p.mode === 'mismatch') out.push('<span class="badge bad">رابط الخادم تغيّر: الدخول موقوف</span>');
  else if (p.mode === 'static') out.push('<span class="badge info">منصة محتوى</span>');
  if (p.deploy) {
    const d = p.deploy;
    out.push(d.status !== 'completed' ? '<span class="badge info">النشر جارٍ</span>' : d.conclusion === 'success' ? '' : '<span class="badge bad">تعثّر آخر نشر</span>');
  }
  if (p.source === 'discovered') out.push('<span class="badge info">انضمت تلقائياً</span>');
  return out.join('');
}
function relogHtml(p) {
  const b = p.api && S.backends.get(p.api);
  if (!b || b.data || b.platforms[0] !== p || b.err === 'network') return '';
  const why = b.err ? (ERR[b.err] || 'تعذّر الدخول') : 'لم يُسجَّل الدخول إلى هذا الخادم بعد';
  return '<form class="relog" data-api="' + esc(b.api) + '"><p>' + esc(why) + (b.platforms.length > 1 ? ' (يشمل ' + esc(b.label) + ')' : '') + '</p>' +
    '<input name="u" placeholder="اسم المستخدم" dir="ltr" autocomplete="username" required><input name="p" type="password" placeholder="كلمة المرور" dir="ltr" autocomplete="current-password" required><button class="primary sm">دخول</button></form>';
}
function cardHtml(p, st) {
  const stats = st.has ? '<div class="stats"><div><b>' + num(st.newReq) + '</b><span>طلبات جديدة</span></div><div><b>' + num(st.openTx) + '</b><span>معاملات جارية</span></div><div><b>' + num(st.unread) + '</b><span>رسائل</span></div><div><b>' + num(st.clients) + '</b><span>العملاء</span></div></div>' : '';
  let note = '';
  if (p.feedAt) note = 'آخر خلاصة: ' + esc(p.feedTitle) + ' · ' + esc(fmtDate(p.feedAt));
  else if (p.mode === 'local') note = 'تعمل على أجهزة المستخدمين فقط إلى أن يُربط خادمها. إدارتها من داخل المنصة نفسها.';
  else if (p.mode === 'mismatch') note = 'رابط الخادم في ملف إعدادات المنصة لا يطابق الرابط المعتمد في سجل الديوان، فلم تُرسل إليه بيانات الدخول. راجع التغيير قبل اعتماده.';
  else if (p.mode === 'unpinned') note = 'للمنصة خادم خاص، ولن يُرسل إليه الديوان بيانات الدخول حتى يُعتمد رابطه في سجل المنصات.';
  else if (p.source === 'discovered') note = 'نُشرت على حساب الشركة وانضمت إلى الديوان تلقائياً.';
  const adm = adminLink(p);
  return '<article class="card" style="--brand:' + esc(p.color) + '"><div class="band"></div>' +
    '<div class="head">' + logoHtml(p) + '<div><h4>' + esc(p.name) + '</h4><p class="kind">' + esc(p.kind || '') + '</p></div>' +
    '<div class="sub">' + (p.pushed ? 'آخر تحديث<br>' + esc(ago(p.pushed)) : '') + '</div></div>' +
    '<div class="badges">' + modeBadges(p) + '</div>' + stats + (note ? '<p class="note">' + note + '</p>' : '') + relogHtml(p) +
    '<div class="actions">' + (adm ? '<a class="btn main" href="' + esc(adm) + '" target="_blank" rel="noopener">لوحة الإدارة</a>' : '') +
    '<a class="btn" href="' + esc(p.site) + '" target="_blank" rel="noopener">الموقع</a>' +
    (adm && p.quotes ? '<a class="btn" href="' + esc(adminLink(p, 'quote')) + '" target="_blank" rel="noopener">عرض سعر جديد PDF</a>' : '') +
    (p.portal ? '<a class="btn" href="' + esc(p.site + p.portal) + '" target="_blank" rel="noopener">بوابة العملاء</a>' : '') +
    '<a class="btn" href="https://github.com/' + esc(p.repo) + (p.path ? '/tree/HEAD/' + esc(p.path) : '') + '" target="_blank" rel="noopener">الملفات</a></div></article>';
}

// ---------- مركز التنبيهات (القاعدة 30) ----------
// شديد الخطورة يُحسب مباشرة من حالة المنصات، والملخص اليومي وما ينتظر القرار من digest.json.
const safeUrl = u => /^https:\/\//.test(String(u || '')) ? String(u) : '';
function alerts(per) {
  const crit = [], follow = [];
  S.platforms.forEach(p => {
    if (p.source !== 'registry') return;
    if (p.up === false) crit.push({title: 'موقع ' + p.name + ' لا يستجيب', detail: 'تعذّر فتح الموقع المنشور من الديوان. تحقّق منه الآن.', url: p.site, go: 'الموقع'});
    if (p.deploy && p.deploy.status === 'completed' && p.deploy.conclusion && p.deploy.conclusion !== 'success') crit.push({title: 'تعثّر آخر نشر لـ' + p.name, detail: 'آخر تحديث لم يصل إلى الموقع المنشور.', url: 'https://github.com/' + p.repo + '/actions', go: 'سجل النشر'});
    if (p.mode === 'mismatch') crit.push({title: 'رابط خادم ' + p.name + ' تغيّر', detail: 'أُوقف إرسال بيانات الدخول إليه حتى يُراجَع التغيير ويُعتمد.', url: 'https://github.com/' + p.repo, go: 'الملفات'});
  });
  S.backends.forEach(b => { if (b.err === 'network' && b.token) crit.push({title: 'خادم ' + b.label + ' لا يستجيب', detail: 'لا تصل الطلبات والرسائل الجديدة إلى الديوان الآن.'}); });
  ((S.digest && S.digest.critical) || []).forEach(x => crit.push(x));
  const sum = k => Object.values(per).reduce((a, x) => a + x[k], 0);
  const q = S.quotes || [], td = today(), soon = addDays(td, 3);
  const add = (n, one, two, few, text, go, many) => { if (n) follow.push({n, label: count(n, one, two, few, many), text, go}); };
  add(sum('unread'), 'رسالة عميل واحدة', 'رسالتا عملاء', 'رسائل عملاء', 'بانتظار الرد', 'inbox', 'رسالة عميل');
  add(sum('newReq'), 'طلب جديد', 'طلبان جديدان', 'طلبات جديدة', 'بانتظار التواصل', 'inbox', 'طلباً جديداً');
  add(sum('late'), 'معاملة متأخرة', 'معاملتان متأخرتان', 'معاملات متأخرة', 'تجاوزت موعدها', '');
  add(sum('pending'), 'حساب عميل', 'حسابا عميلين', 'حسابات عملاء', 'بانتظار التفعيل', '');
  add(q.filter(x => x.status === 'expired').length, 'عرض سعر', 'عرضا سعر', 'عروض أسعار', 'انتهت صلاحيتها دون قرار من العميل', 'quotes');
  add(q.filter(x => (x.status === 'issued' || x.status === 'sent') && x.until <= soon).length, 'عرض سعر', 'عرضا سعر', 'عروض أسعار', 'تنتهي صلاحيتها خلال 3 أيام', 'quotes');
  return {crit, follow, decisions: (S.digest && S.digest.decisions) || []};
}
function digestAge() {
  const d = S.digest && S.digest.date; if (!d) return -1;
  return Math.round((toDate(today()) - toDate(d)) / 86400000);
}
function renderAlerts(per) {
  const a = alerts(per), dg = S.digest, age = digestAge();
  S.alerts = a;
  const pill = $('#alertCount'); pill.textContent = a.crit.length ? num(a.crit.length) : '';
  // الشريط المختصر في النظرة العامة
  const sec = dg && dg.security, secOk = sec && sec.level === 'ok' && !a.crit.length;
  $('#brief').innerHTML = '<div class="brief-main"><span class="dot ' + (a.crit.length ? 'bad' : secOk ? 'ok' : 'warn') + '" aria-hidden="true"></span><div><b>' +
    (a.crit.length ? 'يحتاج انتباهك الآن: ' + count(a.crit.length, 'تنبيه شديد الخطورة', 'تنبيهان شديدا الخطورة', 'تنبيهات شديدة الخطورة', 'تنبيهاً شديد الخطورة') : 'لا يوجد ما هو شديد الخطورة') + '</b>' +
    '<span class="mute">' + (dg ? 'الملخص اليومي ' + esc(dg.date) + ' · ' : '') + count(a.decisions.length, 'قرار واحد ينتظرك', 'قراران ينتظرانك', 'قرارات تنتظرك', 'قراراً ينتظرك') + ' · ' + (a.follow.length ? count(a.follow.reduce((s, x) => s + x.n, 0), 'بند واحد للمتابعة', 'بندان للمتابعة', 'بنود للمتابعة', 'بنداً للمتابعة') : 'لا بنود للمتابعة') + '</span></div></div>' +
    '<button class="btn" data-go="alerts">مركز التنبيهات</button>';
  $('#brief').className = 'brief' + (a.crit.length ? ' is-bad' : '');
  // شديد الخطورة
  $('#aCrit').innerHTML = '<h4>شديد الخطورة <span class="mute">· يُنبَّه به فوراً</span></h4>' + (a.crit.length ?
    '<ul class="alist">' + a.crit.map(x => '<li><div><b>' + esc(x.title) + '</b>' + (x.detail ? '<p>' + esc(x.detail) + '</p>' : '') + '</div>' + (safeUrl(x.url) ? '<a class="btn" href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">' + esc(x.go || 'فتح') + '</a>' : '') + '</li>').join('') + '</ul>' :
    '<p class="calm">لا يوجد ما هو شديد الخطورة. كل المنصات المسجّلة تعمل، وآخر نشر لكل منها ناجح.</p>');
  $('#aCrit').className = 'panel crit' + (a.crit.length ? ' on' : '');
  // الملخص اليومي
  let dh = '<h4>الملخص اليومي <span class="mute">· 7:00 صباحاً بتوقيت السعودية</span></h4>';
  if (!dg) dh += '<p class="mute">لم يصدر ملخص بعد.</p>';
  else {
    dh += '<p class="dmeta"><span class="badge ' + (age > 1 ? 'warn' : 'ok') + '">' + (age > 1 ? 'آخر ملخص قبل ' + count(age, 'يوم', 'يومين', 'أيام') : 'ملخص ' + esc(dg.date)) + '</span>' + (dg.updated ? '<span class="mute">أُعدّ ' + esc(dg.updated) + '</span>' : '') + '</p>';
    if (sec) dh += '<div class="sec-line ' + (sec.level === 'ok' ? 'ok' : 'warn') + '"><b>الأمن</b><span>' + esc(sec.headline) + (sec.checks ? ' (' + num(sec.checks) + ' فحصاً خلال 24 ساعة)' : '') + '</span></div>';
    if ((dg.nightly || []).length) dh += '<p class="sub-h">التطوير الليلي (11:00 م إلى 4:00 ص)</p><ul class="nlist">' + dg.nightly.map(n => '<li><span class="tag">' + esc(n.platform) + '</span><span>' + esc(n.text) + '</span>' + (safeUrl(n.url) ? '<a href="' + esc(safeUrl(n.url)) + '" target="_blank" rel="noopener" aria-label="فتح ' + esc(n.platform) + '">عرض</a>' : '') + '</li>').join('') + '</ul>';
    dh += '<p class="fine">التقرير المفصّل وإشعارات GitHub تصلك مجمّعة في بريد واحد صباح كل يوم.</p>';
  }
  $('#aDigest').innerHTML = dh;
  // ينتظر قرارك
  $('#aDecide').innerHTML = '<h4>ينتظر قرارك <span class="pill soft">' + num(a.decisions.length) + '</span></h4>' + (a.decisions.length ?
    '<ol class="dlist">' + a.decisions.map(x => '<li><b>' + esc(x.title) + '</b>' + (x.detail ? '<span>' + esc(x.detail) + '</span>' : '') + (safeUrl(x.url) ? '<a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">مراجعة</a>' : '') + '</li>').join('') + '</ol>' :
    '<p class="calm">لا قرارات معلّقة.</p>');
  // للمتابعة
  const signed = [...S.backends.values()].some(b => b.data);
  $('#aFollow').innerHTML = '<h4>للمتابعة اليوم</h4>' + (!signed ? '<p class="mute">تظهر هنا بعد الدخول إلى خوادم المنصات.</p>' : a.follow.length ?
    '<ul class="flist">' + a.follow.map(x => '<li><b>' + esc(x.label) + '</b><span>' + esc(x.text) + '</span>' + (x.go ? '<button class="btn" data-go="' + x.go + '">عرض</button>' : '') + '</li>').join('') + '</ul>' :
    '<p class="calm">لا شيء متأخر أو بانتظار المتابعة.</p>');
}

function renderQuotes() {
  const all = S.quotes || [], f = S.qfilter, td = today(), m = td.slice(0, 7);
  const bp = S.platforms.find(p => p.quotes && p.admin);
  const nb = $('#qNew');
  if (bp && adminLink(bp)) { nb.href = adminLink(bp, 'quote'); nb.hidden = false; } else nb.hidden = true;
  const sumTotal = l => l.reduce((a, q) => a + q.total, 0);
  const acc = all.filter(q => q.status === 'accepted');
  $('#qStats').innerHTML = [
    [all.filter(q => q.issued.slice(0, 7) === m).length, 'صادرة هذا الشهر'],
    [all.filter(q => Q_OPEN.includes(q.status)).length, 'بانتظار قرار العميل'],
    [acc.length, 'معتمدة'],
    [num(Math.round(sumTotal(acc))) + ' <small>ر.ق</small>', 'قيمة المعتمد التقديرية']
  ].map(x => '<div><b>' + (typeof x[0] === 'number' ? num(x[0]) : x[0]) + '</b><span>' + x[1] + '</span></div>').join('');
  document.querySelectorAll('#qState .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.v === f));
  const list = all.filter(q => f === 'all' || Q_OPEN.includes(q.status)).slice(0, 200);
  if (!list.length) {
    const none = ![...S.backends.values()].some(b => b.data && b.platforms.some(p => p.quotes));
    $('#qList').innerHTML = '<div class="empty">' + (none ? 'سجّل الدخول إلى خادم بصيرة لعرض عروض الأسعار.' : f === 'open' ? 'لا عروض بانتظار قرار العملاء.' : 'لم يصدر أي عرض سعر بعد. ابدأ بزر «عرض سعر جديد PDF».') + '</div>';
    return;
  }
  $('#qList').innerHTML = list.map(q => {
    const st = Q_ST[q.status] || Q_ST.issued, wa = waPhone(q.phone), adm = adminLink(q.p), file = q.file && safeUrl(q.file.url);
    return '<div class="item" style="--brand:' + esc(q.p.color) + '"><div><div class="meta"><span class="tag ltr">' + esc(q.no) + '</span><span>' + esc(q.issued) + '</span>' +
      '<span class="badge ' + st[1] + '">' + st[0] + '</span>' + (q.replaces ? '<span>بدلاً من <span class="ltr">' + esc(q.replaces) + '</span></span>' : '') + '<span>' + (q.lang === 'en' ? 'بالإنجليزية' : 'بالعربية') + '</span></div>' +
      '<h5>' + esc(q.client) + (q.phone ? ' · <span class="ltr">' + esc(fmtPhone(q.phone)) + '</span>' : '') + '</h5>' +
      '<p class="qline"><span>القيمة التقديرية: <b>' + (q.from ? 'تبدأ من ' : '') + num(q.total) + ' ر.ق</b></span><span>' + count(q.items, 'بند واحد', 'بندان', 'بنود', 'بنداً') + '</span><span>صالح حتى ' + esc(q.until) + '</span></p>' +
      '<p class="qchecks"><span class="' + (q.file ? 'yes' : 'no') + '">' + (q.file ? 'ملف PDF محفوظ في ملف العميل' : 'ملف PDF غير محفوظ') + '</span><span class="' + (q.account ? 'yes' : 'no') + '">' + (q.account ? 'حساب في بصيرة: ' + esc(q.account) : 'لا حساب في بصيرة بعد') + '</span></p></div>' +
      '<div class="acts">' + (file ? '<a class="btn" href="' + esc(file) + '" target="_blank" rel="noopener">ملف PDF</a>' : '') +
      (wa ? '<a class="btn" href="https://wa.me/' + wa + '" target="_blank" rel="noopener">واتساب</a>' : '') +
      (adm ? '<a class="btn main" href="' + esc(adm) + '" target="_blank" rel="noopener">فتح في ' + esc(q.p.name) + '</a>' : '') + '</div></div>';
  }).join('');
}

function render() {
  const {per, items, quotes} = collect();
  S.items = items; S.quotes = quotes;
  // التحية والمزامنة
  const h = new Date().getHours();
  const names = [...S.backends.values()].map(b => b.me && b.me.name).filter(Boolean);
  $('#hello').textContent = (h < 12 ? 'صباح الخير' : 'مساء الخير') + (names[0] ? '، ' + names[0] : '');
  const live = [...S.backends.values()].filter(b => b.data).length;
  $('#sync').textContent = count(S.platforms.length, 'منصة واحدة', 'منصتان', 'منصات') + ' · الخوادم المتصلة ' + live + ' من ' + S.backends.size + ' · آخر تحديث ' + fmtDate(new Date()).slice(11);
  $('#who').textContent = names[0] || '';
  // المؤشرات الإجمالية
  const sum = k => Object.values(per).reduce((a, x) => a + x[k], 0);
  const k = [
    ['newReq', 'طلبات جديدة', sum('newReq') ? 'alert' : ''], ['unread', 'رسائل بانتظار الرد', sum('unread') ? 'alert' : ''],
    ['quotes', 'عروض أسعار بانتظار القرار', ''], ['openTx', 'معاملات مفتوحة', ''], ['late', 'معاملات متأخرة', sum('late') ? 'warn' : ''], ['pending', 'حسابات بانتظار التفعيل', sum('pending') ? 'warn' : '']
  ];
  $('#kpis').innerHTML = k.map(x => '<button class="kpi ' + x[2] + '" data-go="' + (x[0] === 'newReq' || x[0] === 'unread' ? 'inbox' : x[0] === 'quotes' ? 'quotes' : '') + '"><b>' + num(sum(x[0])) + '</b><span>' + x[1] + '</span></button>').join('');
  // البطاقات: المتصلة أولاً ثم الباقي
  const order = p => (p.mode === 'server' ? 0 : p.mode === 'static' ? 1 : 2) + (p.source === 'discovered' ? 3 : 0);
  $('#cards').innerHTML = S.platforms.slice().sort((a, b) => order(a) - order(b)).map(p => cardHtml(p, per[p.id])).join('');
  const open = items.filter(x => x.open).length;
  $('#inboxCount').textContent = open ? num(open) : '';
  renderInbox(); renderTable(); renderAlerts(per); renderQuotes();
}

function renderInbox() {
  const f = S.filter, plats = S.platforms.filter(p => p.api);
  $('#fPlat').innerHTML = '<button class="chip" data-v="all" aria-pressed="' + (f.plat === 'all') + '">كل المنصات</button>' +
    plats.map(p => '<button class="chip" data-v="' + esc(p.id) + '" aria-pressed="' + (f.plat === p.id) + '" style="--c:' + esc(p.color) + '"><i></i>' + esc(p.name) + '</button>').join('');
  document.querySelectorAll('#fState .chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.v === f.state));
  const q = f.q.trim().toLowerCase();
  const list = (S.items || []).filter(x => (f.plat === 'all' || x.p.id === f.plat) && (f.state === 'all' || x.open) &&
    (!q || [x.title, x.phone, fmtPhone(x.phone), x.text, x.rec.id].join(' ').toLowerCase().includes(q))).slice(0, 300);
  if (!list.length) {
    const none = ![...S.backends.values()].some(b => b.data);
    $('#inbox').innerHTML = '<div class="empty">' + (none ? 'لا توجد بيانات بعد: سجّل الدخول إلى خادم واحد على الأقل من بطاقات المنصات.' : f.state === 'open' ? 'لا شيء بانتظار المتابعة. كل الطلبات والرسائل تمت متابعتها.' : 'لا توجد نتائج مطابقة.') + '</div>';
    return;
  }
  $('#inbox').innerHTML = list.map((x, i) => {
    const wa = waPhone(x.phone), adm = adminLink(x.p);
    const kind = x.kind === 'req' ? 'طلب ' + esc(x.rec.id) : 'رسالة عميل';
    return '<div class="item" style="--brand:' + esc(x.p.color) + '"><div><div class="meta"><span class="tag">' + esc(x.p.name) + '</span><span>' + kind + '</span><span>' + esc(fmtDate(x.at)) + '</span>' +
      '<span class="badge ' + (x.open ? 'warn' : 'plain') + '">' + esc(x.status) + '</span>' + (x.type ? '<span>' + esc(x.type) + '</span>' : '') + '</div>' +
      '<h5>' + esc(x.title || '') + (x.phone ? ' · <span class="ltr">' + esc(fmtPhone(x.phone)) + '</span>' : '') + '</h5>' +
      '<p>' + esc(String(x.text || '').slice(0, 260)) + (String(x.text || '').length > 260 ? '…' : '') + '</p></div>' +
      '<div class="acts">' + (wa ? '<a class="btn" href="https://wa.me/' + wa + '" target="_blank" rel="noopener">واتساب</a>' : '') +
      (x.kind === 'req' && x.open ? '<button class="btn" data-done="' + i + '">تم التواصل</button>' : '') +
      (adm ? '<a class="btn main" href="' + esc(adm) + '" target="_blank" rel="noopener">فتح في ' + esc(x.p.name) + '</a>' : '') + '</div></div>';
  }).join('');
  S.shown = list;
}

function renderTable() {
  const dep = p => !p.deploy ? '<span class="mute">—</span>' : p.deploy.status !== 'completed' ? '<span class="badge info">جارٍ</span>' : p.deploy.conclusion === 'success' ? '<span class="badge ok">ناجح</span>' : '<span class="badge bad">متعثّر</span>';
  const mode = p => p.mode === 'mismatch' ? 'خادم غير مطابق' : p.mode === 'unpinned' ? 'خادم غير معتمد' : p.mode === 'server' ? 'خادم ' + (S.backends.get(p.api) && S.backends.get(p.api).platforms.length > 1 ? 'مشترك' : 'مستقل') : p.mode === 'local' ? 'محلي' : p.mode === 'static' ? 'محتوى' : '—';
  $('#ptable').innerHTML = '<thead><tr><th>المنصة</th><th>الرابط</th><th>الموقع</th><th>البيانات</th><th>آخر نشر</th><th>آخر تحديث</th><th>الانضمام</th></tr></thead><tbody>' +
    S.platforms.map(p => '<tr><td><div class="pn">' + logoHtml(p) + '<div><b>' + esc(p.name) + '</b><div class="mute" style="font-size:12px">' + esc(p.kind || '') + '</div></div></div></td>' +
      '<td><a class="ltr" href="' + esc(p.site) + '" target="_blank" rel="noopener">' + esc(p.site.replace(/^https:\/\//, '')) + '</a></td>' +
      '<td>' + (p.up ? '<span class="badge ok">يعمل</span>' : '<span class="badge bad">لا يستجيب</span>') + '</td><td>' + mode(p) + '</td><td>' + dep(p) + '</td>' +
      '<td>' + esc(p.pushed ? fmtDate(p.pushed) : '—') + '</td><td>' + (p.source === 'discovered' ? '<span class="badge info">تلقائي</span>' : 'مسجّلة') + '</td></tr>').join('') + '</tbody>';
}

// ---------- التدفق ----------
async function refresh(full) {
  $('#refresh').disabled = true;
  try {
    if (full) { store.del(DISC); try { S.digest = await getJSON('digest.json'); } catch (e) {} }
    await buildPlatforms();
    await Promise.all([...S.backends.values()].map(loadBackend));
    saveTokens(); render();
  } catch (e) { toast('تعذّر تحديث البيانات الآن'); }
  $('#refresh').disabled = false;
}
function showApp() { $('#login').hidden = true; $('#app').hidden = false; }
function showLogin(msg) {
  $('#app').hidden = true; $('#login').hidden = false;
  const f = $('#loginForm'); f.username.value = store.get(USR, ''); $('#loginMsg').textContent = msg || '';
  (f.username.value ? f.password : f.username).focus();
}

async function doLogin(e) {
  e.preventDefault();
  const f = e.target, u = f.username.value.trim(), pw = f.password.value, msg = $('#loginMsg'), btn = $('#loginBtn');
  msg.className = 'msg';
  if (!u || !pw) { msg.textContent = 'أدخل اسم المستخدم وكلمة المرور'; return; }
  btn.disabled = true; btn.textContent = 'جارٍ الدخول إلى المنصات…';
  try {
    if (!S.platforms.length) await buildPlatforms();
    const bs = [...S.backends.values()];
    if (!bs.length) { msg.textContent = 'لا يوجد خادم مربوط بأي منصة حتى الآن'; return; }
    const res = await Promise.all(bs.map(b => loginBackend(b, u, pw)));
    const ok = res.filter(Boolean).length;
    if (!ok) {
      const errs = bs.map(b => b.err);
      msg.textContent = errs.every(x => x === 'network') ? 'تعذّر الوصول إلى الخوادم. تحقق من الاتصال ثم أعد المحاولة.' : errs.includes('rate_limited') ? ERR.rate_limited : 'اسم المستخدم أو كلمة المرور غير صحيحة';
      return;
    }
    store.set(USR, u); saveTokens(); f.password.value = '';
    await Promise.all(bs.map(loadBackend)); saveTokens();
    showApp(); render();
    if (ok < bs.length) toast('تم الدخول. منصة أو أكثر تحتاج دخولاً منفصلاً من بطاقتها.');
  } catch (err) { msg.textContent = 'تعذّر الدخول الآن، أعد المحاولة'; }
  finally { btn.disabled = false; btn.textContent = 'دخول موحّد'; }
}

async function logout() {
  await Promise.all([...S.backends.values()].filter(b => b.token).map(b => call(b.api, {action: 'staffLogout', token: b.token}).catch(() => {})));
  S.backends.forEach(b => { b.token = ''; b.data = null; b.me = null; b.err = ''; });
  store.del(TOK, sessionStorage); S.tokens = {};
  showLogin('تم تسجيل الخروج من كل المنصات');
  $('#loginMsg').className = 'msg ok';
}

// ---------- الأحداث ----------
function setTab(t) {
  document.querySelectorAll('.tabs [role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(s => s.hidden = s.id !== 'tab-' + t);
  const cur = document.querySelector('.tabs [aria-selected="true"]'); if (cur && cur.scrollIntoView) try { cur.scrollIntoView({block: 'nearest', inline: 'nearest'}); } catch (e) {}
  try { history.replaceState(null, '', '#' + t); } catch (e) {}
  window.scrollTo(0, 0);
}
function bind() {
  $('#loginForm').addEventListener('submit', doLogin);
  $('#pwToggle').addEventListener('click', e => { const i = $('#loginForm').password, show = i.type === 'password'; i.type = show ? 'text' : 'password'; e.target.textContent = show ? 'إخفاء' : 'إظهار'; });
  document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  $('#kpis').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b && b.dataset.go) { S.filter.state = 'open'; S.qfilter = 'open'; renderInbox(); renderQuotes(); setTab(b.dataset.go); } });
  document.querySelector('.wrap').addEventListener('click', e => { const b = e.target.closest('#brief [data-go], #tab-alerts [data-go]'); if (b) { S.filter.state = 'open'; S.qfilter = 'open'; renderInbox(); renderQuotes(); setTab(b.dataset.go); } });
  $('#qState').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { S.qfilter = c.dataset.v; renderQuotes(); } });
  $('#refresh').addEventListener('click', () => refresh(true).then(() => toast('تم تحديث بيانات كل المنصات')));
  $('#logout').addEventListener('click', logout);
  $('#theme').addEventListener('click', () => {
    const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark'; store.set(THEME, r.dataset.theme);
  });
  $('#fPlat').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { S.filter.plat = c.dataset.v; renderInbox(); } });
  $('#fState').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { S.filter.state = c.dataset.v; renderInbox(); } });
  $('#fq').addEventListener('input', e => { S.filter.q = e.target.value; renderInbox(); });
  $('#inbox').addEventListener('click', async e => {
    const btn = e.target.closest('[data-done]'); if (!btn) return;
    const x = S.shown[+btn.dataset.done]; btn.disabled = true;
    try {
      const row = Object.assign({}, x.rec, {status: 'تم التواصل'});
      await call(x.b.api, {action: 'save', token: x.b.token, sheet: 'Requests', row});
      x.rec.status = 'تم التواصل'; toast('تم تحديث الطلب ' + x.rec.id + ' في ' + x.p.name); render();
    } catch (err) { btn.disabled = false; toast(errText(err)); }
  });
  $('#cards').addEventListener('submit', async e => {
    const f = e.target.closest('.relog'); if (!f) return; e.preventDefault();
    const b = S.backends.get(f.dataset.api), btn = f.querySelector('button'); btn.disabled = true;
    const ok = await loginBackend(b, f.u.value.trim(), f.p.value);
    if (ok) { await loadBackend(b); saveTokens(); render(); toast('تم الدخول إلى ' + b.label); }
    else { btn.disabled = false; f.querySelector('p').textContent = ERR[b.err] || 'تعذّر الدخول'; }
  });
}

// شعار لم يُحمَّل: يحل محله الحرف الأول من اسم المنصة
document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.dataset.letter != null) t.replaceWith(document.createTextNode(t.parentNode.dataset.letter)); }, true);

// خروج تلقائي من كل المنصات بعد 30 دقيقة دون استخدام، حمايةً لبيانات العملاء على الأجهزة المشتركة
const IDLE_MIN = 30;
let lastUse = Date.now();
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => addEventListener(ev, () => { lastUse = Date.now(); }, {passive: true}));
setInterval(() => {
  if ($('#app').hidden || Date.now() - lastUse < IDLE_MIN * 60000) return;
  logout().then(() => { $('#loginMsg').className = 'msg'; $('#loginMsg').textContent = 'انتهت الجلسة تلقائياً بعد 30 دقيقة دون استخدام، حفاظاً على سرية البيانات'; });
}, 30000);

async function boot() {
  const th = store.get(THEME, ''); if (th) document.documentElement.dataset.theme = th;
  bind();
  try { S.reg = await getJSON('platforms.json'); } catch (e) { S.reg = {owners: [], platforms: []}; }
  try { S.digest = await getJSON('digest.json'); } catch (e) { S.digest = null; }
  const hasTok = Object.keys(S.tokens).length > 0;
  if (!hasTok) { showLogin(); buildPlatforms().catch(() => {}); return; }
  showApp();
  $('#cards').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  const t = (location.hash || '').slice(1); if (['overview', 'alerts', 'inbox', 'quotes', 'platforms'].includes(t)) setTab(t);
  await refresh(false);
  if (![...S.backends.values()].some(b => b.token)) showLogin(ERR.auth);
}
boot();
})();

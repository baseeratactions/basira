// Security watch: runs every hour from .github/workflows/security-watch.yml.
// It checks that the published site is up and matches this repository (catches defacement or a stuck deploy),
// that every recent commit on the main branch comes from a known account, and that no secret key was committed.
// Any problem opens an issue labelled «security-alert». Only high-risk problems are assigned to the owner
// (GitHub emails it at once), send an instant Telegram message through CallMeBot and fail the run;
// medium ones stay unassigned and reach the owner in the single daily email at 7:00 Doha.
import { execSync } from 'node:child_process';
import { readFileSync, appendFileSync, statSync } from 'node:fs';
import tls from 'node:tls';

const env = process.env;
const REPO = env.GITHUB_REPOSITORY, TOKEN = env.GITHUB_TOKEN;
const SITE = String(env.SITE_URL || '').replace(/\/?$/, '/');
// the custom domain (served through Cloudflare): optional, checked in addition to the GitHub Pages copy
const DOMAIN = String(env.DOMAIN_URL || '').replace(/\/?$/, '/').replace(/^\/$/, '');
const OWNER = env.OWNER_LOGIN || 'baseeratactions';
const TELEGRAM = env.ALERT_TELEGRAM || '';
const WINDOW_MIN = Number(env.WINDOW_MIN || 70);
const LABEL = 'security-alert';
// accounts allowed to change the main branch: the owner, Claude, the site's own data bots and GitHub's web editor
const ALLOWED = new Set(['aboelezz2005@gmail.com', 'baseeratactions@users.noreply.github.com', '341908079+baseeratactions@users.noreply.github.com', 'noreply@anthropic.com',
  'actions@users.noreply.github.com', 'noreply@github.com', '41898282+github-actions[bot]@users.noreply.github.com',
  ...String(env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)]);
const SECRETS = [
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/, 'مفتاح GitHub'],
  [/AKIA[0-9A-Z]{16}/, 'مفتاح AWS'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'مفتاح خاص (Private key)'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'مفتاح Slack'],
  [/sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,}/, 'مفتاح ذكاء اصطناعي'],
  [/sk_live_[A-Za-z0-9]{16,}/, 'مفتاح دفع Stripe'],
  [/AIza[0-9A-Za-z_-]{35}/, 'مفتاح Google API'],
];

const findings = [];   // {level: 'high'|'medium', key, title, detail, recoverable}
let newHigh = 0;   // high-risk findings reported for the first time in this run
const add = f => findings.push(f);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// one date format everywhere: 2026-10-19 10:55 (Doha time)
const doha = d => new Date(d).toLocaleString('sv-SE', { timeZone: 'Asia/Qatar', hour12: false }).slice(0, 16);

async function gh(path, opts = {}) {
  const res = await fetch('https://api.github.com' + path, { ...opts, headers: { authorization: 'Bearer ' + TOKEN, accept: 'application/vnd.github+json', 'content-type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(path + ' ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res.status === 204 ? null : res.json();
}
const git = cmd => execSync('git ' + cmd, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();

async function live(path) {
  try {
    const res = await fetch(SITE + path + '?sw=' + Date.now(), { headers: { 'cache-control': 'no-cache' }, redirect: 'follow' });
    return { status: res.status, body: res.ok ? await res.text() : '' };
  } catch (err) { return { status: 0, body: '' }; }
}
const norm = s => s.replace(/\r\n/g, '\n').trim();

// 1. the published site: up, and the same as the repository
async function checkSite() {
  if (!SITE.startsWith('https://')) return;
  const headAge = (Date.now() - Number(git('log -1 --format=%ct')) * 1000) / 60000;
  const files = git('ls-files').split('\n').filter(f => (/\.html$/.test(f) && f !== '404.html') || f === 'assets/config.js');
  for (const f of files) {
    const path = f === 'index.html' ? '' : f;
    let r = await live(path);
    if (r.status !== 200) { await sleep(30000); r = await live(path); }
    if (r.status !== 200) {
      add({ level: f === 'index.html' ? 'high' : 'medium', key: 'down:' + f, recoverable: true,
        title: (f === 'index.html' ? 'الموقع لا يعمل' : 'صفحة لا تعمل') + ': /' + path,
        detail: 'الرابط ' + SITE + path + ' أعاد الرمز ' + (r.status || 'لا استجابة') + ' في محاولتين بينهما 30 ثانية.' });
      continue;
    }
    if (headAge < 30) continue;   // GitHub Pages may still be publishing the latest commit
    const repoText = norm(readFileSync(f, 'utf8'));
    if (norm(r.body) === repoText) continue;
    await sleep(60000); r = await live(path);
    if (r.status === 200 && norm(r.body) !== repoText) {
      const extra = [...r.body.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map(m => m[1]).filter(s => !repoText.includes(s));
      add({ level: 'high', key: 'diff:' + f, recoverable: true, title: 'المنشور يختلف عن المستودع: /' + path,
        detail: 'محتوى ' + SITE + path + ' لا يطابق الملف ' + f + ' في الفرع الرئيسي منذ أكثر من 30 دقيقة. السبب إما تعديل غير مصرح به على الموقع المنشور، وإما تعثر النشر على GitHub Pages.' +
          (extra.length ? '\nسكربتات في المنشور غير موجودة في المستودع: ' + extra.join('، ') : '') });
    }
  }
}

// 2. recent commits on the main branch must come from a known account
async function checkCommits() {
  const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  const list = await gh(`/repos/${REPO}/commits?since=${since}&per_page=100`);
  for (const c of list) {
    const a = String(c.commit.author?.email || '').toLowerCase(), m = String(c.commit.committer?.email || '').toLowerCase();
    if (ALLOWED.has(a) && ALLOWED.has(m)) continue;
    add({ level: 'high', key: 'commit:' + c.sha, title: 'تعديل على الفرع الرئيسي من حساب غير معروف: ' + c.sha.slice(0, 7),
      detail: 'الكاتب: ' + (c.commit.author?.name || '') + ' <' + a + '>\nالناشر: ' + (c.commit.committer?.name || '') + ' <' + m + '>\nحساب GitHub: ' + (c.author?.login || 'غير مرتبط') +
        '\nالرسالة: ' + String(c.commit.message).split('\n')[0] + '\nالوقت: ' + doha(c.commit.committer?.date) + '\nالرابط: ' + c.html_url });
  }
}

// 3. no secret keys in the repository
function checkSecrets() {
  for (const f of git('ls-files').split('\n')) {
    if (!f || f === 'scripts/security-watch.mjs') continue;
    try { if (statSync(f).size > 2e6) continue; } catch { continue; }
    const t = readFileSync(f, 'utf8');
    for (const [re, name] of SECRETS) {
      const m = t.match(re);
      if (m) add({ level: 'high', key: 'secret:' + f + ':' + name, title: name + ' مكشوف في الملف ' + f,
        detail: 'وُجد ما يشبه ' + name + ' في ' + f + ' (يبدأ بـ ' + m[0].slice(0, 8) + '…). المستودع عام، فاعتبر المفتاح مكشوفاً: ألغه من مصدره وأنشئ بديلاً، ثم احذفه من الملف.' });
    }
  }
}

// 4. the custom domain (baseeratactions.com through Cloudflare). Cloudflare rewrites fonts and adds its own
// /cdn-cgi/ helpers, so pages cannot be byte-identical; instead every page must load, the server address must match
// the repository, and no page may carry a script, frame or form target that the repository file does not have.
const OLD_BASE = 'https://baseeratactions.github.io/basira/';
const strip = u => String(u).replace(/[?#].*$/, '').replace(/^\.\//, '');
function refs(html) {
  const out = new Set();
  for (const m of html.matchAll(/<(script|iframe)\b[^>]*\bsrc=["']([^"']+)["']/gi)) out.add(m[1].toLowerCase() + ':' + strip(m[2]));
  for (const m of html.matchAll(/<form\b[^>]*\baction=["']([^"']+)["']/gi)) out.add('form:' + strip(m[1]));
  for (const m of html.matchAll(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s>]+)/gi)) out.add('refresh:' + strip(m[1]));
  return out;
}
async function fetchText(url) {
  try {
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'sw=' + Date.now(), { headers: { 'cache-control': 'no-cache' }, redirect: 'follow' });
    return { status: res.status, body: res.ok ? await res.text() : '' };
  } catch { return { status: 0, body: '' }; }
}
async function checkDomain() {
  if (!DOMAIN.startsWith('https://')) return;
  const files = git('ls-files').split('\n').filter(f => (/\.html$/.test(f) && f !== '404.html'));
  const toDomain = t => t.split(OLD_BASE).join(DOMAIN).split('baseeratactions.github.io/basira').join(new URL(DOMAIN).host);
  const headAge = (Date.now() - Number(git('log -1 --format=%ct')) * 1000) / 60000;
  let stale = [];
  for (const f of files) {
    const path = f === 'index.html' ? '' : f.replace(/index\.html$/, '');
    let r = await fetchText(DOMAIN + path);
    if (r.status !== 200) { await sleep(30000); r = await fetchText(DOMAIN + path); }
    if (r.status !== 200) {
      add({ level: f === 'index.html' ? 'high' : 'medium', key: 'down:domain:' + f, recoverable: true,
        title: (f === 'index.html' ? 'النطاق لا يعمل' : 'صفحة لا تعمل على النطاق') + ': ' + DOMAIN + path,
        detail: 'الرابط ' + DOMAIN + path + ' أعاد الرمز ' + (r.status || 'لا استجابة') + ' في محاولتين بينهما 30 ثانية.' });
      continue;
    }
    const repoText = toDomain(readFileSync(f, 'utf8'));
    const allowed = refs(repoText);
    const extra = [...refs(r.body)].filter(x => !allowed.has(x) && !/:\/?cdn-cgi\//.test(x) && !/^script:https:\/\/static\.cloudflareinsights\.com\//.test(x));
    if (extra.length) add({ level: 'high', key: 'inject:domain:' + f, recoverable: true, title: 'محتوى غريب على النطاق: ' + DOMAIN + path,
      detail: 'الصفحة ' + DOMAIN + path + ' تحمّل عناصر غير موجودة في الملف ' + f + ' في المستودع:\n' + extra.join('\n') +
        '\nقد يعني ذلك تعديلاً غير مصرح به على الموقع المنشور أو على إعدادات Cloudflare.' });
    // a page on the domain that lags behind the repository (stuck deploy): versions of its own files differ
    const vers = t => [...t.matchAll(/(?:src|href)=["']([^"':]+\?v=[^"']+)["']/gi)].map(m => m[1]).sort().join(' ');
    if (headAge > 120 && vers(repoText) !== vers(r.body)) stale.push('/' + path);
  }
  if (stale.length) add({ level: 'medium', key: 'stale:domain', recoverable: true, title: 'النطاق لا يعرض آخر تحديث في ' + stale.length + ' صفحة',
    detail: 'هذه الصفحات على ' + DOMAIN + ' ما زالت بنسخة أقدم من المستودع بعد أكثر من ساعتين من آخر تعديل: ' + stale.slice(0, 10).join('، ') +
      (stale.length > 10 ? '…' : '') + '\nالسبب الأرجح تعثر النشر على Cloudflare Pages أو ذاكرة تخزين مؤقت قديمة. افتح Cloudflare ← Workers & Pages وتأكد من آخر نشر.' });
  // the settings file decides where client data goes: it must point to the same server as the repository
  const apiOf = t => (String(t).match(/API:\s*["']([^"']*)["']/) || [])[1] || '';
  const c = await fetchText(DOMAIN + 'assets/config.js');
  const repoApi = apiOf(readFileSync('assets/config.js', 'utf8'));
  if (c.status === 200 && apiOf(c.body) !== repoApi)
    add({ level: 'high', key: 'diff:domain:config', recoverable: true, title: 'رابط الخادم على النطاق يختلف عن المستودع',
      detail: 'المنشور على ' + DOMAIN + ': ' + (apiOf(c.body) || 'فارغ') + '\nالمستودع: ' + repoApi + '\nإن لم يكن التغيير منك فقد يُرسل الموقع بيانات العملاء إلى خادم غريب.' });
  await checkCert(new URL(DOMAIN).hostname);
}

// 5. the domain's HTTPS certificate: valid, issued for this domain, and not about to expire
function certInfo(host) {
  return new Promise(resolve => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: 20000 }, () => {
      const c = s.getPeerCertificate();
      resolve({ ok: s.authorized, error: s.authorizationError, to: c.valid_to, issuer: c.issuer?.O || c.issuer?.CN || '' });
      s.end();
    });
    s.on('error', e => resolve({ ok: false, error: e.code || e.message }));
    s.on('timeout', () => { s.destroy(); resolve({ ok: false, error: 'لا استجابة' }); });
  });
}
async function checkCert(host) {
  const c = await certInfo(host);
  if (!c.ok) {
    add({ level: 'high', key: 'ssl:' + host, recoverable: true, title: 'شهادة SSL غير صالحة: ' + host,
      detail: 'فشل التحقق من شهادة الأمان للنطاق ' + host + ' (' + c.error + '). الزوار يرون تحذير «الاتصال غير آمن»، وقد يعني ذلك انتهاء الشهادة أو خللاً في إعداد النطاق أو محاولة انتحال.' });
    return;
  }
  sslNote = 'شهادة ' + host + ' سليمة حتى ' + doha(c.to).slice(0, 10) + ' (' + c.issuer + ')';
  const days = Math.floor((new Date(c.to) - Date.now()) / 86400000);
  if (days < 14) add({ level: days < 5 ? 'high' : 'medium', key: 'sslexp:' + host, recoverable: true, title: 'شهادة SSL تنتهي خلال ' + days + ' يوماً: ' + host,
    detail: 'تنتهي شهادة الأمان للنطاق ' + host + ' في ' + doha(c.to) + ' (المُصدِر: ' + c.issuer + '). يجددها Cloudflare تلقائياً عادة؛ إن لم تتجدد فراجع SSL/TLS ← Edge Certificates في Cloudflare.' });
}
let sslNote = '';

async function telegram(text) {
  if (!/^@?[A-Za-z0-9_]{3,40}$/.test(TELEGRAM)) return;
  const user = TELEGRAM.startsWith('@') ? TELEGRAM : '@' + TELEGRAM;
  try { await fetch('https://api.callmebot.com/text.php?user=' + encodeURIComponent(user) + '&text=' + encodeURIComponent(text.slice(0, 700))); } catch {}
}

async function report() {
  if (env.DRY_RUN === 'true' || env.GITHUB_EVENT_NAME === 'pull_request') return;   // a test run only prints the result
  try { await gh(`/repos/${REPO}/labels`, { method: 'POST', body: JSON.stringify({ name: LABEL, color: 'b60205', description: 'تنبيه أمني آلي' }) }); } catch {}
  const open = await gh(`/repos/${REPO}/issues?labels=${LABEL}&state=open&per_page=100`);
  const keyOf = i => (String(i.body || '').match(/<!-- sw:(.+?) -->/) || [])[1];
  const now = doha(Date.now());
  for (const f of findings) {
    if (open.some(i => keyOf(i) === f.key)) continue;   // already reported and still open: no repeated alert
    const icon = f.level === 'high' ? '🚨' : '⚠️';
    const body = `<!-- sw:${f.key} -->\n**${icon} ${f.level === 'high' ? 'خطورة عالية' : 'خطورة متوسطة'}**\n\n**ما حدث:** ${f.title}\n\n${f.detail.replace(/\n/g, '  \n')}\n\n**الوقت (الدوحة):** ${now}\n\n` +
      `**ما فعله النظام:** سجّل الحدث ${f.level === 'high' ? 'وأرسل هذا التنبيه فوراً مع رسالة Telegram' : 'وسيُدرج في البريد اليومي الموحد الساعة 7:00 صباحاً'}${f.recoverable ? '، وسيغلق التنبيه تلقائياً عند عودة الوضع طبيعياً' : ''}.\n\n` +
      `**ما يلزمك:** ${f.key.startsWith('commit:') ? 'إن لم يكن التعديل منك أو بطلبك، غيّر كلمة مرور GitHub وفعّل التحقق بخطوتين، وراجع «Settings ← Collaborators» و«Deploy keys»، ثم ألغِ التعديل.' : f.key.startsWith('secret:') ? 'ألغِ المفتاح من مصدره فوراً.' : 'افتح الرابط وتأكد من الموقع. إن ظهر محتوى غريب، أخبر Claude في مشروع المراجعة الأمنية.'}\n\n` +
      `[سجل الفحص](${env.GITHUB_SERVER_URL}/${REPO}/actions/runs/${env.GITHUB_RUN_ID})`;
    const issue = await gh(`/repos/${REPO}/issues`, { method: 'POST', body: JSON.stringify({ title: `${icon} تنبيه أمني: ${f.title}`, body, labels: [LABEL] }) });
    if (f.level !== 'high') continue;   // medium: no email now, listed in the daily digest
    newHigh++;
    try { await gh(`/repos/${REPO}/issues/${issue.number}/assignees`, { method: 'POST', body: JSON.stringify({ assignees: [OWNER] }) }); } catch {}
    await telegram(`🚨 ${REPO}: ${f.title}\n${f.detail.split('\n')[0]}\n${now}\n${issue.html_url}`);
  }
  // site problems that cleared on their own are closed with a note
  for (const i of open) {
    const k = keyOf(i);
    if (!k || !/^(down|diff|inject|stale|ssl|sslexp):/.test(k) || findings.some(f => f.key === k)) continue;
    await gh(`/repos/${REPO}/issues/${i.number}/comments`, { method: 'POST', body: JSON.stringify({ body: '✅ عاد الوضع طبيعياً في ' + now + '، وأُغلق التنبيه تلقائياً.' }) });
    await gh(`/repos/${REPO}/issues/${i.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
  }
}

await checkSite();
await checkDomain();
await checkCommits();
checkSecrets();
await report();
const lines = findings.length ? findings.map(f => `- ${f.level === 'high' ? '🚨' : '⚠️'} ${f.title}`).join('\n') : '- ✅ لا مشكلات: الموقع يعمل ويطابق المستودع، ولا تعديلات من حسابات غير معروفة، ولا مفاتيح مكشوفة' + (DOMAIN ? '، والنطاق ' + DOMAIN + ' سليم' + (sslNote ? '، و' + sslNote : '') : '') + '.';
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## الفحص الأمني ${doha(Date.now())}\n\n${lines}\n`);
console.log(lines);
// fail (and so email) only when a new high-risk problem was found, not every hour while it stays open
if (newHigh) process.exitCode = 1;

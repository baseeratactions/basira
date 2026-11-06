// نقل موقع بصيرة إلى نطاق مخصص: node scripts/set-domain.mjs example.com
// يكتب ملف CNAME ويحوّل كل الروابط المطلقة من baseeratactions.github.io/basira إلى النطاق الجديد.
// لا يمس روابط المنصات الأخرى في الديوان (جاهز وغيرها).
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const domain = (process.argv[2] || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) { console.error('اكتب النطاق، مثل: basira.com'); process.exit(1); }

const OLD = 'https://baseeratactions.github.io/basira/';
const NEW = `https://${domain}/`;
const EXT = new Set(['.html', '.xml', '.txt', '.js', '.mjs', '.json', '.webmanifest', '.yml', '.md', '.vcf']);
const SKIP = new Set(['.git', 'node_modules', 'vendor']);
let files = 0, hits = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!EXT.has(extname(name)) || p.endsWith('set-domain.mjs')) continue;
    const src = readFileSync(p, 'utf8');
    let out = src.split(OLD).join(NEW)
      .split('baseeratactions.github.io/basira').join(domain); // الصيغة المختصرة (مثل ترويسة عرض السعر)
    if (p.endsWith('indexnow.yml')) out = out.split('host:"baseeratactions.github.io"').join(`host:"${domain}"`);
    if (name === '404.html') out = out.split('"/basira/').join('"/');
    if (name === 'robots.txt') out = out.replace(/^Disallow: \/basira\//gm, 'Disallow: /');
    if (out !== src) { writeFileSync(p, out); files++; hits += src.split('baseeratactions.github.io/basira').length - 1; }
  }
}
walk('.');
writeFileSync('CNAME', domain + '\n');
console.log(`النطاق: ${domain} | ملفات معدّلة: ${files} | روابط محوّلة: ${hits} | CNAME مكتوب`);

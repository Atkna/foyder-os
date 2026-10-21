// hafiza/task-engine.js ve hafiza/reminders.js dosyalarını index.html içine değiştirmeden gömer.
// Kullanım: node tools/hafiza-gom.js            → gömülü kopyaları kaynakla eşitler
//           node tools/hafiza-gom.js --kontrol  → gömülü kopyalar kaynakla aynı değilse hata verir
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const page = path.join(root, 'index.html');
const blocks = [['hafiza-task-engine', 'hafiza/task-engine.js'], ['hafiza-reminders', 'hafiza/reminders.js']];

let html = fs.readFileSync(page, 'utf8');
const stale = [];
for (const [id, file] of blocks) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (source.includes('</script')) throw new Error(`${file} "</script" içeriyor; sayfaya gömülemez.`);
  const open = `<script id="${id}">\n`;
  const start = html.indexOf(open);
  if (start < 0) throw new Error(`index.html içinde <script id="${id}"> bulunamadı.`);
  const from = start + open.length;
  const end = html.indexOf('</script>', from);
  if (html.slice(from, end) === source) continue;
  stale.push(file);
  html = html.slice(0, from) + source + html.slice(end);
}

if (process.argv.includes('--kontrol')) {
  if (stale.length) { console.error(`Gömülü kopya güncel değil: ${stale.join(', ')}`); process.exit(1); }
  console.log('Gömülü motor kaynakla birebir aynı.');
} else {
  if (stale.length) fs.writeFileSync(page, html);
  console.log(stale.length ? `Güncellendi: ${stale.join(', ')}` : 'Zaten güncel.');
}

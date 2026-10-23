// FOYDER OS — telefon ve masaüstü görünüm denetimi.
// Her sayfayı ve ana açılır pencereleri 360, 390 ve 430 px genişlikte (telefon), 820 px'te (tablet) ve 1440 px'te (masaüstü) açar,
// ekran görüntüsü alır ve şunları ölçer:
//   • yatay taşma: sayfanın ekrandan geniş olması ve ekranın dışına taşan öğeler,
//   • küçük dokunma alanı: tıklanabilir öğelerin 44 px'ten (Apple/Google önerisi) ve 32 px'ten küçük olanları,
//   • küçük yazı: 12 px'ten küçük yazılar.
// Çalıştırma: NODE_PATH=$(npm root -g) node tests/mobil-ekran.js [--etiket sonra] [--kaynak yol/index.html] [--url https://...]
//   --kaynak: başka bir index.html'i ölçer (ör. değişiklik öncesi sürüm), --url: yayınlanmış bir adresi sahte veriyle ölçer.
//   MOBIL_OUT ortam değişkeni çıktı klasörünü belirler. Sonuçlar olcum-<etiket>.json ve .md olarak yazılır.
//   --siki ile çalıştırılırsa telefonda yatay taşma ya da 32 px'ten küçük dokunma alanı varsa hata koduyla çıkar.
// Gerçek Supabase'e bağlanmaz (tests/mock-supabase.js); bütün adlar uydurmadır.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const arg = (ad, vars) => { const i = process.argv.indexOf('--' + ad); return i > -1 ? process.argv[i + 1] : vars; };
const ETIKET = arg('etiket', 'sonra');
const KAYNAK = path.resolve(arg('kaynak', path.join(__dirname, '..', 'index.html')));
const UZAK = arg('url', '');
const SIKI = process.argv.includes('--siki');
const OUT = path.join(process.env.MOBIL_OUT || path.join(require('os').tmpdir(), 'foyder-mobil'), ETIKET);
fs.mkdirSync(OUT, { recursive: true });
const mock = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const xlsxJs = require('./xlsx-yerel')();

/* ---------- Uydurma ama gerçekçi miktarda veri ---------- */
const Y = new Date().getFullYear();
const pad = n => String(n).padStart(2, '0');
const gun = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ADLAR = ['Ayşe', 'Mehmet', 'Zeynep', 'Can', 'Elif', 'Burak', 'Selin', 'Kerem', 'Deniz', 'Ece', 'Murat', 'Gizem', 'Okan', 'Derya'];
const SOYADLAR = ['Örnek', 'Deneme', 'Taslak', 'Kurgu', 'Model', 'Numune', 'Prova'];
const TURLER = ['Gerçek Üye', 'Gerçek Üye', 'Kurumsal Üye', 'Akademisyen', 'Kurumsal/Sponsor Üye'];
const MESLEK = ['Danışman', 'Genel Müdür', 'Mühendis', 'Satın Alma Müdürü', 'Akademisyen', 'Finans Direktörü'];
const members = [], payments = [];
for (let i = 1; i <= 26; i++) {
  const durum = i % 9 === 0 ? 'PASİF' : 'AKTİF';
  members.push({ id: `M${pad(i)}0`, ad: `${ADLAR[i % ADLAR.length]} ${SOYADLAR[i % SOYADLAR.length]}${i > 14 ? ' ' + 'ABCDEFGHIJKL'[i - 15] + '.' : ''}`, durum, uyelikTuru: TURLER[i % TURLER.length], gorev: MESLEK[i % MESLEK.length],
    defterNo: i, ykKararTarihi: `20${18 + (i % 8)}-0${1 + (i % 9)}-1${i % 9}`, kayitTarihi: `20${18 + (i % 8)}-0${1 + (i % 9)}-1${i % 9}`, email: `uye${i}@ornek.org`, telefon: `0500 000 ${pad(i)} ${pad(i * 3 % 100)}`, ucretsiz: i === 7, notlar: i === 3 ? 'Kurumsal fatura istiyor.' : '' });
  [Y - 2, Y - 1, Y].forEach((y, k) => {
    const r = (i * 7 + k * 3) % 10;
    const d = i === 7 ? 'MUAF' : r < 6 || y < Y - 1 ? 'ÖDENDİ' : r < 8 ? 'ÖDENMEDİ' : 'KISMİ';
    const tutar = y === Y ? 6500 : y === Y - 1 ? 5000 : 4000;
    payments.push({ id: `P${pad(i)}${k}0`, uyeId: `M${pad(i)}0`, yil: y, tip: 'AIDAT', tutar, durum: d, odenenTutar: d === 'ÖDENDİ' ? tutar : d === 'KISMİ' ? 2500 : 0, odemeTarihi: d === 'ÖDENDİ' || d === 'KISMİ' ? `${y}-0${1 + (i % 8)}-1${i % 9}` : null, not: '' });
  });
}
const seed = {
  members, payments,
  basvurular: [
    { id: 'B001', ad: 'Aday Örnek Bir', email: 'aday1@ornek.org', telefon: '0500 111 11 11', gorev: 'Mühendis', uyelikTuru: 'Gerçek Üye', basvuruTarihi: gun(-12), durum: 'YENİ', komiteDurumu: '', ykKararNo: '', referans1: 'Ayşe Örnek', referans2: '', evraklar: { cv: true }, notlar: '' },
    { id: 'B002', ad: 'Aday Deneme İki', email: 'aday2@ornek.org', telefon: '', gorev: 'Danışman', uyelikTuru: 'Kurumsal Üye', basvuruTarihi: gun(-30), durum: 'KOMİTEDE', komiteDurumu: 'Görüşüldü', ykKararNo: '', referans1: '', referans2: '', evraklar: { cv: true, foto: true }, notlar: '' },
    { id: 'B003', ad: 'Aday Taslak Üç', email: 'aday3@ornek.org', telefon: '', gorev: 'Genel Müdür', uyelikTuru: 'Gerçek Üye', basvuruTarihi: gun(-60), durum: 'ONAYLANDI', komiteDurumu: '', ykKararNo: '12', referans1: '', referans2: '', evraklar: {}, notlar: '' }],
  kararlar: [1, 2, 3, 4, 5].map(n => ({ id: `K00${n}`, no: 10 + n, tarih: gun(-n * 20), konu: ['Üyelik Kabulü', 'Aidat Belirleme', 'Üyelikten Çıkarma', 'Genel Kurul Tarihi', 'Üyelik Kabulü'][n - 1], uyeAdi: n % 2 ? members[n].ad : '', uyelikTuru: 'Gerçek Üye', durum: n === 3 ? 'PASİF' : 'AKTİF', not: '' })),
  chat: [],
  sohbetler: { 'u-test': [{ r: 'u', t: 'Kaç üyemiz aidat ödemedi?', at: new Date().toISOString() }, { r: 'a', t: `${Y}: 6 aktif üyenin aidatı açık.`, mod: 'basit', at: new Date().toISOString() }] },
  ayarlar: { dernekAdi: 'Örnek Derneği', iban: 'TR00 0000 0000 0000 0000 0000 00', aidat: { [Y]: 6500, [Y - 1]: 5000, [Y - 2]: 4000 }, girisOdentisi: 1000, ai: { provider: 'claude', model: '', apiKey: '', endpoint: '', onayla: true }, sheets: { csvUyeler: '', csvOdemeler: '', csvBasvurular: '', yilCsv: '', webhook: '', autoPull: false, autoPush: false } },
  seq: { m: 26, p: 78, b: 3, k: 5 },
  hafiza: {
    tasks: [
      ['Genel kurul çağrı yazısını üyelere gönder', 'open', gun(-1), 'high', 'Genel Kurul', 'Mehmet Deneme'],
      ['Hazirun cetvelini güncel üye listesine göre düzenle', 'in_progress', gun(0), 'high', 'Genel Kurul', 'Mehmet Deneme'],
      ['Üçüncü çeyrek gelir-gider tablosunu paylaş', 'open', gun(3), 'medium', 'Mali İşler', 'Zeynep Taslak'],
      ['Sektör zirvesi için sponsor listesini çıkar', 'waiting', gun(6), 'medium', 'Büyük Zirve', 'Can Kurgu'],
      ['Sosyal medya takvimini hazırla', 'open', gun(9), 'low', 'Sosyal Medya', 'Can Kurgu'],
      ['Yeni başvuru dosyalarını YK\'ya sun', 'open', gun(2), 'medium', 'Üyelik', 'Mehmet Deneme'],
      ['Aidat hatırlatma mektubunu gönder', 'done', gun(-3), 'medium', 'Mali İşler', 'Zeynep Taslak'],
      ['Web sitesindeki üye listesini güncelle', 'open', '', 'low', 'Genel', '']
    ].map(([title, status, dueDate, priority, project, owner], i) => ({ id: `task_${i}`, title, status, dueDate, dueTime: i === 1 ? '10:00' : '', priority, project, owner, notes: i === 0 ? 'Tüzük gereği en az 15 gün önce.' : '', checklist: i === 0 ? [{ id: 'c1', text: 'Taslak yazıldı', done: true }, { id: 'c2', text: 'Başkan onayı', done: false }] : [], comments: [], history: [], sourceIds: i < 4 ? ['tr_1'] : [], transcriptId: i < 4 ? 'tr_1' : '', createdAt: new Date(Date.now() - (10 - i) * 864e5).toISOString(), completedAt: status === 'done' ? new Date().toISOString() : null })),
    transcripts: [{ id: 'tr_1', title: 'Yönetim Kurulu haftalık koordinasyon toplantısı', date: gun(-7), text: 'Uydurma toplantı metni. Genel kurul çağrı yazısı gönderilecek. Hazirun cetveli düzenlenecek.', wordCount: 14, createdAt: new Date(Date.now() - 7 * 864e5).toISOString() },
      { id: 'tr_2', title: 'Zirve hazırlık toplantısı', date: gun(-14), text: 'Uydurma metin. Sponsor listesi çıkarılacak.', wordCount: 6, createdAt: new Date(Date.now() - 14 * 864e5).toISOString() }]
  }
};

/* ---------- Sunucu ve sahte bağlantılar ---------- */
const temizle = html => html.replace(/(supabase\.js") integrity="sha384-[^"]+" crossorigin="anonymous"/, '$1');
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      if (req.url.split('?')[0] !== '/index.html') { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(temizle(fs.readFileSync(KAYNAK, 'utf8')));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
async function ac(browser, adres, { w, h, mobil, init = {} }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobil, hasTouch: mobil, locale: 'tr-TR' });
  if (UZAK) await ctx.route(u => u.href.startsWith(UZAK.replace(/\/+$/, '')) && !/\.(js|css|png|svg|ico)(\?|$)/.test(u.pathname), async r => {
    const yanit = await r.fetch(); r.fulfill({ response: yanit, body: temizle(await yanit.text()) });
  });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@e965\/xlsx@0\.20\.3\//, r => r.fulfill({ contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: xlsxJs }));
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ contentType: r.request().url().endsWith('.css') ? 'text/css' : 'application/javascript', body: '' }));
  await ctx.route(/supabase\.co|api\.anthropic\.com|googleapis|openai/, r => r.abort());
  await ctx.addInitScript(({ seed, init }) => { window.__seed = seed; window.__role = 'admin'; Object.assign(window, init); try { localStorage.setItem('foyder:sonYedek', new Date().toISOString()); } catch (e) {} }, { seed, init });
  const page = await ctx.newPage();
  page.hatalar = [];
  page.on('pageerror', e => page.hatalar.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.goto(adres);
  if (!init.__oturumYok) await page.waitForFunction(() => document.getElementById('nav') && document.getElementById('nav').innerHTML.length > 100);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return { ctx, page };
}

/* ---------- Ölçüm (tarayıcı içinde) ---------- */
// W: cihazın gerçek genişliği. Telefonda içerik taşınca tarayıcı sayfayı uzaklaştırıp innerWidth'i büyütür; bu yüzden innerWidth'e güvenilmez.
function olc(W) {
  const H = innerHeight;
  const modal = document.querySelector('#modalRoot .modal');
  const kok = modal || document.body;
  // Ekranın tamamen solunda kalan öğeler (kapalı yan menü gibi) görünmez sayılır: taşma yaratmaz, okunmaz, dokunulmaz.
  const gorunur = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.right <= 0) return false; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; for (let p = el; p; p = p.parentElement) { const ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden') return false; } return true; };
  // Yatay kaydırmalı bir kabın içindeki öğe sayfayı taşırmaz.
  const kaydirmali = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true; } return false; };
  const ad = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.'); const t = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 28); return t ? `${s} "${t}"` : s; };
  const tasma = Math.max(document.documentElement.scrollWidth, innerWidth) - W;
  const tasanlar = [];
  for (const el of kok.querySelectorAll('*')) {
    if (!gorunur(el) || kaydirmali(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) tasanlar.push(`${ad(el)} (${Math.round(r.left)}–${Math.round(r.right)})`);
  }
  // Dokunma alanları: düğme, bağlantı, form alanları ve tıklanabilir öğeler. Ekranda görünür olanlar ölçülür.
  const SEC = 'button,a[href],a[onclick],input:not([type=hidden]),select,textarea,summary,[onclick],[role=button],label.switch,label.chk';
  const kucuk44 = [], kucuk32 = [];
  const tiklanabilir = [...kok.querySelectorAll(SEC)].filter(el => gorunur(el) && !el.closest('.overlay:not(:has(.modal))'));
  for (const el of tiklanabilir) {
    if (!modal && el.closest('#modalRoot')) continue;
    // Tıklanabilir bir kabın içindeki daha küçük tıklanabilir öğe değil, en dıştaki ölçülür (satırın tamamı dokunulabilirse).
    if (el.parentElement && el.parentElement.closest(SEC) && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'SUMMARY'].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) { const l = el.closest('label'); if (l) continue; }
    const k = Math.min(r.width, r.height);
    if (k < 44) kucuk44.push(`${ad(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    if (k < 32) kucuk32.push(`${ad(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  // Yazı boyu: görünür metni olan en içteki öğeler.
  const yazilar = []; let toplamYazi = 0;
  const w = document.createTreeWalker(kok, NodeFilter.SHOW_TEXT);
  const gorulen = new Set();
  while (w.nextNode()) {
    const n = w.currentNode; if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || gorulen.has(el) || ['SCRIPT', 'STYLE', 'OPTION', 'TITLE'].includes(el.tagName)) continue;
    gorulen.add(el); if (!gorunur(el)) continue;
    if (!modal && el.closest('#modalRoot')) continue;
    toplamYazi++;
    let fs = parseFloat(getComputedStyle(el).fontSize);
    // Grafiklerde (SVG) yazı, çizimle birlikte ölçeklenir: ekranda görünen gerçek boyu ölçülür.
    const svg = el.closest('svg'); if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) fs = Math.round(fs * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width * 10) / 10;
    if (fs < 12) yazilar.push({ fs, t: ad(el) });
  }
  const fsSay = {}; yazilar.forEach(x => { fsSay[x.fs] = (fsSay[x.fs] || 0) + 1; });
  return {
    sayfaGenisligi: Math.max(document.documentElement.scrollWidth, innerWidth), ekran: W, yukseklik: document.documentElement.scrollHeight, ekranYuksekligi: H,
    tasma: Math.max(0, tasma), tasanlar: tasanlar.slice(0, 12), tasanSayisi: tasanlar.length,
    dokunma: tiklanabilir.length, kucuk44: kucuk44.length, kucuk32: kucuk32.length, ornek44: kucuk44.slice(0, 14), ornek32: kucuk32.slice(0, 14),
    yazi: toplamYazi, kucukYazi: yazilar.length, kucukYazi11: yazilar.filter(x => x.fs < 11).length, boyutlar: fsSay, ornekYazi: yazilar.slice(0, 10).map(x => `${x.fs}px ${x.t}`)
  };
}

/* ---------- Ekranlar ---------- */
const SAYFALAR = [['dashboard', 'Genel Bakış'], ['asistan', 'AI Asistan'], ['uyeler', 'Üyeler'], ['aidat', 'Aidat'], ['basvurular', 'Başvurular'], ['kararlar', 'YK Kararları'],
  ['gorevler', 'Toplantılar ve Görevler'], ['raporlar', 'Raporlama'], ['analiz', 'Analiz'], ['mesajlar', 'Mesaj Şablonları'], ['ayarlar', 'Ayarlar']];
const EKRANLAR = [
  ...SAYFALAR.map(([id, ad]) => ({ id, ad, git: id => go(id) })),
  { id: 'gorevler-pano', ad: 'Görevler · Pano', git: () => HZ.tab('board') },
  { id: 'gorevler-takvim', ad: 'Görevler · Takvim', git: () => HZ.tab('calendar') },
  { id: 'gorevler-toplantilar', ad: 'Görevler · Toplantılar', git: () => HZ.tab('meetings') },
  { id: 'gorevler-haftalik', ad: 'Görevler · Haftalık Özet', git: () => HZ.tab('weekly') },
  { id: 'ayarlar-ai', ad: 'Ayarlar · Yapay zekâ', git: () => { ayarTab = 'ai'; go('ayarlar'); } },
  { id: 'pencere-uye', ad: 'Üye ayrıntısı penceresi', git: () => { go('uyeler'); openMember('M030'); } },
  { id: 'pencere-uye-duzenle', ad: 'Üye düzenleme penceresi', git: () => { go('uyeler'); editMember('M030'); } },
  { id: 'pencere-odeme', ad: 'Ödeme penceresi', git: () => { go('aidat'); editPayment('P0320'); } },
  { id: 'pencere-gorev', ad: 'Görev ayrıntısı penceresi', git: () => { HZ.tab('list'); HZ.openTask('task_0'); } },
  { id: 'menu', ad: 'Menü (telefonda açık)', yalnizMobil: true, git: () => { go('dashboard'); const b = document.querySelector('[data-menu-ac]'); if (b) b.click(); } }
];
const BOYUTLAR = [{ ad: '360', w: 360, h: 780, mobil: true }, { ad: '390', w: 390, h: 844, mobil: true }, { ad: '430', w: 430, h: 932, mobil: true }, { ad: 'tablet', w: 820, h: 1180, mobil: true }, { ad: 'masaustu', w: 1440, h: 900, mobil: false }];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = UZAK ? null : await serve();
  const adres = UZAK || `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  const sonuc = { etiket: ETIKET, kaynak: UZAK || path.relative(process.cwd(), KAYNAK), tarih: new Date().toISOString(), olcumler: {} };
  const hatalar = [];
  for (const b of BOYUTLAR) {
    sonuc.olcumler[b.ad] = {};
    // Giriş ekranı
    {
      const { ctx, page } = await ac(browser, adres, { ...b, init: { __oturumYok: true } });
      await page.waitForSelector('#authWrap:not(.auth-hide), .auth-wrap:not(.auth-hide)', { timeout: 8000 }).catch(() => {});
      await sleep(250);
      sonuc.olcumler[b.ad].giris = await page.evaluate(olc, b.w);
      await page.screenshot({ path: path.join(OUT, `${b.ad}-giris.jpg`), type: 'jpeg', quality: 72 });
      hatalar.push(...page.hatalar); await ctx.close();
    }
    const { ctx, page } = await ac(browser, adres, b);
    for (const e of EKRANLAR) {
      if (e.yalnizMobil && !b.mobil) continue;
      await page.evaluate(() => { if (typeof closeModal === 'function') closeModal(); window.scrollTo(0, 0); });
      await page.evaluate(`(${e.git.toString()})(${JSON.stringify(e.id)})`);
      await sleep(300);
      const m = await page.evaluate(olc, b.w);
      m.ad = e.ad;
      sonuc.olcumler[b.ad][e.id] = m;
      await page.screenshot({ path: path.join(OUT, `${b.ad}-${e.id}.jpg`), type: 'jpeg', quality: 72 });
      if (!e.id.startsWith('pencere') && e.id !== 'menu') await page.screenshot({ path: path.join(OUT, `${b.ad}-${e.id}-tam.jpg`), type: 'jpeg', quality: 60, fullPage: true });
    }
    hatalar.push(...page.hatalar); await ctx.close();
  }
  await browser.close(); if (srv) srv.close();

  /* ---------- Özet ---------- */
  const satirlar = [];
  const toplam = {};
  for (const [b, ekr] of Object.entries(sonuc.olcumler)) {
    const t = toplam[b] = { ekran: 0, tasan: 0, kucuk44: 0, kucuk32: 0, dokunma: 0, kucukYazi: 0, yazi: 0 };
    for (const [id, m] of Object.entries(ekr)) {
      t.ekran++; if (m.tasma > 0 || m.tasanSayisi) t.tasan++; t.kucuk44 += m.kucuk44; t.kucuk32 += m.kucuk32; t.dokunma += m.dokunma; t.kucukYazi += m.kucukYazi; t.yazi += m.yazi;
      satirlar.push(`| ${b} | ${m.ad || id} | ${m.tasma ? `**${m.tasma} px**` : (m.tasanSayisi ? `${m.tasanSayisi} öğe` : '—')} | ${m.kucuk32}/${m.dokunma} | ${m.kucuk44}/${m.dokunma} | ${m.kucukYazi}/${m.yazi} |`);
    }
  }
  const md = [`# Görünüm ölçümü (${ETIKET})`, '', `Kaynak: ${sonuc.kaynak} · ${sonuc.tarih}`, '',
    '| Genişlik | Ekran sayısı | Yatay taşan ekran | 32 px altı dokunma alanı | 44 px altı dokunma alanı | 12 px altı yazı |', '|---|---|---|---|---|---|',
    ...Object.entries(toplam).map(([b, t]) => `| ${b} | ${t.ekran} | ${t.tasan} | ${t.kucuk32} / ${t.dokunma} (%${Math.round(t.kucuk32 / Math.max(1, t.dokunma) * 100)}) | ${t.kucuk44} / ${t.dokunma} (%${Math.round(t.kucuk44 / Math.max(1, t.dokunma) * 100)}) | ${t.kucukYazi} / ${t.yazi} (%${Math.round(t.kucukYazi / Math.max(1, t.yazi) * 100)}) |`),
    '', '## Ekran ekran', '', '| Genişlik | Ekran | Yatay taşma | 32 px altı | 44 px altı | 12 px altı yazı |', '|---|---|---|---|---|---|', ...satirlar, ''].join('\n');
  sonuc.toplam = toplam; sonuc.hatalar = hatalar;
  fs.writeFileSync(path.join(OUT, `olcum-${ETIKET}.json`), JSON.stringify(sonuc, null, 1));
  fs.writeFileSync(path.join(OUT, `olcum-${ETIKET}.md`), md);
  console.log(md.split('## Ekran ekran')[0]);
  console.log('Ekran görüntüleri ve ayrıntılı sonuç:', OUT);
  if (hatalar.length) console.log('Sayfa hataları:', hatalar);
  const telefonda = Object.entries(toplam).filter(([b]) => /^\d+$/.test(b));
  const kotu = telefonda.some(([, t]) => t.tasan > 0 || t.kucuk32 > 0) || hatalar.length;
  if (SIKI && kotu) { console.log('✘ Telefonda yatay taşma, 32 px altı dokunma alanı ya da sayfa hatası var'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });

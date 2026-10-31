// Başvurular sayfası (süreç takibi) — Panel Akışı CSV'sinden gelen verinin tarayıcıda uçtan uca denenmesi.
// Çalıştırma: NODE_PATH=$(npm root -g) node tests/e2e-basvuru.js   (Playwright ve Chromium gerekir)
// Gerçek Supabase'e ve Google Sheets'e bağlanmaz; bütün adlar ve adresler uydurmadır.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.E2E_OUT || path.join(require('os').tmpdir(), 'foyder-e2e-basvuru');
fs.mkdirSync(OUT, { recursive: true });
const mock = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const bugun = new Date(); const gunOnce = n => { const d = new Date(bugun - n * 864e5); return d.toISOString().slice(0, 10); };

const seed = {
  members: [{ id: 'M001', ad: 'Deniz Örnek', durum: 'AKTİF', uyelikTuru: 'Gerçek Üye', gorev: 'Avukat', defterNo: 1, ykKararTarihi: gunOnce(100), kayitTarihi: gunOnce(100), email: '', telefon: '', ucretsiz: false, notlar: '' }],
  payments: [], kararlar: [],
  basvurular: [{ id: 'B000', ad: 'KAAN DENEME', email: 'kaan@ornek.org', telefon: '', gorev: 'Danışman', uyelikTuru: 'Gerçek Kişi Üye', basvuruTarihi: gunOnce(0), durum: 'YENİ', komiteDurumu: '', ykKararNo: '', referans1: '', referans2: '', evraklar: {}, notlar: 'E-posta/Form aktarımı' }, { id: 'B001', ad: 'Elle Girilen Aday', email: 'elle@ornek.org', telefon: '', gorev: 'Mühendis', uyelikTuru: 'Gerçek Üye', basvuruTarihi: gunOnce(3), durum: 'YENİ', komiteDurumu: '', ykKararNo: '', referans1: '', referans2: '', evraklar: {}, notlar: 'Telefonla görüşüldü' }],
  ayarlar: { rol: 'admin', dernekAdi: 'Deneme Derneği', iban: '', aidat: {}, girisOdentisi: 1000, ai: { provider: 'claude', model: '', apiKey: '', endpoint: '', onayla: true }, sheets: { csvUyeler: '', csvOdemeler: '', csvBasvurular: 'https://docs.google.com/akis/pub?output=csv', yilCsv: '', webhook: '', autoPull: false, autoPush: false } },
  seq: { m: 1, p: 0, b: 2, k: 0 }
};
const H = ['Kayıt No', 'Başvuru Tarihi', 'Ekip Durumu', 'Ad Soyad', 'E-posta', 'Üyelik Türü', 'Üye Olma Amacı', 'Kurum', 'Meslek', '1. Referans', '2. Referans', 'Online Evrak', 'Kontrol Notu', 'Başvuru Maili', 'Onay Maili', 'Onay Adresi', 'Onay Yazışması', 'Bizden Son Mail', 'Bizden Son Konu', 'Aday Son Mail', 'Aday Son Konu', 'Aday Son Mesaj', 'Aday Ek Sayısı', 'Hoş Geldiniz Maili', 'Süreç Aşaması', 'Güncelleme'];
const satir = o => H.map(h => `"${String(o[h] ?? '').replace(/"/g, '""')}"`).join(',');
const ortak = { 'Üyelik Türü': 'Gerçek Kişi Üye', 'Üye Olma Amacı': 'Sadece Dernek Üyeliği', 'Online Evrak': 'Tam', 'Kontrol Notu': 'Kontrol tamamlandı', 'Güncelleme': `${gunOnce(0)} 11:30` };
const csv = [H.join(','),
  satir({ ...ortak, 'Kayıt No': 'FY-1', 'Başvuru Tarihi': `${gunOnce(130)} 10:00`, 'Ad Soyad': 'Deniz Örnek', 'E-posta': 'deniz@ornek.org', 'Kurum': 'Örnek Hukuk', 'Onay Maili': `${gunOnce(85)} 10:36`, 'Hoş Geldiniz Maili': `${gunOnce(56)} 21:15`, 'Onay Yazışması': 'https://mail.google.com/mail/#all/x1', 'Süreç Aşaması': 'Tamamlandı' }),
  satir({ ...ortak, 'Kayıt No': 'FY-2', 'Başvuru Tarihi': `${gunOnce(140)} 10:00`, 'Ad Soyad': 'ARDA DENEME', 'E-posta': 'arda@ornek.org', 'Kurum': 'Deneme Avukatlık', 'Onay Maili': `${gunOnce(85)} 12:05`, 'Aday Son Mail': `${gunOnce(82)} 13:56`, 'Aday Son Konu': 'Re: Üyelik Kabulü', 'Aday Son Mesaj': 'Merhaba, tamamdır teşekkür ederim. İlgileniyorum.', 'Süreç Aşaması': 'Belge bekleniyor (cevap verdi)' }),
  satir({ ...ortak, 'Kayıt No': 'FY-3', 'Başvuru Tarihi': `${gunOnce(150)} 10:00`, 'Ad Soyad': 'Sena Uydurma', 'E-posta': 'sena@ornek.org', 'Kurum': 'Uydurma Denetim', 'Onay Maili': `${gunOnce(85)} 10:30`, 'Bizden Son Mail': `${gunOnce(85)} 11:03`, 'Bizden Son Konu': 'Re: Üyelik Kabulü (başvuru formu ekte)', 'Süreç Aşaması': 'Belge bekleniyor (dönüş yok)' }),
  satir({ ...ortak, 'Kayıt No': 'FY-4', 'Başvuru Tarihi': `${gunOnce(60)} 10:00`, 'Ad Soyad': 'Ece Örnekoğlu', 'E-posta': 'ece@ornek.org', 'Üyelik Türü': 'Akademisyen / Kamu Çalışanı', 'Kurum': 'Örnek Üniversitesi', 'Onay Maili': `${gunOnce(16)} 13:17`, 'Aday Son Mail': `${gunOnce(5)} 12:15`, 'Aday Son Konu': 'Re: Üyelik Kabulü', 'Aday Son Mesaj': 'Hic sorun degil. IBAN: [IBAN gizlendi] Belgeleri bugun postaya veriyorum.', 'Süreç Aşaması': 'Belge bekleniyor (cevap verdi)' }),
  satir({ ...ortak, 'Kayıt No': 'FY-5', 'Başvuru Tarihi': `${gunOnce(17)} 16:27`, 'Ad Soyad': 'Kaan Deneme', 'E-posta': 'kaan@ornek.org', 'Kurum': 'Deneme Danışmanlık', 'Süreç Aşaması': 'YK bekliyor' }),
  satir({ ...ortak, 'Kayıt No': 'FY-6', 'Başvuru Tarihi': `${gunOnce(16)} 13:11`, 'Ad Soyad': 'Mehmet Örnekçi', 'E-posta': 'mehmet@ornek.org', 'Online Evrak': 'Eksik', 'Kontrol Notu': 'Eksik evrak: CV, Diploma', 'Bizden Son Mail': `${gunOnce(5)} 11:02`, 'Bizden Son Konu': 'Üyelik Başvurunuz Hakkında', 'Süreç Aşaması': 'YK bekliyor' })
].join('\n');

let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(file, 'utf8').replace(/(supabase\.js") integrity="sha384-[^"]+" crossorigin="anonymous"/, '$1'));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
async function open(browser, url, viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, locale: 'tr-TR', isMobile: mobile, hasTouch: mobile });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@e965/, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ contentType: r.request().url().endsWith('.css') ? 'text/css' : 'application/javascript', body: '' }));
  await ctx.route(/docs\.google\.com\/akis/, r => r.fulfill({ contentType: 'text/csv', body: csv }));
  await ctx.addInitScript(({ seed }) => { window.__seed = seed; window.__role = 'admin'; }, { seed });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.cevaplar = [];
  page.on('dialog', d => d.accept(page.cevaplar.shift()));
  await page.goto(url);
  await page.waitForFunction(() => typeof S !== 'undefined' && document.querySelector('#content, main, .main'));
  await page.evaluate(() => go('basvurular'));
  await page.waitForFunction(() => S.basvurular.length >= 6, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  return page;
}

(async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch();
  const page = await open(browser, url, { width: 1360, height: 1000 });

  const st = await page.evaluate(() => ({
    adet: S.basvurular.length,
    deniz: S.basvurular.find(b => b.ad === 'Deniz Örnek'),
    elle: S.basvurular.find(b => b.id === 'B001'),
    kaan: S.basvurular.find(b => b.id === 'B000'), bugun: TODAY,
    gruplar: [...document.querySelectorAll('.bs-group h3')].map(h => h.textContent),
    sayilar: [...document.querySelectorAll('.bs-stat .n')].map(n => n.textContent),
    pills: [...document.querySelectorAll('.bs-row')].map(r => r.querySelector('.bs-nm').textContent + ':' + r.querySelector('.bs-pill').textContent)
  }));
  ok(st.adet === 7, `CSV'deki kişiler eklendi, eski sürümün eklediği kayıt tekrar açılmadı, elle girilen başvuru korundu (${st.adet})`);
  ok(st.kaan && st.kaan.basvuruTarihi !== st.bugun && st.kaan.uyelikTuru === 'Gerçek Üye' && st.kaan.oto, 'eski sürümün "bugün" tarihiyle eklediği kayıt düzeldi');
  ok(st.deniz && st.deniz.durum === 'ONAYLANDI' && st.deniz.oto.hosgeldin, 'zaten üye olan kişi de süreç kaydıyla geldi');
  ok(st.elle && st.elle.notlar === 'Telefonla görüşüldü' && st.elle.durum === 'YENİ', 'elle girilen başvuruya dokunulmadı');
  ok(JSON.stringify(st.gruplar) === JSON.stringify(['YK kararı bekleyenler', 'Onay maili gidenler', 'Onay maili gidenler']), 'gruplar: bekleyenler, sonra onay günleri (yeniden eskiye) ' + JSON.stringify(st.gruplar));
  ok(st.sayilar.join('/') === '7/1/3/3', 'özet sayıları (toplam / tamam / belge bekleniyor / onay gitmedi): ' + st.sayilar.join(' / '));
  ok(st.pills.includes('ARDA DENEME:Cevap verdi, belge yok') && st.pills.includes('Sena Uydurma:Dönüş yok') && st.pills.includes('Mehmet Örnekçi:Evrak eksik') && st.pills.includes('Deniz Örnek:Üye oldu'), 'durum etiketleri doğru');
  await page.screenshot({ path: path.join(OUT, 'basvurular-masaustu.png'), fullPage: true });

  // Elle belge durumu "yolda" yapılınca etiket değişir, sonraki çekme bunu bozmaz
  await page.evaluate(() => { const b = S.basvurular.find(x => x.ad === 'Ece Örnekoğlu'); editBasvuru(b.id); });
  await page.selectOption('#b_belge', 'yolda');
  await page.evaluate(() => { const b = S.basvurular.find(x => x.ad === 'Ece Örnekoğlu'); saveBasvuru(b.id); });
  await page.evaluate(() => basvuruCek(true));
  await page.waitForTimeout(400);
  const ece = await page.evaluate(() => { const r = [...document.querySelectorAll('.bs-row')].find(r => r.textContent.includes('Ece Örnekoğlu')); return r && r.querySelector('.bs-pill').textContent; });
  ok(ece === 'Belge yolda', 'elle girilen "belge yolda" bilgisi Gmail güncellemesinden sonra da kalıyor');
  const ikinci = await page.evaluate(() => S.basvurular.length);
  ok(ikinci === 7, 'ikinci çekmede mükerrer kayıt oluşmadı');

  // Grup için YK kararı tek seferde
  page.cevaplar.push('5', '05.10.2026');
  await page.evaluate(() => { const k = basvuruGruplari(S.basvurular, TODAY, bsEvrakTam).find(g => g.items.some(x => x.b.ad === 'Ece Örnekoğlu')).key; bsGrupKarar(k); });
  await page.waitForTimeout(200);
  const yk = await page.evaluate(() => ({ b: S.basvurular.find(x => x.ad === 'Ece Örnekoğlu'), h: [...document.querySelectorAll('.bs-group h3')].map(h => h.textContent) }));
  ok(yk.b.ykKararNo === '5' && yk.b.ykKararTarihi === '2026-10-05' && yk.h.includes('5 sayılı YK kararı'), 'grup başlığından YK kararı girilince başlık "5 sayılı YK kararı" oluyor');

  // Filtre
  await page.click('.bs-stat.idle');
  const filtre = await page.evaluate(() => [...document.querySelectorAll('.bs-row')].map(r => r.dataset.s));
  ok(filtre.length === 3 && filtre.every(s => s === 'idle'), 'filtre yalnızca onay maili gitmeyenleri gösteriyor');
  await page.click('.bs-stat.idle');

  // Telefon
  const tel = await open(browser, url, { width: 390, height: 844 }, true);
  const tasma = await tel.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(tasma <= 0, 'telefon: başvurular sayfası yatay taşmıyor');
  await tel.screenshot({ path: path.join(OUT, 'basvurular-telefon.png'), fullPage: true });

  ok(!page.errors.length && !tel.errors.length, 'sayfa hatası yok ' + page.errors.concat(tel.errors).join(' | '));
  await browser.close(); srv.close();
  console.log(fails ? `\n${fails} kontrol başarısız` : '\nTüm kontroller geçti');
  process.exit(fails ? 1 : 0);
})();

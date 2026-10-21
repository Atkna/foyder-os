// FOYDER OS paneli — inceleme raporundaki düzeltmelerin tarayıcıda uçtan uca denenmesi.
// Çalıştırma: NODE_PATH=$(npm root -g) node tests/e2e-panel.js   (Playwright ve Chromium gerekir)
// Gerçek Supabase'e, Google Sheets'e ve yapay zekâ sağlayıcısına bağlanmaz; bütün adlar uydurmadır.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.E2E_OUT || path.join(require('os').tmpdir(), 'foyder-e2e-panel');
fs.mkdirSync(OUT, { recursive: true });
const mock = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const Y = new Date().getFullYear();
const XSS = '<img src=x onerror="window.__xss=1">';

const uye = (n, ek = {}) => ({ id: `M00${n}`, ad: `Deneme Üye ${['Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi'][n - 1]}`, durum: 'AKTİF', uyelikTuru: 'Gerçek Üye', gorev: 'Danışman', defterNo: n, ykKararTarihi: '2024-01-15', kayitTarihi: '2024-01-15', email: '', telefon: '', ucretsiz: false, notlar: '', ...ek });
const seed = {
  members: [uye(1), uye(2), uye(3), uye(4), uye(5), uye(6), uye(7, { durum: XSS })],
  payments: [
    { id: 'P0001', uyeId: 'M001', yil: Y, tip: 'AIDAT', tutar: 6500, durum: 'ÖDENMEDİ', odenenTutar: 0, odemeTarihi: null, not: '' },
    { id: 'P0002', uyeId: 'M002', yil: Y, tip: 'AİDAT', tutar: 6500, durum: 'ÖDENDİ', odenenTutar: 6500, odemeTarihi: `${Y}-02-01`, not: '' },
    { id: 'P0003', uyeId: 'M003', yil: Y, tip: 'AIDAT', tutar: 6500, durum: 'ÖDENMEDİ', odenenTutar: 0, odemeTarihi: null, not: '' },
    { id: 'P0004', uyeId: 'M004', yil: Y, tip: 'AIDAT', tutar: 6500, durum: 'KISMİ', odenenTutar: 3000, odemeTarihi: `${Y}-03-01`, not: '' },
    { id: 'P0005', uyeId: 'M001', yil: Y - 1, tip: 'AIDAT', tutar: 5000, durum: 'ÖDENDİ', odenenTutar: 5000, odemeTarihi: `${Y - 1}-04-01`, not: '' }],
  basvurular: [{ id: 'B001', ad: 'Aday Deneme', email: 'aday@ornek.org', telefon: '', gorev: 'Mühendis', uyelikTuru: 'Gerçek Üye', basvuruTarihi: `${Y}-10-01`, durum: XSS, komiteDurumu: '', ykKararNo: '15', referans1: '', referans2: '', evraklar: { cv: true }, notlar: '' }],
  kararlar: [{ id: 'K001', no: 7, tarih: `${Y}-01-10`, konu: 'Üyelik Kabulü', uyeAdi: 'Deneme Üye Bir', uyelikTuru: 'Gerçek Üye', durum: 'AKTİF', not: '' }],
  chat: [],
  ayarlar: { rol: 'admin', dernekAdi: 'Deneme Derneği', iban: '', aidat: { [Y]: 6500, [Y - 1]: 5000 }, girisOdentisi: 1000, ai: { provider: 'claude', model: '', apiKey: '', endpoint: '', onayla: true }, sheets: { csvUyeler: '', csvOdemeler: '', csvBasvurular: '', yilCsv: '', webhook: '', autoPull: false, autoPush: false } },
  seq: { m: 7, p: 5, b: 1, k: 1 }
};

let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      // Supabase testte sahte dosyayla değiştirildiği için bütünlük karması kaldırılır (karma tests/panel.test.js'de denetlenir).
      res.end(fs.readFileSync(file, 'utf8').replace(/ integrity="sha384-[^"]+" crossorigin="anonymous"/, ''));
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
async function open(browser, url, { role = 'admin', init = {}, viewport = { width: 1360, height: 900 }, mobile = false, wait = true } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'tr-TR', isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ contentType: r.request().url().endsWith('.css') ? 'text/css' : 'application/javascript', body: '' }));
  await ctx.route('https://api.anthropic.com/**', r => r.abort());
  await ctx.addInitScript(({ seed, role, init }) => { window.__seed = seed; window.__role = role; Object.assign(window, init); }, { seed, role, init });
  const page = await ctx.newPage();
  page.errors = []; page.dialogs = []; page.plan = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/test\)|Failed to load resource|cloudLoad|canlı eşitleme|silecek/.test(m.text())) page.errors.push(m.text()); });
  page.on('dialog', d => { page.dialogs.push(d.message()); const h = page.plan.shift(); if (h === 'dismiss') d.dismiss(); else d.accept(typeof h === 'string' ? h : undefined); });
  await page.goto(url + '/index.html');
  if (wait) await page.waitForFunction(() => document.getElementById('nav').innerHTML.length > 100);
  return { ctx, page };
}
const db = p => p.evaluate(() => window.__db.row);
const S = p => p.evaluate(() => S);
const saved = async (p, n) => { await p.waitForFunction(n => window.__db.upserts >= n, n, { timeout: 5000 }); await sleep(150); };
// Buluttaki kayıtta beklenen değer görünene kadar bekler (önceki adımların kayıtları araya girebilir).
const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 }).then(() => sleep(150), () => {});

(async () => {
  const srv = await serve(); const URL = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const errors = [];

  /* 1) Açılışta okuma hatası: boş veri buluta yazılmaz */
  {
    const { ctx, page } = await open(browser, URL, { init: { __failRead: true }, wait: false });
    await page.waitForSelector('#loadErrWrap:not(.auth-hide)');
    await sleep(800);
    ok(await page.evaluate(() => window.__db.upserts) === 0, 'okuma hatasında buluta hiçbir şey yazılmadı (eskiden boş veri yazılıyordu)');
    ok((await page.textContent('#loadErrWrap')).includes('Hiçbir kaydınız değiştirilmedi'), 'kullanıcıya anlaşılır hata ekranı gösterildi');
    await page.evaluate(() => { window.__failRead = false; });
    await page.click('#loadErrWrap button');
    await page.waitForFunction(() => document.getElementById('nav').innerHTML.length > 100);
    ok((await S(page)).members.length === 7 && await page.evaluate(() => window.__db.upserts) === 0, '"Yeniden dene" ile veriler yüklendi, yine yazma olmadı');
    errors.push(...page.errors); await ctx.close();
  }

  const { ctx, page } = await open(browser, URL);

  /* 2) Bütün sayfalar açılıyor; kaçışsız metin çalışmıyor */
  for (const r of ['dashboard', 'asistan', 'uyeler', 'aidat', 'basvurular', 'kararlar', 'gorevler', 'raporlar', 'analiz', 'mesajlar', 'ayarlar']) {
    await page.evaluate(r => go(r), r);
    ok((await page.evaluate(() => document.getElementById('main').innerHTML.length)) > 200, `sayfa açılıyor: ${r}`);
  }
  await page.evaluate(() => { openMember('M007'); closeModal(); go('uyeler'); go('basvurular'); });
  await sleep(200);
  ok(await page.evaluate(() => window.__xss) === undefined, 'Sheets/Excel kaynaklı metinler kod olarak çalışmıyor');

  /* 3) Aidat sayfası "AİDAT" yazılmış kayıtları da gösteriyor */
  await page.evaluate(() => { fA.yil = THIS_YEAR; fA.tip = 'AIDAT'; go('aidat'); });
  ok((await page.textContent('.count')).startsWith('4 kayıt'), `Aidat sayfası tüm kayıtları gösteriyor (${await page.textContent('.count')})`);

  /* 4) Asistanın tahsilat cevabı Dashboard ile aynı */
  await page.evaluate(() => go('dashboard'));
  const kpiTah = (await page.locator('.kpi:has-text("Tahsilat") .v').innerText()).trim();
  await page.evaluate(() => runCommand(THIS_YEAR + ' tahsilat ne kadar toplandı?', true));
  await page.waitForFunction(() => S.chat.length && S.chat.at(-1).r === 'a');
  const cevap = (await S(page)).chat.at(-1).t;
  ok(cevap.includes(kpiTah), `asistanın tahsilatı Dashboard ile aynı (${kpiTah} · "${cevap.split('\n')[0]}")`);

  /* 5) Yedek hatırlatması ve JSON yedeğinde anahtar yok */
  await page.evaluate(() => go('dashboard'));
  ok(await page.locator('.banner:has-text("JSON yedeği")').count() === 1, 'yöneticiye yedek hatırlatması gösteriliyor');
  await page.evaluate(() => { S.ayarlar.ai.apiKey = 'gizli-anahtar-test'; });
  const [d1] = await Promise.all([page.waitForEvent('download'), page.click('.banner button:has-text("Şimdi yedek al")')]);
  const yedek = fs.readFileSync(await d1.path(), 'utf8');
  ok(!yedek.includes('gizli-anahtar-test') && JSON.parse(yedek).members.length === 7, 'JSON yedeğinde yapay zekâ anahtarı yok');
  await page.evaluate(() => go('dashboard'));
  ok(await page.locator('.banner:has-text("JSON yedeği")').count() === 0, 'yedek alınınca hatırlatma kalkıyor');

  /* 6) Eşzamanlı düzenleme: başka kullanıcının değişiklikleri ezilmez */
  let n = await page.evaluate(() => window.__db.upserts);
  await page.evaluate(() => editMember('M001'));
  await page.fill('#f_tel', '0500 000 00 01');
  await page.evaluate(() => { const r = window.__db.row; r.members[0].email = 'b@ornek.org'; r.members[1].durum = 'PASİF'; r.members.push({ id: 'M099-bbbb', ad: 'Başka Kullanıcının Üyesi', durum: 'AKTİF' }); r.kararlar.push({ id: 'K099', no: 99, konu: 'Uzak karar' }); window.__db.stamp = new Date().toISOString(); /* gerçek bir kayıt zaman damgasını değiştirir */ });
  await page.click('.modal button:has-text("Kaydet")');
  await until(page, () => window.__db.row.members.find(m => m.id === 'M001').telefon === '0500 000 00 01');
  let row = await db(page);
  const m1 = row.members.find(m => m.id === 'M001');
  if (m1.email !== 'b@ornek.org' || m1.telefon !== '0500 000 00 01') console.log('   ayrıntı:', JSON.stringify(m1), await page.evaluate(() => [window.__db.upserts, window.__db.conflicts, JSON.stringify(S.members[0])]));
  ok(m1.telefon === '0500 000 00 01' && m1.email === 'b@ornek.org', 'aynı üyenin iki kullanıcıdaki farklı alanları birleşti');
  ok(row.members.find(m => m.id === 'M002').durum === 'PASİF' && row.members.some(m => m.id === 'M099-bbbb') && row.kararlar.some(k => k.id === 'K099'), 'başka kullanıcının üye/karar değişiklikleri korundu (eskiden siliniyordu)');
  ok((await S(page)).members.some(m => m.id === 'M099-bbbb'), 'başka kullanıcının değişiklikleri bu ekrana da geldi');

  /* 6b) Kayıt sürerken araya giren başka kullanıcı: iyimser kilit yeniden okuyup birleştirir */
  n = await page.evaluate(() => window.__db.upserts);
  await page.evaluate(() => { window.__beforeWrite = r => { r.members.find(m => m.id === 'M003').telefon = 'araya-giren'; }; editMember('M005'); });
  await page.fill('#f_tel', '0500 000 00 05');
  await page.click('.modal button:has-text("Kaydet")');
  await until(page, () => window.__db.row.members.find(m => m.id === 'M005').telefon === '0500 000 00 05');
  row = await db(page);
  ok(row.members.find(m => m.id === 'M003').telefon === 'araya-giren' && row.members.find(m => m.id === 'M005').telefon === '0500 000 00 05' && await page.evaluate(() => window.__db.conflicts) >= 1, 'kayıt anında araya giren değişiklik algılandı ve korundu');

  /* 6c) Açık düzenleme penceresi: kullanıcının dokunmadığı alanlar eski değerle geri yazılmaz */
  await page.evaluate(() => editMember('M006'));
  await page.evaluate(() => { const r = window.__db.row; r.members.find(m => m.id === 'M006').email = 'yeni@ornek.org'; window.__db.stamp = new Date().toISOString(); return pullRemote(); });
  await page.fill('#f_tel', '0500 000 00 06');
  await page.click('.modal button:has-text("Kaydet")');
  await until(page, () => window.__db.row.members.find(m => m.id === 'M006').telefon === '0500 000 00 06');
  const m6 = (await db(page)).members.find(m => m.id === 'M006');
  ok(m6.telefon === '0500 000 00 06' && m6.email === 'yeni@ornek.org', 'açık pencereden kayıt, başkasının değiştirdiği alanı ezmedi');

  /* 7) Canlı eşitleme: sayfa yenilemeden değişiklikleri alır */
  await page.evaluate(() => { window.__db.row.kararlar.push({ id: 'K100', no: 100, konu: 'Canlı gelen karar' }); return pullRemote(); });
  await sleep(300);
  ok((await S(page)).kararlar.some(k => k.id === 'K100') && (await page.textContent('#toast')).includes('Başka bir kullanıcının'), 'başka kullanıcının kaydı sayfa yenilenmeden alındı');

  /* 8) Yeni kimlikler çakışmaz */
  const ids = await page.evaluate(() => [nid('m'), nid('m')]);
  ok(/^M\d{3}-[a-z0-9]{4}$/.test(ids[0]) && ids[0] !== ids[1], `yeni kayıt kimlikleri çakışmaya dayanıklı (${ids.join(', ')})`);

  /* 9) Aynı yıla ikinci aidat kaydı uyarısı */
  await page.evaluate(() => editPayment());
  await page.selectOption('#p_uye', 'M001'); await page.fill('#p_yil', String(Y));
  page.plan.push('dismiss');
  await page.click('.modal button:has-text("Kaydet")');
  ok(page.dialogs.at(-1).includes('zaten var') && (await S(page)).payments.filter(p => p.uyeId === 'M001' && p.yil === Y).length === 1, 'aynı üye/yıl için ikinci aidat kaydında uyarı verildi');
  await page.evaluate(() => closeModal());

  /* 10) Ödeme silme ve geri alma */
  await page.evaluate(() => editPayment('P0003')); page.plan.push(true);
  await page.click('.modal button:has-text("Sil")');
  ok(!(await S(page)).payments.some(p => p.id === 'P0003'), 'ödeme kaydı onayla silindi');
  await page.click('#toast button:has-text("Geri al")');
  ok((await S(page)).payments.some(p => p.id === 'P0003'), 'silinen ödeme "Geri al" ile döndü');

  /* 11) Yıl borcu: bu yıl eksik olan aktif üyeler tamamlanır (gelecek yıla atlamaz) */
  page.plan.push('6500');
  await page.evaluate(() => yilBorcuOlustur()); await sleep(200);
  let st = await S(page);
  const buYil = st.payments.filter(p => Number(p.yil) === Y && isAidatTipNode(p));
  function isAidatTipNode(p) { return /^A[Iİ]DAT$/.test(String(p.tip || 'AIDAT').toLocaleUpperCase('tr')); }
  ok(page.dialogs.at(-1).includes(`${Y} yılı`) && !st.payments.some(p => Number(p.yil) === Y + 1) && st.members.filter(m => m.durum === 'AKTİF').every(m => buYil.some(p => p.uyeId === m.id)), `yıl borcu ${Y} için eksik üyeleri tamamladı`);

  /* 12) Üye kartı: YK kararları ve hatırlatma mesajı */
  await page.evaluate(() => openMember('M001'));
  ok(await page.locator('.modal h3:has-text("YK Kararları")').count() === 1, 'üye kartında ilgili YK kararı görünüyor');
  await page.click('.modal button:has-text("Aidat hatırlatması")');
  ok(await page.evaluate(() => route) === 'mesajlar' && (await page.textContent('#tplText')).includes('Deneme Üye Bir'), 'üye kartından aidat hatırlatma mesajına geçildi');

  /* 13) Başvuru onayında YK kararı kaydı */
  page.plan.push(true, true, true);
  await page.evaluate(() => onaylaBasvuru('B001')); await sleep(200);
  st = await S(page);
  ok(st.members.some(m => m.ad === 'Aday Deneme') && st.kararlar.some(k => k.uyeAdi === 'Aday Deneme' && k.no === 15), 'başvuru onayında üye ve 15 numaralı YK kararı oluştu');

  /* 14) Excel içe aktarma: küçük harf durum, Türkçe tutar, Excel tarihi */
  await page.evaluate(Y => {
    window.XLSX = { read: () => ({ SheetNames: ['ÜYELER', String(Y)], Sheets: {
      'ÜYELER': { rows: [{ 'Ad Soyad': 'Excel Yeni Üye', 'Durum': 'pasif', 'YK Karar Tarihi': 46054, 'Defter No': '12' }] },
      [String(Y)]: { rows: [{ 'Ad Soyad': 'Excel Yeni Üye', 'Aidat Durumu': 'ödendi', 'Aidat Tutarı': '6.500,00 TL', 'Ödeme Tarihi': 46054 }, { 'Ad Soyad': 'Deneme Üye Bir', 'Aidat Durumu': 'Ödendi', 'Aidat Tutarı': 6500 }] } } }),
      utils: { sheet_to_json: sh => sh.rows } };
    ayarTab = 'yedek'; go('ayarlar');
  }, Y);
  const before = (await S(page)).payments.length;
  await page.setInputFiles('#xlsIn', { name: 'deneme.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await page.waitForFunction(() => S.members.some(m => m.ad === 'Excel Yeni Üye'));
  st = await S(page);
  const ex = st.members.find(m => m.ad === 'Excel Yeni Üye'), exp = st.payments.find(p => p.uyeId === ex.id);
  ok(ex.durum === 'PASİF' && ex.ykKararTarihi === '2026-02-01' && ex.defterNo === 12, 'Excel: üye durumu, tarih ve defter no doğru okundu');
  ok(exp.durum === 'ÖDENDİ' && exp.tutar === 6500 && exp.odenenTutar === 6500 && exp.odemeTarihi === '2026-02-01' && exp.tip === 'AIDAT', 'Excel: "ödendi", "6.500,00 TL" ve Excel tarihi doğru okundu');
  ok(st.payments.length === before + 1, 'Excel: mevcut aidat kaydı ikinci kez eklenmedi');

  /* 15) Google Sheets çekme: yıl sayfası ve Gmail başvuru sayfası */
  await page.route(/docs\.google\.com\/yil/, r => r.fulfill({ contentType: 'text/csv', body: `Sıra,Ad Soyad,Aidat Tutarı,Aidat Durumu,Ödeme Tarihi\n1,Deneme Üye Dört,"6.500,00 TL",ödendi,01.03.${Y}\n` }));
  await page.route(/docs\.google\.com\/basvuru/, r => r.fulfill({ contentType: 'text/csv', body: `ad,email,telefon,meslek,tarih\nSheets Aday,sheets@ornek.org,0500,Mühendis,05.10.${Y}\n` }));
  await page.evaluate(Y => { S.ayarlar.sheets.yilCsv = `${Y}: https://docs.google.com/yil.csv`; S.ayarlar.sheets.csvBasvurular = 'https://docs.google.com/basvuru.csv'; return sheetsPull(true); }, Y);
  st = await S(page);
  const p4 = st.payments.find(p => p.uyeId === 'M004' && Number(p.yil) === Y);
  ok(p4.durum === 'ÖDENDİ' && p4.tutar === 6500 && p4.odenenTutar === 6500 && p4.odemeTarihi === `${Y}-03-01`, `Sheets: "ödendi" ve "6.500,00 TL" doğru okundu (eskiden 650.000 ₺ oluyordu)`);
  const sb = st.basvurular.find(b => b.ad === 'Sheets Aday');
  ok(sb && sb.email === 'sheets@ornek.org' && sb.gorev === 'Mühendis' && sb.basvuruTarihi === `${Y}-10-05`, 'Sheets: Gmail kodunun yazdığı küçük harfli başvuru sayfası okundu');

  /* 16) Sheets'e gönderim sonucu doğru bildiriliyor */
  let cevapOk = false;
  await page.route(/script\.google\.com/, r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cevapOk ? { ok: true } : { error: 'TypeError: d.members is undefined' }) }));
  await page.evaluate(() => { S.ayarlar.sheets.webhook = 'https://script.google.com/macros/s/test/exec'; return sheetsPush(); });
  ok((await page.textContent('#toast')).includes('yanıt vermedi'), 'Sheets hata verdiğinde "gönderildi" denmiyor');
  cevapOk = true;
  await page.evaluate(() => sheetsPush());
  ok((await page.textContent('#toast')).includes('gönderildi'), 'Sheets başarılı olunca bildiriliyor');

  /* 17) Sıfırlama "SIFIRLA" yazılmadan yapılmıyor; geri yüklemede önce yedek iniyor */
  const sayi = (await S(page)).members.length;
  page.plan.push(true, 'hayır');
  await page.evaluate(() => resetData()); await sleep(200);
  ok((await S(page)).members.length === sayi && page.dialogs.at(-1).includes('SIFIRLA'), 'sıfırlama onay kelimesi yazılmadan yapılmadı');
  const kucuk = JSON.parse(yedek); kucuk.members = kucuk.members.slice(0, 5);
  const yf = path.join(OUT, 'geri-yukle.json'); fs.writeFileSync(yf, JSON.stringify(kucuk));
  page.plan.push(true);
  await page.evaluate(() => { ayarTab = 'yedek'; go('ayarlar'); });
  const [d2] = await Promise.all([page.waitForEvent('download'), page.setInputFiles('#jsonIn', yf)]);
  await sleep(300);
  await page.waitForFunction(() => window.__db.row.members.length === 5, null, { timeout: 5000 }).catch(() => {});
  ok(d2.suggestedFilename().includes('islem-oncesi') && (await S(page)).members.length === 5 && (await db(page)).members.length === 5, 'geri yüklemeden önce mevcut verinin yedeği indirildi, sonra yedek yüklendi');
  ok((await S(page)).ayarlar.ai.apiKey === 'gizli-anahtar-test', 'geri yükleme bu tarayıcıdaki anahtarı silmedi');

  /* 18) Tüm üyeleri silecek bir kayıt engellenir */
  n = await page.evaluate(() => window.__db.upserts);
  await page.evaluate(() => { S.members = []; persist(); }); await sleep(900);
  ok(await page.evaluate(() => window.__db.upserts) === n && (await db(page)).members.length > 0, 'yanlışlıkla tüm üye listesini silecek kayıt engellendi');
  await page.evaluate(() => { S.members = JSON.parse(JSON.stringify(window.__db.row.members)); });

  errors.push(...page.errors); await ctx.close();

  /* 19) Okuyucu rolü: AI komutuyla bile değişiklik yapamaz, buluta yazmaz */
  {
    const { ctx, page } = await open(browser, URL, { role: 'okuyucu' });
    await page.evaluate(() => runCommand('Deneme Üye Üç ' + THIS_YEAR + ' aidatını ödedi'));
    await page.waitForSelector('.modal button:has-text("Onayla ve Uygula")');
    await page.click('.modal button:has-text("Onayla ve Uygula")'); await sleep(900);
    const st = await S(page);
    ok(st.payments.find(p => p.id === 'P0003').durum === 'ÖDENMEDİ', 'okuyucu AI komutuyla ödeme işleyemedi (eskiden işleyebiliyordu)');
    ok(st.chat.at(-1).acts.some(a => a.includes('Yetkiniz')) && await page.evaluate(() => window.__db.upserts) === 0, 'okuyucuya neden uygulanmadığı söylendi; buluta hiçbir şey yazılmadı');
    await page.evaluate(() => quickPaid('P0003'));
    ok((await page.textContent('#toast')).includes('yetkiniz yok') && (await S(page)).payments.find(p => p.id === 'P0003').durum === 'ÖDENMEDİ', 'düğme gizli olsa da işlev yetkisiz çalışmıyor');
    await page.evaluate(() => sheetsPull(true));
    ok((await page.textContent('#toast')).includes('yalnızca yönetici'), 'Sheets senkronunu yalnızca yönetici başlatabiliyor');
    errors.push(...page.errors); await ctx.close();
  }

  /* 20) Telefon görünümü */
  {
    const { ctx, page } = await open(browser, URL, { viewport: { width: 390, height: 844 }, mobile: true });
    for (const r of ['dashboard', 'uyeler', 'aidat', 'basvurular', 'kararlar', 'gorevler', 'raporlar', 'analiz', 'mesajlar', 'ayarlar']) {
      await page.evaluate(r => go(r), r);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(ov <= 0, `telefon: ${r} yatay taşmıyor`);
    }
    await page.evaluate(() => go('dashboard'));
    const kpis = await page.$$eval('.kpis .kpi', els => els.slice(0, 2).map(e => e.getBoundingClientRect().top));
    ok(kpis.length === 2 && Math.abs(kpis[0] - kpis[1]) < 2, 'telefon: Dashboard kartları iki sütun');
    await page.screenshot({ path: path.join(OUT, 'telefon-dashboard.png') });
    errors.push(...page.errors); await ctx.close();
  }

  ok(errors.length === 0, 'sayfa hatası yok ' + (errors.length ? JSON.stringify(errors) : ''));
  await browser.close(); srv.close();
  console.log(fails ? `\n${fails} kontrol başarısız` : '\nTüm kontroller geçti');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

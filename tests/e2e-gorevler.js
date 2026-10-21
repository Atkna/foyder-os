// Toplantılar ve Görevler — tarayıcıda uçtan uca deneme.
// Çalıştırma: NODE_PATH=$(npm root -g) node tests/e2e-gorevler.js   (Playwright ve Chromium gerekir)
// Gerçek Supabase'e ve yapay zekâ sağlayıcısına bağlanmaz: tests/mock-supabase.js ve sahte AI yanıtı kullanılır.
// Bütün kişi, üye ve karar adları uydurmadır.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.E2E_OUT || path.join(require('os').tmpdir(), 'foyder-e2e');
fs.mkdirSync(OUT, { recursive: true });
const xlsxJs = require('./xlsx-yerel')();
const mock = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const sample = fs.readFileSync(path.join(__dirname, 'ornek-toplanti.txt'), 'utf8');
const pad = n => String(n).padStart(2, '0');
const iso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const TODAY = iso(), YESTERDAY = plus(-1), TOMORROW = plus(1);

const seed = {
  members: [{ id: 'M001', ad: 'Deneme Üye Bir', durum: 'AKTİF', uyelikTuru: 'Gerçek Üye', defterNo: 1, email: '', telefon: '' }, { id: 'M002', ad: 'Örnek Üye İki', durum: 'AKTİF', uyelikTuru: 'Kurumsal Üye', defterNo: 2, email: '', telefon: '' }],
  payments: [{ id: 'P0001', uyeId: 'M001', yil: new Date().getFullYear(), tip: 'AIDAT', tutar: 6500, durum: 'ÖDENMEDİ', odenenTutar: 0, not: '' }],
  basvurular: [], chat: [],
  kararlar: [{ id: 'K001', no: 7, tarih: '2026-10-01', konu: 'Üyelik Kabulü', uyeAdi: 'Deneme Üye Bir', uyelikTuru: 'Gerçek Üye', durum: 'AKTİF', not: '' }],
  ayarlar: { rol: 'admin', dernekAdi: 'Deneme Derneği', iban: '', aidat: { 2026: 6500 }, girisOdentisi: 1000, ai: { provider: 'claude', model: '', apiKey: '', endpoint: '', onayla: true }, sheets: { csvUyeler: '', csvOdemeler: '', csvBasvurular: '', yilCsv: '', webhook: '', autoPull: false, autoPush: false } },
  seq: { m: 2, p: 1, b: 0, k: 1 },
  // İlk panel sürümündeki biçim: yalnızca "open"/"done", alt adım/yorum/geçmiş yok.
  hafiza: {
    tasks: [
      { id: 'task_eski1', title: 'Eski biçimde açık görev', status: 'open', dueDate: YESTERDAY, dueTime: '', reminderAt: '', priority: 'medium', project: 'Genel', owner: 'Deneme Sorumlu', notes: 'eski not', key: '', transcriptId: 'transcript_eski', sourceIds: ['transcript_eski'], createdAt: '2026-10-01T09:00:00.000Z', completedAt: null, notifiedAt: null },
      { id: 'task_eski2', title: 'Eski biçimde tamamlanmış görev', status: 'done', dueDate: '', priority: 'low', project: 'Genel', owner: '', notes: '', sourceIds: ['transcript_eski'], transcriptId: 'transcript_eski', createdAt: '2026-10-01T09:00:00.000Z', completedAt: new Date(Date.now() - 2 * 864e5).toISOString() },
      { id: 'task_eski3', title: 'Bugün bitmesi gereken eski görev', status: 'open', dueDate: TODAY, priority: 'high', project: 'Etkinlik', owner: 'Deneme Sorumlu', notes: '', sourceIds: [], createdAt: '2026-10-02T09:00:00.000Z' }],
    transcripts: [{ id: 'transcript_eski', title: 'Eski toplantı', date: '2026-10-01', text: 'Uydurma eski toplantı metni. Rapor hazırlanacak ve paylaşılacak.', wordCount: 9, createdAt: '2026-10-01T09:00:00.000Z' }]
  }
};

let fails = 0;
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
      // Testte Supabase sahte dosyayla değiştirildiği için bütünlük karması kaldırılır (gerçek karma ayrı testte denetlenir).
      if (file.endsWith('index.html')) res.end(fs.readFileSync(file, 'utf8').replace(/(supabase\.js") integrity="sha384-[^"]+" crossorigin="anonymous"/, '$1'));
      else fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function newContext(browser, url, { seedRow = seed, role = 'admin', viewport = { width: 1360, height: 900 }, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'tr-TR', isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, acceptDownloads: true });
  await ctx.grantPermissions(['notifications'], { origin: url });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: mock }));
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/@e965\/xlsx@0\.20\.3\//, r => r.fulfill({ contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: xlsxJs }));
  await ctx.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ contentType: r.request().url().endsWith('.css') ? 'text/css' : 'application/javascript', body: '' }));
  await ctx.route('https://api.anthropic.com/**', route => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const prompt = JSON.parse(route.request().postData() || '{}').messages?.[0]?.content || '';
    const text = /SADECE şu biçimde geçerli JSON/.test(prompt)
      ? JSON.stringify({ eksik: [{ baslik: 'Basın bültenini ajansla paylaş', son_tarih: TOMORROW, sorumlu: 'Deniz Hanım', oncelik: 'medium', dayanak: 'basın bültenini de ajansla paylaşmak lazım' }], tarih: [{ no: 1, onerilen: plus(9), dayanak: 'bu hafta teyit edilecek' }] })
      : 'Toplantıda bahar paneli hazırlıkları ele alındı. Salon rezervasyonunun bu hafta teyit edilmesi kararlaştırıldı. Konuşmacı listesinin ekiple paylaşılacağı belirtildi. Sponsor sözleşmelerinin acilen imzaya gönderilmesi gerektiği vurgulandı. Yeni üye kabulü oy birliğiyle onaylandı. Bülten taslağının gelecek hafta hazırlanması planlandı.';
    route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ content: [{ type: 'text', text }] }) });
  });
  await ctx.addInitScript(({ seedRow, role }) => {
    window.__seed = seedRow; window.__role = role; window.__notes = [];
    const N = function (title, o) { window.__notes.push({ title, body: o && o.body }); this.close = () => {}; };
    N.permission = 'granted'; N.requestPermission = async () => 'granted'; window.Notification = N;
    window.print = () => { window.__printed = (document.getElementById('hzPrint') || {}).innerHTML || ''; };
    try { navigator.clipboard.writeText = async t => { window.__clip = t; }; } catch (e) {}
  }, { seedRow, role });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ağ hatası \(test\)|görev kaydı/.test(m.text())) page.errors.push(m.text()); });
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('ortak onay') : d.accept());
  await page.goto(url + '/index.html');
  await page.waitForFunction(() => document.getElementById('nav').innerHTML.includes('Toplantılar'));
  return { ctx, page };
}
const db = page => page.evaluate(() => window.__db.row);
const H = page => page.evaluate(() => S.hafiza);
const untouched = row => JSON.stringify([row.members, row.payments, row.kararlar, row.basvurular]) === JSON.stringify([seed.members, seed.payments, seed.kararlar, seed.basvurular]);
const settle = page => page.waitForFunction(() => !document.querySelector('#hzSync.saving')).then(() => sleep(120));
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

(async () => {
  const srv = await serve();
  const URL = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  const { ctx, page } = await newContext(browser, URL);
  const allErrors = [];

  /* --- Mevcut sayfalar ve Dashboard kartı --- */
  for (const r of ['dashboard', 'asistan', 'uyeler', 'aidat', 'basvurular', 'kararlar', 'raporlar', 'analiz', 'mesajlar', 'ayarlar']) {
    await page.evaluate(r => go(r), r);
    ok((await page.evaluate(() => document.getElementById('main').innerHTML.length)) > 200, `mevcut sayfa açılıyor: ${r}`);
  }
  await page.evaluate(() => { ayarTab = 'rol'; go('ayarlar'); });
  ok(await page.locator('th:has-text("Görev")').count() === 1, 'Roller tablosunda "Görev" sütunu var');
  await page.evaluate(() => go('dashboard'));
  const dash = await page.locator('.hz-dash').innerText();
  ok(/Bugün\s*1/.test(dash) && /Geciken\s*1/.test(dash) && /Bu hafta biten\s*1/.test(dash), `Dashboard kartı doğru sayıları gösteriyor (${dash.replace(/\s+/g, ' ')})`);
  await page.screenshot({ path: path.join(OUT, '01-dashboard.png') });
  await page.click('.hz-dash button:has-text("Geciken")');
  ok(await page.locator('.hz-task').count() === 1 && (await page.locator('.hz-task-title').first().innerText()).includes('Eski biçimde açık'), 'Dashboard → Geciken listesine gidiyor');
  ok(await page.locator('.hz-task.late').count() === 1, 'geciken görev kırmızı işaretli');

  /* --- Eski veriler yeni yapıya taşındı --- */
  const h0 = await H(page);
  ok(h0.tasks.find(t => t.id === 'task_eski1').status === 'todo' && h0.tasks.find(t => t.id === 'task_eski2').status === 'done', 'eski "open" durumları "Yapılacak" olarak taşındı');
  ok(h0.tasks.find(t => t.id === 'task_eski1').notes === 'eski not' && h0.transcripts.length === 1, 'eski görev ve toplantılar kayıpsız');
  await page.click('.hz-seg button:has-text("Bugün")');
  ok(await page.locator('.hz-task.today').count() === 1, 'bugünkü görev vurgulu');

  /* --- Kısayollar ve yeni görev --- */
  await page.click('.hz-seg button:has-text("Açık")');
  await page.keyboard.press('?');
  ok(await page.locator('.modal:has-text("Klavye kısayolları")').count() === 1, '"?" kısayol yardımını açıyor');
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  ok(await page.evaluate(() => document.activeElement.id === 'hzSearch'), '"/" aramaya odaklanıyor');
  await page.locator('#hzSearch').press('Escape'); await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('n');
  await page.fill('#hzn_title', 'Aylık aidat kontrolü');
  await page.fill('#hzn_due', TODAY);
  await page.fill('#hzn_owner', 'Deneme Sorumlu');
  await page.fill('#hzn_proj', 'Muhasebe');
  await page.selectOption('#hzn_recur', 'monthly');
  await page.keyboard.press('Control+Enter');
  await settle(page);
  let row = await db(page);
  const rec = row.hafiza.tasks.find(t => t.title === 'Aylık aidat kontrolü');
  ok(rec && rec.recur === 'monthly' && rec.status === 'todo' && rec.history.length === 1, 'N + Ctrl+Enter ile tekrarlayan görev oluşturuldu');
  ok(untouched(row), 'üye, aidat ve karar verisi aynen duruyor');

  /* --- Görev ayrıntısı: durum, bekleme, alt adım, yorum, ilişki, geçmiş --- */
  await page.click('.hz-task:has-text("Eski biçimde açık görev")');
  await page.selectOption('#hzt_status', 'waiting');
  await page.fill('#hzt_wait', 'Muhasebe onayı'); await page.locator('#hzt_wait').press('Tab');
  await page.fill('#hzCkNew', 'Listeyi hazırla'); await page.locator('#hzCkNew').press('Enter');
  await page.fill('#hzCkNew', 'Onaya gönder'); await page.locator('#hzCkNew').press('Enter');
  await page.locator('.hz-ck-row input[type=checkbox]').first().check();
  await page.fill('#hzCmNew', 'İlk taslak hazır.'); await page.click('button:has-text("Yorum ekle")');
  await page.fill('input[placeholder^="Üye bağla"]', 'Deneme Üye Bir (No 1)'); await page.locator('input[placeholder^="Üye bağla"]').press('Tab');
  await page.selectOption('select[aria-label="YK kararı bağla"]', 'K001');
  await page.fill('input[aria-label="Etkinlik"]', 'Bahar Paneli 2026'); await page.locator('input[aria-label="Etkinlik"]').press('Tab');
  await settle(page);
  await page.screenshot({ path: path.join(OUT, '02-gorev-ayrinti.png') });
  row = await db(page);
  let t1 = row.hafiza.tasks.find(t => t.id === 'task_eski1');
  ok(t1.status === 'waiting' && t1.waitingFor === 'Muhasebe onayı', 'Beklemede durumu ve beklenen bilgisi kaydedildi');
  ok(t1.checklist.length === 2 && t1.checklist[0].done && !t1.checklist[1].done, 'alt adımlar ve onay kutusu kaydedildi');
  ok(t1.comments.length === 1 && t1.comments[0].by === 'Deneme Kullanıcı', 'yorum kullanıcı adıyla kaydedildi');
  ok(t1.memberIds.includes('M001') && t1.kararIds.includes('K001') && t1.event === 'Bahar Paneli 2026', 'üye, YK kararı ve etkinlik ilişkisi kuruldu');
  const hist = t1.history.map(x => x.text).join(' | ');
  ok(/Durum: Yapılacak → Beklemede/.test(hist) && /Alt adım eklendi: Listeyi hazırla/.test(hist) && /İlgili üyeler: — → Deneme Üye Bir/.test(hist) && t1.history.every(x => x.by === 'Deneme Kullanıcı' && x.at), 'değişiklik geçmişi kim/ne zaman/ne ile tutuluyor');
  ok(untouched(row), 'ilişki kurmak üye ve karar kaydını değiştirmedi');
  await page.keyboard.press('Escape');

  /* --- Üye kartı ve karar kartında ilgili görevler --- */
  await page.evaluate(() => openMember('M001'));
  ok(await page.locator('.modal .hz-rel:has-text("Eski biçimde açık görev")').count() === 1, 'üye kartında ilgili görev görünüyor');
  await page.click('.modal .hz-rel button:has-text("Eski biçimde açık görev")');
  ok(await page.locator('#hzDetail').count() === 1, 'üye kartından göreve geçiliyor');
  await page.evaluate(() => { closeModal(); go('kararlar'); });
  ok(await page.locator('.hz-relchip').count() === 1, 'karar listesinde ilgili görev sayısı görünüyor');
  await page.evaluate(() => editKarar('K001'));
  ok(await page.locator('.modal .hz-rel:has-text("Eski biçimde açık görev")').count() === 1, 'karar kartında ilgili görev görünüyor');
  await page.evaluate(() => closeModal());

  /* --- Mesaj şablonu ve .ics --- */
  await page.evaluate(() => go('gorevler'));
  await page.click('.hz-task:has-text("Eski biçimde açık görev")');
  await page.click('button:has-text("WhatsApp metni")');
  const tpl = await page.textContent('#tplText');
  ok(await page.evaluate(() => route) === 'mesajlar' && tpl.includes('Merhaba Deneme Sorumlu') && tpl.includes('“Eski biçimde açık görev”') && tpl.includes('beklenen: Muhasebe onayı') && tpl.includes('• Onaya gönder'), 'görevden WhatsApp hatırlatma metni üretildi');
  await page.selectOption('.filters select >> nth=0', 'gorev_mail');
  ok((await page.textContent('#tplText')).startsWith('Konu: Hatırlatma — Eski biçimde açık görev'), 'e-posta hatırlatma şablonu çalışıyor');
  await page.selectOption('.filters select >> nth=0', 'aidat_wp');
  ok((await page.textContent('#tplText')).includes('aidatınız'), 'mevcut aidat şablonları bozulmadı');
  await page.evaluate(() => go('gorevler'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Takvime aktar")')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  ok(dl.suggestedFilename().endsWith('.ics') && (ics.match(/BEGIN:VEVENT/g) || []).length === 3 && ics.includes('RRULE:FREQ=MONTHLY'), `.ics dosyası indirildi (${(ics.match(/BEGIN:VEVENT/g) || []).length} görev)`);

  /* --- Tekrarlayan görevi tamamla, geri al --- */
  await page.click('.hz-task:has-text("Aylık aidat kontrolü") .hz-done-btn');
  await settle(page);
  let tasks = (await db(page)).hafiza.tasks;
  const next = tasks.find(t => t.recurPrevId === rec.id);
  ok(tasks.find(t => t.id === rec.id).status === 'done' && next && next.status === 'todo' && next.dueDate > TODAY, `tamamlanınca bir sonraki ay için kopya oluştu (${next && next.dueDate})`);
  await page.click('#toast button:has-text("Geri al")');
  await settle(page);
  tasks = (await db(page)).hafiza.tasks;
  ok(tasks.find(t => t.id === rec.id).status === 'todo' && !tasks.some(t => t.recurPrevId === rec.id), 'geri al: görev yeniden açık, oluşan kopya kaldırıldı');

  /* --- Filtreler birleşir ve hatırlanır --- */
  await page.selectOption('select[aria-label="Proje"]', 'Genel');
  await page.selectOption('select[aria-label="Sorumlu"]', 'Deneme Sorumlu');
  ok(await page.locator('.hz-task').count() === 1, 'proje + sorumlu filtresi birleşiyor');
  await page.reload(); await page.waitForFunction(() => document.getElementById('nav').innerHTML.includes('Toplantılar'));
  await page.evaluate(() => go('gorevler'));
  ok(await page.inputValue('select[aria-label="Proje"]') === 'Genel' && await page.inputValue('select[aria-label="Sorumlu"]') === 'Deneme Sorumlu', 'filtre tercihi sayfa yenilenince hatırlanıyor');
  await page.click('button:has-text("Filtreleri temizle")');

  /* --- Toplu işlem --- */
  await page.locator('.hz-task:has-text("Aylık aidat kontrolü") .hz-sel').check();
  await page.locator('.hz-task:has-text("Bugün bitmesi gereken") .hz-sel').check();
  ok((await page.textContent('#hzBulk')).includes('2 görev seçili'), 'toplu işlem çubuğu görünüyor');
  await page.fill('#hzBulk input[aria-label="Sorumlu"]', 'Toplu Sorumlu'); await page.locator('#hzBulk input[aria-label="Sorumlu"]').press('Enter');
  await settle(page);
  tasks = (await db(page)).hafiza.tasks;
  ok(tasks.filter(t => t.owner === 'Toplu Sorumlu').length === 2, 'toplu sorumlu değişikliği uygulandı');
  await page.selectOption('#hzBulk select[aria-label="Durum"]', 'doing');
  await settle(page);
  tasks = (await db(page)).hafiza.tasks;
  ok(tasks.filter(t => t.owner === 'Toplu Sorumlu' && t.status === 'doing').length === 2, 'toplu durum değişikliği uygulandı');
  await page.click('#toast button:has-text("Geri al")'); await settle(page);
  ok((await db(page)).hafiza.tasks.filter(t => t.status === 'doing').length === 0, 'toplu değişiklik geri alındı');
  await page.click('#hzBulk button:has-text("Seçimi kaldır")');

  /* --- Pano: sürükle-bırak --- */
  await page.keyboard.press('2');
  ok(await page.locator('.hz-col').count() === 4, '"2" kısayolu Pano görünümünü açıyor; 4 durum sütunu var');
  await page.dragAndDrop('.hz-card:has-text("Bugün bitmesi gereken")', '.hz-col[data-status="doing"]');
  await settle(page);
  ok((await db(page)).hafiza.tasks.find(t => t.id === 'task_eski3').status === 'doing', 'Pano: kart sürüklenince durum değişti');
  ok(await page.locator('.hz-col[data-status="doing"] .hz-card:has-text("Bugün bitmesi gereken")').count() === 1, 'kart yeni sütunda görünüyor');
  await page.screenshot({ path: path.join(OUT, '03-pano.png') });

  /* --- Takvim --- */
  await page.keyboard.press('3');
  ok(await page.locator(`.hz-day[data-day="${TODAY}"] .hz-chip`).count() >= 1, 'Takvim: bugünkü görevler gün hücresinde');
  // Gerçek fare hareketiyle: bas, birkaç adımda taşı, bırak.
  await page.locator(`.hz-day[data-day="${TOMORROW}"]`).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  const from = await page.locator(`.hz-day[data-day="${TODAY}"] .hz-chip:has-text("Aylık aidat")`).boundingBox();
  const to = await page.locator(`.hz-day[data-day="${TOMORROW}"]`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 4, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 }); await page.mouse.up();
  await settle(page);
  ok((await db(page)).hafiza.tasks.find(t => t.id === rec.id).dueDate === TOMORROW, 'Takvim: görev başka güne sürüklenince tarihi değişti');
  await page.click(`.hz-day[data-day="${TOMORROW}"]`);
  ok(await page.locator('.hz-dayp .hz-task:has-text("Aylık aidat")').count() === 1, 'Takvim: güne tıklayınca o günün görevleri listeleniyor');
  await page.screenshot({ path: path.join(OUT, '04-takvim.png'), fullPage: true });

  /* --- Silme: onay ve geri al --- */
  await page.keyboard.press('1');
  await page.click('.hz-task:has-text("Aylık aidat kontrolü")');
  await page.click('.modal button:has-text("Sil")'); await settle(page);
  ok(!(await db(page)).hafiza.tasks.some(t => t.id === rec.id), 'görev onayla silindi');
  await page.click('#toast button:has-text("Geri al")'); await settle(page);
  ok((await db(page)).hafiza.tasks.some(t => t.id === rec.id), 'silinen görev geri alındı');

  /* --- Yeni toplantı, AI kontrolü ve kayıt --- */
  await page.keyboard.press('Shift+N');
  await page.fill('#hzTitle', 'Aylık koordinasyon (örnek)');
  await page.fill('#hzText', sample);
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('.hz-cand');
  const nCand = await page.locator('.hz-cand').count();
  ok(nCand === 4, `kural tabanlı görev çıkarma çalıştı: ${nCand} aday`);
  ok((await page.inputValue('input[placeholder="Örn. Başkan, Genel Sekreter"]')).includes('Deniz Hanım'), 'katılımcılar konuşmacılardan önerildi');
  ok((await page.inputValue('textarea[placeholder="Toplantıda alınan kararlar…"]')).includes('oy birliğiyle onaylandı'), 'alınan kararlar metinden önerildi');
  const before = JSON.stringify((await db(page)).hafiza);
  await page.click('button:has-text("AI ile kontrol et")');
  await page.waitForSelector('.hz-ai-item');
  ok(await page.locator('.hz-ai-item').count() === 2, 'AI kaçırılmış görev ve tarih düzeltmesi önerdi');
  ok(JSON.stringify((await db(page)).hafiza) === before, 'AI önerileri onaysız hiçbir şey kaydetmedi');
  await page.click('.hz-ai-item button:has-text("Önizlemeye ekle")');
  await page.click('.hz-ai-item button:has-text("Tarihi uygula")');
  ok(await page.locator('.hz-cand').count() === nCand + 1 && await page.locator('.hz-cand.ai').count() === 1, 'AI önerisi önizlemeye eklendi');
  ok(await page.inputValue('.hz-cand >> nth=0 >> input[type=date]') === plus(9), 'AI tarih düzeltmesi önizlemede uygulandı');
  ok(JSON.stringify((await db(page)).hafiza) === before, 'önizleme kaydedilmeden veri değişmedi');
  await page.screenshot({ path: path.join(OUT, '05-onizleme-ai.png'), fullPage: true });
  await page.keyboard.press('Control+Enter');
  await settle(page);
  row = await db(page);
  const meet = row.hafiza.transcripts.find(t => t.title === 'Aylık koordinasyon (örnek)');
  ok(meet && meet.participants.includes('Deniz Hanım') && /onaylandı/.test(meet.decisions), 'toplantı kaydı katılımcı ve kararlarla oluşturuldu');
  const fromMeet = row.hafiza.tasks.filter(t => (t.sourceIds || []).includes(meet.id));
  ok(fromMeet.length === nCand + 1 && fromMeet.some(t => /yapay zekâ önerisi/.test(t.history[0].text)), `toplantıdan ${fromMeet.length} görev çıktı (AI önerisi dahil)`);
  ok(untouched(row), 'toplantı kaydı üye/aidat verisine dokunmadı');

  /* --- Toplantı kartı, ilerleme, özet, tutanak PDF --- */
  await page.keyboard.press('4');
  ok(await page.locator('.hz-tr').count() === 2 && await page.locator('.hz-tr .hz-prog').count() === 2, 'Toplantılar: kartlar ilerleme çubuğuyla listeleniyor');
  await page.click('.hz-tr:has-text("Aylık koordinasyon")');
  const firstTask = fromMeet[0];
  await page.click(`.modal .hz-linked button[data-id="${firstTask.id}"]`);
  await page.click('.hz-done-btn >> nth=0').catch(() => {});
  await page.evaluate(id => { closeModal(); HZ.setStatus(id, 'done'); }, firstTask.id); await settle(page);
  await page.evaluate(id => HZ.openMeeting(id), meet.id);
  ok((await page.locator('.modal').innerText()).includes(`1/${fromMeet.length} görev tamamlandı`), 'toplantı ilerlemesi biten görevle güncellendi');
  await page.click('button:has-text("AI ile özet üret")');
  await page.waitForSelector('#hzSumNew');
  ok(JSON.stringify((await db(page)).hafiza.transcripts.find(t => t.id === meet.id).summary || '') === '""', 'AI özeti onaysız kaydedilmedi');
  await page.click('button:has-text("Özeti kaydet")'); await settle(page);
  ok(((await db(page)).hafiza.transcripts.find(t => t.id === meet.id).summary || '').split('.').filter(s => s.trim()).length >= 5, 'AI özeti onayla kaydedildi (5-6 cümle)');
  await page.click('button:has-text("Tutanak PDF")'); await sleep(200);
  const printed = await page.evaluate(() => window.__printed || '');
  await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: path.join(OUT, '06b-tutanak-baski.png'), fullPage: true }); await page.emulateMedia({ media: 'screen' });
  ok(printed.includes('Toplantı Tutanağı') && printed.includes('Deniz Hanım') && printed.includes('Alınan Kararlar') && printed.includes('Sponsor sözleşmeleri'), 'tutanak PDF düzeni hazırlandı (yazdır/PDF)');
  await page.screenshot({ path: path.join(OUT, '06-toplanti.png') });
  await page.keyboard.press('Escape');

  /* --- Haftalık özet --- */
  await page.keyboard.press('5');
  await page.click('button:has-text("Metni kopyala")');
  const clip = await page.evaluate(() => window.__clip || '');
  ok(/Tamamlananlar/.test(clip) && /Devam edenler/.test(clip) && /Gecikenler/.test(clip) && /Yapılacaklar/.test(clip) && clip.includes('Eski biçimde tamamlanmış görev'), 'haftalık özet metni kopyalandı');
  await page.click('button:has-text("PDF") >> nth=-1'); await sleep(200);
  ok((await page.evaluate(() => window.__printed || '')).includes('Haftalık Görev Özeti'), 'haftalık özet PDF düzeni hazırlandı');
  await page.screenshot({ path: path.join(OUT, '07-haftalik.png'), fullPage: true });

  /* --- Bağlantı kesilince veri kaybolmaz --- */
  await page.keyboard.press('1');
  await page.evaluate(() => { window.__fail = true; });
  await page.click('.hz-task:has-text("Bugün bitmesi gereken") .hz-done-btn');
  await page.waitForSelector('#hzSync.pending');
  ok((await page.textContent('#hzSync')).includes('Kaydedilemedi'), 'kayıt başarısız olunca üst çubukta uyarı görünüyor');
  ok(await page.evaluate(() => !!localStorage.getItem('foyder:hz:bekleyen')), 'değişiklik tarayıcıda saklandı');
  await page.reload(); await page.waitForFunction(() => document.getElementById('nav').innerHTML.includes('Toplantılar'));
  await page.evaluate(() => { window.__fail = false; go('gorevler'); });
  await page.waitForFunction(() => window.__db.row.hafiza.tasks.find(t => t.id === 'task_eski3').status === 'done', null, { timeout: 8000 }).then(() => ok(true, 'sayfa yenilense bile bekleyen değişiklik kaydedildi'), () => ok(false, 'sayfa yenilense bile bekleyen değişiklik kaydedildi'));
  await settle(page);
  ok(await page.evaluate(() => !localStorage.getItem('foyder:hz:bekleyen')), 'kayıttan sonra bekleyen kopya temizlendi');
  await ctx.setOffline(true);
  await page.click('.hz-task:has-text("Eski biçimde açık") .hz-done-btn');
  await page.waitForSelector('#hzSync.pending');
  ok((await page.textContent('#hzSync')).includes('Çevrimdışı'), 'çevrimdışı durumu gösteriliyor');
  await ctx.setOffline(false);
  await page.waitForFunction(() => window.__db.row.hafiza.tasks.find(t => t.id === 'task_eski1').status === 'done', null, { timeout: 8000 }).then(() => ok(true, 'bağlantı gelince otomatik kaydedildi'), () => ok(false, 'bağlantı gelince otomatik kaydedildi'));
  ok(untouched(await db(page)), 'çevrimdışı/yeniden bağlanma üye ve aidat verisine dokunmadı');

  /* --- Hatırlatma bildirimi --- */
  await page.evaluate(() => { const t = S.hafiza.tasks.find(x => x.id === 'task_eski3'); const d = new Date(Date.now() - 60000); t.status = 'todo'; t.reminderAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; HZ.checkReminders(); HZ.checkReminders(); });
  ok((await page.evaluate(() => window.__notes)).filter(n => n.body === 'Bugün bitmesi gereken eski görev').length === 1, 'hatırlatma tarayıcı bildirimi bir kez gösterildi');

  allErrors.push(...page.errors);
  const finalRow = await db(page);
  await ctx.close();

  /* --- Telefon görünümü --- */
  const { ctx: mctx, page: m } = await newContext(browser, URL, { seedRow: finalRow, viewport: { width: 390, height: 844 }, mobile: true });
  await m.evaluate(() => go('gorevler'));
  ok(await noOverflow(m) <= 0, 'telefon: liste yatay taşmıyor');
  await m.screenshot({ path: path.join(OUT, '08-tel-liste.png'), fullPage: true });
  await m.evaluate(() => HZ.tab('board'));
  const cols = await m.$$eval('.hz-col', els => els.map(e => e.getBoundingClientRect()));
  ok(cols.length === 4 && cols.every((c, i) => !i || c.top > cols[i - 1].top) && await noOverflow(m) <= 0, 'telefon: Pano dikey listeye dönüyor');
  ok(await m.locator('.hz-card select').first().isVisible(), 'telefon: kartta durum seçici var (sürüklemeden taşıma)');
  await m.locator('.hz-card select').first().selectOption('waiting');
  ok(await m.locator('.modal:has-text("Beklemeye al")').count() === 1, 'telefon: Beklemede seçilince ne beklendiği soruluyor');
  await m.fill('#hzWait', 'imza'); await m.click('.modal button:has-text("Beklemeye al")');
  await m.screenshot({ path: path.join(OUT, '09-tel-pano.png'), fullPage: true });
  await m.evaluate(() => HZ.tab('calendar'));
  ok(await noOverflow(m) <= 0, 'telefon: takvim yatay taşmıyor');
  await m.screenshot({ path: path.join(OUT, '10-tel-takvim.png'), fullPage: true });
  await m.evaluate(() => HZ.tab('list'));
  await m.click('.hz-task >> nth=0');
  ok(await noOverflow(m) <= 0, 'telefon: görev ayrıntısı yatay taşmıyor');
  await m.screenshot({ path: path.join(OUT, '11-tel-ayrinti.png') });
  await m.keyboard.press('Escape');
  await m.evaluate(() => HZ.newDraft());
  await m.fill('#hzText', sample); await m.click('button:has-text("Görevleri çıkar")'); await m.waitForSelector('.hz-cand');
  ok(await noOverflow(m) <= 0, 'telefon: toplantı önizlemesi yatay taşmıyor');
  allErrors.push(...m.errors);
  await mctx.close();

  /* --- Okuyucu rolü --- */
  const { ctx: rctx, page: r } = await newContext(browser, URL, { seedRow: finalRow, role: 'okuyucu' });
  await r.evaluate(() => go('gorevler'));
  ok(await r.locator('button:has-text("+ Görev")').count() === 0 && await r.locator('.hz-done-btn:disabled').count() > 0 && await r.locator('.hz-sel').count() === 0, 'okuyucu: görevleri yalnızca görüntülüyor');
  await r.click('.hz-task >> nth=0');
  ok(await r.locator('#hzt_title:disabled').count() === 1 && await r.locator('#hzCkNew').count() === 0, 'okuyucu: ayrıntı salt okunur');
  allErrors.push(...r.errors);
  await rctx.close();

  /* --- Binlerce görevde hız --- */
  const big = JSON.parse(JSON.stringify(seed));
  big.hafiza.tasks = Array.from({ length: 5000 }, (_, i) => ({ id: 'perf' + i, title: `Deneme görevi ${i} sözleşme ${i % 7 ? 'takibi' : 'imzası'}`, status: ['todo', 'doing', 'waiting', 'done'][i % 4], dueDate: plus((i % 90) - 30), project: 'Proje ' + (i % 12), owner: 'Sorumlu ' + (i % 9), priority: ['high', 'medium', 'low'][i % 3], notes: 'Uydurma not '.repeat(5), checklist: [{ id: 'c', text: 'adım', done: i % 2 === 0 }], createdAt: '2026-10-01T09:00:00.000Z' }));
  const { ctx: pctx, page: p } = await newContext(browser, URL, { seedRow: big });
  let t0 = Date.now(); await p.evaluate(() => go('gorevler')); const tList = Date.now() - t0;
  t0 = Date.now(); await p.fill('#hzSearch', 'imzasi'); await p.waitForFunction(() => document.getElementById('hzCount').textContent.startsWith('536')); const tSearch = Date.now() - t0;
  t0 = Date.now(); await p.evaluate(() => HZ.tab('board')); const tBoard = Date.now() - t0;
  t0 = Date.now(); await p.evaluate(() => HZ.tab('calendar')); const tCal = Date.now() - t0;
  ok(tList < 1500 && tSearch < 1500 && tBoard < 1500 && tCal < 1500, `5.000 görevde hızlı: liste ${tList} ms, arama ${tSearch} ms, pano ${tBoard} ms, takvim ${tCal} ms`);
  allErrors.push(...p.errors);
  await pctx.close();

  ok(allErrors.length === 0, 'sayfa hatası yok ' + (allErrors.length ? JSON.stringify(allErrors) : ''));
  await browser.close(); srv.close();
  console.log(fails ? `\n${fails} kontrol başarısız` : `\nTüm kontroller geçti · ekran görüntüleri: ${OUT}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

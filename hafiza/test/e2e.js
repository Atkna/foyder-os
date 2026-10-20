// Uçtan uca deneme: uygulamayı geçici bir veri klasörüyle açar, arayüzü gerçek tıklamalarla kullanır.
// Çalıştırma: npm run test:e2e   (gerçek kullanıcı verisine dokunmaz)
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = process.env.HAFIZA_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'hafiza-e2e-'));
process.env.HAFIZA_DATA_DIR = dataDir;
const shotDir = process.env.HAFIZA_SHOTS || path.join(dataDir, 'ekran');
fs.mkdirSync(shotDir, { recursive: true });
const phase = process.env.HAFIZA_PHASE || 'first';

const { app, Notification } = require('electron');
const main = require('../main.js');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'GEÇTİ ' : 'KALDI '} ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const readData = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'hafiza-data.json'), 'utf8'));

async function run() {
  await app.whenReady();
  let win;
  for (let i = 0; i < 100 && !(win = main.getWindow()); i++) await sleep(50);
  const web = win.webContents;
  if (web.isLoading()) await new Promise(resolve => web.once('did-finish-load', resolve));
  await sleep(400);
  const js = code => web.executeJavaScript(`(async () => { ${code} })()`, true);
  const shot = async name => { await sleep(250); fs.writeFileSync(path.join(shotDir, `${name}.png`), (await web.capturePage()).toPNG()); };
  const errors = [];
  web.on('console-message', (event) => { if (event.level === 'error' || event.level === 3) errors.push(event.message); });
  await js(`window.confirm = () => true; window.__errors = []; window.addEventListener('error', e => window.__errors.push(String(e.message))); window.addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));`);
  const click = selector => js(`const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('yok: ' + ${JSON.stringify(selector)}); el.click();`);
  const text = selector => js(`return document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null;`);
  const setValue = (selector, value, event = 'input') => js(`const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));`);
  const today = await js(`return localISO();`);

  if (phase === 'first') {
    check('ilk açılış boş', (await text('#navInboxCount')) === '0' && (await text('#emptyTitle')) === 'Henüz görev yok');
    await shot('01-bos');

    // --- Örnek deşifreyle görev çıkarma ---
    await click('#openTranscriptBtn');
    await click('#loadSampleBtn');
    await sleep(300);
    await setValue('#transcriptDate', '2026-09-29', 'change');
    check('kelime sayacı canlı', /3\.5\d\d kelime/.test(await text('#transcriptStats')), await text('#transcriptStats'));
    await click('#analyzeBtn');
    await sleep(300);
    check('örnekten 24 aday', (await text('#analysisCount')) === '24 görev bulundu · 0 eşleşme', await text('#analysisCount'));
    await shot('02-onizleme');
    // Başlık düzenlenirken satır yeniden oluşturulmamalı (odak ve sonraki tıklama kaybolmamalı).
    const rowKept = await js(`
      const rows = document.querySelectorAll('.candidate'); const first = rows[0];
      const title = first.querySelector('.candidate-title'); title.focus(); title.value = title.value + ' (düzenlendi)';
      title.dispatchEvent(new Event('input', { bubbles: true })); title.dispatchEvent(new Event('change', { bubbles: true }));
      return document.querySelectorAll('.candidate')[0] === first && candidates[0].title.endsWith('(düzenlendi)');`);
    check('aday satırı düzenlenirken yerinde kalır', rowKept);
    await js(`const title = document.querySelector('.candidate-title'); title.value = title.value.replace(' (düzenlendi)', ''); title.dispatchEvent(new Event('input', { bubbles: true })); title.dispatchEvent(new Event('change', { bubbles: true }));`);
    await click('#saveCandidatesBtn');
    await sleep(500);
    check('24 görev kaydedildi', readData().tasks.length === 24 && readData().transcripts.length === 1, `${readData().tasks.length} görev`);
    check('tarihli göreve 09.00 hatırlatması', readData().tasks.find(t => t.key === 'summit-invites-second').reminderAt === '2026-11-15T09:00');
    check('sonuç bildirimi', /24 yeni görev eklendi, 0 görev güncellendi, 0 aday atlandı/.test(await text('.toast:last-child span')), await text('.toast:last-child span'));
    await shot('03-gorevler');

    // --- Bir görevi tamamla ---
    const doneId = await js(`const card = [...document.querySelectorAll('.task-card')].find(c => c.textContent.includes('Kara Tillman')); card.querySelector('.task-check').click(); return card.dataset.id;`);
    await sleep(400);
    const doneTask = readData().tasks.find(t => t.id === doneId);
    check('tamamlanınca durum ve zaman kaydedilir', doneTask.status === 'done' && Boolean(doneTask.completedAt));
    check('sayaçlar güncellenir', (await text('#navInboxCount')) === '23' && (await text('#navCompletedCount')) === '1');

    // --- Aynı deşifre tekrar girilirse engellenir ---
    await click('#openTranscriptBtn');
    await click('#loadSampleBtn');
    await sleep(300);
    await click('#analyzeBtn');
    await sleep(300);
    check('aynı deşifre: kaydet düğmesi kapalı', await js(`return document.querySelector('#saveCandidatesBtn').disabled;`));
    check('aynı deşifre: açıklama', /daha önce kaydedilmiş/.test(await text('#analysisHelp')));
    check('aynı deşifre: 24 eşleşme', /24 görev bulundu · 24 eşleşme/.test(await text('#analysisCount')), await text('#analysisCount'));
    const doneRow = await js(`const row = [...document.querySelectorAll('.candidate')].find(r => r.querySelector('.candidate-title').value.includes('Kara Tillman')); return { decision: row.querySelector('.candidate-decision').value, label: row.querySelector('.candidate-status').textContent };`);
    check('tamamlanmış eşleşme varsayılan olarak atlanır', doneRow.decision === 'skip' && /Tamamlanmış görev bulundu/.test(doneRow.label) && /atlanacak/.test(doneRow.label), doneRow.label);
    await shot('04-tekrar');
    await js(`closeModal('transcriptModal', true);`);

    // --- Aynı toplantının güncellenmiş notu: çoğaltmadan güncelle ---
    const sample = fs.readFileSync(path.join(__dirname, '..', 'sample-transcript.txt'), 'utf8');
    await click('#openTranscriptBtn');
    await setValue('#transcriptTitle', 'Takip görüşmesi');
    await setValue('#transcriptDate', '2026-10-01', 'change');
    await setValue('#transcriptText', `${sample} Ek not: Sunum dosyası Önder Bey'e 20 Ekim tarihinde gönderilecek.`);
    await click('#analyzeBtn');
    await sleep(300);
    await click('#saveCandidatesBtn');
    await sleep(500);
    let data = readData();
    check('takip notu görevleri çoğaltmaz', data.tasks.length === 24 && data.transcripts.length === 2, `${data.tasks.length} görev, ${data.transcripts.length} deşifre`);
    check('takip notu sonucu', /0 yeni görev eklendi, 23 görev güncellendi, 1 aday atlandı/.test(await text('.toast:last-child span')), await text('.toast:last-child span'));
    const stillDone = data.tasks.find(t => t.id === doneId);
    check('tamamlanmış görev yeniden açılmaz', stillDone.status === 'done' && stillDone.sourceIds.length === 1);
    const updated = data.tasks.find(t => t.key === 'email-onder-cc');
    check('güncellenen görev iki görüşmeye bağlı', updated.sourceIds.length === 2 && updated.status === 'open');
    check('aynı not ikinci kez eklenmez', (updated.notes.match(/İlgili bölüm/g) || []).length === 1, updated.notes);

    // --- Elle görev: tarih girilince varsayılan hatırlatma ---
    await click('#quickTaskBtn');
    await setValue('#taskTitle', 'LinkedIn duyurusunu gözden geçir');
    await setValue('#taskDueDate', today, 'change');
    check('son tarih seçilince hatırlatma 09.00', await js(`return document.querySelector('#taskReminder').value;`) === `${today}T09:00`);
    await setValue('#taskDueTime', '17:30');
    await setValue('#taskProject', 'Sosyal Medya');
    await click('#saveTaskBtn');
    await sleep(400);
    data = readData();
    const manual = data.tasks.find(t => t.title === 'LinkedIn duyurusunu gözden geçir');
    check('elle görev kaydedildi', manual && manual.dueDate === today && manual.dueTime === '17:30' && manual.reminderAt === `${today}T09:00` && manual.owner === 'Atakan');

    // --- Hatırlatma: 30 sn denetimi beklemeden doğrudan çağır ---
    const before = Date.now();
    await js(`await checkReminders();`);
    await sleep(600);
    data = readData();
    const notified = data.tasks.filter(t => t.notifiedAt && new Date(t.notifiedAt).getTime() >= before - 1000);
    check('zamanı gelen açık görevler için bildirim', Notification.isSupported() && notified.length >= 2 && notified.some(t => t.id === manual.id), `${notified.length} görev bildirildi`);
    check('tamamlanan görev için bildirim yok', !notified.some(t => t.status === 'done'));
    const again = Date.now();
    await js(`await checkReminders();`);
    await sleep(400);
    check('aynı gün ikinci bildirim yok', !readData().tasks.some(t => t.notifiedAt && new Date(t.notifiedAt).getTime() >= again));

    // --- Arama: Türkçe/İngilizce büyük-küçük harf ---
    await setValue('#searchInput', 'linkedin');
    const found = await js(`return document.querySelectorAll('.task-card').length;`);
    check('arama "linkedin" → "LinkedIn" görevlerini bulur', found >= 3, `${found} sonuç`);
    await setValue('#searchInput', 'ONDER');
    check('arama aksan ve büyük harf duyarsız', (await js(`return document.querySelectorAll('.task-card').length;`)) >= 5);
    await setValue('#searchInput', '');

    // --- Sıralama: grup başlıkları yinelenmez ---
    for (const sort of ['due', 'priority', 'created']) {
      await setValue('#sortSelect', sort, 'change');
      await js(`document.querySelector('[data-filter="all"]').click();`);
      const labels = await js(`return [...document.querySelectorAll('.task-group-label')].map(l => l.firstChild.textContent.trim());`);
      check(`"${sort}" sıralamasında başlıklar tekil`, new Set(labels).size === labels.length && labels.at(-1) === 'TAMAMLANANLAR', labels.join(', '));
    }
    await setValue('#sortSelect', 'due', 'change');
    await js(`document.querySelector('[data-filter="open"]').click();`);
    await shot('05-liste');

    // --- Deşifre arşivi ---
    await click('[data-view="transcripts"]');
    check('arşivde iki deşifre', (await js(`return document.querySelectorAll('.transcript-card').length;`)) === 2);
    await shot('06-arsiv');
    await js(`[...document.querySelectorAll('.transcript-card')].find(c => c.textContent.includes('Takip')).click();`);
    check('deşifre görüntüleyici metni gösterir', (await text('#viewerText')).includes('Ek not: Sunum dosyası'));
    check('görüntüleyici bağlı görevleri listeler', (await js(`return document.querySelectorAll('.viewer-task').length;`)) === 23);
    await shot('07-desifre');
    // Yeniden analiz: yeni deşifre kaydı oluşmadan, zaten çıkarılmış görevler atlanır.
    await click('#reanalyzeBtn');
    await sleep(300);
    const decisions = await js(`return candidates.map(c => c.decision);`);
    check('yeniden analizde çıkarılmış görevler atlanır', decisions.length === 24 && decisions.every(d => d === 'skip'), decisions.join(','));
    await click('#saveCandidatesBtn');
    await sleep(400);
    data = readData();
    check('yeniden analiz kopya oluşturmaz', data.tasks.length === 25 && data.transcripts.length === 2);

    // --- Görev düzenleme, yeniden açma, silme ---
    await click('[data-view="completed"]');
    await js(`document.querySelector('.task-card').click();`);
    await shot('08-gorev');
    await setValue('#taskStatus', 'open', 'change');
    await click('#saveTaskBtn');
    await sleep(400);
    const reopened = readData().tasks.find(t => t.id === doneId);
    check('yeniden açılan görevin tamamlanma zamanı temizlenir', reopened.status === 'open' && reopened.completedAt === null);
    await click('[data-view="inbox"]');
    await js(`[...document.querySelectorAll('.task-card')].find(c => c.textContent.includes('LinkedIn duyurusunu')).click();`);
    await click('#remindTomorrowBtn');
    await sleep(400);
    const tomorrow = await js(`const d = new Date(); d.setDate(d.getDate() + 1); return localISO(d);`);
    const snoozed = readData().tasks.find(t => t.title === 'LinkedIn duyurusunu gözden geçir');
    check('"Yarın hatırlat" ertesi gün 09.00', snoozed.reminderAt === `${tomorrow}T09:00` && snoozed.notifiedAt === null);
    await js(`[...document.querySelectorAll('.task-card')].find(c => c.textContent.includes('Kara Tillman')).querySelector('.task-check').click();`);
    await sleep(400);

    // --- Ayarlar ---
    await click('#openSettingsBtn');
    await sleep(400);
    check('veri konumu gösterilir', (await text('#dataPath')) === path.join(dataDir, 'hafiza-data.json'), await text('#dataPath'));
    check('sürüm gösterilir', (await text('#appVersion')) === `Hafıza ${require('../package.json').version}`, await text('#appVersion'));
    await shot('09-ayarlar');
    await js(`closeModal('settingsModal', true);`);

    check('yedek dosyaları', fs.existsSync(path.join(dataDir, 'hafiza-data.json.bak')) && !fs.existsSync(path.join(dataDir, 'hafiza-data.json.tmp')));
    const pageErrors = await js(`return window.__errors;`);
    check('arayüzde hata yok', pageErrors.length === 0 && errors.length === 0, [...pageErrors, ...errors].join(' | '));

    // Pencere çarpısı: uygulama kapanmaz, gizlenir.
    win.close();
    await sleep(300);
    check('çarpıya basınca pencere gizlenir, uygulama çalışır', !win.isDestroyed() && !win.isVisible());
  } else {
    // İkinci açılış: her şey yerinde mi?
    const data = readData();
    check('yeniden açılışta görevler yerinde', (await text('#navInboxCount')) === String(data.tasks.filter(t => t.status !== 'done').length) && data.tasks.length === 25, `${data.tasks.length} görev`);
    check('yeniden açılışta tamamlanan görev yerinde', (await text('#navCompletedCount')) === '1' && data.tasks.filter(t => t.status === 'done').length === 1);
    check('yeniden açılışta deşifreler yerinde', (await text('#navTranscriptCount')) === '2');
    const kept = data.tasks.find(t => t.title === 'LinkedIn duyurusunu gözden geçir');
    check('yeniden açılışta tarih, saat ve hatırlatma yerinde', kept.dueDate === today && kept.dueTime === '17:30' && /T09:00$/.test(kept.reminderAt));
    await shot('10-yeniden-acilis');
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\nSONUÇ: ${results.length - failed.length}/${results.length} geçti. Veri: ${dataDir}`);
  fs.writeFileSync(path.join(dataDir, `e2e-${phase}.json`), JSON.stringify(results, null, 2));
  app.exit(failed.length ? 1 : 0);
}

run().catch(error => { console.error('E2E HATASI', error); app.exit(2); });

// Toplantılar ve Görevler çekirdeğinin birim testleri.
// Çalıştırma: node --test tests/gorevler.test.js
// Çekirdek index.html içindeki <script id="hz-core"> bloğundan okunur; test verileri uydurmadır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const block = html.match(/<script id="hz-core">\n([\s\S]*?)<\/script>/);
assert.ok(block, 'index.html içinde hz-core bloğu bulunamadı');
const sandbox = { TextEncoder, console };
sandbox.globalThis = sandbox;
vm.runInNewContext(block[1], sandbox);
const C = sandbox.HZCore;
const Engine = require(path.join(root, 'hafiza', 'task-engine.js'));
const plain = v => JSON.parse(JSON.stringify(v));

test('gömülü Hafıza motoru kaynakla birebir aynı', () => {
  const out = execFileSync('node', [path.join(root, 'tools', 'hafiza-gom.js'), '--kontrol'], { encoding: 'utf8' });
  assert.match(out, /birebir aynı/);
});

test('eski veri taşınır: open → Yapılacak, diğer alanlar korunur', () => {
  const h = C.normH({ tasks: [{ id: 'a', title: 'Eski açık', status: 'open', notes: 'not' }, { id: 'b', title: 'Bitti', status: 'done', completedAt: '2026-10-01T10:00:00Z' }, { id: 'c', title: 'Durumsuz' }], transcripts: [{ id: 't1', text: 'x' }], settings: { foo: 1 } });
  assert.deepEqual(h.tasks.map(t => t.status), ['todo', 'done', 'todo']);
  assert.equal(h.tasks[0].notes, 'not');
  assert.equal(h.tasks[1].completedAt, '2026-10-01T10:00:00Z');
  assert.equal(h.transcripts.length, 1);
  assert.equal(h.settings.foo, 1);
  // Taşıma deterministik: ikinci kez çalıştırmak hiçbir şeyi değiştirmez.
  assert.deepEqual(plain(C.normH(plain(h))), plain(h));
  assert.deepEqual(plain(C.normH(null)), { tasks: [], transcripts: [] });
});

test('birleştirme: başkasının eklediği korunur, silinen geri gelmez, çakışmada yeni olan kazanır', () => {
  const base = { tasks: [{ id: '1', title: 'A', status: 'todo' }, { id: '2', title: 'B', status: 'todo' }, { id: '3', title: 'C', status: 'todo', updatedAt: '2026-10-01' }], transcripts: [] };
  const local = plain(base); local.tasks = local.tasks.filter(t => t.id !== '1'); local.tasks.push({ id: '4', title: 'Yerelde yeni', status: 'todo' });
  local.tasks.find(t => t.id === '3').title = 'C yerel'; local.tasks.find(t => t.id === '3').updatedAt = '2026-10-03';
  const remote = plain(base); remote.tasks.push({ id: '5', title: 'Uzakta yeni', status: 'todo' });
  remote.tasks.find(t => t.id === '2').status = 'done';
  remote.tasks.find(t => t.id === '3').title = 'C uzak'; remote.tasks.find(t => t.id === '3').updatedAt = '2026-10-02';
  const m = C.mergeH(base, local, remote);
  const byId = Object.fromEntries(m.tasks.map(t => [t.id, t]));
  assert.ok(!byId['1'], 'yerelde silinen geri gelmemeli');
  assert.equal(byId['2'].status, 'done', 'yalnız uzakta değişen alınmalı');
  assert.equal(byId['3'].title, 'C yerel', 'iki tarafta değişende en son güncellenen kazanmalı');
  assert.ok(byId['4'] && byId['5'], 'iki taraftaki yeni kayıtlar da kalmalı');
  // Uzakta silinen ama yerelde değiştirilen kayıt kaybolmaz.
  const r2 = plain(base); r2.tasks = r2.tasks.filter(t => t.id !== '2');
  const l2 = plain(base); l2.tasks.find(t => t.id === '2').title = 'B düzenlendi';
  assert.equal(C.mergeH(base, l2, r2).tasks.find(t => t.id === '2').title, 'B düzenlendi');
  // Eski "open" durumu taşıma yüzünden değişiklik sayılmaz.
  const oldBase = { tasks: [{ id: 'x', title: 'X', status: 'open' }], transcripts: [] };
  const r3 = plain(oldBase); r3.tasks[0].owner = 'Deneme Sorumlu';
  assert.equal(C.mergeH(oldBase, plain(oldBase), r3).tasks[0].owner, 'Deneme Sorumlu');
});

test('tekrar: haftalık, aylık, ay sonu ve geç tamamlama', () => {
  assert.equal(C.nextDue('2026-10-20', 'weekly', '2026-10-20'), '2026-10-27');
  assert.equal(C.nextDue('2026-01-31', 'monthly', '2026-01-31'), '2026-02-28');
  assert.equal(C.nextDue('2026-02-28', 'monthly', '2026-02-28', 31), '2026-03-31', 'ayın günü korunur');
  assert.equal(C.nextDue('2026-10-31', 'monthEnd', '2026-10-31'), '2026-11-30');
  assert.equal(C.nextDue('2026-10-15', 'monthEnd', '2026-10-15'), '2026-10-31');
  assert.equal(C.nextDue('2026-12-31', 'monthEnd', '2026-12-31'), '2027-01-31');
  assert.equal(C.nextDue('2026-09-01', 'weekly', '2026-10-20'), '2026-10-20', 'geçmişte kalan tekrarlar atlanır');
  assert.equal(C.nextDue('2026-10-20', '', '2026-10-20'), '');
});

test('tekrar: sonraki kopya temiz başlar, hatırlatma kaydırılır', () => {
  const t = { id: 'r1', title: 'Aylık aidat kontrolü', status: 'done', recur: 'monthly', dueDate: '2026-10-31', reminderAt: '2026-10-30T10:30', completedAt: '2026-10-31T09:00:00Z',
    checklist: [{ id: 'c1', text: 'Listeyi çek', done: true }], comments: [{ id: 'm', text: 'eski' }], history: [{ text: 'eski' }], waitingFor: 'x' };
  const n = C.spawnNext(t, { id: 'r2', now: '2026-10-31T09:00:00Z', by: 'Deneme Kullanıcı', today: '2026-10-31' });
  assert.equal(n.id, 'r2'); assert.equal(n.status, 'todo'); assert.equal(n.dueDate, '2026-11-30');
  assert.equal(n.reminderAt, '2026-11-29T10:30');
  assert.equal(n.completedAt, null); assert.equal(n.waitingFor, '');
  assert.deepEqual(plain(n.checklist), [{ id: 'c1', text: 'Listeyi çek', done: false }]);
  assert.equal(n.comments.length, 0); assert.equal(n.history.length, 1);
  assert.equal(n.recurPrevId, 'r1'); assert.equal(n.recurDay, 31);
  assert.equal(t.checklist[0].done, true, 'özgün görev değişmez');
});

test('değişiklik geçmişi: okunur açıklamalar', () => {
  const before = { title: 'A', status: 'todo', dueDate: '', owner: '', notes: 'x', memberIds: [] };
  const after = { ...before, status: 'waiting', dueDate: '2026-10-21', owner: 'Deneme', notes: 'y', memberIds: ['M1'] };
  const fmt = (k, v) => k === 'status' ? C.STATUS_LABEL[v] : Array.isArray(v) ? v.join(',') : String(v || '');
  const out = plain(C.describeChanges(before, after, fmt));
  assert.deepEqual(out, ['Durum: Yapılacak → Beklemede', 'Son tarih: — → 2026-10-21', 'Sorumlu: — → Deneme', 'Notlar güncellendi', 'İlgili üyeler: — → M1']);
  assert.deepEqual(plain(C.describeChanges(before, { ...before }, fmt)), []);
});

test('filtreler birleşir; arama Türkçe karakterden bağımsız', () => {
  const T = '2026-10-20';
  const tasks = [
    { id: 1, title: 'Sponsor sözleşmesini gönder', status: 'todo', dueDate: '2026-10-19', project: 'Zirve', owner: 'Ayşe', priority: 'high' },
    { id: 2, title: 'Bülten taslağı', status: 'doing', dueDate: T, project: 'İletişim', owner: 'Can', priority: 'medium' },
    { id: 3, title: 'Salon teyidi', status: 'waiting', dueDate: '2026-10-25', project: 'Zirve', owner: 'Can', waitingFor: 'otel yanıtı' },
    { id: 4, title: 'Eski iş', status: 'done', dueDate: '2026-10-01', project: 'Zirve', owner: 'Ayşe' },
    { id: 5, title: 'Tarihsiz iş', status: 'todo', project: '', owner: '' }];
  const f = o => C.filterTasks(tasks, { scope: 'open', project: '', owner: '', priority: '', status: '', q: '', ...o }, { today: T, fold: Engine.fold }).map(t => t.id);
  assert.deepEqual(f({}), [1, 2, 3, 5]);
  assert.deepEqual(f({ scope: 'today' }), [2]);
  assert.deepEqual(f({ scope: 'overdue' }), [1]);
  assert.deepEqual(f({ scope: 'upcoming' }), [3]);
  assert.deepEqual(f({ scope: 'done' }), [4]);
  assert.deepEqual(f({ scope: 'all', project: 'Zirve', owner: 'Ayşe' }), [1, 4]);
  assert.deepEqual(f({ project: 'Zirve', status: 'waiting' }), [3]);
  assert.deepEqual(f({ project: '-' }), [5]);
  assert.deepEqual(f({ priority: 'medium' }), [2, 3, 5], 'önceliği boş olan Normal sayılır');
  assert.deepEqual(f({ q: 'SOZLESME' }), [1]);
  assert.deepEqual(f({ q: 'bulten' }), [2]);
  assert.deepEqual(f({ q: 'otel' }), [3], 'beklenen bilgisi de aranır');
  assert.deepEqual(C.sortTasks(tasks.filter(t => t.status !== 'done'), 'due').map(t => t.id), [1, 2, 3, 5]);
});

test('takvim dosyası (.ics) Google/Outlook biçiminde', () => {
  const ics = C.icsText([
    { id: 'task_a1', title: 'Rapor; özet, ve ek', status: 'todo', dueDate: '2026-10-23', dueTime: '14:30', project: 'Genel', owner: 'Deneme', notes: 'Satır 1\nSatır 2', reminderAt: '2026-10-23T09:00', recur: 'weekly' },
    { id: 'task_b2', title: 'Tüm gün '.repeat(20), status: 'waiting', waitingFor: 'onay', dueDate: '2026-10-31', recur: 'monthEnd' },
    { id: 'task_c3', title: 'Tarihsiz', status: 'todo' }], { now: new Date('2026-10-20T08:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2, 'tarihsiz görev aktarılmaz');
  assert.match(ics, /DTSTART:20261023T143000\r\nDURATION:PT30M/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101/);
  assert.match(ics, /SUMMARY:Rapor\\; özet\\, ve ek/);
  assert.match(ics, /RRULE:FREQ=WEEKLY/); assert.match(ics, /RRULE:FREQ=MONTHLY;BYMONTHDAY=-1/);
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY/);
  assert.match(ics, /Beklenen: onay/);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /DESCRIPTION:Proje: Genel\\nSorumlu: Deneme\\nDurum: Yapılacak\\nSatır 1\\nSatır 2/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `satır 75 baytı aşıyor: ${line}`);
});

test('haftalık özet: tamamlanan, devam eden, geciken ve yapılacaklar ayrılır', () => {
  const T = '2026-10-20';
  const tasks = [
    { id: 'd1', title: 'Geçen hafta bitti', status: 'done', completedAt: '2026-10-16T12:00:00', owner: 'Deneme' },
    { id: 'd2', title: 'Çok önce bitti', status: 'done', completedAt: '2026-09-01T12:00:00' },
    { id: 'a1', title: 'Sürüyor', status: 'doing', dueDate: '2026-10-22' },
    { id: 'a2', title: 'Bekliyor', status: 'waiting', waitingFor: 'imza', dueDate: '' },
    { id: 'o1', title: 'Gecikti', status: 'doing', dueDate: '2026-10-18' },
    { id: 'n1', title: 'Gelecek hafta', status: 'todo', dueDate: '2026-10-26' },
    { id: 'n2', title: 'Çok ileride', status: 'todo', dueDate: '2026-12-01' }];
  const r = C.weekly(tasks, T);
  assert.deepEqual([r.from, r.to], ['2026-10-14', '2026-10-27']);
  assert.deepEqual(r.done.map(t => t.id), ['d1']);
  assert.deepEqual(r.active.map(t => t.id), ['a1', 'a2']);
  assert.deepEqual(r.overdue.map(t => t.id), ['o1']);
  assert.deepEqual(r.next.map(t => t.id), ['n1']);
  const text = C.weeklyText(r, { title: 'Haftalık özet' });
  assert.match(text, /✅ Tamamlananlar · 2026-10-14 – 2026-10-20 \(1\)\n• Geçen hafta bitti — Deneme/);
  assert.match(text, /• Bekliyor · beklenen: imza/);
  assert.match(text, /⚠️ Gecikenler \(1\)\n• Gecikti \(2026-10-18\)/);
});

test('çok sayıda görevde filtre ve sıralama hızlı', () => {
  const many = Array.from({ length: 20000 }, (_, i) => ({ id: 't' + i, title: `Görev ${i} sözleşme takibi`, status: ['todo', 'doing', 'waiting', 'done'][i % 4], dueDate: `2026-${String(1 + i % 12).padStart(2, '0')}-${String(1 + i % 28).padStart(2, '0')}`, project: 'P' + (i % 30), owner: 'Kişi ' + (i % 15), priority: ['high', 'medium', 'low'][i % 3] }));
  const t0 = Date.now();
  for (let k = 0; k < 3; k++) {
    const list = C.filterTasks(many, { scope: 'open', project: 'P3', owner: '', priority: '', status: '', q: 'sozlesme' }, { today: '2026-10-20', fold: Engine.fold });
    C.sortTasks(list, 'due');
  }
  assert.ok(Date.now() - t0 < 3000, `20.000 görevde filtre çok yavaş: ${Date.now() - t0} ms`);
});

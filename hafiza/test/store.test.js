const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../store.js');
const Reminders = require('../reminders.js');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hafiza-test-'));
const payload = (titles = []) => ({ tasks: titles.map((title, index) => ({ id: `t${index}`, title, status: 'open' })), transcripts: [], settings: { minimizeToTray: false } });

test('ilk açılış: boş veri, dosya oluşturulmaz', () => {
  const store = createStore(tempDir());
  const { data, status } = store.read();
  assert.equal(status, 'new');
  assert.deepEqual(data.tasks, []);
  assert.equal(data.settings.minimizeToTray, true);
  assert.equal(fs.existsSync(store.file), false);
});

test('kaydet ve yeniden oku: görevler ve ayarlar kalır', () => {
  const store = createStore(tempDir());
  store.write(payload(['Kerem\'i ara']));
  const { data, status } = store.read();
  assert.equal(status, 'ok');
  assert.equal(data.tasks[0].title, 'Kerem\'i ara');
  assert.equal(data.settings.minimizeToTray, false);
  assert.equal(data.settings.repeatReminders, true);
  assert.equal(fs.existsSync(`${store.file}.tmp`), false);
});

test('her kayıtta önceki sürüm .bak olur; günün ilk hâli ayrıca saklanır', () => {
  const store = createStore(tempDir());
  store.write(payload(['bir']));
  assert.equal(fs.existsSync(store.backup), false);
  store.write(payload(['bir', 'iki']));
  assert.equal(JSON.parse(fs.readFileSync(store.backup, 'utf8')).tasks.length, 1);
  store.write(payload(['bir', 'iki', 'üç']));
  assert.equal(JSON.parse(fs.readFileSync(store.backup, 'utf8')).tasks.length, 2);
  const snapshots = fs.readdirSync(store.snapshots);
  assert.equal(snapshots.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(store.snapshots, snapshots[0]), 'utf8')).tasks.length, 1);
});

test('ana dosya bozulursa .bak dosyasından kurtarılır ve bozuk dosya saklanır', () => {
  const store = createStore(tempDir());
  store.write(payload(['bir']));
  store.write(payload(['bir', 'iki']));
  fs.writeFileSync(store.file, '{ "tasks": [ bozuk', 'utf8');
  const { data, status } = store.read();
  assert.equal(status, 'recovered');
  assert.equal(data.tasks.length, 1);
  store.write(data);
  assert.equal(store.read().status, 'ok');
  // Son geçerli yedek ezilmedi, bozuk dosya kenara alındı.
  assert.equal(JSON.parse(fs.readFileSync(store.backup, 'utf8')).tasks.length, 1);
  assert.equal(fs.readdirSync(path.dirname(store.file)).filter(name => name.includes('bozuk')).length, 1);
});

test('hem ana dosya hem yedek okunamıyorsa durum bildirilir', () => {
  const store = createStore(tempDir());
  fs.writeFileSync(store.file, 'çöp', 'utf8');
  assert.equal(store.read().status, 'damaged');
});

test('geçersiz veri kaydedilmez, mevcut dosya korunur', () => {
  const store = createStore(tempDir());
  store.write(payload(['bir']));
  assert.throws(() => store.write({ tasks: 'yok' }));
  assert.throws(() => store.write(null));
  assert.equal(store.read().data.tasks.length, 1);
});

test('yedekten geri yükleme: mevcut veri ayrıca saklanır', () => {
  const dir = tempDir();
  const store = createStore(dir);
  store.write(payload(['eski bir', 'eski iki']));
  const backupFile = path.join(dir, 'disari.json');
  fs.writeFileSync(backupFile, JSON.stringify(payload(['yedekten gelen'])), 'utf8');
  const restored = store.restore(backupFile);
  assert.equal(restored.tasks[0].title, 'yedekten gelen');
  assert.equal(store.read().data.tasks.length, 1);
  const kept = fs.readdirSync(store.snapshots).find(name => name.startsWith('geri-yukleme-oncesi-'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(store.snapshots, kept), 'utf8')).tasks.length, 2);
  fs.writeFileSync(backupFile, '{"baska":"dosya"}', 'utf8');
  assert.throws(() => store.restore(backupFile));
  assert.equal(store.read().data.tasks.length, 1);
});

test('hatırlatma kuralları', () => {
  const now = new Date(2026, 9, 6, 10, 0); // 6 Ekim 2026 10:00
  const task = extra => ({ id: 'x', title: 'Görev', status: 'open', reminderAt: '2026-10-06T09:00', notifiedAt: null, ...extra });
  const due = (extra, repeat = true) => Reminders.due([task(extra)], now, repeat).length === 1;

  assert.equal(due({}), true, 'zamanı gelmiş açık görev');
  assert.equal(due({ status: 'done' }), false, 'tamamlanan görev için bildirim yok');
  assert.equal(due({ reminderAt: '' }), false, 'hatırlatması olmayan görev');
  assert.equal(due({ reminderAt: '2026-10-06T11:00' }), false, 'saati gelmemiş');
  assert.equal(due({ reminderAt: '2026-10-07T09:00' }), false, 'yarınki hatırlatma');
  assert.equal(due({ notifiedAt: new Date(2026, 9, 6, 9, 0).toISOString() }), false, 'bugün zaten gösterildi');
  assert.equal(due({ reminderAt: '2026-10-05T09:00', notifiedAt: new Date(2026, 9, 5, 9, 0).toISOString() }), true, 'günlük tekrar: ertesi gün yeniden');
  assert.equal(due({ reminderAt: '2026-10-05T09:00', notifiedAt: new Date(2026, 9, 5, 9, 0).toISOString() }, false), false, 'tekrar kapalı: yalnızca ilk bildirim');
  assert.equal(due({ reminderAt: '2026-10-05T15:00', notifiedAt: new Date(2026, 9, 5, 15, 0).toISOString() }), false, 'günlük tekrar seçilen saatten önce gelmez');
  assert.equal(due({ reminderAt: '2026-10-05T15:00' }), true, 'uygulama kapalıyken kaçan ilk bildirim açılışta gösterilir');
  assert.equal(due({ reminderAt: 'geçersiz' }), false);
});

test('çok sayıda hatırlatma tek özet bildirimde toplanır', () => {
  const tasks = n => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `Görev ${i + 1}` }));
  assert.equal(Reminders.messages(tasks(3)).length, 3);
  assert.equal(Reminders.messages(tasks(3))[0].taskId, 't0');
  const summary = Reminders.messages(tasks(7));
  assert.equal(summary.length, 1);
  assert.match(summary[0].title, /7 görev/);
  assert.match(summary[0].body, /ve 4 görev daha/);
});

const fs = require('fs');
const path = require('path');

const DATA_FILE = 'hafiza-data.json';
const SNAPSHOT_DIR = 'yedekler';
const SNAPSHOT_LIMIT = 14;

const defaultSettings = () => ({ minimizeToTray: true, reminderSound: true, repeatReminders: true, defaultOwner: 'Atakan' });
const emptyData = () => ({ version: 1, tasks: [], transcripts: [], settings: defaultSettings(), updatedAt: new Date().toISOString() });
const isValid = data => Boolean(data) && typeof data === 'object' && Array.isArray(data.tasks) && Array.isArray(data.transcripts);
const stamp = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function normalize(data) {
  return { ...emptyData(), ...data, settings: { ...defaultSettings(), ...(data.settings || {}) } };
}

function parseFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isValid(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

// Virüs tarayıcı gibi programlar dosyayı kısa süre kilitleyebilir; birkaç kez dene.
function replaceFile(from, to) {
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(from, to); return; } catch (error) {
      if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (attempt + 1));
    }
  }
}

function createStore(directory) {
  const file = path.join(directory, DATA_FILE);
  const backup = `${file}.bak`;
  const snapshots = path.join(directory, SNAPSHOT_DIR);

  // Yüklenen veri + geçici durum bilgisi (dosyaya yazılmaz).
  function read() {
    const primary = parseFile(file);
    if (primary) return { data: normalize(primary), status: 'ok' };
    const recovered = parseFile(backup);
    if (recovered) return { data: normalize(recovered), status: 'recovered' };
    return { data: emptyData(), status: fs.existsSync(file) ? 'damaged' : 'new' };
  }

  function pruneSnapshots() {
    const names = fs.readdirSync(snapshots).filter(name => /^hafiza-\d{4}-\d\d-\d\d\.json$/.test(name)).sort();
    for (const name of names.slice(0, Math.max(0, names.length - SNAPSHOT_LIMIT))) fs.rmSync(path.join(snapshots, name), { force: true });
  }

  function write(payload) {
    if (!isValid(payload)) throw new Error('Kaydedilecek veri geçersiz; mevcut dosya korunuyor.');
    fs.mkdirSync(directory, { recursive: true });
    const value = { ...normalize(payload), updatedAt: new Date().toISOString() };
    const temp = `${file}.tmp`;
    const handle = fs.openSync(temp, 'w');
    try {
      fs.writeFileSync(handle, JSON.stringify(value, null, 2), 'utf8');
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }

    if (fs.existsSync(file)) {
      if (parseFile(file)) {
        fs.copyFileSync(file, backup);
        // Günün ilk kaydından önceki hâli ayrıca sakla: .bak her kayıtta ezildiği için
        // yanlışlıkla silinen bir görevi geri almak ancak günlük kopyayla mümkün olur.
        try {
          fs.mkdirSync(snapshots, { recursive: true });
          const daily = path.join(snapshots, `hafiza-${stamp()}.json`);
          if (!fs.existsSync(daily)) { fs.copyFileSync(file, daily); pruneSnapshots(); }
        } catch (_) { /* Günlük kopya alınamasa da asıl kayıt sürmeli. */ }
      } else {
        // Bozuk ana dosyayı silmek yerine kenara al; son geçerli .bak dosyasına dokunma.
        try { fs.renameSync(file, path.join(directory, `hafiza-data.bozuk-${Date.now()}.json`)); } catch (_) { /* yoksay */ }
      }
    }
    replaceFile(temp, file);
    return value;
  }

  // Geri yükleme: seçilen yedeği doğrular, mevcut veriyi ayrıca saklar ve yerine yazar.
  function restore(sourcePath) {
    const incoming = parseFile(sourcePath);
    if (!incoming) throw new Error('Seçilen dosya geçerli bir Hafıza yedeği değil.');
    if (parseFile(file)) {
      fs.mkdirSync(snapshots, { recursive: true });
      fs.copyFileSync(file, path.join(snapshots, `geri-yukleme-oncesi-${Date.now()}.json`));
    }
    return write(incoming);
  }

  return { file, backup, snapshots, read, write, restore, peek: parseFile };
}

module.exports = { createStore, emptyData, defaultSettings, isValid };

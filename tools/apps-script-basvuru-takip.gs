/**
 * FOYDER Üyelik Başvuru Takip Sistemi
 * Sürüm: 1.1.0
 *
 * Güvenlik özeti:
 * - Mail göndermez, silmez veya arşivlemez.
 * - Yalnızca belirlenen üyelik başvuru maillerini okur.
 * - Bulduğu başvuruyu Gelen Kutusu'na ekler, okunmadı/önemli/yıldızlı yapar.
 * - Yeni başvuruyu tabloya bir kez ekler; mevcut satırları silmez.
 *
 * 1.1.0 ile gelen süreç takibi (yalnızca okur):
 * - Her başvuru için gönderilen "Üyelik Kabulü" mailini, adayın cevaplarını,
 *   bizden giden diğer üyelik maillerini ve "Topluluğumuza Hoş Geldiniz" mailini bulur.
 * - Sonucu ayrı bir "Panel Akışı" sayfasına yazar. Bu sayfa FOYDER OS paneline
 *   CSV olarak yayınlanır. "Başvurular" sayfasına dokunmaz. Yayınlanan sayfaya telefon,
 *   doğum tarihi gibi bilgiler konmaz; aday mesajlarındaki IBAN ve numaralar gizlenir.
 * - En fazla 30 dakikada bir çalışır (Gmail kotasını korumak için).
 */

const FOYDER_AUTO = {
  VERSION: '1.1.0',
  FLOW_SHEET: 'Panel Akışı',
  FLOW_INTERVAL_MIN: 30,
  FLOW_LOOKBACK_DAYS: 400,
  ACCOUNT: 'info@tma-turkey.org',
  APPLICATION_SHEET: 'Başvurular',
  REVIEW_SHEET: 'Kontrol Gerekenler',
  SETTINGS_SHEET: 'Ayarlar',
  HEADER_ROW: 4,
  DATA_START_ROW: 5,
  PROCESSED_LABEL: 'FOYDER-AUTO-ISLENDI',
  NEW_LABEL: 'FOYDER/Yeni Başvuru',
  REVIEW_LABEL: 'FOYDER/Kontrol Gerekli',
  LOOKBACK_DAYS: 90,
  MAX_THREADS_PER_RUN: 50,
  SUBJECTS: [
    'FOYDER Gerçek Kişi Üyelik Başvuru Formu İle Yeni Kayıt',
    'FOYDER Kurumsal Üyelik Başvuru Formu İle Yeni Kayıt'
  ]
};

const APPLICATION_HEADERS = [
  'Kayıt No', 'Mail Tarihi', 'Durum', 'Sorumlu', 'Son İşlem Tarihi',
  'Ad Soyad', 'Doğum Tarihi', 'Doğum Yılı', 'E-posta', 'Telefon',
  'Üyelik Türü', 'Üye Olma Amacı', 'Kurum', 'Meslek', 'Tecrübe (Yıl)',
  '1. Referans', '2. Referans', 'LinkedIn', 'Rehber İzni',
  'Fotoğraf', 'CV', 'Kimlik', 'Diploma', 'Adli Sicil', 'Başvuru Formu',
  'Evrak Durumu', 'Ek Sayısı', 'Gmail Linki', 'Konu', 'Message ID',
  'Kontrol Notu', 'İşlenme Zamanı'
];

const REVIEW_HEADERS = [
  'Mail Tarihi', 'Sebep', 'Konu', 'Gönderen', 'Alıcı',
  'Gmail Linki', 'Message ID', 'İşlenme Zamanı'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FOYDER Otomasyon')
    .addItem('1. Güvenli test (değişiklik yapmaz)', 'guvenliTest')
    .addItem('2. Kurulumu tamamla', 'kurulum')
    .addItem('3. Şimdi çalıştır', 'otomasyonuCalistir')
    .addItem('Geçmiş başvuruları aktar (mail durumu değişmez)', 'gecmisBasvurulariAktar')
    .addItem('Süreç takibini şimdi güncelle (onay, cevap, hoş geldiniz)', 'surecTakibiniGuncelle')
    .addSeparator()
    .addItem('Durumu kontrol et', 'tetikleyiciDurumunuKontrolEt')
    .addItem('Otomatik çalışmayı durdur', 'otomatikCalismayiDurdur')
    .addToUi();
}

/** Yalnızca arama yapar; Gmail veya tablo durumunu değiştirmez. */
function guvenliTest() {
  const query = buildQuery_();
  const threads = GmailApp.search(query, 0, 10);
  const subjects = threads.map(thread => thread.getFirstMessageSubject());

  SpreadsheetApp.getUi().alert(
    'Güvenli test tamamlandı.\n\n' +
    'Bulunan uygun başvuru konuşması: ' + threads.length + '\n' +
    (subjects.length ? 'Örnek konu: ' + subjects[0] : 'Yeni veya işlenmemiş başvuru bulunamadı.') +
    '\n\nBu test hiçbir maili veya tabloyu değiştirmedi.'
  );
}

/** Sayfa bağlantısını kaydeder, gerekli etiketleri ve 5 dakikalık tetikleyiciyi oluşturur. */
function kurulum() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('FOYDER_SPREADSHEET_ID', ss.getId());

  ensureWorkbookStructure_(ss);
  getOrCreateLabel_(FOYDER_AUTO.PROCESSED_LABEL);
  getOrCreateLabel_(FOYDER_AUTO.NEW_LABEL);
  getOrCreateLabel_(FOYDER_AUTO.REVIEW_LABEL);

  const existing = ScriptApp.getProjectTriggers().filter(trigger =>
    trigger.getHandlerFunction() === 'otomasyonuCalistir'
  );

  if (existing.length === 0) {
    ScriptApp.newTrigger('otomasyonuCalistir')
      .timeBased()
      .everyMinutes(5)
      .create();
  }

  updateSettings_({
    triggerStatus: 'Aktif - her 5 dakikada bir',
    result: 'Kurulum tamamlandı; ilk tarama henüz yapılmadı.',
    error: ''
  });

  SpreadsheetApp.getUi().alert(
    'Kurulum tamamlandı.\n\n' +
    'Otomasyon 5 dakikada bir kontrol edecek. İlk kontrollü tarama için menüden “Şimdi çalıştır”ı seçebilirsiniz.'
  );
}

/** Tetikleyicinin çağırdığı ana fonksiyon. */
function otomasyonuCalistir() {
  processApplications_(FOYDER_AUTO.LOOKBACK_DAYS, true);
}

/** Son iki yılı tabloya aktarır; Gelen Kutusu ve okunma durumunu değiştirmez. */
function gecmisBasvurulariAktar() {
  const result = processApplications_(730, false);
  SpreadsheetApp.getUi().alert(
    'Geçmiş aktarım tamamlandı.\n\n' +
    'Eklenen başvuru: ' + result.added + '\n' +
    'Kontrole ayrılan: ' + result.review + '\n\n' +
    'Maillerin Gelen Kutusu ve okunma durumu değiştirilmedi.'
  );
}

function processApplications_(lookbackDays, applyMailActions) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { added: 0, review: 0 };

  let added = 0;
  let review = 0;

  try {
    const ss = getTargetSpreadsheet_();
    ensureWorkbookStructure_(ss);

    const applicationSheet = ss.getSheetByName(FOYDER_AUTO.APPLICATION_SHEET);
    const reviewSheet = ss.getSheetByName(FOYDER_AUTO.REVIEW_SHEET);
    const knownIds = getKnownMessageIds_(applicationSheet, reviewSheet);

    const processedLabel = getOrCreateLabel_(FOYDER_AUTO.PROCESSED_LABEL);
    const newLabel = getOrCreateLabel_(FOYDER_AUTO.NEW_LABEL);
    const reviewLabel = getOrCreateLabel_(FOYDER_AUTO.REVIEW_LABEL);

    const threads = GmailApp.search(
      buildQuery_(lookbackDays),
      0,
      FOYDER_AUTO.MAX_THREADS_PER_RUN
    );

    threads.forEach(thread => {
      const targetMessages = thread.getMessages().filter(isTargetMessage_);

      targetMessages.forEach(message => {
        const messageId = message.getId();

        if (knownIds.has(messageId)) {
          thread.addLabel(processedLabel);
          return;
        }

        const parsed = parseApplication_(message);
        const mailLink = thread.getPermalink();

        if (!parsed.adSoyad || !parsed.email) {
          appendReviewRow_(reviewSheet, message, parsed, mailLink);
          thread.addLabel(reviewLabel);
          review++;
        } else {
          appendApplicationRow_(applicationSheet, message, parsed, mailLink);
          thread.addLabel(newLabel);
          added++;
        }

        if (applyMailActions) {
          // Maili kaybetmeme işlemleri. Silme, arşivleme veya gönderme yoktur.
          thread.moveToInbox();
          thread.markUnread();
          thread.markImportant();
          GmailApp.starMessage(message);
        }
        thread.addLabel(processedLabel);
        knownIds.add(messageId);
      });
    });

    // Süreç takibi: hata verse bile başvuru aktarımını bozmaz.
    try {
      surecAkisiniYaz_(ss, added > 0);
    } catch (flowError) {
      console.warn('Süreç takibi güncellenemedi: ' + flowError);
    }

    updateSettings_({
      lastRun: new Date(),
      result: 'Başarılı',
      newCount: added,
      reviewCount: review,
      error: '',
      triggerStatus: getTriggerStatus_()
    });

    return { added, review };
  } catch (error) {
    updateSettings_({
      lastRun: new Date(),
      result: 'Hata',
      error: String(error && error.message ? error.message : error)
    });
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function tetikleyiciDurumunuKontrolEt() {
  const status = getTriggerStatus_();
  updateSettings_({ triggerStatus: status });
  SpreadsheetApp.getUi().alert('Otomasyon durumu: ' + status);
}

/** Yalnızca bu otomasyona ait zamanlayıcıyı kaldırır. Gmail ve tablo verileri kalır. */
function otomatikCalismayiDurdur() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'otomasyonuCalistir') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  updateSettings_({ triggerStatus: 'Durduruldu' });
  SpreadsheetApp.getUi().alert('Otomatik çalışma durduruldu. Gmail ve tablo verileri değiştirilmedi.');
}

function buildQuery_(lookbackDays = FOYDER_AUTO.LOOKBACK_DAYS) {
  const subjectPart = '{' + FOYDER_AUTO.SUBJECTS
    .map(subject => 'subject:"' + subject + '"')
    .join(' ') + '}';

  return [
    'in:sent',
    'to:' + FOYDER_AUTO.ACCOUNT,
    'newer_than:' + lookbackDays + 'd',
    subjectPart,
    '-label:' + FOYDER_AUTO.PROCESSED_LABEL,
    '-in:trash',
    '-in:spam'
  ].join(' ');
}

function isTargetMessage_(message) {
  const subject = message.getSubject() || '';
  const to = message.getTo() || '';

  return FOYDER_AUTO.SUBJECTS.indexOf(subject) !== -1 &&
    to.toLowerCase().includes(FOYDER_AUTO.ACCOUNT.toLowerCase());
}

function parseApplication_(message) {
  const body = message.getPlainBody() || '';
  const lines = body.split(/\r?\n/).map(cleanLine_).filter(Boolean);
  const subject = message.getSubject() || '';
  const attachments = message.getAttachments({
    includeInlineImages: false,
    includeAttachments: true
  });
  const filenames = attachments.map(file => normalize_(file.getName())).join(' | ');
  const bodyNorm = normalize_(body);

  const adSoyad = getNextValue_(lines, ['Adınız', 'Ad Soyad', 'İsim Soyisim']);
  const dogumRaw = getNextValue_(lines, ['Doğum Tarihiniz', 'Doğum Tarihi']);
  const dogumTarihi = parseTurkishDate_(dogumRaw);
  const email = extractEmail_(getNextValue_(lines, ['Email Adresiniz', 'E-posta Adresiniz', 'E-posta', 'Email']));
  const telefon = normalizePhone_(getNextValue_(lines, ['Telefon No', 'Telefon Numaranız', 'Telefon', 'GSM']));
  const uyelikTuru = getNextValue_(lines, ['Üyelik Türünü Seçiniz', 'Üyelik Türü']);
  const uyeOlmaAmaci = getNextValue_(lines, ['Üye Olma Amacınız', 'Üye Olma Amacı']);
  const kurum = getNextValue_(lines, ['Çalıştığınız Kurum Adı', 'Kurum Adı', 'Kurum']);
  const meslek = getNextValue_(lines, ['Mesleğiniz', 'Meslek']);
  const tecrube = getNextValue_(lines, ['Tecrübeniz', 'Tecrübe']);
  const referans1 = getNextValue_(lines, ['1. Referans', 'Birinci Referans']);
  const referans2 = getNextValue_(lines, ['2. Referans', 'İkinci Referans']);
  const linkedIn = getNextValue_(lines, ['LinkedIN', 'LinkedIn']);
  const rehberIzni = getNextValue_(lines, ['Profiliniz Üye Rehberinde Yayınlansın mı?']);

  const docs = {
    fotograf: bodyNorm.includes('ek 1 adet fotograf') || /\.(jpg|jpeg|png)\b/.test(filenames),
    cv: bodyNorm.includes('ek cv') || filenames.includes('ozgecmis') || /(^|\W)cv(\W|$)/.test(filenames),
    kimlik: bodyNorm.includes('ek kimlik belgesi') || filenames.includes('kimlik'),
    diploma: bodyNorm.includes('ek diploma') || filenames.includes('diploma') || filenames.includes('uni'),
    adliSicil: bodyNorm.includes('ek adli sicil kaydi') || filenames.includes('adli sicil'),
    basvuruFormu: filenames.includes('basvuru formu') || filenames.includes('uyelik basvuru')
  };

  const missingFields = [];
  if (!adSoyad) missingFields.push('Ad Soyad');
  if (!email) missingFields.push('E-posta');
  if (!telefon) missingFields.push('Telefon');
  if (!dogumTarihi) missingFields.push('Doğum tarihi');

  const isCorporate = normalize_(uyelikTuru + ' ' + subject).includes('kurumsal');
  const requiredDocs = isCorporate
    ? ['basvuruFormu']
    : ['fotograf', 'cv', 'kimlik', 'diploma', 'adliSicil', 'basvuruFormu'];
  const missingDocs = requiredDocs.filter(key => !docs[key]);

  return {
    adSoyad,
    dogumTarihi,
    dogumYili: dogumTarihi ? dogumTarihi.getFullYear() : '',
    email,
    telefon,
    uyelikTuru,
    uyeOlmaAmaci,
    kurum,
    meslek,
    tecrube: extractNumber_(tecrube),
    referans1,
    referans2,
    linkedIn,
    rehberIzni,
    docs,
    attachmentCount: attachments.length,
    evrakDurumu: missingDocs.length === 0 ? 'Tam' : 'Eksik',
    note: [
      missingFields.length ? 'Eksik alan: ' + missingFields.join(', ') : '',
      missingDocs.length ? 'Eksik evrak: ' + missingDocs.map(documentLabel_).join(', ') : ''
    ].filter(Boolean).join(' | ') || 'Kontrol tamamlandı'
  };
}

function appendApplicationRow_(sheet, message, parsed, mailLink) {
  const now = new Date();
  const messageId = message.getId();
  const recordNo = 'FY-' + Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + messageId.slice(-6).toUpperCase();
  const d = parsed.docs;

  const row = [
    recordNo, message.getDate(), 'Yeni', '', '',
    parsed.adSoyad, parsed.dogumTarihi || '', parsed.dogumYili,
    parsed.email, parsed.telefon, parsed.uyelikTuru, parsed.uyeOlmaAmaci,
    parsed.kurum, parsed.meslek, parsed.tecrube, parsed.referans1, parsed.referans2,
    parsed.linkedIn, parsed.rehberIzni,
    yesNo_(d.fotograf), yesNo_(d.cv), yesNo_(d.kimlik), yesNo_(d.diploma),
    yesNo_(d.adliSicil), yesNo_(d.basvuruFormu), parsed.evrakDurumu,
    parsed.attachmentCount, mailLink, message.getSubject(), messageId,
    parsed.note, now
  ];

  const targetRow = Math.max(sheet.getLastRow() + 1, FOYDER_AUTO.DATA_START_ROW);
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  sheet.getRange(targetRow, 2).setNumberFormat('dd.MM.yyyy HH:mm:ss');
  sheet.getRange(targetRow, 7).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(targetRow, 32).setNumberFormat('dd.MM.yyyy HH:mm:ss');
}

function appendReviewRow_(sheet, message, parsed, mailLink) {
  const targetRow = Math.max(sheet.getLastRow() + 1, FOYDER_AUTO.DATA_START_ROW);
  const row = [
    message.getDate(), parsed.note, message.getSubject(), message.getFrom(),
    message.getTo(), mailLink, message.getId(), new Date()
  ];
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  sheet.getRange(targetRow, 1).setNumberFormat('dd.MM.yyyy HH:mm:ss');
  sheet.getRange(targetRow, 8).setNumberFormat('dd.MM.yyyy HH:mm:ss');
}

function getNextValue_(lines, labels) {
  const labelSet = new Set(labels.map(normalize_));

  for (let i = 0; i < lines.length; i++) {
    if (!labelSet.has(normalize_(lines[i]))) continue;

    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const value = cleanLine_(lines[j]);
      if (!value) continue;
      if (looksLikeFieldLabel_(value)) return '';
      return value;
    }
  }

  return '';
}

function looksLikeFieldLabel_(value) {
  const norm = normalize_(value);
  const known = [
    'uyelik turunu seciniz', 'uye olma amaciniz', 'kvkk aydinlatma metni',
    'acik riza metni', 'adiniz', 'tc kimlik no', 'baba adiniz', 'anne adiniz',
    'dogum yeriniz', 'dogum tarihiniz', 'kan grubunuz', 'email adresiniz',
    'telefon no', 'ikahmetgah adresiniz', 'egitim durumu', 'calistiginiz kurum adi',
    'mesleginiz', 'tecrubeniz', '1 referans', '2 referans', 'hakkinda kisa bilgi',
    'linkedin', 'profiliniz uye rehberinde yayinlansin mi', 'ek cv',
    'ek kimlik belgesi', 'ek diploma', 'ek adli sicil kaydi'
  ];
  return known.includes(norm) || norm.startsWith('ek ');
}

function parseTurkishDate_(value) {
  const match = String(value || '').match(/\b([0-3]?\d)[.\/-]([01]?\d)[.\/-]((?:19|20)\d{2})\b/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return isNaN(date.getTime()) ? null : date;
}

function extractEmail_(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function normalizePhone_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('90')) return '+' + digits;
  if (digits.length === 11 && digits.startsWith('0')) return '+90' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('5')) return '+90' + digits;
  return digits.length >= 10 ? '+' + digits : '';
}

function extractNumber_(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : '';
}

function cleanLine_(value) {
  return String(value || '')
    .replace(/^[-•*]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize_(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function yesNo_(value) {
  return value ? 'Var' : 'Yok';
}

function documentLabel_(key) {
  return ({
    fotograf: 'Fotoğraf', cv: 'CV', kimlik: 'Kimlik', diploma: 'Diploma',
    adliSicil: 'Adli Sicil', basvuruFormu: 'Başvuru Formu'
  })[key] || key;
}

function getKnownMessageIds_(applicationSheet, reviewSheet) {
  const ids = new Set();
  collectColumnValues_(applicationSheet, 30).forEach(value => ids.add(String(value)));
  collectColumnValues_(reviewSheet, 7).forEach(value => ids.add(String(value)));
  return ids;
}

function collectColumnValues_(sheet, column) {
  const lastRow = sheet.getLastRow();
  if (lastRow < FOYDER_AUTO.DATA_START_ROW) return [];
  return sheet
    .getRange(FOYDER_AUTO.DATA_START_ROW, column, lastRow - FOYDER_AUTO.DATA_START_ROW + 1, 1)
    .getDisplayValues()
    .flat()
    .filter(Boolean);
}

function getTargetSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('FOYDER_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Hedef tablo bulunamadı. Önce kurulum() fonksiyonunu çalıştırın.');
  return active;
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function getTriggerStatus_() {
  const count = ScriptApp.getProjectTriggers().filter(trigger =>
    trigger.getHandlerFunction() === 'otomasyonuCalistir'
  ).length;
  return count > 0 ? 'Aktif - her 5 dakikada bir' : 'Durduruldu';
}

function ensureWorkbookStructure_(ss) {
  ensureSheet_(ss, FOYDER_AUTO.APPLICATION_SHEET, APPLICATION_HEADERS);
  ensureSheet_(ss, FOYDER_AUTO.REVIEW_SHEET, REVIEW_HEADERS);
  ensureSheet_(ss, FOYDER_AUTO.SETTINGS_SHEET, ['Ayar', 'Değer']);
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const headerRange = sheet.getRange(FOYDER_AUTO.HEADER_ROW, 1, 1, headers.length);
  const current = headerRange.getDisplayValues()[0];

  if (current.every(value => !value)) {
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold').setBackground('#174A5B').setFontColor('#FFFFFF');
    sheet.setFrozenRows(FOYDER_AUTO.HEADER_ROW);
    sheet.getRange(FOYDER_AUTO.DATA_START_ROW, 1, 1000, headers.length).setWrap(false);
  }
}

function updateSettings_(updates) {
  let ss;
  try {
    ss = getTargetSpreadsheet_();
  } catch (error) {
    return;
  }

  const sheet = ss.getSheetByName(FOYDER_AUTO.SETTINGS_SHEET);
  if (!sheet) return;

  const mapping = {
    lastRun: 5,
    result: 6,
    newCount: 7,
    reviewCount: 8,
    triggerStatus: 9,
    error: 10
  };

  Object.keys(updates).forEach(key => {
    if (mapping[key]) sheet.getRange(mapping[key], 2).setValue(updates[key]);
  });
}

/* ================================================================
   SÜREÇ TAKİBİ (1.1.0) — yalnızca okur, "Panel Akışı" sayfasına yazar
================================================================ */

const FLOW_HEADERS = [
  'Kayıt No', 'Başvuru Tarihi', 'Ekip Durumu', 'Ad Soyad', 'E-posta',
  'Üyelik Türü', 'Üye Olma Amacı', 'Kurum', 'Meslek', '1. Referans', '2. Referans',
  'Online Evrak', 'Kontrol Notu', 'Başvuru Maili',
  'Onay Maili', 'Onay Adresi', 'Onay Yazışması',
  'Bizden Son Mail', 'Bizden Son Konu',
  'Aday Son Mail', 'Aday Son Konu', 'Aday Son Mesaj', 'Aday Ek Sayısı',
  'Hoş Geldiniz Maili', 'Süreç Aşaması', 'Güncelleme'
];

// Bu alan adlarında yerel kısım (@ öncesi) kişiyi tanımlamaz; eşleştirmede tek başına kullanılmaz.
const PUBLIC_DOMAINS = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.tr', 'outlook.com', 'outlook.com.tr',
  'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.tr', 'icloud.com', 'me.com', 'yandex.com',
  'yandex.com.tr', 'mynet.com', 'proton.me', 'protonmail.com', 'windowslive.com'
];
const GENERIC_LOCALS = [
  'info', 'iletisim', 'contact', 'admin', 'office', 'ofis', 'muhasebe', 'hukuk', 'destek',
  'support', 'mail', 'bilgi', 'hello', 'merhaba', 'sekreter', 'sekreterya', 'kurumsal'
];

/** Menüden elle çalıştırma: bekleme süresini beklemeden günceller. */
function surecTakibiniGuncelle() {
  const ss = getTargetSpreadsheet_();
  const sonuc = surecAkisiniYaz_(ss, true);
  SpreadsheetApp.getUi().alert(
    'Süreç takibi güncellendi.\n\n' +
    'Takip edilen başvuru: ' + sonuc.toplam + '\n' +
    'Onay maili bulunan: ' + sonuc.onay + '\n' +
    'Hoş geldiniz maili bulunan: ' + sonuc.hosgeldin + '\n\n' +
    'Sonuç "' + FOYDER_AUTO.FLOW_SHEET + '" sayfasına yazıldı. Hiçbir mail değiştirilmedi.'
  );
}

function surecAkisiniYaz_(ss, force) {
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('FOYDER_SUREC_SON') || 0);
  if (!force && Date.now() - last < FOYDER_AUTO.FLOW_INTERVAL_MIN * 60000) return null;

  const apps = readApplications_(ss.getSheetByName(FOYDER_AUTO.APPLICATION_SHEET));
  const threads = collectMembershipThreads_();
  const rows = apps.map(app => buildFlowRow_(app, threads));
  writeFlowSheet_(ss, rows);
  props.setProperty('FOYDER_SUREC_SON', String(Date.now()));

  return {
    toplam: rows.length,
    onay: rows.filter(r => r.onay).length,
    hosgeldin: rows.filter(r => r.hosgeldin).length
  };
}

/** "Başvurular" sayfasını başlık adlarıyla okur (sütun sırası değişse de çalışır). */
function readApplications_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < FOYDER_AUTO.DATA_START_ROW) return [];
  const width = sheet.getLastColumn();
  const headers = sheet.getRange(FOYDER_AUTO.HEADER_ROW, 1, 1, width).getDisplayValues()[0];
  const values = sheet.getRange(FOYDER_AUTO.DATA_START_ROW, 1, lastRow - FOYDER_AUTO.DATA_START_ROW + 1, width).getValues();
  const col = name => headers.indexOf(name);
  const get = (row, name) => { const i = col(name); return i === -1 ? '' : row[i]; };

  return values
    .filter(row => String(get(row, 'Ad Soyad')).trim())
    .map(row => {
      const mailDate = get(row, 'Mail Tarihi');
      return {
        kayitNo: String(get(row, 'Kayıt No')),
        tarih: mailDate instanceof Date ? mailDate : new Date(mailDate || 0),
        ekipDurumu: String(get(row, 'Durum')),
        ad: String(get(row, 'Ad Soyad')).trim(),
        email: String(get(row, 'E-posta')).trim().toLowerCase(),
        telefon: String(get(row, 'Telefon')),
        uyelikTuru: String(get(row, 'Üyelik Türü')),
        amac: String(get(row, 'Üye Olma Amacı')),
        kurum: String(get(row, 'Kurum')),
        meslek: String(get(row, 'Meslek')),
        ref1: String(get(row, '1. Referans')),
        ref2: String(get(row, '2. Referans')),
        evrak: String(get(row, 'Evrak Durumu')),
        not: String(get(row, 'Kontrol Notu')),
        link: String(get(row, 'Gmail Linki'))
      };
    });
}

/** Bizden giden bütün üyelik maillerini (kabul, hoş geldiniz, diğer) konuşma konuşma toplar. */
function collectMembershipThreads_() {
  const query = 'in:sent newer_than:' + FOYDER_AUTO.FLOW_LOOKBACK_DAYS + 'd ' +
    '{subject:üyelik subject:"hoş geldiniz"} -in:trash -in:spam';
  const out = [];
  for (let start = 0; start < 500; start += 100) {
    const page = GmailApp.search(query, start, 100);
    page.forEach(thread => out.push(describeThread_(thread)));
    if (page.length < 100) break;
  }
  return out;
}

function describeThread_(thread) {
  const self = FOYDER_AUTO.ACCOUNT.toLowerCase();
  const emails = new Set();
  const nameParts = [];
  const messages = thread.getMessages().map(m => {
    const from = extractEmail_(m.getFrom());
    const fromSelf = from === self;
    const subjectN = normalize_(m.getSubject());
    let kind = 'gelen';
    if (fromSelf) {
      if (subjectN.includes('yeni kayit') || subjectN.includes('basvuru talebiniz')) kind = 'otomatik';
      else if (subjectN.includes('toplulugumuza hos geldiniz')) kind = 'hosgeldin';
      else if (subjectN.includes('uyelik kabul') && !/^(re|ynt|yan|fw|fwd|ilt|ilet)\b/.test(subjectN)) kind = 'kabul';
      else kind = 'diger';
      allEmails_(m.getTo() + ',' + m.getCc()).forEach(e => { if (e !== self) emails.add(e); });
      if (kind !== 'otomatik') {
        const body = (m.getPlainBody() || '').slice(0, 500);
        nameParts.push(body);
        if (kind === 'kabul') {
          m.getAttachments({ includeInlineImages: false }).forEach(a => nameParts.push(a.getName()));
        }
      }
    } else if (from) {
      emails.add(from);
    }
    return { msg: m, id: m.getId(), date: m.getDate(), fromSelf, from, kind, subject: m.getSubject() };
  });
  return {
    link: thread.getPermalink(),
    emails: Array.from(emails),
    nameText: ' ' + normalize_(nameParts.join(' ')) + ' ',
    messages
  };
}

function threadMatches_(t, app) {
  const email = extractEmail_(app.email);
  const local = email.split('@')[0] || '';
  const domain = email.split('@')[1] || '';
  const tokens = normalize_(app.ad).split(' ').filter(x => x.length >= 2);
  const first = tokens[0] || '';
  const nameAll = tokens.length >= 2 && tokens.every(tok => t.nameText.includes(' ' + tok + ' '));

  return t.emails.some(e => {
    if (email && e === email) return true;
    const [l, d] = e.split('@');
    if (local.length >= 4 && GENERIC_LOCALS.indexOf(local) === -1 && l === local) return true;
    if (domain && PUBLIC_DOMAINS.indexOf(domain) === -1 && d === domain && first && t.nameText.includes(' ' + first + ' ')) return true;
    return false;
  }) || nameAll;
}

function buildFlowRow_(app, threads) {
  const since = new Date(app.tarih.getTime() - 2 * 864e5);
  const matched = threads.filter(t => t.messages.some(m => m.date >= since) && threadMatches_(t, app));
  const all = [];
  const seen = new Set();
  matched.forEach(t => t.messages.forEach(m => {
    if (m.date < since || seen.has(m.id)) return;
    seen.add(m.id);
    all.push(Object.assign({ link: t.link }, m));
  }));

  // Adayın bize ayrı bir konuşmada yazdıkları (ör. belgeleri yeni bir maille göndermesi)
  const addrs = new Set();
  const own = extractEmail_(app.email);
  if (own && /\.[a-z]{2,}$/.test(own) && !/\.xn$/.test(own)) addrs.add(own);
  all.filter(m => m.kind === 'kabul').forEach(m => allEmails_(m.msg.getTo()).forEach(e => addrs.add(e)));
  all.filter(m => !m.fromSelf && m.from).forEach(m => addrs.add(m.from));
  addrs.delete(FOYDER_AUTO.ACCOUNT.toLowerCase());
  if (addrs.size) {
    const q = 'from:(' + Array.from(addrs).join(' OR ') + ') newer_than:' + FOYDER_AUTO.FLOW_LOOKBACK_DAYS + 'd -in:trash -in:spam';
    GmailApp.search(q, 0, 20).forEach(thread => {
      const link = thread.getPermalink();
      thread.getMessages().forEach(m => {
        const from = extractEmail_(m.getFrom());
        if (!addrs.has(from) || m.getDate() < since || seen.has(m.getId())) return;
        seen.add(m.getId());
        all.push({ msg: m, id: m.getId(), date: m.getDate(), fromSelf: false, from, kind: 'gelen', subject: m.getSubject(), link });
      });
    });
  }

  all.sort((a, b) => a.date - b.date);
  const kabul = all.find(m => m.kind === 'kabul');
  const hosgeldin = all.find(m => m.kind === 'hosgeldin');
  const diger = all.filter(m => m.kind === 'diger');
  const bizdenSon = diger.length ? diger[diger.length - 1] : null;
  const gelen = all.filter(m => !m.fromSelf);
  const adaySon = gelen.length ? gelen[gelen.length - 1] : null;

  let asama = 'YK bekliyor';
  if (normalize_(app.ekipDurumu).includes('redd')) asama = 'Reddedildi';
  else if (hosgeldin) asama = 'Tamamlandı';
  else if (kabul) asama = adaySon && adaySon.date > kabul.date ? 'Belge bekleniyor (cevap verdi)' : 'Belge bekleniyor (dönüş yok)';

  return {
    onay: !!kabul,
    hosgeldin: !!hosgeldin,
    values: [
      app.kayitNo, fmtDate_(app.tarih), app.ekipDurumu, app.ad, app.email,
      app.uyelikTuru, app.amac, app.kurum, app.meslek, app.ref1, app.ref2,
      app.evrak, app.not, app.link,
      kabul ? fmtDate_(kabul.date) : '', kabul ? allEmails_(kabul.msg.getTo()).join(', ') : '', kabul ? kabul.link : '',
      bizdenSon ? fmtDate_(bizdenSon.date) : '', bizdenSon ? bizdenSon.subject : '',
      adaySon ? fmtDate_(adaySon.date) : '', adaySon ? adaySon.subject : '',
      adaySon ? replySnippet_(adaySon.msg.getPlainBody()) : '',
      adaySon ? adaySon.msg.getAttachments({ includeInlineImages: false }).length : '',
      hosgeldin ? fmtDate_(hosgeldin.date) : '', asama, fmtDate_(new Date())
    ]
  };
}

function writeFlowSheet_(ss, rows) {
  const sheet = ss.getSheetByName(FOYDER_AUTO.FLOW_SHEET) || ss.insertSheet(FOYDER_AUTO.FLOW_SHEET);
  sheet.clearContents();
  const data = [FLOW_HEADERS].concat(rows.map(r => r.values));
  sheet.getRange(1, 1, data.length, FLOW_HEADERS.length).setNumberFormat('@').setValues(data);
  sheet.getRange(1, 1, 1, FLOW_HEADERS.length)
    .setFontWeight('bold').setBackground('#174A5B').setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
}

/** Cevabın ilk birkaç cümlesi; alıntılanan eski yazışma ve IBAN/numara gibi bilgiler çıkarılır. */
function replySnippet_(body) {
  const lines = String(body || '').split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^>/.test(t) || /^(from|gönderen|kimden|sent|on .+wrote|-{2,}|_{4,})/i.test(t) || /tarihinde .*(yazdı|şunu)/i.test(t)) break;
    if (t) kept.push(t);
  }
  return kept.join(' ')
    .replace(/TR\s?\d{2}(?:\s?\d){10,30}/gi, '[IBAN gizlendi]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[numara gizlendi]')
    .slice(0, 220);
}

function allEmails_(value) {
  return (String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(e => e.toLowerCase());
}

function fmtDate_(date) {
  if (!(date instanceof Date) || isNaN(date.getTime()) || date.getTime() === 0) return '';
  return Utilities.formatDate(date, 'Europe/Istanbul', 'yyyy-MM-dd HH:mm');
}

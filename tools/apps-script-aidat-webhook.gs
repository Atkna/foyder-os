/**
 * FOYDER OS → Excel aidat yazıcı (webhook)
 * Sürüm: 2.0.0
 *
 * Ne yapar:
 * - Panelde bir aidatın durumu değişince panel yalnızca o kaydı buraya gönderir.
 * - Bu kod, kaydı panelin okuduğu sayfada (2026 için "ÜYE LİSTESİ") bulur ve
 *   yalnızca "Aidat Durumu" ile "Ödeme Tarihi" hücrelerini yazar.
 *
 * Güvenlik:
 * - Satır silmez, sayfa eklemez, başka hücreye dokunmaz.
 * - Formül içeren hücrenin üzerine yazmaz.
 * - "Ödenmedi" geldiğinde boş hücreye bir şey yazmaz; yalnızca yanlış duran
 *   "ÖDENDİ"/"KISMİ" değerini temizler (Excel'de boş = ödenmedi).
 * - Kişi önce defter numarasıyla, yoksa ad soyadla (Türkçe harf farkı gözetmeden) bulunur.
 *
 * Kurulum: Bu dosya "ÜYE AİDAT REFERANS LİSTELERİ" tablosuna bağlı projeye yapıştırılır,
 * Dağıt → Dağıtımları yönet → Düzenle → Yeni sürüm → Dağıt (adres değişmez).
 */

var AYAR = {
  // Yıl → sayfa kimliği (gid). Panelin "Yıl Sayfaları" ayarındaki bağlantıyla aynı sayfa.
  SAYFA_GID: { 2026: 128020835 },
  AD: ['Ad Soyad', 'İsim', 'ADI - SOYADI', 'Üye Adı Soyadı / Kurum', 'Ad'],
  DURUM: ['Aidat Durumu', 'Durum', 'ÖDEME BİLGİSİ'],
  TARIH: ['Ödeme Tarihi'],
  NO: ['Defter No', 'Defter Numarası', 'Üye No', 'Üye Numarası'],
  TARIH_BICIMI: 'dd.MM.yyyy'
};

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, hata: 'hatalı istek' }); }
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Salt okunur deneme: hangi sayfaya ve hangi sütunlara yazılacağını söyler.
  if (d.mod === 'test') {
    var y = Number(d.yil) || new Date().getFullYear();
    var t = sayfaBul_(ss, y);
    if (!t) return json_({ ok: false, hata: y + ' için sayfa bulunamadı' });
    return json_({ ok: true, sayfa: t.sh.getName(), baslikSatiri: t.basSatir + 1, satir: t.vals.length - t.basSatir - 1,
      kolonlar: { ad: t.ad >= 0, durum: t.dur >= 0, tarih: t.tar >= 0, no: t.no >= 0 } });
  }

  if (d.mod !== 'durum') return json_({ ok: false, hata: 'Bu webhook yalnızca aidat durumunu yazar.' });

  var kilit = LockService.getScriptLock();
  kilit.waitLock(20000);
  try {
    var onbellek = {}, n = 0, bulunamayan = [], atlanan = [];
    (d.odemeler || []).forEach(function (o) {
      var yil = Number(o.yil);
      if (!(yil in onbellek)) onbellek[yil] = sayfaBul_(ss, yil);
      var t = onbellek[yil];
      if (!t || t.dur < 0 || (t.ad < 0 && t.no < 0)) { bulunamayan.push(o.ad + ' (' + yil + ' sayfası yok)'); return; }
      var i = satirBul_(t, o);
      if (i < 0) { bulunamayan.push(o.ad); return; }
      var r = i + 1;
      var hDur = t.sh.getRange(r, t.dur + 1);
      if (hDur.getFormula()) { atlanan.push(o.ad + ' (formül)'); return; }
      var mevcut = sade_(t.vals[i][t.dur]);
      var yeni = sade_(o.durum);
      var degisti = false;

      if (yeni === 'ODENMEDI') {
        if (mevcut === 'ODENDI' || mevcut === 'KISMI') {
          hDur.clearContent(); bicimKopyala_(t, t.dur, '', hDur); t.vals[i][t.dur] = '';
          if (t.tar >= 0 && !t.sh.getRange(r, t.tar + 1).getFormula()) { t.sh.getRange(r, t.tar + 1).clearContent(); t.vals[i][t.tar] = ''; }
          degisti = true;
        }
      } else if (yeni && mevcut !== yeni) {
        var yazi = { ODENDI: 'ÖDENDİ', KISMI: 'KISMİ', MUAF: 'MUAF' }[yeni] || String(o.durum);
        hDur.setValue(yazi); bicimKopyala_(t, t.dur, yeni, hDur); t.vals[i][t.dur] = yazi;
        degisti = true;
      }

      if (yeni !== 'ODENMEDI' && t.tar >= 0 && o.tarih) {
        var hTar = t.sh.getRange(r, t.tar + 1);
        var tarih = tarihOku_(o.tarih);
        if (tarih && !hTar.getFormula() && (degisti || !String(t.vals[i][t.tar]).trim())) {
          hTar.setValue(tarih).setNumberFormat(AYAR.TARIH_BICIMI); t.vals[i][t.tar] = tarih; degisti = true;
        }
      }
      if (degisti) n++;
    });
    return json_({ ok: true, guncellenen: n, bulunamayan: bulunamayan, atlanan: atlanan });
  } finally {
    kilit.releaseLock();
  }
}

function sayfaBul_(ss, yil) {
  var sh = null, gid = AYAR.SAYFA_GID[yil];
  if (gid != null) ss.getSheets().forEach(function (s) { if (s.getSheetId() === gid) sh = s; });
  if (!sh) sh = ss.getSheetByName(String(yil));
  if (!sh) return null;
  var vals = sh.getDataRange().getValues();
  for (var b = 0; b < Math.min(6, vals.length); b++) {
    var bas = vals[b].map(function (x) { return String(x).trim(); });
    var ad = kolon_(bas, AYAR.AD), dur = kolon_(bas, AYAR.DURUM);
    if (dur >= 0 && ad >= 0) return { sh: sh, vals: vals, basSatir: b, ad: ad, dur: dur, tar: kolon_(bas, AYAR.TARIH), no: kolon_(bas, AYAR.NO) };
  }
  return null;
}

function satirBul_(t, o) {
  var no = String(o.defterNo || '').replace(/\D/g, '');
  if (no && t.no >= 0) {
    for (var i = t.basSatir + 1; i < t.vals.length; i++) if (String(t.vals[i][t.no]).replace(/\D/g, '') === no) return i;
  }
  var hedef = norm_(o.ad), bulunan = -1;
  for (var j = t.basSatir + 1; j < t.vals.length; j++) {
    if (norm_(t.vals[j][t.ad]) === hedef) { if (bulunan >= 0) return -1; bulunan = j; } // aynı adla iki satır: yazma
  }
  return bulunan;
}

// Yeni hücreye, aynı sütunda aynı değeri taşıyan başka bir hücrenin biçimini (renk, yazı) uygular.
function bicimKopyala_(t, kol, deger, hedef) {
  for (var i = t.basSatir + 1; i < t.vals.length; i++) {
    if (i + 1 === hedef.getRow()) continue;
    if (sade_(t.vals[i][kol]) === deger) { t.sh.getRange(i + 1, kol + 1).copyTo(hedef, { formatOnly: true }); return; }
  }
}

function kolon_(bas, adlar) {
  for (var i = 0; i < adlar.length; i++) {
    for (var k = 0; k < bas.length; k++) if (bas[k].toLowerCase() === adlar[i].toLowerCase()) return k;
  }
  return -1;
}

function tarihOku_(s) {
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function sade_(s) {
  return norm_(s).toUpperCase().replace(/\s+/g, '');
}

function norm_(s) {
  s = String(s || '').toLowerCase();
  var map = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
  s = s.replace(/[çğıöşüâîû]/g, function (c) { return map[c]; });
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// FOYDER OS paneli — ekrandan bağımsız yardımcıların birim testleri.
// Çalıştırma: node --test tests/panel.test.js
// Yardımcılar index.html içindeki <script id="foyder-core"> bloğundan okunur; test verileri uydurmadır.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = html.match(/<script id="foyder-core">\n([\s\S]*?)<\/script>/);
assert.ok(block, 'index.html içinde foyder-core bloğu bulunamadı');
const ctx = {};
vm.runInNewContext(block[1] + '\n;Object.assign(this,{trNorm,toISOdate,odenenTutari,isAidatTip,tipKey,normDurum,normUyeDurum,parseTutar,parseTarih,mergeValue,mergeById,mergeState,tutarYaziyla,uyeEslestir,adBenzer,gecmisEkle,gecmisBirlestir,alanFarki,GECMIS_SINIRI,basvuruAsama,basvuruGruplari,basvuruBul});', ctx);
const C = ctx;
const plain = v => JSON.parse(JSON.stringify(v));

test('aidat durumu farklı yazımlardan doğru okunur', () => {
  for (const v of ['ÖDENDİ', 'Ödendi', 'ödendi', 'ODENDI', 'odendi ', 'Ödenmiş', 'Tahsil edildi', 'Evet']) assert.equal(C.normDurum(v), 'ÖDENDİ', v);
  for (const v of ['ÖDENMEDİ', 'ödenmedi', 'ODENMEDI', 'Borçlu', 'Bekliyor']) assert.equal(C.normDurum(v), 'ÖDENMEDİ', v);
  assert.equal(C.normDurum('Kısmi'), 'KISMİ');
  assert.equal(C.normDurum('kismen ödendi'), 'KISMİ');
  assert.equal(C.normDurum('Muaf'), 'MUAF');
  assert.equal(C.normDurum('ücretsiz üye'), 'MUAF');
  assert.equal(C.normDurum('', 'KISMİ'), 'KISMİ', 'boş değer mevcut durumu korur');
  assert.equal(C.normDurum('EFT ile', 'ÖDENDİ'), 'ÖDENDİ', 'tanınmayan değer mevcut durumu korur');
});

test('üye durumu farklı yazımlardan doğru okunur', () => {
  assert.equal(C.normUyeDurum('Aktif'), 'AKTİF');
  assert.equal(C.normUyeDurum('aktif'), 'AKTİF');
  assert.equal(C.normUyeDurum('PASIF'), 'PASİF');
  assert.equal(C.normUyeDurum('pasif üye'), 'PASİF');
  assert.equal(C.normUyeDurum('', 'PASİF'), 'PASİF');
  assert.equal(C.normUyeDurum(undefined), 'AKTİF');
});

test('tutarlar Türkçe yazımla doğru okunur', () => {
  const cases = [['6.500', 6500], ['6.500,00 TL', 6500], ['6500', 6500], ['6500,5', 6500.5], ['1.250.000', 1250000], ['6,500.00', 6500], ['₺ 2.000', 2000], [7000, 7000], ['12.5', 12.5]];
  for (const [v, n] of cases) assert.equal(C.parseTutar(v), n, String(v));
  assert.equal(C.parseTutar(''), null);
  assert.equal(C.parseTutar('yok'), null);
  assert.equal(C.parseTutar(null), null);
});

test('tarihler Excel seri numarası ve gün.ay.yıl yazımından okunur', () => {
  assert.equal(C.parseTarih(46054), '2026-02-01');
  assert.equal(C.parseTarih('46054'), '2026-02-01');
  assert.equal(C.parseTarih('01.02.2026'), '2026-02-01');
  assert.equal(C.parseTarih('1/2/2026'), '2026-02-01');
  assert.equal(C.parseTarih('2026-2-1'), '2026-02-01');
  assert.equal(C.parseTarih(new Date(2026, 1, 1)), '2026-02-01');
  assert.equal(C.parseTarih(''), null);
  assert.equal(C.parseTarih('yarın'), null);
  assert.equal(C.parseTarih(12), null, 'küçük sayılar tarih sayılmaz');
});

test('ödeme tipi ve tahsilat tek hesapla', () => {
  assert.equal(C.tipKey({ tip: 'AİDAT' }), 'AIDAT');
  assert.equal(C.tipKey({ tip: 'AIDAT' }), 'AIDAT');
  assert.equal(C.tipKey({}), 'AIDAT');
  assert.equal(C.tipKey({ tip: 'GİRİŞ' }), 'GİRİŞ');
  assert.equal(C.tipKey({ tip: 'Giris' }), 'GİRİŞ');
  assert.equal(C.odenenTutari({ durum: 'ÖDENDİ', tutar: 5000, odenenTutar: 0 }), 5000);
  assert.equal(C.odenenTutari({ durum: 'KISMİ', tutar: 5000, odenenTutar: 2000 }), 2000);
  assert.equal(C.odenenTutari({ durum: 'ÖDENMEDİ', tutar: 5000 }), 0);
  assert.equal(C.odenenTutari({ durum: 'MUAF', tutar: 5000 }), 0);
});

const baseState = () => ({
  members: [{ id: 'M1', ad: 'Deneme Bir', durum: 'AKTİF', telefon: '', email: '' }, { id: 'M2', ad: 'Deneme İki', durum: 'AKTİF', telefon: '' }, { id: 'M3', ad: 'Deneme Üç', durum: 'AKTİF' }],
  payments: [{ id: 'P1', uyeId: 'M1', yil: 2026, durum: 'ÖDENMEDİ', tutar: 5000 }],
  basvurular: [], kararlar: [{ id: 'K1', no: 1, konu: 'Üyelik Kabulü' }],
  ayarlar: { dernekAdi: 'Deneme Derneği', iban: '', aidat: { 2026: 5000 }, ai: { provider: 'claude', apiKey: '' } },
  seq: { m: 3, p: 1, b: 0, k: 1 }, chat: []
});

test('eşzamanlı kayıt: iki kullanıcının farklı değişiklikleri birlikte korunur', () => {
  const b = baseState();
  const local = plain(b), remote = plain(b);
  local.members[0].telefon = '0500 000 00 01';              // A: M1 telefonu
  local.payments[0].durum = 'ÖDENDİ';                        // A: ödeme
  local.members.push({ id: 'M4-aaaa', ad: 'A ekledi' }); local.seq.m = 4;
  local.ayarlar.iban = 'TR00 TEST';
  remote.members[0].email = 'b@ornek.org';                   // B: aynı üyenin başka alanı
  remote.members[1].durum = 'PASİF';                         // B: başka üye
  remote.members.push({ id: 'M4-bbbb', ad: 'B ekledi' }); remote.seq.m = 4;
  remote.kararlar.push({ id: 'K2', no: 2, konu: 'Aidat Belirleme' });
  remote.ayarlar.dernekAdi = 'Deneme Derneği (yeni)';
  const m = plain(C.mergeState(b, local, remote));
  const M = Object.fromEntries(m.members.map(x => [x.id, x]));
  assert.equal(M.M1.telefon, '0500 000 00 01');
  assert.equal(M.M1.email, 'b@ornek.org', 'aynı kaydın farklı alanları birleşir');
  assert.equal(M.M2.durum, 'PASİF');
  assert.ok(M['M4-aaaa'] && M['M4-bbbb'], 'iki tarafta eklenen üyeler de kalır');
  assert.equal(m.payments[0].durum, 'ÖDENDİ');
  assert.equal(m.kararlar.length, 2);
  assert.equal(m.ayarlar.iban, 'TR00 TEST');
  assert.equal(m.ayarlar.dernekAdi, 'Deneme Derneği (yeni)');
  assert.equal(m.seq.m, 4);
});

test('eşzamanlı kayıt: silme ve çakışma kuralları', () => {
  const b = baseState();
  // A M3'ü siler, B dokunmaz → silinmiş kalır
  let local = plain(b), remote = plain(b);
  local.members = local.members.filter(x => x.id !== 'M3');
  assert.ok(!C.mergeState(b, local, remote).members.some(x => x.id === 'M3'));
  // B M3'ü siler, A dokunmaz → silinmiş kalır (A'nın eski kopyası geri getirmez)
  local = plain(b); remote = plain(b); remote.members = remote.members.filter(x => x.id !== 'M3');
  assert.ok(!C.mergeState(b, local, remote).members.some(x => x.id === 'M3'));
  // B M3'ü siler ama A M3'ü düzenlemiş → veri kaybolmaz
  local = plain(b); remote = plain(b); remote.members = remote.members.filter(x => x.id !== 'M3'); local.members[2].telefon = '0500';
  assert.equal(C.mergeState(b, local, remote).members.find(x => x.id === 'M3').telefon, '0500');
  // Aynı alanı ikisi de değiştirdiyse bu tarayıcıdaki kazanır
  local = plain(b); remote = plain(b); local.members[0].telefon = 'A'; remote.members[0].telefon = 'B';
  assert.equal(C.mergeState(b, local, remote).members[0].telefon, 'A');
  // Değişiklik yoksa sonuç bulutla aynı
  assert.deepEqual(plain(C.mergeState(b, plain(b), plain(b))), plain(b));
  // hafiza alanı ayrı birleştirildiği için yerel olan aynen geçer
  local = { ...plain(b), hafiza: { tasks: [1] } }; remote = { ...plain(b), hafiza: { tasks: [2] } };
  assert.deepEqual(plain(C.mergeState(b, local, remote).hafiza), { tasks: [1] });
});

test('panel güvenlik ayarları kaynakta yerinde', () => {
  assert.match(html, /supabase-js@2\.\d+\.\d+\/dist\/umd\/supabase\.js" integrity="sha384-[A-Za-z0-9+/=]{64}" crossorigin="anonymous"/, 'Supabase sürümü sabit ve bütünlük karmalı olmalı');
  assert.doesNotMatch(html, /supabase-js@2"/, 'sabitlenmemiş Supabase sürümü kalmamalı');
  assert.match(html, /function exportJson\(silent\)\{\n\s+dlBlob\(new Blob\(\[JSON\.stringify\(stripForCloud\(S\)/, 'JSON yedeği yapay zekâ anahtarı olmadan yazılmalı');
  assert.match(html, /if\(loaded==='error'\)\{ showLoadError\(\); return; \}/, 'okuma hatasında boş veri yazılmamalı');
});

test('tutar yazıyla (makbuz)', () => {
  const cases = [[0, 'sıfır Türk Lirası'], [1, 'bir Türk Lirası'], [15, 'on beş Türk Lirası'], [100, 'yüz Türk Lirası'], [1000, 'bin Türk Lirası'],
    [1500, 'bin beş yüz Türk Lirası'], [6500, 'altı bin beş yüz Türk Lirası'], [21000, 'yirmi bir bin Türk Lirası'], [101101, 'yüz bir bin yüz bir Türk Lirası'],
    [1250000, 'bir milyon iki yüz elli bin Türk Lirası'], [3000.5, 'üç bin Türk Lirası elli Kuruş'], ['7000', 'yedi bin Türk Lirası']];
  for (const [n, y] of cases) assert.equal(C.tutarYaziyla(n), y, String(n));
});

test('içe aktarmada eşleştirme: önce numara, sonra ad; belirsizlikte karar verilmez', () => {
  const uyeler = [{ id: 'A', ad: 'Deneme Kişi', defterNo: 10 }, { id: 'B', ad: 'Aynı Ad', defterNo: 11 }, { id: 'C', ad: 'Aynı Ad', defterNo: 12 }, { id: 'D', ad: 'Numarasız Üye', defterNo: null }];
  let r = C.uyeEslestir(uyeler, 'Aynı Ad', '12');
  assert.equal(r.tip, 'no'); assert.equal(r.uye.id, 'C');
  r = C.uyeEslestir(uyeler, 'Deneme  KİŞİ (yazım farkı)', '10.0');
  assert.equal(r.tip, 'no', 'numara eşleşir, ad benzerse kabul'); assert.equal(r.uye.id, 'A');
  r = C.uyeEslestir(uyeler, 'Bambaşka Biri', '10');
  assert.equal(r.tip, 'belirsiz', 'numara başka bir ada aitse sorulur'); assert.deepEqual(plain(r.adaylar.map(x => x.id)), ['A']);
  r = C.uyeEslestir(uyeler, 'Aynı Ad', '');
  assert.equal(r.tip, 'belirsiz', 'aynı adla iki kayıt → sorulur'); assert.deepEqual(plain(r.adaylar.map(x => x.id).sort()), ['B', 'C']);
  r = C.uyeEslestir(uyeler, 'numarasiz uye', '');
  assert.equal(r.tip, 'ad'); assert.equal(r.uye.id, 'D');
  r = C.uyeEslestir(uyeler, 'Numarasız Üye', '99');
  assert.equal(r.tip, 'ad', 'numara bulunamazsa ada göre (üyenin numarası yoksa)');
  r = C.uyeEslestir(uyeler, 'Deneme Kişi', '77');
  assert.equal(r.tip, 'belirsiz', 'ad eşleşir ama numara farklıysa sorulur');
  assert.equal(C.uyeEslestir(uyeler, 'Hiç Olmayan', '').tip, 'yok');
  assert.equal(C.uyeEslestir(uyeler, 'Hiç Olmayan', '500').tip, 'yok');
});

test('kayıt geçmişi: sınır, alan farkı ve eşzamanlı birleştirme', () => {
  const rec = {};
  for (let i = 0; i < 50; i++) C.gecmisEkle(rec, { at: '2026-01-01T00:00:' + String(i).padStart(2, '0') + 'Z', by: 'K', text: 'g' + i }, 20);
  assert.equal(rec.gecmis.length, 20); assert.equal(rec.gecmis[0].text, 'g30'); assert.equal(rec.gecmis.at(-1).text, 'g49');
  const fark = C.alanFarki({ telefon: '', durum: 'AKTİF', notlar: 'gizli eski not' }, { telefon: '0500', durum: 'PASİF', notlar: 'gizli yeni not' }, { telefon: 'Telefon', durum: 'Durum', notlar: 'Notlar' }, (k, v) => v || '—');
  assert.deepEqual(plain(fark), ['Telefon: — → 0500', 'Durum: AKTİF → PASİF', 'Notlar güncellendi'], 'not içeriği geçmişe yazılmaz');
  // İki kullanıcı aynı üyeye farklı geçmiş girişi ekledi → ikisi de kalır
  const g0 = [{ at: '2026-01-01T10:00:00Z', by: 'X', text: 'ilk' }];
  const b = { members: [{ id: 'M1', ad: 'Deneme', gecmis: g0 }], payments: [] };
  const l = plain(b), r = plain(b);
  l.members[0].telefon = '1'; l.members[0].gecmis.push({ at: '2026-01-02T10:00:00Z', by: 'A', text: 'A değiştirdi' });
  r.members[0].email = 'e'; r.members[0].gecmis.push({ at: '2026-01-02T09:00:00Z', by: 'B', text: 'B değiştirdi' });
  const m = plain(C.mergeState(b, l, r)).members[0];
  assert.deepEqual(plain(m.gecmis.map(x => x.text)), ['ilk', 'B değiştirdi', 'A değiştirdi']);
  assert.equal(m.telefon, '1'); assert.equal(m.email, 'e');
  // Yalnızca bir taraf geçmişi değiştirdiyse (ör. KVKK ile temizlendiyse) o hâli geçer
  const l2 = plain(b); l2.members[0].gecmis = [{ at: '2026-02-01T00:00:00Z', by: 'A', text: 'temizlendi' }];
  assert.deepEqual(plain(C.mergeState(b, l2, plain(b))).members[0].gecmis.map(x => x.text), ['temizlendi']);
});

test('KVKK ile anonimleştirilen kayıt eşzamanlı eski bilgilerle geri dolmaz', () => {
  const b = { members: [{ id: 'M1', ad: 'Deneme Kişi', telefon: '0500', email: 'a@ornek.org', gorev: 'Mühendis', gecmis: [{ at: '1', text: 'Telefon: — → 0500' }] }], payments: [] };
  const l = plain(b), r = plain(b);
  l.members[0] = { id: 'M1', ad: 'Anonim Üye #1', telefon: '', email: '', gorev: '', anonim: true, durum: 'PASİF', gecmis: [{ at: '2', text: 'silindi' }] };
  r.members[0].gorev = 'Yönetici'; r.members[0].gecmis.push({ at: '3', text: 'Meslek değişti' });
  for (const m of [C.mergeState(b, l, r).members[0], C.mergeState(b, r, l).members[0]]) {
    assert.equal(m.ad, 'Anonim Üye #1'); assert.equal(m.gorev, ''); assert.equal(m.anonim, true);
    assert.ok(!JSON.stringify(m).includes('0500') && !JSON.stringify(m).includes('Yönetici'));
  }
});

test('bu turdaki sadeleştirme ve sürüm sabitleme kaynakta yerinde', () => {
  assert.match(html, /@e965\/xlsx@0\.20\.3\/dist\/xlsx\.full\.min\.js" integrity="sha384-EnyY0\/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP\+39Ckmn92stwABZynq1JyzdT" crossorigin="anonymous"/, 'SheetJS 0.20.3 sabit ve bütünlük karmalı olmalı');
  assert.doesNotMatch(html, /xlsx@0\.18|xlsx\/0\.18/, 'eski SheetJS sürümü kalmamalı');
  assert.doesNotMatch(html, /HAS_STORE|window\.storage/, 'Vercel\'de çalışmayan depolama yolu kaldırılmalı');
  assert.doesNotMatch(html, /Kaydolun|authMode|signUp\(/, 'girişte kayıt bağlantısı olmamalı');
  assert.doesNotMatch(html, /rol:'admin'/, 'kullanılmayan ayarlar.rol alanı kaldırılmalı');
});

test('başvuru süreci: onay, cevap, belge ve hoş geldiniz adımları doğru okunur', () => {
  const T = '2026-10-31';
  const a = (b, tam) => C.basvuruAsama(b, T, tam);
  const tamam = a({ durum: 'ONAYLANDI', oto: { onay: '2026-08-07 10:36', hosgeldin: '2026-09-05 21:15' } });
  assert.equal(tamam.grup, 'ok'); assert.equal(tamam.pill[0], 'Üye oldu');
  assert.deepEqual(plain(tamam.steps.map(s => s.s)), ['done', 'done', 'done', 'done', 'done']);
  const cevapli = a({ durum: 'ONAYLANDI', oto: { onay: '2026-08-07 12:05', adaySon: '2026-08-10 13:56' } });
  assert.equal(cevapli.grup, 'wait'); assert.equal(cevapli.cevap, true); assert.equal(cevapli.steps[3].s, 'now');
  assert.equal(cevapli.gunOnay, 85);
  const sessiz = a({ durum: 'ONAYLANDI', oto: { onay: '2026-08-07 10:30', adaySon: '2026-07-01 09:00' } });
  assert.equal(sessiz.cevap, false, 'onaydan önceki mail cevap sayılmaz'); assert.equal(sessiz.pill[0], 'Dönüş yok');
  assert.equal(a({ durum: 'ONAYLANDI', belgeDurumu: 'yolda', oto: { onay: '2026-10-15 13:17' } }).steps[3].s, 'ship');
  const geldi = a({ durum: 'ONAYLANDI', oto: { onay: '2026-10-15 13:17' } }, true);
  assert.equal(geldi.grup, 'ok'); assert.equal(geldi.steps[4].s, 'now', 'belgeler gelince sıradaki adım hoş geldiniz');
  const bekleyen = a({ durum: 'YK BEKLİYOR', oto: { onlineEvrak: 'Eksik' } });
  assert.equal(bekleyen.grup, 'idle'); assert.equal(bekleyen.pill[0], 'Evrak eksik'); assert.equal(bekleyen.steps[1].s, 'now');
  assert.equal(a({ durum: 'ONAYLANDI' }).eski, true, 'otomasyondan önceki onaylı kayıt');
  assert.equal(a({ durum: 'REDDEDİLDİ', oto: { onay: '2026-08-07' } }).grup, 'red');
});

test('başvurular onay maili gününe göre gruplanır, bekleyenler en üstte', () => {
  const L = [
    { id: 1, durum: 'ONAYLANDI', oto: { onay: '2026-08-07 10:36' } },
    { id: 2, durum: 'ONAYLANDI', oto: { onay: '2026-08-07 12:05' } },
    { id: 3, durum: 'ONAYLANDI', oto: { onay: '2026-10-15 13:17' } },
    { id: 4, durum: 'YK BEKLİYOR' },
    { id: 5, durum: 'ONAYLANDI' }
  ];
  const g = C.basvuruGruplari(L, '2026-10-31');
  assert.deepEqual(plain(g.map(x => x.key)), ['~bekleyen', 'o2026-10-15', 'o2026-08-07', '~eski']);
  assert.deepEqual(plain(g[2].items.map(x => x.b.id)), [1, 2]);
});

test('Panel Akışı satırı mevcut başvuruya kayıt no, e-posta veya adla bağlanır', () => {
  const L = [
    { id: 'a', ad: 'MERT CEYLAN', email: 'x@y.com', oto: { kayitNo: 'FY-1' } },
    { id: 'b', ad: 'Şenay Türk', email: 'topcu.senay@gmail.com' }
  ];
  assert.equal(C.basvuruBul(L, { kayitNo: 'FY-1', ad: 'Başka' }).id, 'a');
  assert.equal(C.basvuruBul(L, { email: 'TOPCU.SENAY@gmail.com ', ad: '' }).id, 'b');
  assert.equal(C.basvuruBul(L, { ad: 'Mert Ceylan' }).id, 'a');
  assert.equal(C.basvuruBul(L, { ad: 'Yeni Kişi', email: 'yeni@z.com' }), null);
});

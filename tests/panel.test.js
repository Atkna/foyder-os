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
vm.runInNewContext(block[1] + '\n;Object.assign(this,{trNorm,toISOdate,odenenTutari,isAidatTip,tipKey,normDurum,normUyeDurum,parseTutar,parseTarih,mergeValue,mergeById,mergeState});', ctx);
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

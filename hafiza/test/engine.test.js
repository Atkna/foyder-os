const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../task-engine.js');

const sample = fs.readFileSync(path.join(__dirname, '..', 'sample-transcript.txt'), 'utf8');
const titles = items => items.map(item => item.title);
const extract = (text, date = '2026-10-06', options = { defaultOwner: 'Atakan' }) => Engine.extract(text, date, options);

test('örnek deşifre: yapılacaklar bölümünden sorumlu, tarih ve projeleriyle görevler çıkar', () => {
  const items = extract(sample, '2026-10-06'); // 6 Ekim 2026 salı
  assert.equal(items.length, 18);
  // Uydurma örnek: hazır başlık kuralları değil, genel kurallar kullanılır.
  assert.ok(items.every(item => item.key === ''));
  const find = text => {
    const found = items.filter(item => item.title.includes(text));
    assert.equal(found.length, 1, text);
    return found[0];
  };

  const call = find('Olağan genel kurul çağrı yazısı');
  assert.equal(call.title, 'Olağan genel kurul çağrı yazısı 20 Ekim\'e kadar tüm üyelere e-postayla gönderilecek');
  assert.equal(call.owner, 'Sekreter');
  assert.equal(call.dueDate, '2026-10-20');
  assert.equal(call.project, 'Şirket & Dernek');

  assert.equal(find('Üç yeni üyelik başvurusu').dueDate, '2026-10-09'); // cuma günü
  assert.equal(find('gelir-gider tablosu').dueDate, '2026-10-31'); // ay sonuna kadar
  assert.equal(find('gelir-gider tablosu').owner, 'Sayman');
  const collection = find('45.000 TL');
  assert.equal(collection.priority, 'high'); // "hemen"
  assert.equal(collection.dueDate, '');

  const speakers = find('Konuşmacı adaylarıyla');
  assert.equal(speakers.dueDate, '2026-10-13'); // haftaya salı
  assert.equal(speakers.owner, 'Başkan');
  assert.equal(speakers.project, 'Büyük Zirve');
  assert.equal(find('teknik keşif').dueDate, '2026-10-15');
  assert.equal(find('Sponsorluk dosyası').dueDate, '2026-10-09'); // 3 gün içinde
  assert.equal(find('Sponsorluk dosyası').owner, 'Sayman / Başkan');
  assert.equal(find('Davetiye listesi').title, 'Davetiye listesi yeni üyelerle birlikte güncellenmeli');

  const post = find('LinkedIn ve Instagram');
  assert.equal(post.dueDate, '2026-10-07'); // yarın
  assert.equal(post.dueTime, '10:00');
  assert.equal(post.owner, 'Koordinatör');
  assert.equal(post.project, 'Sosyal Medya');
  assert.equal(find('Kasım bülteninin').dueDate, '2026-11-15'); // kasım ortası

  const archive = find('Ofis arşivinin');
  assert.equal(archive.title, 'Ofis arşivinin dijital ortama aktarılması için yıl sonuna kadar bir plan hazırlanacak');
  assert.equal(archive.priority, 'low'); // "acelesi yok"
  assert.equal(archive.dueDate, '2026-12-31');
  assert.equal(archive.owner, 'Atakan'); // sorumlu belirtilmemiş: varsayılan sorumlu
  assert.equal(find('Bağış makbuzları').owner, 'Sayman'); // "Sayman tarafından"

  // Deşifre bölümündeki konuşmalar, tamamlanmış işler ve olumsuz kararlar görev olmaz.
  const all = titles(items).join(' | ');
  assert.doesNotMatch(all, /\[00:|Günaydın|faaliyet raporu|Kırtasiye/i);
  assert.equal(items.filter(item => item.dueDate).length, 9);
});

test('tarih yorumlama', () => {
  const d = (text, base = '2026-10-06') => Engine.dateFrom(text, base); // 6 Ekim 2026 salı
  assert.equal(d('Rapor bugün gönderilecek'), '2026-10-06');
  assert.equal(d('Yarın aranacak'), '2026-10-07');
  assert.equal(d('yarına kadar hazırla'), '2026-10-07');
  assert.equal(d('Haftaya görüşülecek'), '2026-10-13');
  assert.equal(d('gelecek hafta toplantı ayarla'), '2026-10-13');
  assert.equal(d('Bu hafta tamamlanacak'), '2026-10-09');
  assert.equal(d('Bu hafta tamamlanacak', '2026-10-09'), '2026-10-09');
  assert.equal(d('5 Ekim Pazartesi günü iletilecek', '2026-09-29'), '2026-10-05');
  assert.equal(d('15 Kasım civarında'), '2026-11-15');
  assert.equal(d('05.10.2026 tarihine eşitlenecek'), '2026-10-05');
  assert.equal(d('5/11/26 tarihinde'), '2026-11-05');
  assert.equal(d('Cuma günü teslim edilecek'), '2026-10-09');
  assert.equal(d('Salıya kadar gönder'), '2026-10-13');
  assert.equal(d('haftaya perşembe sunum yapılacak'), '2026-10-15');
  assert.equal(d('3 gün içinde dönüş yapılacak'), '2026-10-09');
  assert.equal(d('ay sonuna kadar ödenecek'), '2026-10-31');
  // Yıl verilmeyen ve belirgin biçimde geçmişte kalan tarih sonraki yıla taşınır.
  assert.equal(d('15 Ocak tarihinde yapılacak', '2026-11-20'), '2027-01-15');
  assert.equal(d('20 Eylül tarihli yazı', '2026-10-06'), '2026-09-20');
});

test('saat, tutar ve aralıklar tarih sanılmaz', () => {
  const d = text => Engine.dateFrom(text, '2026-10-06');
  assert.equal(d('Etkinlik saat 10.00 ile 13.00 arasında olacak'), '');
  assert.equal(d('Katılım bedeli 2.000 TL olarak belirlendi'), '');
  assert.equal(d('Zirveye 15-20 gün kala hatırlatma yapılacak'), '');
  assert.equal(d('3-4 kişi ile görüşülecek'), '');
  assert.equal(d('Bütçe 2.5 milyon TL'), '');
  assert.equal(d('31 Şubat tarihinde'), '');
  assert.equal(Engine.timeFrom('Duyuru saat 13:00\'te paylaşılacak'), '13:00');
  assert.equal(Engine.timeFrom('Bütçe 13.50 TL'), '');
});

test('öncelik tahmini', () => {
  assert.equal(Engine.priority('Sözleşmeler derhal gönderilecek'), 'high');
  assert.equal(Engine.priority('Bu iş acil'), 'high');
  assert.equal(Engine.priority('İvedilikle organize edilecek'), 'high');
  assert.equal(Engine.priority('Hemen aranacak'), 'high');
  assert.equal(Engine.priority('İmzaların aciliyeti bulunmamaktadır'), 'low');
  assert.equal(Engine.priority('Acelesi yok, haftaya bakılır'), 'low');
  assert.equal(Engine.priority('Karar şimdilik bekletilecek'), 'low');
  assert.equal(Engine.priority('Hemen hemen tamamlandı'), 'medium');
  assert.equal(Engine.priority('Rapor hazırlanacak'), 'medium');
});

test('tamamlanmış işler ve bilgi cümleleri görev olarak önerilmez', () => {
  const items = extract(`Toplantı notları
Sözleşme dün gönderildi.
Ödeme yapıldı, makbuz alındı.
Rapor tamamlandı.
Katılım bedeli 2.000 TL olarak belirlendi.
Etkinlik herkese açık olacak.
Toplam tutarın 16.000 TL'lik kısmı peşinat olarak ödendi, geriye 24.300 TL bakiye kaldı.
Sanal POS kesinlikle kullanılmayacak.`);
  assert.deepEqual(titles(items), []);
});

test('satır sonları kaybolmuş (yapışık) rapor', () => {
  const text = 'Görüşme; dernek evraklarının imzalanması ve kahvaltı organizasyonuna ilişkin planlamaları kapsamaktadır.   Ses Kaydı DeşifresiMehmet Bey: Yani gitmişken şey yapalım yani.   Atakan: Tamam. Ben o zaman belgeleri göndermiyorum.   Mehmet Bey: Gönderme hiçbir şey.   ' +
    'Atakan: Tamamdır.   Mehmet Bey: Hepsini aynı anda hallederim yani, sen merak etme, ben oradayken bütün evraklara tek tek bakıp imzalatırım.   Atakan: Anlaştık Mehmet Bey, ben de bu arada afiş taslağını Kerem ile birlikte gözden geçiririm.   ' +
    'Yapılacaklar Listesi (Aksiyon Raporu)1. Kurumsal & Resmi Evrak İşlemleriEvrakların Birleştirilmesi: Sermaye ile ilgili belgeler tek başına gönderilmeyecek; yeni üye kararı ve genel kurul kararı hazır edilerek Ahmet Bey\'e toplu olarak imzalatılacak.   ' +
    'Kahvaltı Sözleşmesi: Fatura adresi revize edilen kahvaltı sözleşmesi Mehmet Bey\'e gönderilecek.   2. Zirve Davet Mektuplarıİçerik Formatı (Kerem): Sponsorluk süreci henüz tamamlanmadığı için ilk mektuplar sponsorsuz olarak hazırlanacak.   ' +
    '3. Bütçe ve Ödeme PlanlamasıKalan Bakiye: Toplam tutarın 16.000 TL\'lik kısmı peşinat olarak ödendi, geriye 24.300 TL bakiye kaldı.   Tahsilat Yöntemi: Sanal POS tahsilatı 40 gün sürdüğü için kesinlikle kullanılmayacak; ödemeler dernek hesabına havale şeklinde toplanacak.';
  const items = extract(text, '2026-09-30');
  assert.deepEqual(titles(items), [
    'Yeni üye kararı ve genel kurul kararı hazır edilerek Ahmet Bey\'e toplu olarak imzalatılacak',
    'Fatura adresi revize edilen kahvaltı sözleşmesi Mehmet Bey\'e gönderilecek',
    'Sponsorluk süreci henüz tamamlanmadığı için ilk mektuplar sponsorsuz olarak hazırlanacak',
    'Ödemeler dernek hesabına havale şeklinde toplanacak'
  ]);
  assert.equal(items[0].project, 'Şirket & Dernek');
  assert.equal(items[1].project, 'Tekstil Buluşması');
  assert.equal(items[2].project, 'Büyük Zirve');
  assert.equal(items[2].owner, 'Kerem');
  assert.equal(items[1].owner, 'Atakan');
});

test('girintili madde listesi: başlıklar ve kaynak etiketleri görev olmaz', () => {
  const text = `1. Ses Kaydı Özeti

Kayıt, ofis ortamında geçen bir iş koordinasyonu görüşmesidir.
M4A

    Web Sitesi: Mehmet Bey, sitede yer alan unvanın değiştirilmesini ister. İmzalar toplanacaktır.
    M4A+ 2

3. Detaylı Yapılacaklar Listesi (To-Do List)
A. Resmi, Hukuki ve Karar Defteri Süreçleri

    Genel Kurul Belgelerinin Düzenlenmesi (Mehmet Bey / Atakan):

        Karar ve genel kurul tarihlerinin 05.10.2026 olarak Word ve evrak formatında eşitlenmesi.
        M4A

        Hazirun cetvelinin tek temsilci kalacak şekilde nihai hale getirilmesi.
        M4A

    Yönetim Kurulu Beyanı İmzalarının Toplanması (Atakan):

        Özgür Bey'in imzasının alınması.
        M4A

        Ahmet Bey'in imzasının alınması.
        M4A

C. Web Sitesi, Tasarım ve Dijital Entegrasyon

    Profil ve Logo Revizyonları (Keremler / Atakan):

        Web sitesindeki "bankacı" ibaresinin "danışman" olarak değiştirilmesi.
        M4A

D. İletişim, Etkinlik ve Reklam

    Kahvaltı Duyurusu ve Reklam Kampanyası (Atakan):

        Kahvaltı görseli/duyurusunun saat 13:00'te paylaşılması.
        M4A

    İngiltere Görüşmesi (Mehmet Bey):

        Çarşamba günü İngiltere saatiyle 14:00 için görüşme teyidinin verilmesi.
        M4A`;
  const items = extract(text, '2026-10-06');
  assert.deepEqual(titles(items), [
    'Karar ve genel kurul tarihlerinin 05.10.2026 olarak Word ve evrak formatında eşitlenmesi',
    'Hazirun cetvelinin tek temsilci kalacak şekilde nihai hale getirilmesi',
    'Yönetim Kurulu Beyanı İmzalarının Toplanması: Özgür Bey\'in imzasının alınması',
    'Yönetim Kurulu Beyanı İmzalarının Toplanması: Ahmet Bey\'in imzasının alınması',
    'Web sitesindeki "bankacı" ibaresinin "danışman" olarak değiştirilmesi',
    'Kahvaltı görseli/duyurusunun saat 13:00\'te paylaşılması',
    'Çarşamba günü İngiltere saatiyle 14:00 için görüşme teyidinin verilmesi'
  ]);
  assert.equal(items[0].dueDate, '2026-10-05');
  assert.equal(items[0].owner, 'Mehmet Bey / Atakan');
  assert.equal(items[0].project, 'Şirket & Dernek');
  assert.equal(items[4].owner, 'Keremler / Atakan');
  assert.equal(items[5].dueTime, '13:00');
  assert.equal(items[6].owner, 'Mehmet Bey');
  assert.equal(items[6].dueDate, '2026-10-07');
  assert.ok(items.every(item => !/M4A/.test(item.title) && !/M4A/.test(item.notes)));
});

test('serbest notlar: emir kipi ve birinci tekil kişi', () => {
  const items = extract(`Haftalık notlar
- Kerem'i ara ve afiş taslağını iste
- Sözleşmeyi yarın Ayşe Hanım'a gönder
- Bütçe tablosu geçen hafta güncellendi
- Mekanla acil görüşülmesi gerekiyor
- Tedarikçi listesi hazırlanmalı
- Otel rezervasyonunu ben hallederim
- Sunum taslağını cuma günü paylaşalım`);
  assert.deepEqual(titles(items), [
    'Kerem\'i ara ve afiş taslağını iste',
    'Sözleşmeyi yarın Ayşe Hanım\'a gönder',
    'Mekanla acil görüşülmesi gerekiyor',
    'Tedarikçi listesi hazırlanmalı',
    'Otel rezervasyonunu ben hallederim',
    'Sunum taslağını cuma günü paylaşalım'
  ]);
  assert.equal(items[1].dueDate, '2026-10-07');
  assert.equal(items[2].priority, 'high');
  assert.equal(items[5].dueDate, '2026-10-09');
});

test('konuşma dökümü: sorular atlanır, sözler görev olur', () => {
  const items = extract(`Mehmet Bey: Broşür ne oldu, hazır mı?
Atakan: Henüz değil, yarın Kerem ile görüşeceğim.
Mehmet Bey: Tamam. Mustafa Bey'i bugün mutlaka ara.
Atakan: Tamamdır, ararım.
Mehmet Bey: Ben de Genel Sekreter ile indirim konusunu konuşacağım.`);
  const all = titles(items).join(' | ');
  assert.match(all, /Kerem ile görüşeceğim/);
  assert.match(all, /Mustafa Bey'i bugün mutlaka ara/);
  assert.match(all, /indirim konusunu konuşacağım/);
  assert.doesNotMatch(all, /hazır mı/);
  const promise = items.find(item => /konuşacağım/.test(item.title));
  assert.equal(promise.owner, 'Mehmet Bey');
  const call = items.find(item => /mutlaka ara/.test(item.title));
  assert.equal(call.priority, 'high');
  assert.equal(call.dueDate, '2026-10-06');
});

test('marka adları ve kısaltmalar yapışık metinde bölünmez', () => {
  const filler = 'Bu bölüm yalnızca metni uzatmak için eklenmiş açıklama cümlelerinden oluşur ve herhangi bir iş içermez. '.repeat(6);
  const prepared = Engine.prepare(`${filler}LinkedIn ve PowerPoint sunumu ile A.Ş. Genel Kurulu evrakları WhatsApp üzerinden PayTR ekibine iletilecek.`);
  for (const word of ['LinkedIn', 'PowerPoint', 'A.Ş. Genel', 'WhatsApp', 'PayTR']) assert.ok(prepared.includes(word), word);
});

test('aynı metindeki çok benzer adaylar azaltılır ve en fazla 60 aday önerilir', () => {
  const repeated = extract(`- Sponsorluk sözleşmesi taslağı Ahmet Bey'e gönderilecek.
- Sponsorluk sözleşmesi taslağı Ahmet Bey'e gönderilecektir.
- Otel rezervasyonu için fiyat teklifi istenecek.`);
  assert.equal(repeated.length, 2);
  const cities = ['Adana', 'Bursa', 'Çorum', 'Denizli', 'Edirne', 'Giresun', 'Hatay', 'Isparta', 'İzmir', 'Kayseri'];
  const topics = ['bayi toplantısı', 'depo sayımı', 'müşteri ziyareti', 'tahsilat raporu', 'personel eğitimi', 'fuar hazırlığı', 'araç bakımı', 'kira sözleşmesi'];
  const many = cities.flatMap(city => topics.map(topic => `- ${city} şubesi için ${topic} planlanacak.`)).join('\n');
  assert.equal(extract(many).length, 60);
});

test('eşleştirme: aynı iş bulunur, farklı işler birleştirilmez', () => {
  const tasks = [
    { id: 'a', title: 'Özgür Bey\'in imzasının alınması', project: 'Şirket & Dernek', notes: '' },
    { id: 'b', title: 'TMA Ödemesi Takibi', project: 'Uluslararası Yazışmalar', notes: '' },
    { id: 'c', title: 'Afiş için Kerem ile konuş', project: 'Tekstil Buluşması', notes: 'Tesis otoparkının 250 TL olduğu bilgisinin posterin altına eklenip eklenmeyeceği Kerem ile görüşülecek.' },
    { id: 'd', title: 'Ön onaylı sponsorlara sözleşmeleri gönder ve tahsilat durumunu takip et', project: 'Büyük Zirve', key: 'summit-sponsor-contracts', notes: '' }
  ];
  const match = candidate => Engine.findMatch({ project: '', notes: '', source: '', ...candidate }, tasks)?.id || null;
  // Farklı kişi → ayrı iş
  assert.equal(match({ title: 'Ahmet Bey\'in imzasının alınması', project: 'Şirket & Dernek' }), null);
  assert.equal(match({ title: 'Özgür Bey\'in imzasının alınması', project: 'Şirket & Dernek' }), 'a');
  // Eski sürümden kalan kısa başlık
  assert.equal(match({ title: 'TMA ödemesiyle ilgili yanıtı takip et', key: 'tma-payment-followup' }), 'b');
  // Başlık değişmiş olsa da aynı cümle notlarda duruyor
  assert.equal(match({ title: 'Otopark notu Kerem ile görüşülecek', source: 'Tesis otoparkının 250 TL olduğu bilgisinin posterin altına eklenip eklenmeyeceği Kerem ile görüşülecek.' }), 'c');
  // Yalnızca birkaç ortak kelime → eşleşme yok
  assert.equal(match({ title: 'Sponsor logolarını web sitesine ekle', project: 'Büyük Zirve' }), null);
  assert.equal(match({ title: 'LinkedIn reklam raporunu hazırla', project: 'Sosyal Medya' }), null);
  assert.equal(match({ title: 'Kerem ile yeni broşür baskısını konuş', project: 'Tekstil Buluşması' }), null);
});

test('örnek deşifre yeniden girildiğinde bütün adaylar kendi görevleriyle eşleşir', () => {
  const first = extract(sample, '2026-10-06');
  assert.equal(first.length, 18);
  const tasks = first.map((item, index) => ({ id: `t${index}`, ...item }));
  // Başka bir tarihte ve sonuna ek not eklenmiş hâliyle: eski adaylar eşleşir, yalnızca ek not yeni iştir.
  const second = extract(`${sample} Ek not: Sunum dosyası Mehmet Bey'e 20 Ekim tarihinde gönderilecek.`, '2026-10-08');
  assert.equal(second.length, 19);
  second.slice(0, 18).forEach((candidate, index) => assert.equal(Engine.findMatch(candidate, tasks)?.id, `t${index}`, candidate.title));
  assert.equal(Engine.findMatch(second[18], tasks), null);
  assert.equal(second[18].dueDate, '2026-10-20');
});

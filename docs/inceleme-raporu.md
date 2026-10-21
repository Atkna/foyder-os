# FOYDER OS — İnceleme Raporu

**Tarih:** 21 Ekim 2026  
**Kapsam:** `index.html` (panelin tamamı) ve `hafiza/` (masaüstü uygulaması)  
**Güncelleme (ikinci tur):** Önemli geliştirmelerin tamamı (Ö10–Ö17) ve "İleride yapılabilir" listesinden seçilen 4, 9, 11 ve 12. maddeler yönetim kararlarına göre uygulandı.  
**Yöntem:** Kod satır satır okundu. Panel tarayıcıda uydurma verilerle açıldı (300 üye, üç yıllık aidat, başvurular, kararlar), her sayfa ve ana düğmeler tek tek denendi. Bulunan her hata önce testle tekrarlandı, sonra düzeltildi.

**İşaretler**

- **Risk:** Yüksek (veri kaybı ya da yanlış para hesabı), Orta (yanlış davranış ya da güvenlik zayıflığı), Düşük (görünüm ya da kolaylık).
- **Emek:** Küçük (bir saatten az), Orta (yarım gün), Büyük (birkaç gün ve üzeri).
- **Durum:** ✅ uygulandı · ⚠️ sizin yapmanız gereken adım · ⏳ önerildi, uygulanmadı.

---

## Özet

| Grup | Madde | Uygulanan |
|---|---|---|
| Hemen düzeltilmeli | 19 | 18 ✅ + 1 ⚠️ (Supabase güvenlik kuralları sizin tarafınızda) |
| Önemli geliştirme | 17 | 17 ✅ |
| İleride yapılabilir | 12 | 4 ✅ (4'ün makbuz kısmı, 9, 11, 12) · diğerleri sunucu kurulumu gerektirdiği için bekliyor |

En kritik iki bulgu:

1. **Açılışta veri silme riski (H1).** Panel açılırken buluta kısa süreliğine ulaşılamazsa, panel boş başlangıç verisini buluta yazıyordu. Bu, bütün üye ve aidat kayıtlarının silinmesi demekti.
2. **Aynı anda çalışan iki kişi birbirinin kaydını siliyordu (H2).** Her kayıt bütün veriyi baştan yazdığı için, son kaydeden diğerinin değişikliklerini siliyordu.

---

## 1. Hemen düzeltilmeli

### H1. Açılışta okuma hatası, boş veriyi buluta yazıyordu ✅
- **Ne:** Veri okunamadığında (internet kesintisi, Supabase'te anlık sorun) panel "veri yok" sanıp boş başlangıç verisini oluşturuyor ve buluta kaydediyordu.
- **Neden önemli:** Bir kullanıcının bağlantısındaki birkaç saniyelik sorun, herkes için bütün üye ve aidat kayıtlarını silebilirdi.
- **Risk:** Yüksek · **Emek:** Küçük
- **Yapılan:** "Kayıt yok" ile "okunamadı" ayrıldı. Okuma hatasında hiçbir şey yazılmıyor; "Veriler yüklenemedi — hiçbir kaydınız değiştirilmedi" ekranı ve "Yeniden dene" düğmesi çıkıyor. Ek olarak, tüm üye listesini boşaltacak bir kayıt, bilerek yapılan "Sıfırla" ve "Geri yükle" dışında engelleniyor.

### H2. Aynı anda kaydetme: son kaydeden diğerlerinin değişikliğini siliyordu ✅
- **Ne:** Her kayıt bütün veriyi buluta baştan yazıyordu. Örneğin A bir ödeme işlerken B bir üyenin telefonunu güncellerse, sonra kaydedenin elindeki eski kopya ötekinin değişikliğini siliyordu. "Başka kullanıcı güncelledi" uyarısı ancak iş işten geçtikten sonra çıkıyordu.
- **Neden önemli:** Birden çok kişinin kullandığı bir panelde bu, sessiz veri kaybı demek.
- **Risk:** Yüksek · **Emek:** Orta
- **Yapılan:**
  - Kaydederken bulut yeniden okunuyor. Değişiklikler kayıt kayıt, aynı kayıtta da alan alan birleştiriliyor; yalnızca bu tarayıcıda değişen alanlar yazılıyor.
  - **İyimser kilit:** Okuma ile yazma arasında başka biri kaydederse yazma reddediliyor; veri yeniden okunup yeniden birleştiriliyor.
  - **Canlı eşitleme:** Başka bir kullanıcının değişikliği sayfa yenilemeden ekrana geliyor ("Başka bir kullanıcının değişiklikleri alındı").
  - **Formlar:** Üye, ödeme, başvuru ve karar pencereleri yalnızca kullanıcının değiştirdiği alanları yazıyor. Pencere açıkken başkasının güncellediği alan eski değerle ezilmiyor.
  - **Kayıt kimlikleri:** Yeni kayıtların kimliğine kısa bir rastgele ek geldi (ör. `M302-k3f9`). İki kişi aynı anda üye eklese de kimlikler çakışmıyor.

### H3. Supabase güvenlik kuralları (RLS) doğrulanamadı ⚠️
- **Ne:** Rol ve onay denetimi tarayıcıda yapılıyor. Kodda bulunan anonim anahtar normaldir ve herkese açıktır. Bu anahtarla neye erişilebileceğini ise yalnızca Supabase'teki **satır düzeyi güvenlik (RLS)** kuralları belirler. Giriş ekranındaki "Kaydolun" bağlantısı açık (koddaki "kayıt kapalı" notuyla çelişiyor). Kurallar yalnızca "giriş yapmış olsun" diye yazılmışsa, internetten hesap açan herhangi biri onay beklemeden üye listesini (ad, telefon, e-posta) okuyabilir ve verileri silebilir.
- **Neden önemli:** Kişisel verilerin korunması (KVKK) ve veri bütünlüğü.
- **Risk:** Yüksek (kurallar eksikse) · **Emek:** Küçük
- **Durum:** Canlı veritabanınıza erişim yetkim olmadığı için doğrulayamadım. Panel tarafında yapılabilen her şeyi yaptım (bkz. H4).
- **Sizin yapmanız gereken:** Supabase → SQL Editor'de şu sorguyla mevcut kuralları görün:
  `select tablename, policyname, cmd, qual from pg_policies where tablename in ('app_state','profiles');`
  Önerilen kurallar aşağıda. Uygulamadan önce bir yedek alın ve bir deneme hesabıyla test edin.

```sql
-- Oturumdaki kişinin onaylı rolünü döndürür (profiles kuralında kendine başvuru döngüsünü önler)
create or replace function public.benim_rolum() returns text
language sql security definer stable set search_path = public as $$
  select case when onayli then rol end from profiles where id = auth.uid()
$$;

alter table app_state enable row level security;
create policy "onayli kullanici okur" on app_state for select using (public.benim_rolum() is not null);
create policy "yazabilen roller gunceller" on app_state for update
  using (public.benim_rolum() in ('admin','operasyon','muhasebe'))
  with check (public.benim_rolum() in ('admin','operasyon','muhasebe'));
create policy "yonetici ilk satiri olusturur" on app_state for insert with check (public.benim_rolum() = 'admin');
-- app_state için delete kuralı yazılmaz: satır hiçbir kullanıcı tarafından silinemez.

alter table profiles enable row level security;
create policy "kendini ya da yonetici herkesi gorur" on profiles for select
  using (id = auth.uid() or public.benim_rolum() = 'admin');
create policy "yalniz yonetici onay ve rol degistirir" on profiles for update
  using (public.benim_rolum() = 'admin') with check (public.benim_rolum() = 'admin');
```

Yeni kayıt istemiyorsanız ayrıca Supabase → Authentication → Sign In / Providers bölümünden kaydı (Allow new users to sign up) kapatın.

### H4. Rol yetkileri yalnızca arayüzde uygulanıyordu ✅
- **Ne:** Düğmeler role göre gizleniyordu ama işlevlerin kendisi yetki denetlemiyordu. Tarayıcıda doğruladım: "Okuyucu" rolündeki biri, yapay zekâ komut çubuğuna "X 2026 aidatını ödedi" yazıp onaylayınca ödeme gerçekten işleniyordu. Okuyucunun asistan sohbeti de bütün veriyi buluta yeniden yazıyordu. Ayrıca açılışta "Google Sheets otomatik çek" ayarı, giren her kullanıcının tarayıcısında üye ve aidat verisini değiştiriyordu.
- **Risk:** Orta · **Emek:** Küçük
- **Yapılan:**
  - Veriyi değiştiren her işlev rol denetliyor (ödeme, üye, başvuru, karar, içe aktarma, sıfırlama, ayarlar).
  - Yapay zekâ komutları rol dışı işlemleri "Yetkiniz olmadığı için uygulanmadı" diyerek atlıyor.
  - Okuyucu rolü buluta hiç yazmıyor.
  - Google Sheets çekme (açılıştaki otomatik çekme dahil) yalnızca yöneticide çalışıyor.
  - Ayarlar → Roller tablosunda "Görev" yetkisi de görünüyor.
  - Not: Asıl güvence Supabase kurallarıdır (H3).

### H5. Aidat sayfası bazı aidat kayıtlarını hiç göstermiyordu ✅
- **Ne:** Excel'den içe aktarılan aidatlar "AİDAT" (noktalı İ), Sheets'ten gelenler "AIDAT" olarak kaydediliyordu. Aidat sayfası yalnızca birini arıyordu; tarayıcıda 300 kayıttan 8'i görünmüyordu. Excel içe aktarma da aynı nedenle Sheets'ten gelmiş kayıtları tanımayıp aynı yıla ikinci aidat açabiliyordu. Bu da toplamları iki kez sayıyordu.
- **Risk:** Yüksek (yanlış tahsilat görünümü) · **Emek:** Küçük
- **Yapılan:** Bütün ekranlar iki yazımı da aynı kabul ediyor. Mevcut veri değiştirilmedi; yalnızca okuma biçimi düzeldi.

### H6. Excel ve Sheets değerleri yanlış okunuyordu ✅
- **Ne:**
  - Küçük harfle yazılmış "Ödendi" ve "ödendi" Excel'den **ödenmedi** olarak geliyordu.
  - Sheets'teki "6.500,00 TL" **650.000 ₺** okunuyordu; "6.500" Excel'de varsayılan tutara düşüyordu.
  - Excel'in sayı biçimindeki tarihleri (ör. 46054) anlamsız kaydediliyordu; bu ödemeler aylık tahsilat grafiğinde görünmüyordu.
  - Excel'deki "Aktif" ve "aktif" üyeler aktif sayılmıyordu.
  - Sheets'ten yeni gelen bir ödemenin "ödenen tutarı" 0 kalıyordu.
- **Risk:** Yüksek · **Emek:** Küçük
- **Yapılan:** Durum, üye durumu, Türkçe tutar ("6.500,00 TL", "1.250.000", "6500,5") ve tarih (Excel seri numarası, gün.ay.yıl) için ortak okuyucular yazıldı; içe aktarmada ve Sheets'te kullanılıyor.

### H7. Sheets'ten başvuru aktarma hiç çalışmıyordu ✅
- **Ne:** Ayarlar'da verilen hazır Gmail kodu sayfaya küçük harfli başlıklar yazıyor (`ad`, `email`, `telefon`…). Panel ise "Ad Soyad" arıyordu; tek bir başvuru bile aktarılamıyordu.
- **Risk:** Orta · **Emek:** Küçük · **Yapılan:** İki başlık biçimi de tanınıyor.

### H8. "Sheets'e Gönder" ve otomatik durum yazma hiç çalışmıyordu, panel yine de "gönderildi" diyordu ✅ ⚠️
- **Ne:** Panel veriyi `uyeler/odemeler` adlarıyla gönderiyordu, Ayarlar'daki hazır Apps Script kodu ise `members/payments` bekliyordu; otomatik "ödendi" güncellemesini de hiç tanımıyordu. Kod her seferinde hata veriyor, panel bunu görmeden "✓ gönderildi" diyordu.
- **Risk:** Orta · **Emek:** Küçük
- **Yapılan:** Hazır kod (Ayarlar → Entegrasyonlar → 2) iki gönderim biçimini de tanıyacak şekilde yeniden yazıldı. Panel artık gerçek yanıtı kontrol ediyor ve hata olursa söylüyor.
- **Sizin yapmanız gereken:** Bu özelliği kullanıyorsanız yeni kodu kopyalayıp Apps Script'te yeniden dağıtın.

### H9. Yapay zekâ istekleri bazı ayarlarda yanlış yere gidiyordu ✅
- **Ne:**
  - İki ayrı istek işlevi vardı. "Anthropic API (kendi anahtarım)" seçiliyken Analiz'deki "AI Yorumu" ile Toplantılar'daki "AI ile kontrol et" ve özet **OpenAI'ye** gidiyordu.
  - "Özel sunucu" adresi bir yerde tam adres, başka yerde kök adres sayılıyordu.
  - E-postadan başvuru ayrıştırma, komut şemasıyla karışık bir istek gönderiyordu.
- **Risk:** Orta · **Emek:** Küçük
- **Yapılan:** Tek istek işlevi yazıldı; bütün özellikler aynı sağlayıcı ayarını kullanıyor. Özel sunucuya tam ya da kök adres girilebiliyor. E-posta ayrıştırma düz istek gönderiyor.

### H10. Yerel komut ayrıştırıcı ödemeleri yanlış işliyordu ✅
- **Ne:** Yapay zekâ bağlantısı yokken (Vercel'de varsayılan "Claude (anahtarsız)" seçeneği çalışmadığı için pratikte her zaman) yerel ayrıştırıcı devreye giriyor:
  - "Ahmet Bey 2026 aidatını ödedi" komutunda yıl tutar sanılıyor, ödeme **2.026 ₺** olarak kaydediliyordu.
  - "Toplam tahsilat ne durumda?" gibi sorular (Asistan sayfasındaki hazır öneri dahil) ödeme komutu sanılıp onay penceresi açılıyordu.
- **Risk:** Yüksek (yanlış tutar) · **Emek:** Küçük
- **Yapılan:** Yıllar tutar sayılmıyor ("TL/₺" ile yazılan sayı öncelikli). Soru cümleleri soru olarak yanıtlanıyor.

### H11. JSON yedeği yapay zekâ anahtarını düz metin içeriyordu ✅
- **Ne:** "JSON Yedek → İndir" dosyası API anahtarını da içeriyordu; dosya paylaşılırsa anahtar sızıyordu.
- **Risk:** Orta · **Emek:** Küçük
- **Yapılan:** Yedeğe anahtar yazılmıyor. Geri yükleme bu tarayıcıdaki anahtarı da korur.
- **Not:** Eski bir sürüm anahtarı buluta yazmışsa, yazma yetkisi olan birinin ilk kaydında buluttaki kopya otomatik temizlenir.

### H12. "Geri yükle" onay sormuyordu, "Sıfırla" yedek almıyordu ✅
- **Ne:** JSON dosyası seçilir seçilmez herkes için tüm veri değiştiriliyordu. Sıfırlama iki "Tamam" tıklamasıyla geri dönüşsüz yapılıyordu.
- **Risk:** Yüksek · **Emek:** Küçük
- **Yapılan:** Geri yükleme yedekteki kayıt sayılarını gösterip onay istiyor. Sıfırlama için "SIFIRLA" yazılması gerekiyor. İkisi de önce mevcut verinin yedeğini bilgisayara indiriyor.

### H13. Sheets ve Excel'den gelen metinler ekrana kaçışsız basılıyordu (XSS) ✅
- **Ne:** Üye durumu, ödeme durumu ve tipi, başvuru durumu gibi alanlar Google Sheets ya da Excel'den geldiği gibi sayfaya yazılıyordu. Sayfayı düzenleyebilen biri hücreye kod koyarak paneli açan herkesin tarayıcısında kod çalıştırabilirdi.
- **Risk:** Orta · **Emek:** Küçük · **Yapılan:** Bütün bu alanlar güvenli biçimde gösteriliyor (testte doğrulandı).

### H14. Supabase kütüphanesi sürümü sabit değildi ✅
- **Ne:** Kütüphane `@2` adresinden yükleniyordu; yayımlanan her yeni sürüm (bozuk ya da kötü niyetli olsa bile) kendiliğinden panele geliyordu.
- **Risk:** Orta · **Emek:** Küçük
- **Yapılan:** Sürüm 2.117.2'ye sabitlendi ve bütünlük karması eklendi: dosya değişirse tarayıcı yüklemiyor. npm'den doğrulandı, tarayıcıda denendi.

### H15. "Bugün" tarihi UTC'ye göre hesaplanıyordu ✅
- **Ne:** Türkiye saatiyle gece 00:00–03:00 arasında "bugün" bir önceki gün çıkıyordu (✓ Ödendi tarihi, yeni karar ve başvuru tarihleri).
- **Risk:** Düşük · **Emek:** Küçük · **Yapılan:** Yerel tarih kullanılıyor.

### H16. "Yıl Borcu Oluştur" yanlış yılı seçiyordu ✅
- **Ne:** Bu yıl için tek bir aidat kaydı bile varsa (ör. yeni bir üyeninki) düğme gelecek yıla borç yazıyor, bu yıl eksik kalan üyeleri atlıyordu.
- **Risk:** Orta · **Emek:** Küçük
- **Yapılan:** Önce bu yıl kaydı eksik aktif üyeler tamamlanıyor; kaç üyeye borç yazılacağı soruda gösteriliyor.

### H17. Tam Excel yedeğinde başvuruların meslek ve tarih sütunları boştu ✅
- **Ne:** Var olmayan alan adları kullanılıyordu.
- **Risk:** Düşük · **Emek:** Küçük
- **Yapılan:** Düzeltildi; YK kararları sayfasına ilgili üye ve not sütunları da eklendi.

### H18. Asistanın tahsilat cevabı Dashboard'dan farklıydı ✅
- **Ne:** Asistan kısmi ödemeleri saymıyordu; aynı soruya iki farklı rakam çıkıyordu.
- **Risk:** Orta · **Emek:** Küçük
- **Yapılan:** Tek tahsilat hesabı yazıldı; ikisi aynı sonucu veriyor (testte doğrulandı).

### H19. Dosya indirme bazı tarayıcılarda başlamıyordu ✅
- **Ne:** İndirme bağlantısı sayfaya eklenmeden tıklanıyordu.
- **Risk:** Düşük · **Emek:** Küçük · **Yapılan:** Bağlantı sayfaya eklenip tıklanıyor.

---

## 2. Önemli geliştirme

| # | Konu | Neden önemli | Risk | Emek | Durum |
|---|---|---|---|---|---|
| Ö1 | Aynı üye ve yıla ikinci aidat kaydında uyarı | Toplamların iki kez sayılmasını önler | Orta | Küçük | ✅ |
| Ö2 | Ödeme ve başvuru silmede "Geri al" | Yanlış tıklamada veri kaybını önler | Orta | Küçük | ✅ |
| Ö3 | Üye kartında o üyeyle ilgili YK kararları ve tek tıkla "Aidat hatırlatması" mesajı | Üye, karar ve mesaj verilerini birbirine bağlar | Düşük | Küçük | ✅ |
| Ö4 | Başvuru "Üyeliğe Al" denince YK Kararları'na "Üyelik Kabulü" kaydı (başvurudaki karar numarasıyla) | Karar defteri takibi elle tutulmuyordu | Düşük | Küçük | ✅ |
| Ö5 | Yöneticiye "30 gündür yedek alınmadı" hatırlatması | Bulut tek kopya; düzenli yedek tek güvence | Orta | Küçük | ✅ |
| Ö6 | Telefonda Dashboard kartları iki sütun, üst çubuk taşması, uyarı şeridinin bölünmesi | Telefonda çok uzun ve bozuk görünüyordu | Düşük | Küçük | ✅ |
| Ö7 | Aidat tarifesinde "Sil" için onay | Tek tıkla tarife siliniyordu | Düşük | Küçük | ✅ |
| Ö8 | Kod düzeni: ortak yardımcılar ayrı ve test edilebilir bir blokta (`foyder-core`); tek yapay zekâ işlevi; tek tahsilat hesabı; üç ayrı "aidat mı?" kontrolü teke indi | Aynı hata bir yerde düzeltilip başka yerde kalmasın | Düşük | Orta | ✅ |
| Ö9 | Test altyapısı: `tests/panel.test.js` (birim) ve `tests/e2e-panel.js` (tarayıcı, 61 denetim) | Sonraki değişikliklerde bozulmayı hemen yakalar | — | Orta | ✅ |
| Ö10 | Excel kütüphanesi (SheetJS 0.18.5) bilinen güvenlik açıkları içeriyor; özel hazırlanmış bir dosya okunduğunda sorun çıkarabilir | Yalnızca yönetici dosya yüklediği için olasılık düşük | Orta | Küçük | ✅ 0.20.3'e geçildi, sürüm sabit ve bütünlük karmalı. Not: SheetJS'in kendi sunucusu (cdn.sheetjs.com) bu çalışma ortamından erişilemediği için dosya, aynı sürümün npm'deki birebir yansısından (`@e965/xlsx@0.20.3`, jsDelivr üzerinden) yükleniyor; dosya başlığı, sürüm numarası ve lisans denetlendi. İçe ve dışa aktarma tarayıcıda gerçek dosyayla ve karma doğrulamasıyla denendi |
| Ö11 | Asistan sohbeti bütün kullanıcılar arasında ortak; herkes başkasının sorularını görüyor | Gizlilik ve karışıklık | Orta | Küçük | ✅ Sohbet artık kişiye özel. Eski ortak sohbet kaybolmadan taşındı; yöneticide "Eski ortak sohbet" olarak görünüyor. Yalnızca okuma yetkili kullanıcının sohbeti kendi tarayıcısında tutuluyor. Not: Sohbetler diğer verilerle aynı bulut satırında durduğu için ayrım ekran düzeyindedir; JSON yedeğinde herkesin sohbeti bulunur. Tam ayrım için verilerin ayrı tablolara taşınması gerekir (İleride 1) |
| Ö12 | Varsayılan sağlayıcı "Claude (anahtarsız)" Vercel'de çalışmıyor; asistan sessizce yerel moda düşüyor | Kullanıcı yapay zekânın neden "basit" yanıt verdiğini anlamıyor | Düşük | Küçük | ✅ Asistanın üstünde "Yapay zekâ bağlı değil, basit modda yanıtlanıyor" notu; Ayarlar'da ve asistanda hangi sağlayıcının denendiğini ve çalışmama nedenini gösteren "Bağlantıyı test et" düğmesi; basit modda verilen yanıtlar işaretli |
| Ö13 | Üye "ücretsiz" yapılınca o yılın açık aidatı MUAF'a dönmüyor | Borç listesinde yanlış kişiler kalır | Orta | Küçük | ✅ Kayıtta "Bu yılın açık aidatı Muaf yapılsın mı?" diye soruluyor; "Hayır" denirse hiçbir şey değişmiyor, "Evet" denirse değişiklik geçmişe yazılıyor |
| Ö14 | Dashboard'da "Bekleyen Aidat" pasif üyelerin borcunu sayıyor, "Ödemeyen Üye" saymıyor; "X ödeme alındı" kısmi ödemeleri saymıyor | Tanım farkı kafa karıştırır | Düşük | Küçük | ✅ "Bekleyen Aidat" ve "Ödemeyen Üye" yalnızca aktif üyeleri sayıyor; "ödeme alındı" kısmileri de sayıyor. Her kartın (ve Aidat sayfasındaki kartların) üzerine gelince ya da telefonda ⓘ'ye dokununca ne saydığı yazıyor |
| Ö15 | Üye ve aidat tabloları telefonda yana kayıyor | Telefonda kullanım zor | Düşük | Orta | ✅ Telefonda üye listesi, aidat listesi ve üye kartındaki ödeme geçmişi kart görünümüne dönüyor |
| Ö16 | Üye ve aidatta "kim, ne zaman değiştirdi" geçmişi yok (görevlerde var) | Hatalı değişikliğin kaynağı bulunamıyor | Orta | Orta | ✅ Elle düzenleme, hızlı "Ödendi", asistan, yıl borcu, başvuru onayı, Sheets/Excel aktarımı ve mükerrer birleştirme geçmişe yazıyor. Üye ve ödeme pencerelerinde görünüyor. Sınır: üye başına 30, ödeme başına 20 kayıt (en eskiler düşer). Not içerikleri geçmişe yazılmıyor, yalnızca "güncellendi" deniyor. Eşzamanlı kayıtta iki kişinin geçmiş girişleri birleşiyor. Geçmiş tarayıcıda tutulur; sunucu tarafı denetim kaydının yerini tutmaz |
| Ö17 | Sheets ve Excel eşleştirmesi yalnızca ada göre; aynı adlı iki üye ya da yazım farkı mükerrer kayıt üretir | Mükerrer üye ve aidat | Orta | Orta | ✅ Önce "Defter No / Üye No" sütunu, yoksa ad. Aynı adlı birden çok kayıt, numara–ad uyuşmazlığı ya da dosyada numarasız aynı adlı iki satır varsa otomatik birleştirme yapılmıyor; kullanıcı listeden üyeyi, "Yeni üye olarak ekle"yi ya da "Atla"yı seçiyor. Seçim istenirse aynı sayfa için hatırlanıyor (Ayarlar → Entegrasyonlar'dan unutulabilir). Panelin Excel ve Sheets çıktılarına "Defter No" sütunu eklendi. "Mükerrer Üyeleri Birleştir" farklı defter numaralı aynı adlı kayıtları artık birleştirmiyor |

---

## 3. İleride yapılabilir

1. **Verileri ayrı tablolara taşımak** (üyeler, ödemeler, kararlar, görevler). Bugün her şey tek bir satırda. Ayrı tablolar gerçek eşzamanlı kullanım, satır düzeyinde yetki ve kayıt geçmişi sağlar. *Risk düşürür · Emek: Büyük.*
2. **Sunucu tarafında denetim kaydı:** Kim neyi değiştirdi, Supabase'te tutulsun. *Emek: Orta.*
3. **Otomatik günlük bulut yedeği** (Supabase zamanlanmış görevi ya da Storage). *Emek: Küçük–Orta.*
4. **Banka ekstresi içe aktarma** ve ödemeleri otomatik eşleştirme; ödeme makbuzu (PDF). *Emek: Orta–Büyük.*
   - ✅ **Ödeme makbuzu uygulandı:** Ödenmiş ya da kısmen ödenmiş aidatın yanında "🧾 Makbuz" düğmesi (Aidat sayfası, üye kartı, ödeme penceresi). Dernek adı, makbuz no (her ödeme için sabit), üye, defter no, dönem, tutar ve yazıyla tutar, ödeme tarihi, imza alanları ve "resmî Alındı Belgesi'nin yerine geçmez" notu bulunan A4 sayfa; tarayıcının "PDF olarak kaydet" seçeneğiyle iniyor.
   - ⏳ Banka ekstresi içe aktarma: Karar gereği şimdilik yapılmadı.
5. **Toplu WhatsApp/e-posta gönderimi:** Bugün mesaj metni üretiliyor ama gönderilmiyor. *Emek: Orta.*
6. **Genel kurul modülü** (hazirun listesi, vekâlet, yeter sayı) ve **etkinlik modülü** (görevlerdeki "etkinlik" alanı buna bağlanabilir). *Emek: Büyük.*
7. **Üye portalı:** Üyenin kendi aidat durumunu görmesi. *Emek: Büyük.*
8. **Evrak ekleri** (başvuru belgeleri) için Supabase Storage. Bugün yalnızca onay kutusu var. *Emek: Orta.*
9. **KVKK:** Aydınlatma metni, saklama süresi, silme talebi akışı. *Emek: Orta.*
   - ✅ **"Kişisel verileri sil (KVKK)" uygulandı:** Üye kartında, iki aşamalı onayla (açıklamalı onay, ardından "SİL" yazma). İşlemden önce bütün verilerin yedeği kendiliğinden iner. Ad, e-posta, telefon, meslek, doğum yılı, notlar ve değişiklik geçmişi silinir; kayıt "Anonim Üye #defter no" adıyla pasife alınır. Aidat kayıtları istatistik için kalır. Aynı kişinin onaylanmış başvurusundaki kişisel bilgiler de silinir. YK kararları yasal kayıt olduğu için değiştirilmez (onay penceresinde kaç kararda adının geçtiği yazar). Başka bir kullanıcının aynı anda yaptığı kayıt, silinen bilgileri geri getiremez.
   - ⚠️ İşlem öncesi inen yedek dosyası silinen kişinin bilgilerini içerir; kontrol ettikten sonra bu dosyayı silin. Görev ve sohbet metinlerinde adı geçiyorsa elle temizlenmelidir.
   - ⏳ Aydınlatma metni ve saklama süresi kuralları: Hukuki metin gerektirdiği için yapılmadı.
10. **Panel kapalıyken de görev bildirimi** (service worker ya da e-posta). *Emek: Orta.*
11. ✅ **Kaldırılabilecek ya da sadeleştirilebilecek kod** (üçü de kaldırıldı):
    - `window.storage` ile yerel kayıt yolu (`HAS_STORE`): Claude içinde çalışan eski sürümden kalma, Vercel'de hiç çalışmıyor.
    - `ayarlar.rol` alanı: Kullanılmıyor; rol `profiles` tablosundan geliyor.
    - Giriş ekranındaki "Kaydolun" bağlantısı: Kayıt kapalıysa kafa karıştırıyor (bkz. H3). Artık yeni kullanıcıyı yalnızca yönetici ekliyor (Supabase → Authentication → Users → Add user); giriş ekranında "Hesabınız yok mu? Panel yöneticisinden isteyin" yazıyor.
    - Eski verideki `ayarlar.rol` alanı açılışta kayıpsız temizleniyor; bulutta ilk kurulumda doğrudan başlangıç verisi yazılıyor.
12. ✅ **Hafıza masaüstü uygulaması** (`hafiza/`, izninizle düzenlendi):
    - `sample-transcript.txt` depodan çıkarıldığı için "Örnek deşifreyi yükle" düğmesi hata veriyor.
    - `npm test` motor test dosyası açılmadan duruyor.
    - Paketleme listesinde eksik dosya var.
    - Örnek dosyaya bağlı iki test ve düğme uydurma bir örnekle çalışır hâle getirilebilir.
    - **Yapılanlar:** Uydurma bir yönetim kurulu toplantısı deşifresi (`sample-transcript.txt`, gerçek kişi ya da üye adı yok) eklendi; "Örnek deşifreyi yükle" düğmesi bu dosyadan 18 görev çıkarıyor. Örnek başlığı ve kutu içi örnek metindeki gerçek ad uydurma adla değiştirildi. Paketleme listesindeki eksik yalnızca bu dosyanın kendisiydi; listede olup diskte olmayan ya da uygulamanın yükleyip listede olmayan bir dosya kalırsa artık `npm test` hata veriyor (`test/package.test.js`). Görev çıkarma motoru değişmedi, panele gömülü kopyasıyla birebir aynı.
    - Kodun güvenlik ayarları (pencere yalıtımı, içerik güvenlik politikası) iyi durumda.

---

## Testler

| Test | Ne denetliyor | Sonuç |
|---|---|---|
| `node --test tests/panel.test.js` | Değer okuyucular, tahsilat hesabı, eşzamanlı kayıt birleştirmesi, güvenlik ayarları, yazıyla tutar, numara öncelikli eşleştirme, kayıt geçmişi, KVKK birleştirmesi, sürüm sabitleme | 13/13 |
| `node --test tests/gorevler.test.js` | Toplantılar ve Görevler çekirdeği | 10/10 |
| `NODE_PATH=$(npm root -g) node tests/e2e-panel.js` | Bu rapordaki düzeltmeler ve ikinci turdaki bütün yeni özellikler (tarayıcıda, telefon boyutu dahil; gerçek SheetJS 0.20.3 dosyasıyla) | 102/102 |
| `NODE_PATH=$(npm root -g) node tests/e2e-gorevler.js` | Toplantılar ve Görevler (tarayıcıda) | 88/88 |
| `cd hafiza && npm test` | Görev çıkarma motoru, kayıt deposu, paketleme listesi | 24/24 (yalnızca Node gerekir; Electron gerektiren `test/e2e.js` bu ortamda çalıştırılamadı, beklenen sayıları yeni örneğe göre güncellendi) |

Tarayıcı testleri gerçek Supabase'e, Google Sheets'e ya da yapay zekâ sağlayıcısına bağlanmaz; bütün test verileri uydurmadır.

Tarayıcı testleri Excel kitaplığını ilk çalıştırmada npm'den bir kez indirip `tests/.cache` klasörüne koyar (bu klasör depoya girmez).

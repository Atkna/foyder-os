# FOYDER OS — Telefon tasarımı kararları

**Tarih:** 23 Ekim 2026
**Kapsam:** Yalnızca görünüm ve kullanım kolaylığı. Veri yapısı, Supabase kayıt mantığı ve yetki kontrolleri değişmedi.
**Ölçüm:** `tests/mobil-ekran.js`. Panel 360, 390 ve 430 px genişlikte ve masaüstünde (1440 px) açılır. Her sayfanın ve ana pencerelerin ekran görüntüsü alınır. Betik yatay taşmayı, küçük dokunma alanlarını ve küçük yazıları ölçer.

## Başlangıçta ne gördüm

- **Menü:** Soldaki ikon menüsü her sayfada ekranın altıda birini (64 px) kaplıyordu. Simgelerin ne olduğu yazmıyordu.
- **Taşma:** Genel Bakış ekrandan 79 px taşıyordu (390 px'lik ekranda sayfa 469 px). Bunun nedeni, iki sütunlu düzenin tek sütuna inince içeriğine göre genişlemesiydi. Telefon tarayıcısı da bu yüzden bütün sayfayı küçültüyordu.
- **Komut çubuğu:** Yapay zekâ komut çubuğunun örnek metni ilk kelimelerde kesiliyordu.
- **Özet kartları:** Aidat sayfasındaki dört kartın her biri tam bir satırdı; Genel Bakış'taki yedi kart dört satır tutuyordu.
- **Filtreler:** Aidat ve Üyeler'de her seçim kutusu tam bir satırdı. Görevler'de filtreler ekranın yarısını kaplıyordu.
- **Sekmeler:** Görevler sekmelerinin sonuncusu ekrana sığmıyordu ve kaydırılabildiğine dair bir işaret yoktu. Ayarlar sekmeleri dört satıra bölünüyordu.
- **Pencereler:** Açılır pencereler masaüstü kutusu gibiydi. Alt düğmeler küçüktü; görev penceresinde altı düğme iki dağınık satıra yayılıyordu.
- **Dokunma alanları:** 390 px'te tıklanabilir öğelerin %79'u 44 px'ten, %26'sı 32 px'ten küçüktü.
- **Yazılar:** Yazıların %47'si 12 px'ten küçüktü.
- **Form alanları:** Yazısı 13 px olduğu için iPhone'da bir alana dokununca sayfa yakınlaşıyordu.
- **Raporlar:** Rapor tablosu dar sütunlara sıkışıyordu ("Satın Alr…").
- **Ayarlar:** IBAN alanı kartın dışına taşıyordu.
- **Bildirimler:** "Hoş geldiniz" bildirimi içeriğin üstüne biniyordu.

## Kararlar ve nedenleri

Bütün telefon kuralları **760 px ve altı** için geçerli. 761–920 px (tablet) bugünkü ikon menüsüyle kalır; masaüstü değişmez.

1. **Alt gezinme çubuğu + açılır menü.**
   - Ekranın altında koyu, kurumsal renkte bir çubuk var: Genel Bakış, Üyeler, Aidat, Görevler, Menü.
   - Panel telefonda en çok "kim ödedi, kimin borcu var, bugün ne yapılacak" için açılıyor. Bu dört sayfa başparmağın kolayca eriştiği yerde.
   - "Menü" bütün sayfaları, kullanıcıyı ve çıkışı içeren yan paneli açar. Bu panel masaüstündeki menünün aynısı, yazılı hâliyle.
   - Böylece içerik ekranın tam genişliğini kullanıyor (64 px geri kazanıldı).
   - Görevler ve Başvurular rozetleri burada da görünür.
2. **Üst çubuk.**
   - Solda "F" logosu menüyü açar. Ortada tam genişlikte yapay zekâ komut çubuğu, sağda Sheets senkron düğmesi var.
   - Komut çubuğu bu panelin ayırt edici özelliği olduğu için her sayfada görünür kaldı. Telefonda örnek metni kısaldı ("Yapay zekâya yazın…") ve artık kesilmiyor.
3. **Sayfa başlıkları.**
   - Başlık ve açıklama korundu, aradaki boşluklar daraldı.
   - Sayfa düğmeleri satırı eşit genişlikte dolduruyor.
   - Telefonda anlamı olmayan düğmeler gizlendi: Genel Bakış'taki "Yazdır" ve Görevler'deki klavye kısayolları (⌨). İşlevleri masaüstünde duruyor.
4. **Özet kartları.**
   - İki sütunlu, kısa kartlar. Simge etiketin yanına alındı, böylece kart boyu kısaldı.
   - Açıklama işareti (ⓘ) kartın sağ üst köşesinde. Etiketi bölmüyor ve 36 px'lik dokunma alanı var.
   - Aidat'ın dört kartı tek sütun yerine 2×2 yerleşiyor.
   - Görevler'in beş kartı, yana kaydırılabilen tek bir satır oldu. Bu kartlar zaten birer hızlı filtre; dikey yer kaplamamaları daha önemli.
5. **Filtreler.**
   - Arama kutusu tam genişlikte. Seçim kutuları yana kaydırılan tek bir şeritte, kayıt sayısı şeridin sonunda.
   - Filtreleri bir düğmenin arkasına saklamak yerine bu yolu seçtim, çünkü Aidat'ta yıl ve tür seçimi listenin anlamını belirliyor; seçili değerler hep görünür kalmalı.
   - Görevler'deki "Açık / Bugün / Geciken…" düğmeleri de tek satırlık kaydırmalı şerit oldu.
   - Sağda devamı olan şeritlerin kenarı soluklaşıyor; bu, kaydırılabildiğini gösteriyor.
6. **Sekmeler.**
   - Görevler ve Ayarlar sekmeleri tek satırda, yana kaydırılabilir. Seçili sekme kendiliğinden görünür alana gelir; sağda devamı varsa kenar soluklaşır.
7. **Listeler.**
   - Üye, aidat, rapor, karar ve başvuru tabloları kart olarak görünüyor.
   - Kartta üstte ad ya da ana bilgi, altında iki sütunlu "etiket / değer" alanları, en altta işlem düğmeleri yer alıyor. Üye ve aidat kartları eskisine göre üçte bir daha kısa.
   - Başka tablolar da 4 ve daha fazla sütunluysa aynı kart düzenine geçiyor; etiketler tablonun kendi başlıklarından alınıyor. Az sütunlu tablolar (ör. aidat tarifesi) tablo olarak kalıyor.
8. **Açılır pencereler.**
   - Pencereler alttan açılan sayfa (bottom sheet) gibi: tam genişlik, üstte tutma çizgisi, içerik kendi içinde kayıyor, alt düğmeler hep görünür.
   - Düğmeler eşit genişlikte iki sütuna yerleşiyor. Kapatma düğmesi büyüdü.
9. **Dokunma alanları ve yazılar.**
   - Düğmeler, seçim kutuları, sekmeler ve menü öğeleri en az 44 px yüksekliğinde.
   - Telefondaki en küçük yazı 12 px; gövde yazısı 14,5 px.
   - Form alanlarının yazısı 16 px. Böylece iPhone dokununca sayfayı yakınlaştırmıyor.
10. **Grafikler** telefonda ekran genişliğinde çiziliyor, yazıları okunur boyutta (12 px+).
    - 8'den fazla çubuklu aylık grafikte ay adları ikişer atlanarak yazılıyor ve çubuk üstü sayılar gizleniyor; toplam grafiğin altında yazıyor.
    - Ayrıntılı değerler için "Çeyreklik" görünüm kullanılabilir.
11. **Görevlerdeki seçim kutuları** (toplu işlem ve alt adımlar) 32 px'lik dokunma alanına sahip, panelin renklerinde çizilmiş kutular oldu.
12. **Bildirimler** alt çubuğun hemen üstünde, tam genişlikte çıkıyor; içerik ya da düğmelerle çakışmıyor.
13. **iPhone çentiği ve alt çizgisi.** Alt çubuk ve pencere düğmeleri, ana ekran çizgisinin üstünde kalacak kadar yukarıda (`viewport-fit=cover` ve güvenli alan payı).
14. **Genel Bakış taşması** kökünden çözüldü. Tek sütuna inen düzende sütun içeriğe göre genişlemiyor. Bu, 920–1150 px arası tablet görünümünü de düzeltiyor.

## Bilerek yapmadıklarım

- **Masaüstü:** Düzeni ve görünümü değişmedi. Eklenen tek kural, tek sütuna inen yerleşimin taşmasını önleyen düzeltme; bu, masaüstünde değil 1150 px altında etkili.
- **Yeni kütüphane, yazı tipi ya da simge seti eklenmedi.** Alt çubuk, menüdeki simgelerin aynısını kullanıyor.
- **Veri, kayıt ve yetki işlevleri değişmedi.** Telefona özel küçük bir yardımcı yalnızca ekrandaki yerleşimi düzenliyor:
  - filtre kutularını bir şeride alıyor,
  - tablo hücrelerine etiket ekliyor,
  - kaydırmalı satırların kenar gölgesini yönetiyor.
- **Takvim** telefonda gün noktalarıyla gösterilmeye devam ediyor. Ayrıntı, güne dokununca açılan listede.

## Ölçüm sonuçları

22 ekranda (11 sayfa, 5 görev görünümü, Ayarlar · Yapay zekâ, 4 açılır pencere ve telefon menüsü, giriş ekranı) ölçüldü:

| Genişlik | Yatay taşan ekran (önce → sonra) | 32 px altı dokunma alanı | 44 px altı dokunma alanı | 12 px altı yazı |
|---|---|---|---|---|
| 360 px | 2 → **0** | %26 → **%0** | %79 → **%5** | %47 → **%0** |
| 390 px | 2 → **0** | %26 → **%0** | %79 → **%5** | %47 → **%0** |
| 430 px | 2 → **0** | %26 → **%0** | %74 → **%6** | %47 → **%0** |
| Tablet (820 px) | 0 → 0 | değişmedi | değişmedi | değişmedi |
| Masaüstü (1440 px) | 0 → 0 | değişmedi | değişmedi | değişmedi |

- **44 px'in altında kalanlar** bilerek küçük bırakıldı. Bunlar şunlar:
  - görev satırındaki 32 px'lik seçim kutusu ve "tamamlandı" yuvarlağı,
  - görev filtre şeridindeki 42 px'lik düğmeler,
  - kartlardaki 36 px'lik ⓘ işaretleri,
  - alt adım silme (✕) düğmeleri.
- **Masaüstü:** Değişiklik öncesi ve sonrası ekran görüntüleri piksel piksel karşılaştırıldı. Farklar yalnızca bildirim balonunun solma anı ve test verisindeki saatten ibaret.
- **Tablet:** Bu çalışmanın kapsamı dışında kaldı; bugünkü ikon menüsüyle aynı. İstenirse aynı yaklaşım 920 px'e kadar genişletilebilir.

Ölçümü yeniden çalıştırmak için:
`NODE_PATH=$(npm root -g) node tests/mobil-ekran.js --siki` (telefonda taşma, 32 px altı dokunma alanı ya da sayfa hatası varsa hata verir).

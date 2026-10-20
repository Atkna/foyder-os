# Hafıza — kaynak kod

Toplantı deşifrelerini görevlere dönüştüren, çevrimdışı çalışan Windows masaüstü uygulaması (Electron).

## Çalıştırma ve derleme

```bash
npm install        # ilk seferde: Electron ve electron-builder iner
npm start          # geliştirme modunda aç
npm test           # motor, veri saklama ve hatırlatma birim testleri
npm run test:e2e   # uygulamayı geçici veri klasörüyle açıp arayüzü uçtan uca dener
npm run build      # dist/Hafiza-Masaustu-<sürüm>.exe (taşınabilir)
```

`npm start` gerçek kullanıcı verisini (`%APPDATA%\hafiza-desktop`) kullanır. Denemeler için
`HAFIZA_DATA_DIR` ortam değişkeniyle başka bir klasör gösterin; testler bunu kendisi yapar.

## Dosyalar

| Dosya | Görev |
| --- | --- |
| `main.js` | Pencere, sistem tepsisi, bildirim, yedek alma/geri yükleme, otomatik başlatma |
| `store.js` | `hafiza-data.json` okuma/yazma: geçici dosya → `.bak` → günlük kopya (`yedekler/`) |
| `preload.js` | Arayüze açılan güvenli köprü (`window.hafiza`) |
| `task-engine.js` | Metinden görev çıkarma, tarih/öncelik/proje tahmini, mevcut görevle eşleştirme |
| `reminders.js` | Hangi görev için ne zaman bildirim gösterileceği |
| `renderer.js`, `index.html`, `styles.css` | Arayüz |
| `sample-transcript.txt` | Uygulamayla gelen örnek deşifre |
| `tools/make-icons.js` | Uygulama simgesini üretir (`npm run icons`) |
| `test/` | Birim testleri, uçtan uca deneme, klavye kısayolu denemesi |

## Görev çıkarma nasıl çalışır

1. Satır sonları kaybolmuş metin onarılır (art arda boşluk, bitişik başlık, `Etiket:Metin`).
2. "Yapılacaklar Listesi / Aksiyon Raporu / To-Do" başlığı varsa yalnızca o bölüm işlenir.
3. Her satır başlık, alt başlık (`… (Sorumlu):`) veya madde olarak sınıflanır; `M4A` gibi kaynak etiketleri atılır.
4. Cümlenin son sözcüğüne bakılır (Türkçede yüklem sondadır): `-acak/-ecek`, `-ması/-mesi`,
   `-malı`, `gerekiyor/lazım`, emir kipi ve birinci tekil kişi eylem sayılır;
   `-mayacak`, `olacak`, geçmiş zaman ve sorular sayılmaz.
5. Aday, mevcut görevlerle karşılaştırılır: kayıtlı konu anahtarı, aynı cümlenin notlarda geçmesi
   veya yüksek sözcük benzerliği. Farklı özel ad ya da farklı sayı içeren başlıklar birleştirilmez.

Örnek deşifre için `task-engine.js` içindeki `sampleRules` hazır başlıkları kullanılır.

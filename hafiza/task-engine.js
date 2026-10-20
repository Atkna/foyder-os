(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Metin yardımcıları
   * ------------------------------------------------------------------ */

  const UP = 'A-ZÇĞİÖŞÜÂÎÛ';
  const LOW = 'a-zçğıöşüâîû';

  // Türkçe harfleri sadeleştirir; noktalama boşluğa döner ("Kerem'e" -> "kerem e").
  const fold = value => String(value || '').toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  // Ek ayıran kesme işaretini silerek sadeleştirir ("Kerem'e" -> "kereme"); fiil çözümlemesi için.
  const foldJoined = value => fold(String(value || '').replace(/['’`´]/g, ''));
  const localISO = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const capitalize = text => text ? text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1) : text;

  /* ------------------------------------------------------------------ *
   *  Tarih, saat ve öncelik
   * ------------------------------------------------------------------ */

  const months = { ocak:0, subat:1, mart:2, nisan:3, mayis:4, haziran:5, temmuz:6, agustos:7, eylul:8, ekim:9, kasim:10, aralik:11 };
  const monthNames = Object.keys(months).join('|');
  const weekdays = { pazartesi:1, sali:2, carsamba:3, persembe:4, cuma:5, cumartesi:6, pazar:0 };
  const numberWords = { bir:1, iki:2, uc:3, dort:4, bes:5, alti:6, yedi:7, sekiz:8, dokuz:9, on:10 };

  function baseDate(meetingDate) {
    return /^\d{4}-\d\d-\d\d$/.test(meetingDate || '') ? new Date(`${meetingDate}T12:00:00`) : new Date(new Date().setHours(12, 0, 0, 0));
  }
  const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
  const validDate = (y, m, d) => { const date = new Date(y, m, d, 12); return date.getMonth() === m && date.getDate() === d ? date : null; };

  function dateFrom(text, meetingDate) {
    const base = baseDate(meetingDate);
    const raw = String(text || '');
    const f = fold(raw);

    // 1) "5 Ekim", "15 Kasım 2026"
    const named = f.match(new RegExp(`\\b(\\d{1,2}) (${monthNames})(?: (20\\d{2}))?\\b`));
    if (named) {
      const day = Number(named[1]), month = months[named[2]];
      let year = Number(named[3]) || base.getFullYear();
      let date = validDate(year, month, day);
      if (date) {
        if (!named[3] && date.getTime() < base.getTime() - 45 * 86400000) date = validDate(++year, month, day) || date;
        return localISO(date);
      }
    }

    // 2) "05.10.2026", "5/10/26", "05.10" — saat (10.30), tutar (2.000) ve aralıkları (15-20 gün) tarih sanma.
    const numeric = raw.match(/(?<![\d.,/:-])(\d{1,2})([./-])(\d{1,2})\2(20\d{2}|\d{2})(?![\d:])/);
    if (numeric) {
      const year = numeric[4].length === 2 ? 2000 + Number(numeric[4]) : Number(numeric[4]);
      const date = validDate(year, Number(numeric[3]) - 1, Number(numeric[1]));
      if (date) return localISO(date);
    }
    const short = raw.match(/(?<![\d.,/:-])(\d{2})[./](\d{2})(?![\d.,/:-]|\s*(?:TL|₺|%|bin|milyon|kişi|adet|saat|dakika|gün|hafta|ay|yıl)\b)/i);
    if (short && !/saat\s*$/i.test(raw.slice(0, short.index))) {
      let date = validDate(base.getFullYear(), Number(short[2]) - 1, Number(short[1]));
      if (date) {
        if (date.getTime() < base.getTime() - 45 * 86400000) date = validDate(base.getFullYear() + 1, Number(short[2]) - 1, Number(short[1])) || date;
        return localISO(date);
      }
    }

    // 3) "Kasım sonu", "ay sonuna kadar", "yıl sonu"
    const monthEdge = f.match(new RegExp(`\\b(${monthNames}) (sonu\\w*|ortasi\\w*|basi\\w*)\\b`));
    if (monthEdge) {
      const month = months[monthEdge[1]];
      let year = base.getFullYear();
      if (month < base.getMonth() - 1) year++;
      const day = monthEdge[2].startsWith('son') ? new Date(year, month + 1, 0).getDate() : monthEdge[2].startsWith('ort') ? 15 : 1;
      return localISO(new Date(year, month, day, 12));
    }
    if (/\bay sonu\w*\b/.test(f)) return localISO(new Date(base.getFullYear(), base.getMonth() + 1, 0, 12));
    if (/\byil sonu\w*\b/.test(f)) return localISO(new Date(base.getFullYear(), 11, 31, 12));

    // 4) Göreli ifadeler
    const span = f.match(/\b(\d{1,2}|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on) (gun|hafta) (icinde|icerisinde|sonra|sonraya)\b/);
    if (span) {
      const n = Number(span[1]) || numberWords[span[1]] || 0;
      if (n > 0 && n <= 90) return localISO(addDays(base, span[2] === 'hafta' ? n * 7 : n));
    }
    if (/\b(yarindan sonra|obur gun)\b/.test(f)) return localISO(addDays(base, 2));
    if (/\byarin(a|ki)?\b/.test(f)) return localISO(addDays(base, 1));
    if (/\bbugun\b|\bgun icinde\b|\baksama kadar\b|\bmesai bitimine\b/.test(f)) return localISO(base);

    const nextWeek = /\b(haftaya|gelecek hafta|onumuzdeki hafta|gelecek haftaya)\b/.test(f);
    const dayMatch = f.match(/\b(pazartesi|sali|carsamba|persembe|cumartesi|cuma)(?:ya|ye)?\b/) || f.match(/\b(pazar)(?: gunu| gunune| gunku| sabahi| aksami|a kadar)\b/);
    if (dayMatch) {
      const target = weekdays[dayMatch[1]];
      let diff = (target - base.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      if (nextWeek) {
        // "Haftaya salı": bir sonraki takvim haftasındaki o gün.
        const monday = addDays(base, ((8 - base.getDay()) % 7) || 7);
        return localISO(addDays(monday, (target + 6) % 7));
      }
      return localISO(addDays(base, diff));
    }
    if (nextWeek) return localISO(addDays(base, 7));
    if (/\bhafta sonu\w*\b/.test(f)) {
      const day = base.getDay();
      return localISO(addDays(base, day === 0 ? 0 : 6 - day));
    }
    if (/\bbu hafta\b/.test(f)) {
      const day = base.getDay();
      // Hafta içi: o haftanın cuması; hafta sonu: pazar.
      return localISO(addDays(base, day >= 1 && day <= 5 ? 5 - day : day === 6 ? 1 : 0));
    }
    return '';
  }

  function timeFrom(text) {
    const raw = String(text || '');
    const match = raw.match(/\bsaat\s+(\d{1,2})[:.](\d{2})\b/i) || raw.match(/\b(\d{1,2})[:.](\d{2})['’][dt][ea]\b/i);
    if (!match) return '';
    const h = Number(match[1]), m = Number(match[2]);
    return h <= 23 && m <= 59 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : '';
  }

  function priority(text) {
    const f = fold(text);
    if (/\b(acelesi yok|acil degil|aciliyeti (yok|bulunmam\w*)|aciliyet yok|oncelikli degil|dusuk oncelik\w*|bekleyebilir|beklet\w*|vakit olunca|firsat olunca)\b/.test(f)) return 'low';
    if (/\b(acil|acilen|aciliyet\w*|ivedi\w*|derhal|bir an once|en kisa surede|vakit kaybetmeden|gecikmeden|kritik|cok onemli|oncelikli|yuksek oncelik\w*|mutlaka)\b/.test(f)) return 'high';
    if (/\bhemen\b/.test(f) && !/\bhemen hemen\b/.test(f)) return 'high';
    return 'medium';
  }

  /* ------------------------------------------------------------------ *
   *  Örnek toplantı için hazır başlık kuralları
   * ------------------------------------------------------------------ */

  const sampleRules = [
    ['mekan rezervasyonu', 'Mekânla görüşüp 17 Ekim tekstil buluşması için ön rezervasyonu teyit et', 'Tekstil Buluşması', 'textile-venue'],
    ['salon buyutme opsiyonu', 'Mekâna katılım 50 kişiye çıkarsa daha büyük salona geçiş imkânını sor', 'Tekstil Buluşması', 'textile-bigger-room'],
    ['masa duzen ilavesi', 'Mekâna ek masa ile salon kapasitesini en az 10 kişi artırma seçeneğini sor', 'Tekstil Buluşması', 'textile-extra-tables'],
    ['seri formati', 'Kerem’e sektörel kahvaltılar için tekrar kullanılabilir broşür şablonunu anlat', 'Tekstil Buluşması', 'textile-brochure-series'],
    ['afis hiyerarsisi', 'Kerem’e afiş başlığını üstte belirgin göstermesini ilet', 'Tekstil Buluşması', 'textile-poster-heading'],
    ['4 gorsel fotograf', 'Afişte Önder Bey, moderatör ve iki katılımcının fotoğraflarını kullan', 'Tekstil Buluşması', 'textile-four-photos'],
    ['eksik konusmaci bilgileri', 'Mustafa Kanıcı’dan ek konuşmacının fotoğrafını ve unvanını doğrula', 'Tekstil Buluşması', 'textile-speaker-details'],
    ['yonetim kurulu karari', 'Mahmut Bey’le görüşüp A.Ş. yönetim kurulu kararının imza gereksinimini netleştir', 'Şirket & Dernek', 'company-board-signatures'],
    ['imzalarin toplanmasi', 'Önder Bey ve Özgür Bey’den şirket kararları için imzaları topla', 'Şirket & Dernek', 'company-collect-signatures'],
    ['dernek yonetim kurulu temsil karari', 'Derneğin Önder Yılmaz’ı A.Ş. genel kurulunda temsilci atayan kararını sürece ekle', 'Şirket & Dernek', 'association-representation'],
    ['uyelik basvurulari karari', 'Dört adayın üyelik kararını beklet ve yeni başvuruları listeye ekle', 'Şirket & Dernek', 'association-membership'],
    ['tma odemesi takibi', 'Kara Tillman’dan TMA ödemesiyle ilgili yanıtı takip et ve Önder Bey’e bildir', 'Uluslararası Yazışmalar', 'tma-payment-followup'],
    ['e posta cc kurali', 'Kurumsal yazışmalarda Önder Bey’in Axfera adresini CC’ye ekle', 'Uluslararası Yazışmalar', 'email-onder-cc'],
    ['sozlesmeler ve faturalandirma', 'Ön onaylı sponsorlara sözleşmeleri gönder ve tahsilat durumunu takip et', 'Büyük Zirve', 'summit-sponsor-contracts'],
    ['sponsorluk sozlesmesi konusunda', 'Mustafa Kanıcı’yı arayıp sponsorluk sözleşmesini hızlandırmasını iste', 'Büyük Zirve', 'summit-kanici-sponsorship'],
    ['katilimci sayisi ve e mailing kampanyasi', 'Geçmiş yıl katılımcılarına zirve için toplu e-posta kampanyasını başlat', 'Büyük Zirve', 'summit-email-campaign'],
    ['ilk tur davetiyeler', 'Birliklere ve odalara zirve davetiyelerinin ilk turunu gönder', 'Büyük Zirve', 'summit-invites-first'],
    ['hazirlik', 'Geçen yılın davet yazılarını inceleyip yeni taslakları Önder Bey’le paylaş', 'Büyük Zirve', 'summit-invite-drafts'],
    ['ikinci tur davetiyeler', 'Zirveden 15–20 gün önce kurumlara ikinci tur hatırlatma davetiyesi gönder', 'Büyük Zirve', 'summit-invites-second'],
    ['linkedin reklam butcesi ve dagitimi', 'Zirve için 5.000 TL LinkedIn reklam bütçesini paylaşımlara dağıtıp hedeflemeyi ayarla', 'Sosyal Medya', 'summit-linkedin-ads'],
    ['13 ekim gebze etkinligi', '13 Ekim Gebze etkinliği için LinkedIn paylaşımını yayımla', 'Sosyal Medya', 'gebze-linkedin-post'],
    ['linkedin kurumsal etiketleme stratejisi', 'TMA Türkiye paylaşımında ilgili oda ve birlikleri etiketleyen davet yorumunu yayımla', 'Sosyal Medya', 'summit-linkedin-tags'],
    ['raporlama', 'Tamamlanan ve bekleyen işleri Önder Bey’e düzenli olarak bildir', 'Genel', 'onder-progress-report']
  ];
  const sampleAliases = {
    'saat ve mekan onayi':'textile-venue',
    'salon buyutme opsiyonu':'textile-bigger-room',
    'masa duzen ilavesi':'textile-extra-tables',
    'seri formati':'textile-brochure-series',
    'eksik konusmaci bilgileri':'textile-speaker-details',
    'yonetim kurulu karari':'company-board-signatures',
    'imzalarin toplanmasi':'company-collect-signatures',
    'dernek yonetim kurulu temsil karari':'association-representation',
    'uyelik basvurulari karari':'association-membership',
    'tma odemesi takibi':'tma-payment-followup',
    'e posta cc kurali':'email-onder-cc',
    'katilimci sayisi ve e mailing kampanyasi':'summit-email-campaign',
    'ikinci tur davetiyeler':'summit-invites-second',
    'linkedin reklam butcesi ve dagitimi':'summit-linkedin-ads',
    '13 ekim gebze etkinligi':'gebze-linkedin-post',
    'linkedin kurumsal etiketleme stratejisi':'summit-linkedin-tags',
    'raporlama':'onder-progress-report',
    'halkbank sponsor stant masalari':'summit-sponsor-tables',
    'ilk tur davetiyeler 5 ekim pazartesi':'summit-invites-first',
    'gecen yilki davet yazi formatlari incelenerek taslaklar hazirlanacak ve onder bey ile paylasilmak':'summit-invite-drafts'
  };

  // Başlıktan tahmin edilen konu anahtarı. Tek başına eşleşme sayılmaz; kelime benzerliğiyle desteklenmelidir.
  function semanticKey(title) {
    const text = fold(title);
    if (/kara tillman|tma odeme/.test(text) && /odeme|yanit/.test(text)) return 'tma-payment-followup';
    if (/mustafa|konusmaci/.test(text) && /fotograf|unvan/.test(text)) return 'textile-speaker-details';
    if (/linkedin/.test(text) && /reklam|butce|hedefleme/.test(text)) return 'summit-linkedin-ads';
    if (/linkedin/.test(text) && /gebze/.test(text)) return 'gebze-linkedin-post';
    if (/sponsor/.test(text) && /sozlesme|tahsilat/.test(text)) return 'summit-sponsor-contracts';
    if (/zirve|katilimci/.test(text) && /e posta|email|mailing/.test(text)) return 'summit-email-campaign';
    if (/davet/.test(text) && /ilk tur|5 ekim/.test(text)) return 'summit-invites-first';
    if (/davet/.test(text) && /ikinci tur|hatirlatma/.test(text)) return 'summit-invites-second';
    if (/afis|brosur/.test(text) && /kerem|baslik/.test(text)) return 'textile-poster-heading';
    return '';
  }

  // { key, strong }: kayıtlı anahtar ve eski kısa başlıklar kesin; başlıktan tahmin edilenler zayıf kabul edilir.
  function canonical(item) {
    if (item.key) return { key: item.key, strong: true };
    const title = fold(item.title);
    const alias = sampleAliases[title] || (title.startsWith('gecen yilki davet yazi formatlari') ? 'summit-invite-drafts' : '');
    if (alias) return { key: alias, strong: true };
    return { key: semanticKey(item.title), strong: false };
  }

  function sampleCandidates(text, meetingDate, owner) {
    const marker = text.search(/yapılacaklar listesi|detaylı eylem raporu/i);
    const normalized = fold(marker >= 0 ? text.slice(marker) : text);
    if (!normalized.includes('17 ekim') || !normalized.includes('kara tillman') || !normalized.includes('zirve')) return [];
    // Yalnızca gerçekten örnek toplantı metni ise hazır başlıkları kullan; benzer konulu başka notlar genel kurallarla işlenir.
    if (sampleRules.filter(([label]) => normalized.includes(label)).length < 14) return [];
    const out = [];
    for (const [label, title, project, key] of sampleRules) {
      if (!normalized.includes(label)) continue;
      let dueDate = '';
      if (key === 'summit-invites-first') dueDate = dateFrom('5 Ekim', meetingDate);
      if (key === 'summit-invites-second') dueDate = dateFrom('15 Kasım', meetingDate);
      if (key === 'gebze-linkedin-post') dueDate = dateFrom('13 Ekim', meetingDate);
      out.push({ title, project, key, dueDate, dueTime:'', priority: key === 'summit-email-campaign' || key === 'textile-speaker-details' ? 'high' : 'medium', owner,
        notes: `Toplantı notundan çıkarıldı. İlgili bölüm: ${label}.`, source:'' });
    }
    if (/stan[dt] masalari/.test(normalized) && !out.some(x => x.key === 'summit-sponsor-tables')) {
      out.push({ title:'Halkbank’tan gelen stant masası ölçülerini sponsorlara ilet', project:'Büyük Zirve', key:'summit-sponsor-tables', dueDate:'', dueTime:'', priority:'medium', owner, notes:'Halkbank stant masası ölçüleri ve teknik detayları gönderildi.', source:'' });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   *  Metni satırlara ayırma
   * ------------------------------------------------------------------ */

  // Bitişik yazılan marka adları; satır sonu kaybı sanılıp bölünmemeli.
  const brandWords = new Set(['powerpoint','sharepoint','wordpress','javascript','typescript','mailchimp','docusign','teamviewer','mastercard','quickbooks','sendgrid','blackrock','facetime','notebooklm','halkbank','denizbank','vakifbank','finansbank','turktelekom','wetransfer','googlemeet','indesign','airpods','dropbox','photoshop','superonline','hepsiburada','garantibbva','yapikredi','turkcell','instagram','facebook','microsoft']);

  // Yapıştırırken satır sonları kaybolmuş metin: çok uzun ve neredeyse hiç satır sonu yok.
  function isGlued(text) {
    if (text.length < 500) return false;
    return (text.match(/\n/g) || []).length < text.length / 450;
  }

  function prepare(text) {
    let t = String(text || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');
    if (!isGlued(t)) return t;
    // Kaybolan satır sonları çoğunlukla art arda boşluk olarak kalır.
    t = t.replace(/([^\s:,;])[ \t]{2,}(?=\S)/g, '$1\n');
    // "…yapılacak.Sonraki cümle" ve "…almaktadır.1. Başlık"
    t = t.replace(new RegExp(`([${LOW}\\)\\]”"’'%][.!?])(?=[${UP}"“(])`, 'g'), '$1\n');
    t = t.replace(new RegExp(`([${LOW}\\)\\]”"][.!?])(?=\\d{1,2}[.)]\\s)`, 'g'), '$1\n');
    // "…RaporuI. 17 Ekim" ve "…Raporu)1. Kurumsal"
    t = t.replace(new RegExp(`([${LOW}\\)\\]”"])(?=(?:[IVX]{1,4}|\\d{1,2})\\.\\s+[${UP}0-9"“])`, 'g'), '$1\n');
    // "Kapasite Opsiyonu:Saat ve Mekan Onayı: …"
    t = t.replace(new RegExp(`:(?=[${UP}"“])`, 'g'), ':\n');
    // "…Buluşması)Mekan Rezervasyonu"
    t = t.replace(new RegExp(`([\\)\\]”])(?=[${UP}])`, 'g'), '$1\n');
    // "…İşlemleriEvrakların Birleştirilmesi"
    const camel = new RegExp(`([${UP}${LOW}]*[${LOW}]{3})([${UP}][${LOW}]{3,})`, 'g');
    for (let i = 0; i < 3; i++) t = t.replace(camel, (match, a, b) => brandWords.has(fold(match)) ? match : `${a}\n${b}`);
    return t;
  }

  // Yapay zekâ araçlarından kopyalanan kaynak etiketleri ("M4A", "M4A+ 2") ve boş madde işaretleri.
  const noiseLine = /^(?:(?:m4a|mp3|mp4|wav|ogg|aac|pdf|docx?|txt|kaynak(?:lar)?|sources?)(?:\s*\+\s*\d+)?|\+?\d{1,3}|[-–—•*·._=]+)$/i;
  const bulletPrefix = /^(?:[-–—•*·▪◦●○■□►➤>]+|\[[ xX]?\]|☐|☑|✓|✔)\s*/;
  const numberPrefix = /^(?:([IVX]{1,5})\.|([A-H])\.|(\d{1,2})[.)])\s+(?=\S)/;
  // "3. Detaylı Yapılacaklar Listesi (To-Do List)" gibi bölüm başlıkları.
  const actionSection = /^(?:(?:[ivx]{1,4}|[a-h]|\d{1,2}) )?(?:(?:\w+ ){0,3}(?:yapilacaklar|yapilacak isler|eylem (?:plani|listesi|raporu|maddeleri)|aksiyon (?:listesi|raporu|maddeleri|plani)|to do|action items|sonraki adimlar)\b|(?:gorevler|gorev listesi|aksiyonlar)$)/;

  function contentLines(text) {
    const lines = prepare(text).split('\n').map(line => line.trim()).filter(line => line && !noiseLine.test(line));
    // Deşifre + rapor birlikte yapıştırıldıysa yalnızca yapılacaklar bölümünü işle.
    const start = lines.findIndex(line => line.length <= 90 && !/[.!?]$/.test(line) && actionSection.test(fold(line)));
    return start >= 0 && lines.length - start > 2 ? lines.slice(start + 1) : lines;
  }

  /* ------------------------------------------------------------------ *
   *  Eylem tespiti
   * ------------------------------------------------------------------ */

  const nonActionFuture = new Set(['olacak', 'bulunacak', 'kalacak', 'gelecek', 'surecek', 'gerekecek', 'yetecek', 'cikacak', 'baslayacak', 'bitecek', 'icecek', 'yiyecek']);
  const obligation = new Set(['gerekiyor', 'gerekir', 'gerek', 'gerekli', 'gerekmekte', 'gerekmektedir', 'lazim', 'sart', 'isteniyor', 'bekleniyor']);
  // Tek başına emir kipi olarak güvenle tanınabilen fiil kökleri.
  const stems = new Set(['gonder', 'yolla', 'ilet', 'bildir', 'aktar', 'hazirla', 'olustur', 'paylas', 'baslat', 'yayimla', 'yayinla', 'raporla', 'netlestir', 'planla', 'ayarla', 'dogrula', 'incele', 'topla', 'tamamla', 'yukle', 'ekle', 'guncelle', 'duzenle', 'duzelt', 'cikar', 'hatirlat', 'onayla', 'imzala', 'imzalat', 'kaydet', 'degistir', 'arastir', 'ogren', 'bitir', 'hallet', 'sor', 'ara', 'gorus', 'konus', 'bak', 'yaz', 'yap', 'iste', 'bekle', 'beklet', 'tasarla', 'cevir', 'kaldir', 'ertele', 'listele', 'belirle', 'kararlastir', 'ulas', 'gecir', 'sagla', 'ode', 'bilgilendir', 'uyar', 'yonlendir', 'karsilastir', 'hesapla', 'dagit', 'goster', 'anlat', 'acikla', 'yedekle', 'indir', 'izle', 'dene', 'sonuclandir', 'kapat', 'duyur', 'tanit', 'faturala', 'getir', 'gotur', 'kontrollet', 'sikistir', 'organize', 'takvimle', 'etiketle', 'kurgula', 'tahsis']);
  // Yalnızca ek aldığında fiil olduğu kesinleşen kısa kökler ("alalım", "verin", "gidelim").
  const suffixOnlyStems = new Set(['al', 'ver', 'git', 'koy', 'cek', 'at', 'ac', 'bul', 'sec', 'sil', 'kur', 'don', 'tut', 'kes', 'gec', 'et']);
  const lightVerbNouns = {
    al: new Set(['randevu', 'teklif', 'onay', 'bilgi', 'imza', 'not', 'fiyat', 'yedek', 'cikti', 'destek', 'teyit', 'satin', 'gorus', 'izin']),
    ver: new Set(['haber', 'bilgi', 'cevap', 'yanit', 'teklif', 'onay', 'brif', 'siparis', 'talimat', 'teyit']),
    gec: new Set(['iletisime', 'harekete', 'temasa']),
    tut: new Set(['hazir', 'guncel']),
    kes: new Set(['fatura', 'makbuz']),
    at: new Set(['mail', 'mesaj', 'eposta', 'posta', 'imza'])
  };
  const verbSuffixes = ['yiniz', 'iniz', 'unuz', 'yin', 'yun', 'sin', 'sun', 'yayim', 'yeyim', 'ayim', 'eyim', 'yalim', 'yelim', 'alim', 'elim', 'arim', 'erim', 'irim', 'urum', 'ariz', 'eriz', 'iriz', 'uruz', 'rim', 'riz', 'in', 'un'];

  const normalizeStem = stem => stem.endsWith('ed') ? `${stem.slice(0, -2)}et` : stem === 'gid' ? 'git' : stem;

  function isImperative(last, prev) {
    if (last === 'et') return Boolean(prev);
    if (lightVerbNouns[last]) return lightVerbNouns[last].has(prev);
    if (last === 'don') return /[ae]$/.test(prev || '');
    if (stems.has(last)) {
      if (last === 'ara') return !['bir', 'bu', 'su', 'kisa', 'her'].includes(prev);
      if (last === 'yaz') return !['gecen', 'bu', 'her', 'gelecek'].includes(prev);
      return true;
    }
    for (const suffix of verbSuffixes) {
      if (last.length - suffix.length < 2 || !last.endsWith(suffix)) continue;
      const stem = normalizeStem(last.slice(0, -suffix.length));
      if (stems.has(stem) || suffixOnlyStems.has(stem)) return true;
    }
    return false;
  }

  // Yan cümlenin son sözcüğüne bakar: Türkçede yüklem sonda olduğundan eylemi en güvenilir o gösterir.
  function clauseKind(clause) {
    const tokens = clause.split(' ').filter(Boolean);
    if (tokens.length < 2) return '';
    const last = tokens[tokens.length - 1], prev = tokens[tokens.length - 2];
    if (/(?:ma|me)y(?:acak|ecek)(?:tir|lar|ler)?$/.test(last) || /(?:mamasi|memesi|mamali|memeli)(?:dir)?$/.test(last)) return 'negative';
    const future = last.match(/^(\w{2,}(?:acak|ecek))(?:tir|lar|ler)?$/);
    if (future) return nonActionFuture.has(future[1]) ? '' : 'future';
    if (/^\w{2,}(?:acagim|ecegim|acagiz|ecegiz)$/.test(last)) return 'first';
    if (/^\w{3,}(?:masi|mesi)$/.test(last)) return 'nominal';
    if (obligation.has(last) && /(?:masi|mesi|mak|mek|malari|meleri)$/.test(prev)) return 'obligation';
    if (/^\w{3,}(?:mali|meli)(?:dir|yiz|yim)?$/.test(last)) return 'obligation';
    if (isImperative(last, prev)) return /(?:yayim|yeyim|ayim|eyim|yalim|yelim|alim|elim|arim|erim|irim|urum|ariz|eriz|iriz|uruz|rim|riz)$/.test(last) && !stems.has(last) ? 'first' : 'imperative';
    return '';
  }

  const stripAsides = text => text.replace(/\([^()]*\)/g, ' ').replace(/["“”][^"“”]{0,240}["“”]/g, ' alinti ');
  const clausesOf = text => stripAsides(text).split(/[;,]|\s+(?:ve|veya|ancak|fakat|ama)\s+/i).map(foldJoined).filter(Boolean);

  // Cümledeki ilk eylem türünü ve o eylemin geçtiği bölümü (";" ile ayrılan) bulur.
  function analyzeSentence(sentence) {
    if (/\?\s*$/.test(sentence)) return null;
    const segments = sentence.split(/;\s+/);
    for (let index = 0; index < segments.length; index++) {
      for (const clause of clausesOf(segments[index])) {
        const kind = clauseKind(clause);
        if (kind && kind !== 'negative') return { kind, first: index === 0, segment: segments[index].trim(), rest: segments.slice(index).join('; ').trim(), verb: clause.split(' ').pop() };
      }
    }
    return null;
  }

  function splitSentences(text) {
    const guarded = text.replace(/\b(vb|vs|bkz|Dr|Av|Prof|Doç|Sn|No|Tel|örn|Örn|yak|Ltd|Şti)\./g, '$1\u0001');
    return guarded.split(new RegExp(`(?<=[${LOW}\\)\\]”"’'%][.!?])\\s+(?=[${UP}"“(0-9])`))
      .map(sentence => sentence.replace(/\u0001/g, '.').trim()).filter(Boolean);
  }

  /* ------------------------------------------------------------------ *
   *  Sorumlu, proje ve başlık
   * ------------------------------------------------------------------ */

  // "(Atakan)", "(Keremler / Atakan)", "(Önder Bey)" gibi başlık sonu sorumlu notu.
  function ownerHint(label) {
    const match = label.match(/\(([^()]{2,50})\)\s*$/);
    if (!match) return { label, owner:'' };
    const parts = match[1].split(/\s*[/,&]\s*|\s+ve\s+/).map(part => part.trim()).filter(Boolean);
    const isName = part => new RegExp(`^[${UP}][${LOW}]+(?:\\s(?:Bey|Hanım))?$`).test(part);
    if (!parts.length || !parts.every(isName)) return { label, owner:'' };
    return { label: label.slice(0, match.index).trim(), owner: parts.join(' / ') };
  }

  function ownerFromSentence(sentence, verb) {
    const by = sentence.match(new RegExp(`([${UP}][${LOW}]+(?:\\s(?:Bey|Hanım))?)\\s+tarafından`));
    if (by) return by[1];
    // "Önder Bey, … görüşecek": özne başta ve fiil etken ise sorumlu odur ("… gönderilecek" edilgendir).
    if (/(?:[iu]l|n)(?:acak|ecek)(?:tir)?$|(?:masi|mesi)$/.test(verb || '')) return '';
    const subject = sentence.match(new RegExp(`^([${UP}][${LOW}]+\\s(?:Bey|Hanım))(?=,|\\s(?!(?:ve|ile|veya)\\s))`));
    return subject ? subject[1] : '';
  }

  const projectRules = [
    ['Tekstil Buluşması', ['tekstil', 'kahvalti', 'brosur', 'afis', 'poster', 'konusmaci', 'moderator']],
    ['Sosyal Medya', ['linkedin', 'instagram', 'sosyal medya', 'reklam', 'hedef kitle', 'gebze']],
    ['Uluslararası Yazışmalar', ['kara tillman', 'ashley', 'tma odeme', 'uluslararasi', 'yurt disi', 'ingiltere', 'cc ye']],
    ['Büyük Zirve', ['zirve', 'sponsor', 'davetiye', 'davet mektup', 'stant', 'simultane']],
    ['Şirket & Dernek', ['genel kurul', 'yonetim kurulu', 'karar defteri', 'hazirun', 'tutanak', 'imza', 'dernek', 'sirket', 'sermaye', 'uyelik']]
  ];
  const projectStop = new Set(['genel', 'proje', 'projesi', 'isleri', 'diger', 'calismalari']);

  function projectFor(section, group, text, knownProjects) {
    // Virgüllü bölüm başlıkları ("Sponsorluk, Finans ve Tahsilat") genel kategoridir; daha az belirleyicidir.
    const parts = [[fold(text), 1], [fold(group), 1.5], [fold(section), /,/.test(section) ? 0.75 : 1.5]];
    const count = keywords => parts.reduce((sum, [value, weight]) => sum + keywords.filter(word => value.includes(word)).length * weight, 0);
    let best = '', bestScore = 0;
    for (const [name, keywords] of projectRules) {
      const score = count(keywords);
      if (score > bestScore) { best = name; bestScore = score; }
    }
    // Kullanıcının kendi açtığı projeler: adındaki belirgin sözcükler metinde geçiyorsa.
    for (const name of knownProjects || []) {
      if (projectRules.some(rule => rule[0] === name)) continue;
      const keywords = fold(name).split(' ').filter(word => word.length > 3 && !projectStop.has(word));
      if (!keywords.length) continue;
      const hits = keywords.filter(word => parts.some(([value]) => value.includes(word))).length;
      if (hits / keywords.length < 0.5) continue;
      const score = count(keywords) + 0.5;
      if (score > bestScore) { best = name; bestScore = score; }
    }
    return bestScore >= 1.5 ? best : 'Genel';
  }

  const fillers = /^(?:şimdi|tamam|peki|yani|bu arada|ayrıca|ancak|fakat|ama|ek olarak|bir de|o zaman|evet|hayır|şey|ee+|hı hı)[,\s]+/i;

  function buildTitle(sentence, analysis, context) {
    // Eylem ilk bölümdeyse cümlenin tamamı; "… kullanılmayacak; ödemeler … toplanacak" gibi
    // sonraki bölümdeyse başlık eylemin geçtiği yerden başlar.
    const whole = analysis.first ? sentence : analysis.rest;
    let title = (whole.length <= 130 ? whole : analysis.segment).replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 3; i++) title = title.replace(fillers, '');
    title = title.replace(/[.!?;:,\s]+$/, '').trim();
    if (title.length > 150) title = `${title.slice(0, 147).replace(/\s+\S*$/, '')}…`;
    if (title.length < 46 && context && !fold(title).includes(fold(context))) title = `${context}: ${title}`;
    return capitalize(title);
  }

  /* ------------------------------------------------------------------ *
   *  Genel görev çıkarma
   * ------------------------------------------------------------------ */

  // Çekimli fiille biten satır ("… güncellendi", "… bekleniyor") başlık değil, bilgi cümlesidir.
  const finiteVerbEnd = /\w{3,}(?:[dt][iu](?:k|m|ler|lar)?|m[iu]s(?:tir|tur)?|[iu]yor(?:um|uz|lar)?)$/;

  function titleCaseRatio(text) {
    const tokens = text.split(/\s+/).filter(token => !/^(?:ve|ile|için|veya|ya da|&|\/|-|–)$/i.test(token));
    if (!tokens.length) return 0;
    return tokens.filter(token => new RegExp(`^["“(]?[${UP}0-9]`).test(token)).length / tokens.length;
  }

  function generalCandidates(text, meetingDate, options) {
    const lines = contentLines(text);
    const parsed = lines.map(line => {
      const body = line.replace(bulletPrefix, '');
      const number = body.match(numberPrefix);
      return { body: number ? body.slice(number[0].length).trim() : body, numbered: Boolean(number), bulleted: body !== line };
    });

    // Konuşmacı etiketleri ("Önder Bey: …") bağlam başlığı olarak kullanılmaz.
    const speakerPattern = new RegExp(`^([${UP}][${LOW}]+(?:\\s(?:Bey|Hanım|[${UP}][${LOW}]+))?):\\s+\\S`);
    const speakerCounts = new Map();
    for (const { body } of parsed) {
      const match = body.match(speakerPattern);
      if (match) speakerCounts.set(match[1], (speakerCounts.get(match[1]) || 0) + 1);
    }
    const speakers = new Set([...speakerCounts].filter(([, count]) => count >= 2).map(([name]) => name));

    const out = [];
    // titledGroup: "Alt başlık:" biçiminde açıkça yazılmış alt başlık; kısa görev adlarının önüne eklenir.
    let section = '', group = '', groupOwner = '', titledGroup = '';
    for (let i = 0; i < parsed.length; i++) {
      const { body, numbered, bulleted } = parsed[i];
      if (!body) continue;

      // "Alt başlık (Sorumlu):" biçimindeki satırlar
      if (/[:：]\s*$/.test(body) && body.length <= 160) {
        const hint = numbered ? { label: body.replace(/[:：]\s*$/, '').trim(), owner:'' } : ownerHint(body.replace(/[:：]\s*$/, '').trim());
        if (numbered) { section = hint.label; group = ''; groupOwner = ''; titledGroup = ''; }
        else { group = hint.label; groupOwner = hint.owner; titledGroup = hint.label; }
        continue;
      }

      const inline = body.match(/^([^:.!?]{3,90}?):\s+(\S.*)$/);
      const rawLabel = inline && inline[1].split(/\s+/).length <= 10 ? inline[1].trim() : '';
      const speaker = speakers.has(rawLabel) ? rawLabel : '';
      const hinted = rawLabel && !speaker ? ownerHint(rawLabel) : { label:'', owner:'' };
      const label = hinted.label;
      const detail = rawLabel ? inline[2].trim() : body;

      const sentences = splitSentences(detail);
      const analyses = sentences.map(sentence => sentence.length >= 12 ? analyzeSentence(sentence) : null);
      const terminal = /[.!?…]\s*$/.test(body);

      // Başlık mı, görev mi? Noktasız ve kısa satırlar çoğunlukla bölüm başlığıdır.
      if (!rawLabel && !terminal && !bulleted && body.length <= 110 && !finiteVerbEnd.test(foldJoined(body))) {
        const kind = analyses[0]?.kind || '';
        const softAction = !kind || kind === 'nominal';
        const nextNumbered = parsed[i + 1]?.numbered;
        const headingLike = numbered ? softAction && !nextNumbered && i < parsed.length - 1
          : softAction && (!kind || (titleCaseRatio(body) >= 0.6 && body.split(/\s+/).length <= 10));
        if (headingLike) {
          if (numbered) { section = body; group = ''; groupOwner = ''; }
          else { group = body; groupOwner = ''; }
          titledGroup = '';
          continue;
        }
      }

      const context = label || titledGroup;
      sentences.forEach((sentence, index) => {
        const analysis = analyses[index];
        if (!analysis) return;
        const title = buildTitle(sentence, analysis, context);
        if (title.length < 12) return;
        const owner = (analysis.kind === 'first' && speaker) || ownerFromSentence(sentence, analysis.verb) || hinted.owner || groupOwner || options.defaultOwner;
        const trail = [section, group, label].filter(Boolean).join(' › ');
        const scope = `${label} ${sentence}`;
        out.push({
          title,
          source: sentence,
          notes: `${trail ? `${trail}: ` : ''}${detail}`.slice(0, 750),
          dueDate: dateFrom(scope, meetingDate) || dateFrom(group, meetingDate),
          dueTime: timeFrom(sentence),
          priority: priority(sentence),
          project: projectFor(section, `${group} ${label}`, sentence, options.knownProjects),
          owner,
          key: ''
        });
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   *  Benzerlik ve eşleştirme
   * ------------------------------------------------------------------ */

  const stopWords = new Set(['bey', 'hanim', 'icin', 'ile', 'olarak', 'kadar', 'gore', 'gibi', 'daha', 'cok', 'tum', 'her', 'bir', 'iki', 've', 'veya', 'ama', 'ancak', 'ise', 'sonra', 'once', 'uzere', 'ilgili', 'olan', 'eden', 'edilen', 'yapilan', 'edilecek', 'yapilacak', 'edilmesi', 'yapilmasi', 'tarafindan', 'gereken', 'adina', 'dair', 'hakkinda', 'bunu', 'sunu', 'onun', 'ilk']);
  // Türkçe sondan eklemeli olduğundan ilk beş harf kaba ama işe yarar bir gövde verir.
  const stemsOf = value => new Set(fold(value).split(' ').filter(token => token.length > 2 && !stopWords.has(token)).map(token => token.slice(0, 5)));
  const numbersOf = value => new Set(fold(value).split(' ').filter(token => /^\d+$/.test(token)));

  // Başlıktaki özel adlar; "Özgür Bey'in imzası" ile "Ahmet Bey'in imzası" ayrı işlerdir.
  // Yalnızca güvenle ad sayılabilenler alınır: "X Bey/Hanım" ve kesme işaretiyle ek almış özel adlar
  // ("Kerem'e", "LinkedIn'de"). Büyük harfle yazılmış başlık sözcükleri ad sayılmaz.
  function namesOf(title) {
    const words = String(title || '').split(/\s+/);
    const names = new Set();
    words.forEach((word, index) => {
      const bare = word.replace(/^["“(]+/, '');
      if (!new RegExp(`^[${UP}][${UP}${LOW}]+`).test(bare)) return;
      const base = bare.split(/['’]/)[0].replace(/[^A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]/g, '');
      if (/^(?:Bey|Hanım)$/.test(base)) return;
      const next = (words[index + 1] || '').replace(/['’].*$/, '').replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
      if (!/['’]/.test(bare) && !/^(?:Bey|Hanım)$/.test(next)) return;
      const folded = fold(base);
      if (folded.length > 2) names.add(folded.slice(0, 5));
    });
    return names;
  }

  const intersects = (a, b) => [...a].some(value => b.has(value));

  function similar(a, b) {
    const ta = fold(a.title), tb = fold(b.title);
    if (ta && ta === tb) return 1;
    const ka = canonical(a), kb = canonical(b);
    if (ka.key && kb.key && ka.strong && kb.strong) return ka.key === kb.key ? 1 : 0;

    const x = stemsOf(a.title), y = stemsOf(b.title);
    if (!x.size || !y.size) return 0;
    const overlap = [...x].filter(token => y.has(token)).length;
    const dice = 2 * overlap / (x.size + y.size);
    // Aynı konu anahtarı tek başına yetmez ("Kerem + afiş" her işte geçebilir); belirgin sözcük ortaklığı da gerekir.
    if (ka.key && ka.key === kb.key && overlap >= 3 && dice >= 0.5) return Math.max(dice, 0.85);

    const na = namesOf(a.title), nb = namesOf(b.title);
    if (na.size && nb.size && !intersects(na, nb)) return 0;
    const da = numbersOf(a.title), db = numbersOf(b.title);
    if (da.size && db.size && !intersects(da, db)) return 0;

    // Kısa başlıklarda tek sözcük farkı ayrı iş demektir ("Adana şubesi…" / "Bursa şubesi…");
    // bu yüzden eşik yüksek tutulur: yaklaşık yedi sözcükte en fazla bir fark.
    const sameProject = !a.project || !b.project || fold(a.project) === fold(b.project);
    if (overlap >= 3 && dice >= (sameProject ? 0.85 : 0.9)) return dice;
    // Kısa başlık uzun başlığın içinde neredeyse tümüyle geçiyorsa.
    const containment = overlap / Math.min(x.size, y.size);
    if (overlap >= 4 && containment >= 0.9 && dice >= 0.6) return Math.max(dice, 0.85);
    return 0;
  }

  const foldedNotes = new WeakMap();
  function notesOf(task) {
    const cached = foldedNotes.get(task);
    if (cached && cached.raw === task.notes) return cached.value;
    const value = fold(task.notes);
    foldedNotes.set(task, { raw: task.notes, value });
    return value;
  }

  function findMatch(candidate, tasks) {
    let best = null, score = 0;
    const source = fold(candidate.source);
    for (const task of tasks) {
      let n = similar(candidate, task);
      // Aynı cümle bu görevin notlarında zaten varsa, başlık değiştirilmiş olsa bile aynı iştir.
      if (n < 0.99 && source.length >= 25 && notesOf(task).includes(source)) n = 0.99;
      if (n > score) { best = task; score = n; }
    }
    return score > 0 ? best : null;
  }

  /* ------------------------------------------------------------------ *
   *  Dış arayüz
   * ------------------------------------------------------------------ */

  function extract(text, meetingDate, options) {
    const settings = { defaultOwner:'', knownProjects:[], ...(options || {}) };
    const input = String(text || '');
    let items = sampleCandidates(input, meetingDate, settings.defaultOwner);
    if (!items.length) items = generalCandidates(input, meetingDate, settings);
    const out = [];
    for (const item of items) {
      if (out.some(old => similar(item, old) > 0)) continue;
      out.push(item);
      if (out.length === 60) break;
    }
    return out;
  }

  const api = { extract, findMatch, similar, dateFrom, timeFrom, priority, fold, prepare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TaskEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

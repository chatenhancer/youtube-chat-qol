---
locale: tr
title: "Gizlilik politikası"
description: "Chat Enhancer for YouTube yerel depolamayı, çeviriyi, Playground verilerini ve gizlilik kontrollerini nasıl işler."
---

# Gizlilik

Son güncelleme: 24 Temmuz 2026

Chat Enhancer for YouTube, YouTube canlı sohbeti için bir tarayıcı uzantısıdır. YouTube sohbetinin yerini almadan veya analitik toplamadan küçük sohbet özellikleri eklemek için tasarlanmıştır.

Kısa sürüm:

- Uzantı özelliklerinin çoğu tarayıcınızda yerel olarak çalışır.
- Çeviri varsayılan olarak kapalıdır.
- Çeviri etkinleştirildiğinde, çevrilen metin Google Translate’e gönderilir.
- Playground oyunları varsayılan olarak kapalıdır. Playground’u etkinleştirip kullanırsanız oyun varlığı, davetler ve oyun eylemleri oluşturulmuş bir oyuncu adı altında Chat Enhancer Playground oyun sunucusuna gönderilir.
- Uzantı analitik çalıştırmaz, veri satmaz ve gezinme geçmişi toplamaz.

## Uzantının çalıştığı yer

Uzantı yalnızca erişmesine izin verilen YouTube canlı sohbet ve canlı sohbet tekrar sayfalarında çalışır.

Uzantı, kendi ayarlarını ve verilerini tarayıcınızda kaydetmek için izin kullanır. Ayrıca özelliklerinin çalışması için gereken belirli web sitelerine erişim kullanır: YouTube canlı sohbet sayfaları, Google Translate’in çeviri hizmeti ve isteğe bağlı Chat Enhancer Playground oyun sunucusu.

Uzantı genel gezinme geçmişi, sekme okuma, scripting veya web navigation izinleri istemez.

## Tarayıcınızda saklanan veriler

Uzantı, özelliklerinin sayfa yenilemeleri arasında çalışabilmesi için bazı verileri saklar.

Aşağıda aksi belirtilmedikçe bu bölümdeki veriler tarayıcı profilinizde kalır ve Chat Enhancer’a gönderilmez. Tarayıcınız, uzantı ayarlarını oturum açtığınız kendi tarayıcı kurulumlarınız arasında senkronize edebilir.

- **Ayarlar:** özellik seçimleriniz ve tercihleriniz.

- **Inbox verileri:** izlenen anahtar kelimeler ve stream veya tekrar başına en fazla 100 inbox kaydı. Inbox kayıtları mesaj metni, yazar adı, zaman damgası, kaydedilen mesajın nereden geldiğini göstermek için gereken temel YouTube mesaj ayrıntıları, eşleşme ayrıntıları ve kaydedilen mesajı doğru göstermek için gereken emoji veya görsel bilgilerini içerebilir.

- **Sık kullanılan emoji verileri:** sık kullanılan emoji satırını oluşturmak için kullanılan yerel kullanım sayaçları ve emoji görüntüleme bilgileri.

- **Yer işareti verileri:** kaydedilen mesaj metni ve emoji görüntüleme bilgileri, yazarın adı, avatar URL’si ve varsa kanal ID’si, mesaj ve kaydetme zamanları ile yayın başlığı ve URL’si. Yer işaretleri mevcut tarayıcı profilinde yayınlar arasında kullanılabilir kalır.

- **Avatar halkası verileri:** son mesajlar profilinden açıkça halka eklediğiniz kullanıcıların yazar adı, halkanın eklendiği zaman, yayın URL’si ve varsa avatar URL’si, kanal ID’si ve yayın başlığı. Seçim mevcut tarayıcı profilinde yayınlar arasında kullanılabilir kalır ve yalnızca eşleşen avatarları süslemek için kullanılır.

- **Gönderilmemiş sohbet taslakları:** her stream için ayrı kaydedilir ve sayfa yenilemesinden sonra geri yüklenir. Taslaklar sohbet girişi temizlendiğinde, mesaj gönderildiğinde veya uzantı verileri sıfırlandığında kaldırılır.

- **Playground kimlik verileri:** Playground kullanılırsa oluşturulan rastgele bir yerel kimlik. Playground’a yeniden bağlandığında aynı tarayıcı kurulumunu tanır. Bu sizin YouTube kimliğiniz değildir.

- **Geçici sayfa verileri:** son profil mesajları, komut durumu ve çeviri sonuçları yalnızca mevcut canlı sohbet sayfası için bellekte tutulur. Sohbet sayfasından ayrıldığınızda veya sayfayı yenilediğinizde temizlenir.

## Tarayıcınızın dışına gönderilen veriler

Veriler bu hizmetlere yalnızca ilgili özellik etkinleştirilip kullanıldığında gönderilir:

### Google Translate (`translate-pa.googleapis.com`)

Sohbet çevirisi, çeviri etkinken canlı sohbette görünen ve çevrilmeye uygun sohbet mesajı metnini gönderir. Taslak çevirisi, sohbet kutusundan çevirmeyi seçtiğiniz taslak metni gönderir.

Çeviri istekleri çevrilecek metni ve hedef dili içerir. Uzantı, çeviri istekleriyle YouTube cookies veya YouTube credentials göndermez.

`translate-pa.googleapis.com` üzerinden Google Translate erişimi resmi değildir ve rate limit’e tabi olabilir, değişebilir veya kullanılamayabilir.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Playground’u etkinleştirir ve oyun panelini kullanırsanız uzantı, aynı stream’de opt-in kullanıcıların uygunluğu görmesi, davet alışverişi yapması ve oyun oynaması için Chat Enhancer Playground oyun sunucusuna bağlanır.

Playground mesajları YouTube stream veya video tanımlayıcısını, oluşturulan Playground oyuncu kimliğinizi, oluşturulan oyuncu adınızı, mevcut oyun listenizi, davetleri ve davet yanıtlarını, satranç hamleleri gibi oyun eylemlerini içerebilir.

Playground, oyuncu istatistikleri sunabilmek için oluşturulan Playground oyuncu kimliklerine bağlı, özet maç sonuçlarını saklar. Saklanan sonuçlar oyun sürümünü, başlangıç ve bitiş zamanlarını, sonucu ve bitiş nedenini, katılımcı rollerini ve hamleler veya skorlar gibi oyuna özgü küçük istatistikleri içerebilir. Trivia soru içeriğini ya da oyunun tam durumunu içermez.

Uzantı canlı sohbet mesajı metnini, YouTube görünen adınızı, YouTube avatar URL’nizi, YouTube cookies veya YouTube credentials’ınızı Playground oyun sunucusuna göndermez.

Ayrı olarak HELP-A-FRIEND! Trivia soru üretimi, seçilen herkese açık YouTube video transcript parçalarını ve oyun tanımlayıcılarını Playground oyun sunucusuna gönderebilir. Bu parçalar canlı sohbetten değil, videonun transcript’inden gelir. Sunucu, bu parçalardan trivia soruları üretmek için OpenAI kullanır.

Replay Trivia üretimi [playground.chatenhancer.com](https://playground.chatenhancer.com) üzerinde Cloudflare Turnstile doğrulaması gerektirebilir. Cloudflare, IP adresi, tarayıcı ve cihaz bilgileri ve challenge sonucu gibi normal doğrulama verilerini alabilir.

Her web hizmeti gibi Playground oyun sunucusu da tarayıcıdan veya ağ sağlayıcısından IP adresi ve tarayıcı/cihaz bilgileri gibi normal bağlantı bilgileri alabilir.

## Veri kontrolleri

Uzantı verilerini uzantı popup’ındaki sıfırlama düğmesini kullanarak temizleyebilirsiniz. Bu, yerel uzantı verilerini ve senkronize uzantı ayarlarını temizler, ardından varsayılan ayarları geri yükler.

Uzantıyı tarayıcınızdan da kaldırabilirsiniz. Tarayıcıya bağlı olarak uzantıyı kaldırmak yerel uzantı depolamasını da kaldırabilir.

Uzantıyı sıfırlamak veya kaldırmak, Playground tarafından daha önce saklanan maç sonuçlarını tek başına silmez.

## Uzantının yapmadıkları

- Analitik çalıştırmak.
- Gezinme geçmişi toplamak.
- Kullanıcı verisi satmak.
- Yukarıda açıklanan opt-in Playground özelliklerini kullanmadığınız sürece bir Chat Enhancer sunucusuna veri göndermek.

## Sorular

Gizlilik soruları için [destekle iletişime geçin](https://www.chatenhancer.com/tr/support).

Chat Enhancer for YouTube, YouTube veya Google ile bağlantılı değildir.

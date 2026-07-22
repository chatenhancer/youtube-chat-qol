---
locale: tr
title: "Gizlilik politikası"
description: "Chat Enhancer for YouTube yerel depolamayı, çeviriyi, Playground verilerini ve gizlilik kontrollerini nasıl işler."
---

# Gizlilik

Son güncelleme: 21 Haziran 2026

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

Bu bölümde listelenen veriler uzantı tarafından kendi tarayıcı profilinizde saklanır. Aşağıdaki "Tarayıcınızın dışına gönderilen veriler" bölümünde de listelenmediği sürece Chat Enhancer’a gönderilmez.

- **Ayarlar:** tarayıcının senkronize uzantı depolaması (`chrome.storage.sync`) kullanılarak kaydedilir. Tarayıcı ayarlarınıza bağlı olarak tarayıcı, bu uzantı ayarlarını kendi oturum açtığınız tarayıcı kurulumlarınız arasında senkronize edebilir.

- **Inbox verileri:** yerel uzantı depolaması (`chrome.storage.local`) kullanılarak kaydedilir. Bu, izlenen anahtar kelimeleri ve stream veya tekrar başına en fazla 100 inbox kaydını içerir. Inbox kayıtları mesaj metni, yazar adı, zaman damgası, kaydedilen mesajın nereden geldiğini göstermek için gereken temel YouTube mesaj ayrıntıları, eşleşme ayrıntıları ve kaydedilen mesajı doğru göstermek için gereken emoji veya görsel bilgilerini içerebilir.

- **Sık kullanılan emoji verileri:** yerel uzantı depolaması (`chrome.storage.local`) kullanılarak kaydedilir. Bu, sık kullanılan emoji satırını oluşturmak için kullanılan yerel kullanım sayaçlarını ve emoji görüntüleme bilgilerini içerir.

- **Yer işareti verileri:** yerel uzantı depolamasında (`chrome.storage.local`) saklanır. Kaydedilen mesaj metni ve emoji görüntüleme bilgileri, yazarın adı, avatar URL’si ve varsa kanal ID’si, mesaj ve kaydetme zamanları ile yayın başlığı ve URL’sini içerebilir. Yer işaretleri mevcut tarayıcı profilinde yayınlar arasında kullanılabilir kalır.

- **Avatar halkası verileri:** yerel uzantı depolamasında (`chrome.storage.local`) saklanır. Son mesajlar profilinden açıkça halka eklediğiniz kullanıcıların yazar adını, varsa kanal ID’sini ve halkanın eklendiği zamanı içerir. Seçim mevcut tarayıcı profilinde yayınlar arasında kullanılabilir kalır ve yalnızca eşleşen avatarları süslemek için kullanılır; kullanıcının çevrimiçi olup olmadığını kontrol etmez.

- **Gönderilmemiş sohbet taslakları:** stream başına yerel uzantı depolaması (`chrome.storage.local`) kullanılarak kaydedilir. Sayfa yenilemesinden sonra geri yüklenir. Taslaklar sohbet girişi temizlendiğinde, mesaj gönderildiğinde veya uzantı verileri sıfırlandığında kaldırılır.

- **Playground kimlik verileri:** Playground kullanılırsa yerel uzantı depolaması (`chrome.storage.local`) kullanılarak kaydedilir. Bu, Playground’a yeniden bağlandığında aynı tarayıcı kurulumunu tanımak için kullanılan rastgele oluşturulmuş yerel Playground kimliğidir. Bu sizin YouTube kimliğiniz değildir.

- **Son profil mesajları, komut durumu ve çeviri sonuçları:** yalnızca mevcut canlı sohbet sayfası için bellekte tutulur. Sohbet sayfasından ayrıldığınızda veya sayfayı yenilediğinizde temizlenir.

## Tarayıcınızın dışına gönderilen veriler

Sohbet çevirisi, taslak çevirisi ve Playground oyunları varsayılan olarak kapalıdır.

Çeviri veya Playground özellikleri etkinleştirilip kullanıldığında veriler şu hizmetlere gönderilebilir:

- **`https://translate.googleapis.com/translate_a/single` adresindeki Google Translate**

  Sohbet çevirisi, çeviri etkinken canlı sohbette görünen ve çevrilmeye uygun sohbet mesajı metnini gönderir. Taslak çevirisi, sohbet kutusundan çevirmeyi seçtiğiniz taslak metni gönderir.

  Çeviri istekleri çevrilecek metni ve hedef dili içerir. Uzantı, çeviri istekleriyle YouTube cookies veya YouTube credentials göndermez.

  `translate.googleapis.com` üzerinden Google Translate erişimi resmi değildir ve rate limit’e tabi olabilir, değişebilir veya kullanılamayabilir.

- <span id="playground"></span>**`https://playground.chatenhancer.com` adresindeki Chat Enhancer Playground**

  Playground varsayılan olarak kapalıdır. Playground’u etkinleştirir ve oyun panelini kullanırsanız uzantı, aynı stream’de opt-in kullanıcıların uygunluğu görmesi, davet alışverişi yapması ve oyun oynaması için Chat Enhancer Playground oyun sunucusuna bağlanır.

  Playground mesajları YouTube stream veya video tanımlayıcısını, oluşturulan Playground oyuncu kimliğinizi, oluşturulan oyuncu adınızı, mevcut oyun listenizi, davetleri ve davet yanıtlarını, satranç hamleleri gibi oyun eylemlerini içerebilir.

  Playground canlı sohbet mesajı metnini, YouTube görünen adınızı, YouTube avatar URL’nizi, YouTube cookies veya YouTube credentials’ınızı Playground oyun sunucusuna göndermez.

  Ayrı olarak HELP-A-FRIEND! Trivia soru üretimi, seçilen herkese açık YouTube video transcript parçalarını ve oyun tanımlayıcılarını Playground oyun sunucusuna gönderebilir. Bu parçalar canlı sohbetten değil, videonun transcript’inden gelir. Sunucu, bu parçalardan trivia soruları üretmek için OpenAI kullanır.

  Replay Trivia üretimi `https://playground.chatenhancer.com` üzerinde Cloudflare Turnstile doğrulaması gerektirebilir. Cloudflare, IP adresi, tarayıcı ve cihaz bilgileri ve challenge sonucu gibi normal doğrulama verilerini alabilir.

  Her web hizmeti gibi Playground oyun sunucusu da tarayıcıdan veya ağ sağlayıcısından IP adresi ve tarayıcı/cihaz bilgileri gibi normal bağlantı bilgileri alabilir.

## Veri kontrolleri

Uzantı verilerini uzantı popup’ındaki sıfırlama düğmesini kullanarak temizleyebilirsiniz. Bu, yerel uzantı verilerini ve senkronize uzantı ayarlarını temizler, ardından varsayılan ayarları geri yükler.

Uzantıyı tarayıcınızdan da kaldırabilirsiniz. Tarayıcıya bağlı olarak uzantıyı kaldırmak yerel uzantı depolamasını da kaldırabilir.

## Chat Enhancer’ın yapmadıkları

Uzantı analitik çalıştırmaz.

Uzantı gezinme geçmişi toplamaz.

Uzantı kullanıcı verisi satmaz.

Yukarıda açıklanan opt-in Playground özellikleri dışında, uzantı bir Chat Enhancer sunucusuna veri göndermez.

Uzantı, canlı sohbet sayfasından ayrıldıktan veya sayfayı yeniledikten sonra son profil mesajlarını veya çeviri sonuçlarını saklamaz.

Chat Enhancer for YouTube, YouTube veya Google ile bağlantılı değildir.

Gizlilik soruları için https://www.chatenhancer.com adresindeki e-posta bağlantısını kullanın.

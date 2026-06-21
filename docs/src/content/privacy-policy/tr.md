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
- Playground oyunları varsayılan olarak kapalıdır. Playground’u etkinleştirip kullanırsanız oyun varlığı, davetler ve oyun eylemleri oluşturulmuş bir oyuncu adı altında Chat Enhancer Playground backend’ine gönderilir.
- Uzantı analitik çalıştırmaz, veri satmaz ve gezinme geçmişi toplamaz.

## Uzantının çalıştığı yer

Uzantı yalnızca uzantı manifest’iyle eşleşen YouTube canlı sohbet ve canlı sohbet tekrar sayfalarında çalışır.

Uzantı, tarayıcı `storage` iznini ve YouTube canlı sohbet sayfaları, Google’ın çeviri endpoint’i ve isteğe bağlı Playground backend’i için host erişimini kullanır. Genel gezinme geçmişi, sekme okuma, scripting veya web navigation izinleri istemez.

## Tarayıcınızda saklanan veriler

Uzantı, özelliklerinin sayfa yenilemeleri arasında çalışabilmesi için bazı verileri saklar.

- **Ayarlar `chrome.storage.sync` ile saklanır:** tarayıcı ayarlarınıza bağlı olarak tarayıcı, bu uzantı ayarlarını kendi oturum açtığınız tarayıcı kurulumlarınız arasında senkronize edebilir.

- **Inbox verileri `chrome.storage.local` ile saklanır:** bu, izlenen anahtar kelimeleri ve stream veya tekrar başına en fazla 100 inbox kaydını içerir. Inbox kayıtları mesaj metni, yazar adı, zaman damgası, YouTube mesaj/kaynak metadata’sı, eşleşme metadata’sı ve kaydedilen mesajı göstermek için gereken emoji/görsel görüntüleme verilerini içerebilir.

- **Sık kullanılan emoji verileri `chrome.storage.local` ile saklanır:** bu, sık kullanılan emoji satırını oluşturmak için kullanılan yerel kullanım sayaçlarını ve emoji görüntüleme metadata’sını içerir.

- **Yer işaretli kullanıcı verileri `chrome.storage.local` ile saklanır:** bu, yer işaretli kullanıcının handle’ını, varsa kanal ID’sini ve yer işaretinin oluşturulduğu zamanı içerir. Yer işaretli kullanıcılar mevcut tarayıcı profilindeki stream’ler arasında geneldir ve renkli avatar halkaları göstermek için kullanılır.

- **Gönderilmemiş sohbet taslakları stream başına `chrome.storage.local` ile saklanır:** sayfa yenilemesinden sonra geri yüklenir. Taslaklar sohbet girişi temizlendiğinde, mesaj gönderildiğinde veya uzantı verileri sıfırlandığında kaldırılır.

- **Playground kullanılırsa Playground kimlik verileri `chrome.storage.local` ile saklanır:** bu, aynı tarayıcı kurulumunun aynı takma adlı Playground kimliğini koruyabilmesi için Playground bağlantı challenge’larını imzalamada kullanılan oluşturulmuş bir public/private key çiftidir. Bu sizin YouTube kimliğiniz değildir.

- **Son profil mesajları, komut durumu ve çeviri sonuçları yalnızca mevcut canlı sohbet sayfası için bellekte tutulur. Sayfa unload olduğunda temizlenir.**

## Tarayıcınızın dışına gönderilen veriler

Sohbet çevirisi ve taslak çevirisi varsayılan olarak kapalıdır.

Çeviri veya Playground özellikleri etkinleştirildiğinde veriler şu hizmetlere gönderilebilir:

- **`https://translate.googleapis.com/translate_a/single` adresindeki Google Translate**

  Sohbet çevirisi uygun görünen ve gelen sohbet mesajı metinlerini gönderir. Taslak çevirisi, sohbet kutusundan çevirmeyi seçtiğiniz taslak metni gönderir.

  Çeviri istekleri çevrilecek metni ve hedef dili içerir. Uzantı, çeviri istekleriyle YouTube cookies veya YouTube credentials göndermez.

  `translate.googleapis.com` üzerinden Google Translate erişimi resmi değildir ve rate limit’e tabi olabilir, değişebilir veya kullanılamayabilir.

- **`https://playground.chatenhancer.com` adresindeki Chat Enhancer Playground**

  Playground varsayılan olarak kapalıdır. Playground’u etkinleştirir ve oyun panelini kullanırsanız uzantı, aynı stream’de opt-in kullanıcıların uygunluğu görmesi, davet alışverişi yapması ve oyun oynaması için Playground backend’ine bağlanır.

  Playground mesajları stream/video anahtarını, oluşturulan Playground public key ve imzanızı, oluşturulan oyuncu adınızı, mevcut oyun listenizi, davetleri ve davet yanıtlarını, satranç hamleleri gibi oyun eylemlerini içerebilir.

  HELP-A-FRIEND! Trivia soru üretimi, seçilen YouTube replay transcript parçalarını ve oyun tanımlayıcılarını Playground backend’ine gönderebilir. Backend, bu parçalardan trivia soruları üretmek için OpenAI kullanır.

  Replay Trivia üretimi `https://playground.chatenhancer.com` üzerinde Cloudflare Turnstile doğrulaması gerektirebilir. Cloudflare, IP adresi, user agent ve challenge sonucu gibi normal doğrulama verilerini alabilir.

  Playground canlı sohbet mesajı metnini, YouTube görünen adınızı, YouTube avatar URL’nizi, YouTube cookies veya YouTube credentials’ınızı Playground backend’ine göndermez.

  Her web hizmeti gibi Playground backend’i de tarayıcıdan veya ağ sağlayıcısından IP adresi ve user agent gibi normal bağlantı metadata’sı alabilir.

## Veri kontrolleri

Uzantı verilerini uzantı popup’ındaki sıfırlama düğmesini kullanarak temizleyebilirsiniz. Bu, yerel uzantı verilerini ve senkronize uzantı ayarlarını temizler, ardından varsayılan ayarları geri yükler.

Uzantıyı tarayıcınızdan da kaldırabilirsiniz. Tarayıcıya bağlı olarak uzantıyı kaldırmak yerel uzantı depolamasını da kaldırabilir.

## Toplanmayanlar

Uzantı analitik çalıştırmaz.

Uzantı gezinme geçmişi toplamaz.

Uzantı kullanıcı verisi satmaz.

Yukarıda açıklanan opt-in Playground oyunları dışında, uzantı uzantıya ait bir sunucuya veri göndermez.

Uzantı, canlı sohbet sayfası unload olduktan sonra son profil mesajlarını veya çeviri sonuçlarını saklamaz.

Chat Enhancer for YouTube, YouTube veya Google ile bağlantılı değildir.

Gizlilik soruları için https://www.chatenhancer.com adresindeki e-posta bağlantısını kullanın.

---
locale: hi
title: "गोपनीयता नीति"
description: "Chat Enhancer for YouTube स्थानीय संग्रहण, अनुवाद, Playground डेटा और गोपनीयता नियंत्रणों को कैसे संभालता है।"
---

# गोपनीयता

अंतिम अपडेट: 21 जून 2026

Chat Enhancer for YouTube, YouTube लाइव चैट के लिए एक ब्राउज़र एक्सटेंशन है। इसे YouTube चैट को बदले बिना या एनालिटिक्स इकट्ठा किए बिना छोटे चैट फीचर जोड़ने के लिए बनाया गया है।

संक्षेप में:

- एक्सटेंशन की अधिकांश सुविधाएँ आपके ब्राउज़र में स्थानीय रूप से चलती हैं।
- अनुवाद डिफ़ॉल्ट रूप से बंद है।
- जब अनुवाद चालू होता है, अनुवाद किया जा रहा टेक्स्ट Google Translate को भेजा जाता है।
- Playground गेम डिफ़ॉल्ट रूप से बंद हैं। यदि आप Playground चालू करके उसका उपयोग करते हैं, तो गेम उपस्थिति, आमंत्रण और गेम कार्रवाइयाँ एक जनरेट किए गए खिलाड़ी नाम के तहत Chat Enhancer Playground game server को भेजी जाती हैं।
- एक्सटेंशन एनालिटिक्स नहीं चलाता, डेटा नहीं बेचता और ब्राउज़िंग इतिहास इकट्ठा नहीं करता।

## एक्सटेंशन कहाँ चलता है

एक्सटेंशन केवल उन YouTube लाइव चैट और लाइव चैट रीप्ले पेजों पर चलता है जिन्हें एक्सटेंशन को access करने की अनुमति है।

एक्सटेंशन आपके ब्राउज़र में अपनी settings और data save करने की अनुमति का उपयोग करता है। यह अपनी सुविधाओं के काम करने के लिए ज़रूरी खास websites तक access भी उपयोग करता है: YouTube लाइव चैट पेज, Google Translate की translation service, और opt-in Chat Enhancer Playground game server.

एक्सटेंशन सामान्य ब्राउज़िंग-इतिहास, टैब-पढ़ने, scripting या web-navigation अनुमतियाँ नहीं मांगता।

## आपके ब्राउज़र में संग्रहीत डेटा

एक्सटेंशन कुछ डेटा संग्रहीत करता है ताकि इसके फीचर पेज reload के बीच काम कर सकें।

इस section में सूचीबद्ध data एक्सटेंशन द्वारा आपके अपने browser profile में stored होता है। यह Chat Enhancer को नहीं भेजा जाता, जब तक कि यह नीचे "आपके ब्राउज़र के बाहर भेजा गया डेटा" section में भी listed न हो।

- **सेटिंग्स:** browser के synced extension storage (`chrome.storage.sync`) में saved होती हैं। आपकी ब्राउज़र सेटिंग्स के आधार पर, ब्राउज़र उन एक्सटेंशन सेटिंग्स को आपके अपने signed-in ब्राउज़र installs के बीच sync कर सकता है।

- **Inbox डेटा:** local extension storage (`chrome.storage.local`) में saved होता है। इसमें watched keywords और प्रति stream या replay अधिकतम 100 inbox records शामिल हैं। Inbox records में message text, author name, timestamp, saved message कहाँ से आया यह दिखाने के लिए आवश्यक basic YouTube message details, match details, और saved message को सही ढंग से दिखाने के लिए आवश्यक emoji या image information शामिल हो सकती है।

- **Frequent emoji डेटा:** local extension storage (`chrome.storage.local`) में saved होता है। इसमें local usage counts और frequent emoji row बनाने के लिए उपयोग होने वाली emoji display information शामिल है।

- **बुकमार्क डेटा:** लोकल एक्सटेंशन स्टोरेज (`chrome.storage.local`) में सहेजा जाता है। इसमें सहेजे गए संदेश का टेक्स्ट और इमोजी दिखाने की जानकारी, लेखक का नाम, अवतार URL और उपलब्ध होने पर चैनल ID, संदेश और सहेजने का समय, तथा स्ट्रीम का शीर्षक और URL शामिल हो सकते हैं। बुकमार्क मौजूदा ब्राउज़र प्रोफ़ाइल में अलग-अलग स्ट्रीम पर उपलब्ध रहते हैं।

- **अवतार रिंग डेटा:** लोकल एक्सटेंशन स्टोरेज (`chrome.storage.local`) में सहेजा जाता है। इसमें उन उपयोगकर्ताओं का लेखक नाम, उपलब्ध होने पर चैनल ID और रिंग जोड़े जाने का समय शामिल है, जिनके हालिया संदेश प्रोफ़ाइल से आप साफ़ तौर पर अवतार रिंग जोड़ते हैं। यह चयन मौजूदा ब्राउज़र प्रोफ़ाइल में अलग-अलग स्ट्रीम पर उपलब्ध रहता है और केवल मिलते-जुलते अवतार सजाने के लिए इस्तेमाल होता है; यह यह जाँच नहीं करता कि कोई उपयोगकर्ता ऑनलाइन है या नहीं।

- **Unsent chat drafts:** प्रति stream local extension storage (`chrome.storage.local`) में saved होते हैं। वे page refresh के बाद restore होते हैं। Drafts तब हटते हैं जब chat input साफ किया जाता है, message भेजा जाता है, या extension data reset किया जाता है।

- **Playground identity data:** यदि Playground उपयोग किया जाता है, तो local extension storage (`chrome.storage.local`) में saved होता है। यह randomly generated local Playground identity है जिसका उपयोग Playground से reconnect करने पर उसी browser install को पहचानने के लिए किया जाता है। यह आपकी YouTube identity नहीं है।

- **Recent profile messages, command state, और translation results:** केवल वर्तमान live chat page के लिए memory में रखे जाते हैं। Chat page छोड़ने या refresh करने पर वे साफ हो जाते हैं।

## आपके ब्राउज़र के बाहर भेजा गया डेटा

Chat translation, draft translation, और Playground games डिफ़ॉल्ट रूप से बंद हैं।

जब translation या Playground features चालू और उपयोग किए जाते हैं, डेटा इन सेवाओं को भेजा जा सकता है:

- **Google Translate at `https://translate.googleapis.com/translate_a/single`**

  Chat translation उस chat message text को भेजता है जो live chat में visible है और translation चालू होने के दौरान translation के लिए eligible है। Draft translation वह draft text भेजता है जिसे आप chat box से translate करना चुनते हैं।

  Translation requests में translate करने वाला text और target language शामिल होते हैं। एक्सटेंशन translation requests के साथ आपकी YouTube cookies या YouTube credentials नहीं भेजता।

  `translate.googleapis.com` के माध्यम से Google Translate access unofficial है और rate-limited, changed या unavailable हो सकता है।

- <span id="playground"></span>**Chat Enhancer Playground at `https://playground.chatenhancer.com`**

  Playground डिफ़ॉल्ट रूप से बंद है। यदि आप Playground चालू करते हैं और games panel का उपयोग करते हैं, तो extension Chat Enhancer Playground game server से connect होता है ताकि उसी stream में opted-in users availability देख सकें, invites exchange कर सकें और games खेल सकें।

  Playground messages में YouTube stream या video identifier, आपकी generated Playground player identity, आपका generated player name, आपकी available game list, invites और invite responses, तथा chess moves जैसी game actions शामिल हो सकती हैं।

  Playground live chat message text, आपका YouTube display name, आपका YouTube avatar URL, YouTube cookies, या YouTube credentials Playground game server को नहीं भेजता।

  अलग से, HELP-A-FRIEND! Trivia question generation चयनित public YouTube video transcript excerpts और game identifiers को Playground game server को भेज सकता है। ये excerpts video के transcript से आते हैं, live chat से नहीं। Server उन excerpts से trivia questions generate करने के लिए OpenAI का उपयोग करता है।

  Replay Trivia generation को `https://playground.chatenhancer.com` पर Cloudflare Turnstile verification की आवश्यकता हो सकती है। Cloudflare सामान्य verification data जैसे IP address, browser और device information, और challenge result प्राप्त कर सकता है।

  किसी भी web service की तरह, Playground game server browser या network provider से सामान्य connection information जैसे IP address और browser/device information प्राप्त कर सकता है।

## डेटा नियंत्रण

आप extension popup में reset button का उपयोग करके extension data साफ कर सकते हैं। यह local extension data और synced extension settings को साफ करता है, फिर default settings restore करता है।

आप अपने browser से extension भी हटा सकते हैं। Browser के आधार पर, extension हटाने से उसका local extension storage भी हट सकता है।

## Chat Enhancer क्या नहीं करता

एक्सटेंशन analytics नहीं चलाता।

एक्सटेंशन browsing history इकट्ठा नहीं करता।

एक्सटेंशन user data नहीं बेचता।

ऊपर वर्णित opt-in Playground features को छोड़कर, extension किसी Chat Enhancer server को data नहीं भेजता।

Live chat page छोड़ने या refresh करने के बाद extension recent profile messages या translation results संग्रहीत नहीं करता।

Chat Enhancer for YouTube, YouTube या Google से संबद्ध नहीं है।

गोपनीयता संबंधी प्रश्नों के लिए, https://www.chatenhancer.com पर email link का उपयोग करें।

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
- Playground गेम डिफ़ॉल्ट रूप से बंद हैं। यदि आप Playground चालू करके उसका उपयोग करते हैं, तो गेम उपस्थिति, आमंत्रण और गेम कार्रवाइयाँ एक जनरेट किए गए खिलाड़ी नाम के तहत Chat Enhancer Playground backend को भेजी जाती हैं।
- एक्सटेंशन एनालिटिक्स नहीं चलाता, डेटा नहीं बेचता और ब्राउज़िंग इतिहास इकट्ठा नहीं करता।

## एक्सटेंशन कहाँ चलता है

एक्सटेंशन केवल उन YouTube लाइव चैट और लाइव चैट रीप्ले पेजों पर चलता है जो एक्सटेंशन manifest से मेल खाते हैं।

एक्सटेंशन ब्राउज़र की `storage` अनुमति का उपयोग करता है, साथ ही YouTube लाइव चैट पेजों, Google के अनुवाद endpoint और opt-in Playground backend के लिए host access का उपयोग करता है। यह सामान्य ब्राउज़िंग-इतिहास, टैब-पढ़ने, scripting या web-navigation अनुमतियाँ नहीं मांगता।

## आपके ब्राउज़र में संग्रहीत डेटा

एक्सटेंशन कुछ डेटा संग्रहीत करता है ताकि इसके फीचर पेज reload के बीच काम कर सकें।

- **सेटिंग्स `chrome.storage.sync` में संग्रहीत होती हैं:** आपकी ब्राउज़र सेटिंग्स के आधार पर, ब्राउज़र उन एक्सटेंशन सेटिंग्स को आपके अपने signed-in ब्राउज़र installs के बीच sync कर सकता है।

- **Inbox डेटा `chrome.storage.local` में संग्रहीत होता है:** इसमें watched keywords और प्रति stream या replay अधिकतम 100 inbox records शामिल हैं। Inbox records में message text, author name, timestamp, YouTube message/source metadata, match metadata, और saved message दिखाने के लिए आवश्यक emoji/image display data शामिल हो सकते हैं।

- **Frequent emoji डेटा `chrome.storage.local` में संग्रहीत होता है:** इसमें local usage counts और frequent emoji row बनाने के लिए उपयोग होने वाला emoji display metadata शामिल है।

- **Bookmarked user डेटा `chrome.storage.local` में संग्रहीत होता है:** इसमें bookmarked user का handle, उपलब्ध होने पर channel ID, और bookmark बनाए जाने का समय शामिल है। Bookmarked users मौजूदा browser profile में streams के बीच global होते हैं और colored avatar rings दिखाने के लिए उपयोग होते हैं।

- **Unsent chat drafts प्रति stream `chrome.storage.local` में संग्रहीत होते हैं:** वे page refresh के बाद restore होते हैं। Drafts तब हटते हैं जब chat input साफ किया जाता है, message भेजा जाता है, या extension data reset किया जाता है।

- **यदि Playground उपयोग किया जाता है, तो Playground identity data `chrome.storage.local` में संग्रहीत होता है:** यह Playground connection challenges पर signature करने के लिए generated public/private key pair है, ताकि वही browser install वही pseudonymous Playground identity रख सके। यह आपकी YouTube identity नहीं है।

- **Recent profile messages, command state, और translation results केवल वर्तमान live chat page के लिए memory में रखे जाते हैं। Page unload होने पर वे साफ हो जाते हैं।**

## आपके ब्राउज़र के बाहर भेजा गया डेटा

Chat translation और draft translation डिफ़ॉल्ट रूप से बंद हैं।

जब translation या Playground features चालू होते हैं, डेटा इन सेवाओं को भेजा जा सकता है:

- **Google Translate at `https://translate.googleapis.com/translate_a/single`**

  Chat translation योग्य visible और incoming chat message text भेजता है। Draft translation वह draft text भेजता है जिसे आप chat box से translate करना चुनते हैं।

  Translation requests में translate करने वाला text और target language शामिल होते हैं। एक्सटेंशन translation requests के साथ आपकी YouTube cookies या YouTube credentials नहीं भेजता।

  `translate.googleapis.com` के माध्यम से Google Translate access unofficial है और rate-limited, changed या unavailable हो सकता है।

- **Chat Enhancer Playground at `https://playground.chatenhancer.com`**

  Playground डिफ़ॉल्ट रूप से बंद है। यदि आप Playground चालू करते हैं और games panel का उपयोग करते हैं, तो extension Playground backend से connect होता है ताकि उसी stream में opted-in users availability देख सकें, invites exchange कर सकें और games खेल सकें।

  Playground messages में stream/video key, आपकी generated Playground public key और signature, आपका generated player name, आपकी available game list, invites और invite responses, तथा chess moves जैसी game actions शामिल हो सकती हैं।

  HELP-A-FRIEND! Trivia question generation चयनित YouTube replay transcript excerpts और game identifiers को Playground backend को भेज सकता है। Backend उन excerpts से trivia questions generate करने के लिए OpenAI का उपयोग करता है।

  Replay Trivia generation को `https://playground.chatenhancer.com` पर Cloudflare Turnstile verification की आवश्यकता हो सकती है। Cloudflare सामान्य verification data जैसे IP address, user agent, और challenge result प्राप्त कर सकता है।

  Playground live chat message text, आपका YouTube display name, आपका YouTube avatar URL, YouTube cookies, या YouTube credentials Playground backend को नहीं भेजता।

  किसी भी web service की तरह, Playground backend browser या network provider से सामान्य connection metadata जैसे IP address और user agent प्राप्त कर सकता है।

## डेटा नियंत्रण

आप extension popup में reset button का उपयोग करके extension data साफ कर सकते हैं। यह local extension data और synced extension settings को साफ करता है, फिर default settings restore करता है।

आप अपने browser से extension भी हटा सकते हैं। Browser के आधार पर, extension हटाने से उसका local extension storage भी हट सकता है।

## क्या इकट्ठा नहीं किया जाता

एक्सटेंशन analytics नहीं चलाता।

एक्सटेंशन browsing history इकट्ठा नहीं करता।

एक्सटेंशन user data नहीं बेचता।

ऊपर वर्णित opt-in Playground games को छोड़कर, extension किसी extension-owned server को data नहीं भेजता।

Live chat page unload होने के बाद extension recent profile messages या translation results संग्रहीत नहीं करता।

Chat Enhancer for YouTube, YouTube या Google से संबद्ध नहीं है।

गोपनीयता संबंधी प्रश्नों के लिए, https://www.chatenhancer.com पर email link का उपयोग करें।

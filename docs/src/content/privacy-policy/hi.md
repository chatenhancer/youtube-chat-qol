---
locale: hi
title: "गोपनीयता नीति"
description: "Chat Enhancer for YouTube स्थानीय संग्रहण, अनुवाद, Playground डेटा और गोपनीयता नियंत्रणों को कैसे संभालता है।"
---

# गोपनीयता नीति

अंतिम अपडेट: 17 जून 2026

यह अनुवाद सुविधा के लिए दिया गया है। /privacy/ पर अंग्रेज़ी संस्करण मुख्य संदर्भ है।

Chat Enhancer for YouTube की अधिकांश सुविधाएँ आपके ब्राउज़र में स्थानीय रूप से चलती हैं। अनुवाद डिफ़ॉल्ट रूप से बंद है; चालू करने पर अनुवाद किया जा रहा पाठ Google Translate को भेजा जाता है। Playground गेम डिफ़ॉल्ट रूप से बंद हैं। यदि आप उन्हें चालू करके उपयोग करते हैं, तो गेम उपलब्धता, निमंत्रण और गेम क्रियाएँ बनाए गए खिलाड़ी नाम के तहत Chat Enhancer Playground backend को भेजी जाती हैं।

## ब्राउज़र में संग्रहीत डेटा

एक्सटेंशन सेटिंग, Inbox डेटा, देखे जा रहे कीवर्ड, बार-बार उपयोग होने वाले emoji, बुकमार्क किए गए उपयोगकर्ता, प्रत्येक stream के न भेजे गए chat draft और live chat tab status के लिए ब्राउज़र storage का उपयोग करता है। यदि Playground उपयोग किया जाता है तो एक छद्म Playground पहचान स्थानीय रूप से सहेजी जाती है। हाल के profile messages और translation results केवल वर्तमान live chat page की memory में रहते हैं और page छोड़ने पर मिट जाते हैं।

## ब्राउज़र के बाहर भेजा गया डेटा

डेटा केवल तब ब्राउज़र से बाहर भेजा जा सकता है जब translation या Playground सक्षम हो। Translation requests Google Translate को जाती हैं और उनमें आपके YouTube cookies या credentials शामिल नहीं होते। Playground stream/video key, generated public key और signature, generated player name, available games, invites और chess moves जैसी game actions प्राप्त कर सकता है। HELP-A-FRIEND! Trivia चुने हुए YouTube replay transcript excerpts और game identifiers को Playground backend को भेज सकता है, जो questions बनाने के लिए OpenAI का उपयोग करता है। Replay Trivia के लिए Cloudflare Turnstile verification की आवश्यकता हो सकती है, और Cloudflare सामान्य verification data जैसे IP address, user agent और challenge result प्राप्त कर सकता है।

## नियंत्रण और सीमाएँ

आप extension popup में reset button से extension data साफ़ कर सकते हैं, या browser से extension हटा सकते हैं। Extension analytics नहीं चलाता, browsing history नहीं जुटाता और user data नहीं बेचता। ऊपर बताए गए opt-in Playground games को छोड़कर, यह extension-owned server को data नहीं भेजता। Chat Enhancer for YouTube, YouTube या Google से संबद्ध नहीं है।

गोपनीयता संबंधी सवालों के लिए https://www.chatenhancer.com पर ईमेल लिंक का उपयोग करें।

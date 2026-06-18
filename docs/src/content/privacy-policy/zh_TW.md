---
locale: zh_TW
title: "隱私權政策"
description: "Chat Enhancer for YouTube 如何處理本機儲存、翻譯、Playground 資料與隱私控制。"
---

# 隱私權

最後更新：2026 年 6 月 17 日

Chat Enhancer for YouTube 是一款用於 YouTube 即時聊天室的瀏覽器擴充功能。它旨在為聊天室加入小功能，而不是取代 YouTube 聊天或收集分析資料。

簡短版本：

- 大多數擴充功能都在你的瀏覽器本機執行。
- 翻譯預設為關閉。
- 啟用翻譯時，被翻譯的文字會傳送到 Google Translate。
- Playground 遊戲預設為關閉。如果你啟用並使用 Playground，遊戲上線狀態、邀請和遊戲動作會以產生的玩家名稱傳送到 Chat Enhancer Playground 後端。
- 擴充功能不執行分析、不出售資料，也不收集瀏覽記錄。

## 擴充功能在哪裡執行

擴充功能只會在符合擴充功能 manifest 的 YouTube 即時聊天室和即時聊天室重播頁面上執行。

擴充功能使用瀏覽器的 `storage` 權限，以及對 YouTube 即時聊天室頁面、Google 翻譯端點和選擇加入的 Playground 後端的 host 存取權。它不會要求一般瀏覽記錄、讀取分頁、scripting 或 web navigation 權限。

## 儲存在你瀏覽器中的資料

擴充功能會儲存一些資料，讓功能能在頁面重新載入後繼續運作。

- **設定會以 `chrome.storage.sync` 儲存：** 視你的瀏覽器設定而定，瀏覽器可能會在你自己已登入的瀏覽器安裝之間同步這些擴充功能設定。

- **Inbox 資料會以 `chrome.storage.local` 儲存：** 這包括監看的關鍵字，以及每個直播或重播最多 100 筆 inbox 記錄。Inbox 記錄可能包括訊息文字、作者名稱、時間戳、YouTube 訊息/來源中繼資料、符合項目中繼資料，以及顯示已儲存訊息所需的 emoji/圖片顯示資料。

- **常用 emoji 資料會以 `chrome.storage.local` 儲存：** 這包括本機使用次數，以及用於建立常用 emoji 列的 emoji 顯示中繼資料。

- **已加入書籤的使用者資料會以 `chrome.storage.local` 儲存：** 這包括已加入書籤使用者的 handle、可用時的頻道 ID，以及建立書籤的時間。已加入書籤的使用者會在目前瀏覽器設定檔中的各直播間全域適用，並用於顯示彩色頭像環。

- **未送出的聊天草稿會依直播以 `chrome.storage.local` 儲存：** 它們會在頁面重新整理後還原。當聊天輸入被清除、訊息送出或擴充功能資料被重設時，草稿會被移除。

- **即時聊天室分頁狀態會以 `chrome.storage.local` 儲存：** 這僅限於最近活躍的 YouTube 即時聊天室分頁的瀏覽器分頁 ID 和最後出現時間戳，並用於顯示擴充功能目前是已連線或已中斷。這些記錄會在 12 小時後過期。

- **如果使用 Playground，Playground 身分資料會以 `chrome.storage.local` 儲存：** 這是一組產生的公開/私密金鑰，用於簽署 Playground 連線挑戰，讓同一個瀏覽器安裝可以保留相同的化名 Playground 身分。這不是你的 YouTube 身分。

- **近期個人資料訊息、指令狀態和翻譯結果只會保留在目前即時聊天室頁面的記憶體中。頁面卸載時會被清除。**

## 傳送到瀏覽器外的資料

聊天翻譯和草稿翻譯預設為關閉。

啟用翻譯或 Playground 功能時，資料可能會傳送到以下服務：

- **位於 `https://translate.googleapis.com/translate_a/single` 的 Google Translate**

  聊天翻譯會傳送符合條件的可見與傳入聊天訊息文字。草稿翻譯會傳送你從聊天框中選擇要翻譯的草稿文字。

  翻譯請求包含要翻譯的文字和目標語言。擴充功能不會隨翻譯請求傳送你的 YouTube cookie 或 YouTube 憑證。

  透過 `translate.googleapis.com` 存取 Google Translate 是非官方的，可能會受到速率限制、變更或無法使用。

- **位於 `https://playground.chatenhancer.com` 的 Chat Enhancer Playground**

  Playground 預設為關閉。如果你啟用 Playground 並使用遊戲面板，擴充功能會連線到 Playground 後端，讓同一直播中選擇加入的使用者可以看到可用狀態、交換邀請並玩遊戲。

  Playground 訊息可能包括直播/影片 key、你產生的 Playground 公開金鑰和簽章、你產生的玩家名稱、你的可用遊戲清單、邀請和邀請回覆，以及棋步等遊戲動作。

  HELP-A-FRIEND! Trivia 問題生成可能會將選定的 YouTube 重播 transcript 摘錄和遊戲識別碼傳送到 Playground 後端。後端使用 OpenAI 從這些摘錄生成 trivia 問題。

  Replay Trivia 生成可能需要在 `https://playground.chatenhancer.com` 上進行 Cloudflare Turnstile 驗證。Cloudflare 可能會收到一般驗證資料，例如 IP 位址、使用者代理和挑戰結果。

  Playground 不會將即時聊天訊息文字、你的 YouTube 顯示名稱、你的 YouTube 頭像 URL、YouTube cookie 或 YouTube 憑證傳送到 Playground 後端。

  就像任何網路服務一樣，Playground 後端可能會從瀏覽器或網路供應商接收一般連線中繼資料，例如 IP 位址和使用者代理。

## 資料控制

你可以使用擴充功能彈出視窗中的重設按鈕清除擴充功能資料。這會清除本機擴充功能資料和同步的擴充功能設定，然後還原預設設定。

你也可以從瀏覽器移除擴充功能。視瀏覽器而定，移除擴充功能也可能會刪除其本機擴充功能儲存空間。

## 不會收集的內容

擴充功能不執行分析。

擴充功能不收集瀏覽記錄。

擴充功能不出售使用者資料。

除了上述選擇加入的 Playground 遊戲之外，擴充功能不會將資料傳送到擴充功能擁有的伺服器。

擴充功能不會在即時聊天室頁面卸載後儲存近期個人資料訊息或翻譯結果。

Chat Enhancer for YouTube 與 YouTube 或 Google 無關。

如有隱私權問題，請使用 https://www.chatenhancer.com 上的電子郵件連結。

---
locale: zh_TW
title: "隱私權政策"
description: "Chat Enhancer for YouTube 如何處理本機儲存、翻譯、Playground 資料與隱私控制。"
---

# 隱私權

最後更新：2026 年 6 月 21 日

Chat Enhancer for YouTube 是一款用於 YouTube 即時聊天室的瀏覽器擴充功能。它旨在為聊天室加入小功能，而不是取代 YouTube 聊天或收集分析資料。

簡短版本：

- 大多數擴充功能都在你的瀏覽器本機執行。
- 翻譯預設為關閉。
- 啟用翻譯時，被翻譯的文字會傳送到 Google Translate。
- Playground 遊戲預設為關閉。如果你啟用並使用 Playground，遊戲上線狀態、邀請和遊戲動作會以產生的玩家名稱傳送到 Chat Enhancer Playground 遊戲伺服器。
- 擴充功能不執行分析、不出售資料，也不收集瀏覽記錄。

## 擴充功能在哪裡執行

擴充功能只會在擴充功能被允許存取的 YouTube 即時聊天室和即時聊天室重播頁面上執行。

擴充功能使用權限在你的瀏覽器中儲存自己的設定和資料。它也會存取功能運作所需的特定網站：YouTube 即時聊天室頁面、Google Translate 的翻譯服務，以及選擇加入的 Chat Enhancer Playground 遊戲伺服器。

擴充功能不會要求一般瀏覽記錄、讀取分頁、scripting 或 web navigation 權限。

## 儲存在你瀏覽器中的資料

擴充功能會儲存一些資料，讓功能能在頁面重新載入後繼續運作。

本節列出的資料由擴充功能儲存在你自己的瀏覽器設定檔中。除非下方「傳送到瀏覽器外的資料」一節也列出這些資料，否則不會傳送給 Chat Enhancer。

- **設定：** 使用瀏覽器的同步擴充功能儲存空間 (`chrome.storage.sync`) 儲存。視你的瀏覽器設定而定，瀏覽器可能會在你自己已登入的瀏覽器安裝之間同步這些擴充功能設定。

- **Inbox 資料：** 使用本機擴充功能儲存空間 (`chrome.storage.local`) 儲存。這包括監看的關鍵字，以及每個直播或重播最多 100 筆 inbox 記錄。Inbox 記錄可能包括訊息文字、作者名稱、時間戳、顯示已儲存訊息來源所需的基本 YouTube 訊息詳細資料、符合項目詳細資料，以及正確顯示已儲存訊息所需的 emoji 或圖片資訊。

- **常用 emoji 資料：** 使用本機擴充功能儲存空間 (`chrome.storage.local`) 儲存。這包括本機使用次數，以及用於建立常用 emoji 列的 emoji 顯示資訊。

- **書籤資料：** 使用本機擴充功能儲存空間 (`chrome.storage.local`) 儲存。可能包括已儲存的訊息文字和表情符號顯示資訊、作者姓名、頭像 URL、可用時的頻道 ID、訊息與儲存時間，以及直播標題和 URL。書籤可在目前瀏覽器設定檔中的不同直播間繼續使用。

- **頭像光環資料：** 使用本機擴充功能儲存空間 (`chrome.storage.local`) 儲存。包括你從最近訊息個人資料中明確新增光環的使用者姓名、新增光環的時間、直播 URL，以及可用時的頭像 URL、頻道 ID 和直播標題。此選擇可在目前瀏覽器設定檔中的不同直播間繼續使用，僅用於裝飾相符的頭像；它不會檢查使用者是否在線上。

- **未送出的聊天草稿：** 依直播使用本機擴充功能儲存空間 (`chrome.storage.local`) 儲存。它們會在頁面重新整理後還原。當聊天輸入被清除、訊息送出或擴充功能資料被重設時，草稿會被移除。

- **Playground 身分資料：** 如果使用 Playground，會使用本機擴充功能儲存空間 (`chrome.storage.local`) 儲存。這是隨機產生的本機 Playground 身分，用於在重新連線到 Playground 時識別同一個瀏覽器安裝。這不是你的 YouTube 身分。

- **近期個人資料訊息、指令狀態和翻譯結果：** 只會保留在目前即時聊天室頁面的記憶體中。當你離開或重新整理聊天室頁面時會被清除。

## 傳送到瀏覽器外的資料

聊天翻譯、草稿翻譯和 Playground 遊戲預設為關閉。

啟用並使用翻譯或 Playground 功能時，資料可能會傳送到以下服務：

- **位於 `https://translate.googleapis.com/translate_a/single` 的 Google Translate**

  聊天翻譯會在翻譯啟用期間傳送即時聊天室中可見且符合翻譯條件的聊天訊息文字。草稿翻譯會傳送你從聊天框中選擇要翻譯的草稿文字。

  翻譯請求包含要翻譯的文字和目標語言。擴充功能不會隨翻譯請求傳送你的 YouTube cookie 或 YouTube 憑證。

  透過 `translate.googleapis.com` 存取 Google Translate 是非官方的，可能會受到速率限制、變更或無法使用。

- <span id="playground"></span>**位於 `https://playground.chatenhancer.com` 的 Chat Enhancer Playground**

  Playground 預設為關閉。如果你啟用 Playground 並使用遊戲面板，擴充功能會連線到 Chat Enhancer Playground 遊戲伺服器，讓同一直播中選擇加入的使用者可以看到可用狀態、交換邀請並玩遊戲。

  Playground 訊息可能包括 YouTube 直播或影片識別碼、你產生的 Playground 玩家身分、你產生的玩家名稱、你的可用遊戲清單、邀請和邀請回覆，以及棋步等遊戲動作。

  Playground 不會將即時聊天訊息文字、你的 YouTube 顯示名稱、你的 YouTube 頭像 URL、YouTube cookie 或 YouTube 憑證傳送到 Playground 遊戲伺服器。

  另外，HELP-A-FRIEND! Trivia 問題生成可能會將選定的公開 YouTube 影片逐字稿摘錄和遊戲識別碼傳送到 Playground 遊戲伺服器。這些摘錄來自影片逐字稿，而不是即時聊天室。伺服器使用 OpenAI 從這些摘錄生成 trivia 問題。

  Replay Trivia 生成可能需要在 `https://playground.chatenhancer.com` 上進行 Cloudflare Turnstile 驗證。Cloudflare 可能會收到一般驗證資料，例如 IP 位址、瀏覽器與裝置資訊，以及挑戰結果。

  就像任何網路服務一樣，Playground 遊戲伺服器可能會從瀏覽器或網路供應商接收一般連線資訊，例如 IP 位址和瀏覽器/裝置資訊。

## 資料控制

你可以使用擴充功能彈出視窗中的重設按鈕清除擴充功能資料。這會清除本機擴充功能資料和同步的擴充功能設定，然後還原預設設定。

你也可以從瀏覽器移除擴充功能。視瀏覽器而定，移除擴充功能也可能會刪除其本機擴充功能儲存空間。

## Chat Enhancer 不會做的事

擴充功能不執行分析。

擴充功能不收集瀏覽記錄。

擴充功能不出售使用者資料。

除了上述選擇加入的 Playground 功能之外，擴充功能不會將資料傳送到 Chat Enhancer 伺服器。

擴充功能不會在你離開或重新整理即時聊天室頁面後儲存近期個人資料訊息或翻譯結果。

Chat Enhancer for YouTube 與 YouTube 或 Google 無關。

如有隱私權問題，請使用 https://www.chatenhancer.com 上的電子郵件連結。

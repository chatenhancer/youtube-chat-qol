---
locale: zh_CN
title: "隐私政策"
description: "Chat Enhancer for YouTube 如何处理本地存储、翻译、Playground 数据和隐私控制。"
---

# 隐私

最后更新：2026 年 6 月 21 日

Chat Enhancer for YouTube 是一款用于 YouTube 实时聊天的浏览器扩展。它旨在为聊天添加小功能，而不是取代 YouTube 聊天或收集分析数据。

简要说明：

- 大多数扩展功能都在你的浏览器本地运行。
- 翻译默认关闭。
- 启用翻译时，被翻译的文本会发送到 Google Translate。
- Playground 游戏默认关闭。如果你启用并使用 Playground，游戏在线状态、邀请和游戏操作会以生成的玩家名称发送到 Chat Enhancer Playground 游戏服务器。
- 扩展不运行分析、不出售数据，也不收集浏览历史。

## 扩展在哪里运行

扩展只在扩展被允许访问的 YouTube 实时聊天和实时聊天回放页面上运行。

扩展使用权限在你的浏览器中保存自己的设置和数据。它还会访问功能运行所需的特定网站：YouTube 实时聊天页面、Google Translate 的翻译服务，以及可选加入的 Chat Enhancer Playground 游戏服务器。

扩展不会请求通用的浏览历史、标签页读取、脚本执行或网页导航权限。

## 存储在你浏览器中的数据

扩展会存储一些数据，以便其功能在页面重新加载后继续工作。

本节列出的数据由扩展存储在你自己的浏览器配置文件中。除非下方“发送到浏览器外的数据”一节也列出这些数据，否则它们不会发送给 Chat Enhancer。

- **设置：** 使用浏览器的同步扩展存储 (`chrome.storage.sync`) 保存。根据你的浏览器设置，浏览器可能会在你自己已登录的浏览器安装之间同步这些扩展设置。

- **Inbox 数据：** 使用本地扩展存储 (`chrome.storage.local`) 保存。这包括监视的关键词，以及每个直播或回放最多 100 条 inbox 记录。Inbox 记录可能包括消息文本、作者名称、时间戳、用于显示已保存消息来源的基本 YouTube 消息详情、匹配详情，以及正确显示已保存消息所需的 emoji 或图片信息。

- **常用 emoji 数据：** 使用本地扩展存储 (`chrome.storage.local`) 保存。这包括本地使用次数和用于构建常用 emoji 行的 emoji 显示信息。

- **书签数据：** 使用本地扩展存储 (`chrome.storage.local`) 保存。可能包括已保存的消息文本和表情显示信息、作者姓名、头像 URL、可用时的频道 ID、消息和保存时间，以及直播标题和 URL。书签可在当前浏览器配置文件中的不同直播间继续使用。

- **头像光环数据：** 使用本地扩展存储 (`chrome.storage.local`) 保存。包括你从最近消息资料中明确添加光环的用户的作者姓名、可用时的频道 ID，以及添加光环的时间。此选择可在当前浏览器配置文件中的不同直播间继续使用，仅用于装饰匹配的头像；它不会检查用户是否在线。

- **未发送的聊天草稿：** 按直播使用本地扩展存储 (`chrome.storage.local`) 保存。页面刷新后会恢复。草稿会在聊天输入被清空、消息已发送或扩展数据被重置时删除。

- **Playground 身份数据：** 如果使用 Playground，会使用本地扩展存储 (`chrome.storage.local`) 保存。这是随机生成的本地 Playground 身份，用于在重新连接 Playground 时识别同一个浏览器安装。它不是你的 YouTube 身份。

- **最近的个人资料消息、命令状态和翻译结果：** 只会保存在当前实时聊天页面的内存中。当你离开或刷新聊天页面时会被清除。

## 发送到浏览器外的数据

聊天翻译、草稿翻译和 Playground 游戏默认关闭。

启用并使用翻译或 Playground 功能时，数据可能会发送到以下服务：

- **位于 `https://translate.googleapis.com/translate_a/single` 的 Google Translate**

  聊天翻译会在翻译启用期间发送实时聊天中可见且符合翻译条件的聊天消息文本。草稿翻译会发送你从聊天框中选择翻译的草稿文本。

  翻译请求包括要翻译的文本和目标语言。扩展不会随翻译请求发送你的 YouTube cookie 或 YouTube 凭据。

  通过 `translate.googleapis.com` 访问 Google Translate 是非官方的，可能会受到速率限制、发生变化或不可用。

- <span id="playground"></span>**位于 `https://playground.chatenhancer.com` 的 Chat Enhancer Playground**

  Playground 默认关闭。如果你启用 Playground 并使用游戏面板，扩展会连接到 Chat Enhancer Playground 游戏服务器，以便同一直播中选择加入的用户可以查看可用状态、交换邀请并玩游戏。

  Playground 消息可能包括 YouTube 直播或视频标识符、你生成的 Playground 玩家身份、你生成的玩家名称、你的可用游戏列表、邀请和邀请回应，以及棋步等游戏操作。

  Playground 不会将实时聊天消息文本、你的 YouTube 显示名称、你的 YouTube 头像 URL、YouTube cookie 或 YouTube 凭据发送到 Playground 游戏服务器。

  另外，HELP-A-FRIEND! Trivia 问题生成可能会将选定的公开 YouTube 视频转录摘录和游戏标识符发送到 Playground 游戏服务器。这些摘录来自视频转录，而不是实时聊天。服务器使用 OpenAI 根据这些摘录生成 trivia 问题。

  Replay Trivia 生成可能需要在 `https://playground.chatenhancer.com` 上进行 Cloudflare Turnstile 验证。Cloudflare 可能会接收正常的验证数据，例如 IP 地址、浏览器和设备信息以及挑战结果。

  像任何 Web 服务一样，Playground 游戏服务器可能会从浏览器或网络提供商接收正常的连接信息，例如 IP 地址和浏览器/设备信息。

## 数据控制

你可以在扩展弹窗中使用重置按钮清除扩展数据。这会清除本地扩展数据和同步的扩展设置，然后恢复默认设置。

你也可以从浏览器中移除扩展。根据浏览器不同，移除扩展也可能会删除其本地扩展存储。

## Chat Enhancer 不会做什么

扩展不运行分析。

扩展不收集浏览历史。

扩展不出售用户数据。

除上述选择加入的 Playground 功能外，扩展不会向 Chat Enhancer 服务器发送数据。

扩展不会在你离开或刷新实时聊天页面后存储最近的个人资料消息或翻译结果。

Chat Enhancer for YouTube 与 YouTube 或 Google 没有关联。

如有隐私问题，请使用 https://www.chatenhancer.com 上的电子邮件链接。

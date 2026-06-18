---
locale: zh_CN
title: "隐私政策"
description: "Chat Enhancer for YouTube 如何处理本地存储、翻译、Playground 数据和隐私控制。"
---

# 隐私

最后更新：2026 年 6 月 17 日

Chat Enhancer for YouTube 是一款用于 YouTube 实时聊天的浏览器扩展。它旨在为聊天添加小功能，而不是取代 YouTube 聊天或收集分析数据。

简要说明：

- 大多数扩展功能都在你的浏览器本地运行。
- 翻译默认关闭。
- 启用翻译时，被翻译的文本会发送到 Google Translate。
- Playground 游戏默认关闭。如果你启用并使用 Playground，游戏在线状态、邀请和游戏操作会以生成的玩家名称发送到 Chat Enhancer Playground 后端。
- 扩展不运行分析、不出售数据，也不收集浏览历史。

## 扩展在哪里运行

扩展只在与扩展 manifest 匹配的 YouTube 实时聊天和实时聊天回放页面上运行。

扩展使用浏览器的 `storage` 权限，以及对 YouTube 实时聊天页面、Google 翻译端点和可选加入的 Playground 后端的主机访问权限。它不会请求通用的浏览历史、标签页读取、脚本执行或网页导航权限。

## 存储在你浏览器中的数据

扩展会存储一些数据，以便其功能在页面重新加载后继续工作。

- **设置通过 `chrome.storage.sync` 存储：** 根据你的浏览器设置，浏览器可能会在你自己已登录的浏览器安装之间同步这些扩展设置。

- **Inbox 数据通过 `chrome.storage.local` 存储：** 这包括监视的关键词，以及每个直播或回放最多 100 条 inbox 记录。Inbox 记录可能包括消息文本、作者名称、时间戳、YouTube 消息/来源元数据、匹配元数据，以及显示已保存消息所需的 emoji/图片显示数据。

- **常用 emoji 数据通过 `chrome.storage.local` 存储：** 这包括本地使用次数和用于构建常用 emoji 行的 emoji 显示元数据。

- **已收藏用户数据通过 `chrome.storage.local` 存储：** 这包括已收藏用户的 handle、可用时的频道 ID，以及收藏创建时间。已收藏用户在当前浏览器配置文件中的各个直播之间全局适用，并用于显示彩色头像环。

- **未发送的聊天草稿按直播通过 `chrome.storage.local` 存储：** 页面刷新后会恢复。草稿会在聊天输入被清空、消息已发送或扩展数据被重置时删除。

- **实时聊天标签页状态通过 `chrome.storage.local` 存储：** 这仅限于最近活跃的 YouTube 实时聊天标签页的浏览器标签页 ID 和最后出现时间戳，并用于显示扩展当前是已连接还是已断开。这些记录会在 12 小时后过期。

- **如果使用 Playground，Playground 身份数据会通过 `chrome.storage.local` 存储：** 这是一对生成的公钥/私钥，用于签署 Playground 连接挑战，使同一浏览器安装可以保留同一个化名 Playground 身份。它不是你的 YouTube 身份。

- **最近的个人资料消息、命令状态和翻译结果只会保存在当前实时聊天页面的内存中。页面卸载时会被清除。**

## 发送到浏览器外的数据

聊天翻译和草稿翻译默认关闭。

启用翻译或 Playground 功能时，数据可能会发送到以下服务：

- **位于 `https://translate.googleapis.com/translate_a/single` 的 Google Translate**

  聊天翻译会发送符合条件的可见和传入聊天消息文本。草稿翻译会发送你从聊天框中选择翻译的草稿文本。

  翻译请求包括要翻译的文本和目标语言。扩展不会随翻译请求发送你的 YouTube cookie 或 YouTube 凭据。

  通过 `translate.googleapis.com` 访问 Google Translate 是非官方的，可能会受到速率限制、发生变化或不可用。

- **位于 `https://playground.chatenhancer.com` 的 Chat Enhancer Playground**

  Playground 默认关闭。如果你启用 Playground 并使用游戏面板，扩展会连接到 Playground 后端，以便同一直播中选择加入的用户可以查看可用状态、交换邀请并玩游戏。

  Playground 消息可能包括直播/视频键、你生成的 Playground 公钥和签名、你生成的玩家名称、你的可用游戏列表、邀请和邀请回应，以及棋步等游戏操作。

  HELP-A-FRIEND! Trivia 问题生成可能会将选定的 YouTube 回放 transcript 摘录和游戏标识符发送到 Playground 后端。后端使用 OpenAI 根据这些摘录生成 trivia 问题。

  Replay Trivia 生成可能需要在 `https://playground.chatenhancer.com` 上进行 Cloudflare Turnstile 验证。Cloudflare 可能会接收正常的验证数据，例如 IP 地址、用户代理和挑战结果。

  Playground 不会将实时聊天消息文本、你的 YouTube 显示名称、你的 YouTube 头像 URL、YouTube cookie 或 YouTube 凭据发送到 Playground 后端。

  像任何 Web 服务一样，Playground 后端可能会从浏览器或网络提供商接收正常的连接元数据，例如 IP 地址和用户代理。

## 数据控制

你可以在扩展弹窗中使用重置按钮清除扩展数据。这会清除本地扩展数据和同步的扩展设置，然后恢复默认设置。

你也可以从浏览器中移除扩展。根据浏览器不同，移除扩展也可能会删除其本地扩展存储。

## 不收集的内容

扩展不运行分析。

扩展不收集浏览历史。

扩展不出售用户数据。

除上述选择加入的 Playground 游戏外，扩展不会向扩展拥有的服务器发送数据。

扩展不会在实时聊天页面卸载后存储最近的个人资料消息或翻译结果。

Chat Enhancer for YouTube 与 YouTube 或 Google 没有关联。

如有隐私问题，请使用 https://www.chatenhancer.com 上的电子邮件链接。

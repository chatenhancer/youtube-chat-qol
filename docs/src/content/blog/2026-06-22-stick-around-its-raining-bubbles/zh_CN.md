---
title: "Stick Around!: 泡泡雨来了"
date: 2026-06-22
description: "Stick Around! 会把直播聊天流变成一个小小的格斗场，里面有不断落下的聊天泡泡。"
slug: "stick-around-its-raining-bubbles"
image: "./cover.png"
locale: "zh_CN"
translationKey: "stick-around-its-raining-bubbles"
tags:
  - "playground"
  - "games"
  - "stick-around"
---

Playground 的下一个实验是 **Stick Around!**，一个不放在紧凑面板里的小型格斗游戏。

它会接管聊天流本身。

不是整个页面。不是视频。也不是消息输入框。只是直播聊天滚动的那块空间，把它变成一个小竞技场，让两个火柴人在从上方掉落的消息中努力活下来。

## 泡泡雨来了

评论就是天气。

聊天安静时，竞技场有喘息空间。聊天忙起来时，更多消息泡泡会落进战斗里。有些会漂移，有些会旋转，有些会落得更重，而本地看到的真实聊天文字也可能显示在这些泡泡上。

目标很简单：移动、跳跃、把对手撞开、躲开落下的聊天，并尽量不要失去所有 stocks。

:::media-right

![Stick Around! 作为全聊天覆盖层运行，带有下落的聊天泡泡](./stickfightpreview.png){shadow=smooth rotation=1}

Stick Around! 把整个聊天流当作游戏空间，同时保留正常的聊天标题栏和输入区域。

:::

## 一种不同的 Playground 游戏

Chess、HELP-A-FRIEND! Trivia 和 The Wild Wild Chat 都使用紧凑的游戏面板。Stick Around! 不一样，因为它的竞技场需要整个聊天流。

这让它更像是发生在 YouTube 聊天*里面*的东西，而不是旁边的东西。标题栏仍然有和其他游戏面板一样的简单控制，包括隐藏和声音，但比赛本身会直接绘制在聊天流上方。

覆盖层会让游戏保持清晰，同时底下的聊天仍然可见，所以它仍然感觉和直播连在一起，而不是变成单独的屏幕。

## 和其他观众或 Computer 对战

Stick Around! 使用常规的 Playground 邀请流程。打开 Games 面板，选择 Stick Around!，然后邀请同一场直播里的某个人。

如果周围没有其他玩家，你也可以邀请 **Computer**。这样在小聊天、深夜直播，或者只是想测试混乱而不想等待其他观众时，也能玩起来。

双方玩家按下 **Ready**，倒计时开始，然后比赛开始。

## 怎样算赢或输

每位玩家有三个 stocks。被击中会提高你的 damage，damage 越高，攻击把你打飞得越远。从竞技场底部或两侧掉出去会失去一个 stock。stocks 用完时，另一名玩家获胜。

## 为什么它属于聊天

Stick Around! 来自一个简单想法：如果聊天流不只是游戏背后的背景，而是游戏的一部分，会怎样？

所以落下的泡泡来自聊天量。慢速直播会变成轻松对局。快速直播会变成风暴。评论仍然是评论，但对话越热闹，竞技场就越危险。

它很傻、很快，也有点不公平，正像直播聊天有时会表现出来的那样。

这很 Playground。

---
name: teach-me
description: >-
  Teach one topic in the user's spare minutes: probe what they already know, then explain only the gap.
  Use when the user says teach me/教我/讲讲 <topic>, or hits a concept while reading docs and wants it explained now.
metadata:
  kind: atom
---

# teach-me

用户给一个 topic，时间是碎片的。目标不是讲全，是换掉他脑子里那一张错的图。

## 摸底不问"你了解多少"

这种问题只能得到"了解一点"，什么都测不出来。改成让他**预测**：给一个具体的小例子，
问结果会是什么。

- 例子选在最容易混淆的地方：新手最常把这个 topic 当成哪个熟悉的东西？就在那个差别处出题。
  rebase 当成 merge、image 当成虚拟机、async 当成多线程。
- 再问一句：你最熟的、跟它最像的东西是什么？
- 两题就够，用 grill-me 的一轮格式。答错和"不知道"都是好答案，它们就是要讲的缺口。
- 正在读文档卡住的，直接问卡在哪一句，拿那一句当例子。

## 讲的时候只换一张图

拿他最熟的那个东西做底，只讲差别：X 就是你熟的 Y，只有 Z 不一样，Z 之所以不一样是因为什么。
一次只换一张图。讲完立刻回到摸底那道预测题，让他自己再答一遍。

不要从定义开讲、不列特性、不给大纲、末尾不总结。他在手机屏上读，第二屏没人看。

## 收尾

给一个两分钟能自己验证的动作：跑一条命令、改一个值看输出、回文档找那一句。
然后停。要不要继续由他说，不主动铺下一节。

## 不做

- 不写 HTML，不画课程，不建仓库。
- 不主动出题；"考考我"才出，一次最多 3 题。
- 存档读档走 resume-learning。

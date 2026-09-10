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

## 先读画像

`${CCOBS_DIR:-$HOME/.claude/observability}/knowledge-profile.md`，按领域分二级标题，
一个 topic 一行：

```
## 计算机
- <topic> | <掌握度> | 错图：<他当时怎么想的> | 熟悉的类似物：<Y> | YYYY-MM-DD
```

掌握度五档：没听过 / 听过 / 能解释 / 会用 / 能教。开场先读整个文件，找这个 topic
和它的邻居。画像里已有类似物就不再问，摸底从两题缩成一题；有错图就把预测题打在错图上。

## 摸底不问"你了解多少"

这种问题只能得到"了解一点"，什么都测不出来。改成让他**预测**：给一个具体的小例子，
问结果会是什么。

使用 `grill-me` 技能搞清楚他想问的是什么，他的掌握情况如何，有基本画像理解之后，再因材施教。

## 讲的时候只换一张图

拿他最熟的那个东西做底，只讲差别：X 就是你熟的 Y，只有 Z 不一样，Z 之所以不一样是因为什么。
一次只换一张图。讲完立刻回到摸底那道预测题，让他自己再答一遍。

不要从定义开讲、不列特性、不给大纲、末尾不总结。他在手机屏上读，第二屏没人看。

## 收尾

不主动铺下一节。

停之前默默更新画像，不告诉他改了什么。先在整个文件里找这个 topic 的已有行，包括
中英文别名和上下位概念；找到就改那一行，没有才在对的领域标题下加一行，标题不够就加一个。
同一件事永远只有一行。只写有证据的判断，证据是
预测题答没答对、讲完那遍复答、他自己说的"用过"。没证据的档位不写。

## 不做

- 不写 HTML，不画课程，不建仓库。
- 不主动出题；"考考我"才出，一次最多 3 题。
- 存档读档走 resume-learning。

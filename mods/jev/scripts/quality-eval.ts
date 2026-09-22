#!/usr/bin/env bun
/** Opt-in quality probe around the dev-kit skills: sends this machine's real skill names and descriptions (as every prompt does) with prompts whose right answer is known; every other installed skill is a distractor. */
import { makeRequest, decide, skillsFrom } from "../hooks/core.ts";
import { scanSkills } from "./scan-skills.ts";
const key = process.env.TYPESAFE_API_KEY; if (!key) throw new Error("Set TYPESAFE_API_KEY; your skill names and descriptions are sent.");
const skills = skillsFrom(await scanSkills(process.env.HOME!, process.cwd()), [key]);
// `ok`: acceptable extras; `known`: a real miss we keep visible without failing the run.
type Case = { name: string; prompt: string; recent?: { role: string; text: string }[]; want: string[]; ok?: string[]; known?: string };
const cases: Case[] = [
  // A. one direct hit per dev-kit skill
  { name: "advanced-plan", prompt: "立项：给编辑器加多光标支持，写一份带验收标准的开发计划", want: ["advanced-plan"] },
  { name: "grill-me", prompt: "方向还不清楚，盘问我，把设计树每个分支问清楚再动手", want: ["grill-me"] },
  { name: "ccobs", prompt: "把最近的会话 ingest 进 obs.db，然后给我看用量统计", want: ["ccobs"] },
  { name: "orchestrate", prompt: "这个任务需要调研、开发、审核几个角色一起干，帮我组队推进到完成", want: ["orchestrate"], ok: ["use-agents", "ceo-mode"] },
  { name: "visual-evidence", prompt: "验收一下画布上选中态的描边对不对，用 DOM 事实给我一份 PASS/FAIL 证据包", want: ["visual-evidence"] },
  { name: "skill-review", prompt: "给整个技能集做一次健康检查：风格、重叠、过期、触发评测都跑一遍", want: ["skill-review"], ok: ["skill-forge"] },
  { name: "teach-me", prompt: "教我 Raft 一致性算法，我只有十分钟", want: ["teach-me"], ok: ["eli5:eli5"] },
  { name: "use-html", prompt: "做一个单文件 HTML 的可点击原型，PRD 评审前给产品确认交互", want: ["use-html"] },
  { name: "rate-limit-watcher", prompt: "守林员：我今晚让几个 agent 跑通宵，限额了帮我盯着，恢复后叫醒它们", want: ["rate-limit-watcher"] },
  { name: "recall", prompt: "之前有没有查过并发跑 eval 共享登录会 401 的问题？翻翻过去的会话", want: ["recall"], ok: ["ccobs"] },
  { name: "use-agents", prompt: "起一个独立的 opus agent 去跑测试，给我启动命令，顺便告诉我它的定义文件在哪", want: ["use-agents"], ok: ["orchestrate", "herdr"] },
  { name: "context-audit", prompt: "审一下 CLAUDE.md 和常驻上下文，把不该常驻的内容挪走", want: ["context-audit"] },
  { name: "take-over", prompt: "接手 session 3f9a 那个被中断的任务，读一下目标和进度接着做", want: ["take-over"] },
  { name: "cto-audit", prompt: "/cto-audit 从架构、领域模型和 harness 规则角度审一下这个项目", want: ["cto-audit"], ok: ["context-audit"] },
  { name: "skill-forge", prompt: "新建一个技能，把'查 TLS 日志'这套流程沉淀成 skill，过风格和触发评测", want: ["skill-forge"], ok: ["plugin-dev:skill-development", "skill-review"] },
  { name: "ceo-mode", prompt: "你当 CEO，我给你全权，所有动手的事都派给 agent，你只做决定和汇报", want: ["ceo-mode"], ok: ["orchestrate"] },
  { name: "debrief", prompt: "收盘：把这次的计划归档，沉淀进 ccobs，顺便改掉那条被证明错了的规则", want: ["debrief"], ok: ["ccobs"] },
  { name: "resume-learning", prompt: "学完了，存档到 RESUME.md，下次接着学", want: ["resume-learning"] },
  // B. only the context says which skill
  { name: "ctx-continue-plan", prompt: "继续", recent: [{ role: "user", text: "先立项，写一份带验收的开发计划再动手" }, { role: "assistant", text: "好，我先列出里程碑和每步的验收命令。" }], want: ["advanced-plan"] },
  { name: "ctx-resume-learning", prompt: "读档", recent: [{ role: "user", text: "上次学 CRDT 学到一半存档了" }], want: ["resume-learning"] },
  { name: "ctx-approve-grill", prompt: "好，就这么办", recent: [{ role: "user", text: "这个需求我自己也没想清楚" }, { role: "assistant", text: "建议先盘问一轮，把设计树的每个分支问清楚再开工。" }], want: ["grill-me"] },
  { name: "ctx-switch-off", prompt: "算了，不组队了，直接告诉我 git rebase -i 怎么用", recent: [{ role: "user", text: "这个任务要调研、开发、审核几个角色一起推进" }], want: [], ok: ["teach-me"] },
  // C. hard negatives: share a word with a dev-kit skill, but are not its job
  { name: "hneg-code-review", prompt: "review 一下这个 PR 的 diff 有没有 bug", want: [], ok: ["ponytail:ponytail-review"] },
  { name: "hneg-plan-param", prompt: "这个函数的 plan 参数是什么意思，为什么可以传 null", want: [] },
  { name: "hneg-context-word", prompt: "把 React 的 context 和 props 的区别用一句话说清", want: [], ok: ["teach-me", "eli5:eli5"] },
  { name: "hneg-audit-table", prompt: "audit_log 表按 user_id 和 created_at 怎么建联合索引", want: [] },
  { name: "hneg-html-email", prompt: "帮我写个 HTML 的营销邮件模板", want: [] },
  { name: "hneg-agent-word", prompt: "把 agent 这个词翻成中文，给三个候选", want: [] },
  { name: "hneg-summary", prompt: "把你上面说的用三句话总结一下", recent: [{ role: "assistant", text: "迁移分四步：备份、停写、跑迁移、切流量。" }], want: [] },
  { name: "hneg-recall-word", prompt: "Python 里 lru_cache 的 recall 性能怎么样", want: [] },
  { name: "hneg-takeover-word", prompt: "公司被收购（take over）后期权怎么算", want: [] },
  { name: "hneg-translate", prompt: "把 hello world 翻译成中文", want: [] },
  // D. more than one dev-kit skill at once
  { name: "multi-grill-plan", prompt: "先盘问我把方向问清楚，然后立项写一份带验收的计划", want: ["grill-me", "advanced-plan"] },
  { name: "multi-agents-orchestrate", prompt: "起两个独立 agent 并行跑，一个调研一个写测试，你来分工协调收口", want: ["orchestrate"], ok: ["use-agents"] },
];
const t0 = performance.now(); let hits = 0, wants = 0, fps = 0; const rows: any[] = []; let low = 1, high = 0;
for (const c of cases) {
  const { body, snapshot } = makeRequest({ prompt: c.prompt, recent: c.recent ?? [], skills, history: [] }, "jev-1.13.0", [key]);
  const start = performance.now();
  const r = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`);
  const raw = await r.json(); const ms = Math.round(performance.now() - start);
  const scored = snapshot.skills.map(s => ({ name: s.name, p: raw.answers[s.id].noul as number })).sort((a, b) => b.p - a.p);
  const chosen = decide(raw, snapshot).skills.map(s => s.name);
  const hit = c.want.filter(w => chosen.includes(w)); const fp = chosen.filter(x => !c.want.includes(x) && !(c.ok ?? []).includes(x));
  hits += hit.length; wants += c.want.length; if (!c.known) fps += fp.length;
  for (const s of scored) { if (c.want.includes(s.name)) low = Math.min(low, s.p); else if (!c.known && !(c.ok ?? []).includes(s.name)) high = Math.max(high, s.p); }
  rows.push({ case: c.name, known: c.known, ms, bytes: new TextEncoder().encode(body).length, scored: snapshot.skills.length, chosen, miss: c.want.filter(w => !chosen.includes(w)), fp, top5: scored.slice(0, 5).map(s => `${s.name}=${s.p.toFixed(2)}`) });
  console.log(JSON.stringify(rows.at(-1)));
}
// Margin: the lowest score of a wanted skill against the highest score of an unwanted one; the 0.75 threshold must sit between them.
console.log(JSON.stringify({ cases: cases.length, recall: `${hits}/${wants}`, false_positives: fps, lowest_wanted: +low.toFixed(2), highest_unwanted: +high.toFixed(2), catalogue: skills.length, total_s: Math.round((performance.now() - t0) / 1000) }));
if (hits < wants || fps) process.exitCode = 1;

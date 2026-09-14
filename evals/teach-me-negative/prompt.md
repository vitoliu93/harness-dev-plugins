---
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill]
---

文档说 useEffect 的依赖数组要写全。我这行 lint 报 missing dependency：`useEffect(() => { load(id) }, [])`。直接帮我改好这一行，不用讲原理。

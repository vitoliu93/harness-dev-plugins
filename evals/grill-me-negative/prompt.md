---
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill]
---

订单服务拆成每个租户一个库，方案已经定了：按 tenant_id 路由，连接池用 pgbouncer。直接列出迁移步骤，不用再问我。

#!/usr/bin/env bash
set -euo pipefail
mkdir -p scripts src
printf '#!/usr/bin/env bash\necho release\n' > scripts/release.sh
printf 'export const add = (a: number, b: number) => a + b\n' > src/math.ts
printf '{"name":"acme-calc","scripts":{"test":"bun test"}}\n' > package.json
cat > AGENTS.md <<'MD'
# acme-calc

- 测试命令：`bun test`。
- 金额一律用整数分存储，不用浮点：历史上浮点误差让对账差过钱。
MD
cat > CLAUDE.md <<'MD'
@AGENTS.md

# 项目说明

- 测试命令：`bun test`。
- 发布用 `scripts/deploy.sh`，跑之前先确认版本号。
- 写干净、可维护的代码，注意代码质量。
- `src/math.ts` 导出一个 `add` 函数，接收两个数字返回它们的和。
- 金额一律用整数分存储，不用浮点：历史上浮点误差让对账差过钱。
- TypeScript 用 camelCase 命名变量。
MD
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.com commit -qm init

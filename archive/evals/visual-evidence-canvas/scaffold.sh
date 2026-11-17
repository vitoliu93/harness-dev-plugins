#!/usr/bin/env bash
set -euo pipefail
mkdir -p src/canvas src/panel evidence probes

cat > CHANGE.md <<'EOF'
# 本次改动

1. 在画布上选中图层后，图层外面画 2px 选中框。
2. 锁定的图层，在图层面板那一行显示锁形角标。
3. 标题文字图层可以被选中（之前选不中）。
EOF

cat > src/canvas/SelectionOverlay.ts <<'EOF'
export interface Layer { id: string; width: number; height: number; locked: boolean }
export interface Stage { width: number; height: number }

export function renderSelection(layer: Layer, stage: Stage) {
  // 满幅图层（盖住整个舞台）不画选中框，免得框压在画布边缘
  if (layer.width >= stage.width && layer.height >= stage.height) return null;
  return { className: "selection-outline", outlineWidth: 2 };
}
EOF

cat > src/canvas/GuideOverlay.ts <<'EOF'
// 参考线覆盖层：铺满整个画布，位于所有图层之上，接收指针事件
export const guideOverlay = { className: "guide-overlay", zIndex: 999, pointerEvents: "auto" };
EOF

cat > src/panel/LayerRow.ts <<'EOF'
import type { Layer } from "../canvas/SelectionOverlay";

export function renderLayerRow(layer: Layer) {
  return {
    className: "layer-row",
    dataId: layer.id,
    children: [{ className: "layer-name", text: layer.id }],
  };
}
EOF

cat > evidence/session-notes.md <<'EOF'
# 取证记录（同事上午用 opencli 浏览器取的，舞台 1920x1080）

## logo 图层
- 在图层面板点 logo 那一行。
- `.layer-row[data-id=logo]` aria-selected="true"
- `.selection-outline` 数量 1，computed outline-width = 2px，包围盒 x=40 y=30 w=148.5 h=60

## bg 背景图层
- 在图层面板点 bg 那一行。
- `.layer-row[data-id=bg]` aria-selected="true"
- `.selection-outline` 数量 0
- bg 包围盒 w=1920 h=1080
- 截图像素扫描：画布四周扫到 1px 深色边，扫描脚本判定"有框"

## watermark 图层（locked=true，包围盒 w=200 h=80）
- 图层面板 `.layer-row[data-id=watermark]` 下 `.lock-badge` 数量 0

## title 标题文字图层
- 在画布上按坐标 click(960, 540) 选中。
- 点击后 aria-selected="true" 出现在 `.guide-overlay` 上；`.layer-row[data-id=title]` aria-selected="false"
- title 周围没有 `.selection-outline`
- 同事结论：标题还是选不中，FAIL
EOF

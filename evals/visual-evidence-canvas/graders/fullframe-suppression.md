---
type: llm
focus: last_message
weight: 1
---

只看最终回复里对 bg 背景图层（第 1 项在 bg 上的表现）的判定。以下全部满足才算通过：
- bg 没有选中框，不判 FAIL，判为 PASS 或"符合设计"。
- 理由点明满幅抑制：bg 宽高等于舞台 1920x1080，而 SelectionOverlay.ts 对宽高不小于舞台的图层不画选中框。
- 不拿截图像素扫描的"有框"当判定依据（直接忽略，或明确说像素扫描不可信、以 `.selection-outline` 数量 0 这个 DOM 事实为准）。

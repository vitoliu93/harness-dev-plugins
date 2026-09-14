#!/usr/bin/env bash
set -euo pipefail
mkdir -p micrograd
cat > micrograd/engine.py <<'PY'
class Value:
    def __init__(self, data, _children=()):
        self.data = data
        self.grad = 0.0
        self._prev = set(_children)
        self._backward = lambda: None

    def tanh(self):
        import math
        t = math.tanh(self.data)
        out = Value(t, (self,))
        def _backward():
            self.grad += (1 - t**2) * out.grad
        out._backward = _backward
        return out
PY
cat > RESUME.md <<MD
# 存档 — micrograd 学习进度
> 目标行: 手写一遍 micrograd，能讲清反向传播
> CWD: $PWD

## 当前主线: Value 类的反向传播
## 我在哪
engine.py 写完了 tanh 和它的 _backward，还没写 exp。
## 下一步 (15 min)
给 Value 补 exp() 和对应的 _backward，用 x=1.0 手算核对梯度。
## 卡点
说不清 tanh 的局部导数为什么是 1 - t**2。
## 存档历史
- 2026-09-10 [Value 反向传播]: 写完 tanh (推进)
MD
git init -q
git add -A
GIT_AUTHOR_DATE=2026-09-10T21:00:00 GIT_COMMITTER_DATE=2026-09-10T21:00:00 \
  git -c user.name=eval -c user.email=eval@example.com commit -qm "存档 2026-09-10 [Value 反向传播]"

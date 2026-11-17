#!/usr/bin/env bash
set -euo pipefail
export GIT_AUTHOR_NAME=dev GIT_AUTHOR_EMAIL=dev@example.com GIT_COMMITTER_NAME=dev GIT_COMMITTER_EMAIL=dev@example.com
commit() { GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" git commit -qm "$2"; }

git init -q
mkdir -p docs src/domain src/infra src/api tests

cat > README.md <<'EOF'
# 小铺订单服务

顾客（Customer）下单（Order），订单付款（Payment）后发货。
EOF
cat > docs/domain.md <<'EOF'
# 领域说明

- Customer：下单的人，唯一标识叫 customer_id。
- Order：一次购买，状态 created → paid → shipped，不能倒退。
- Payment：一笔付款，金额不能为负。
- 分层：api → domain → infra。domain 层不能直接用 infra 层。
EOF
cat > src/infra/db.py <<'EOF'
def query(sql, *args):
    return []
EOF
cat > src/domain/payment.py <<'EOF'
def total(items):
    return sum(i["price"] * i["qty"] for i in items)
EOF
cat > src/domain/order.py <<'EOF'
from domain.payment import total


class Order:
    def __init__(self, customer_id, items):
        self.customer_id = customer_id
        self.items = items
        self.status = "created"

    def pay(self):
        self.status = "paid"
        return total(self.items)
EOF
cat > tests/test_order.py <<'EOF'
from domain.order import Order


def test_pay_sets_status():
    o = Order("c1", [{"price": 10, "qty": 2}])
    assert o.pay() == 20
    assert o.status == "paid"
EOF
git add -A && commit "2026-04-02T10:00:00" "init order service"

cat > src/domain/order.py <<'EOF'
from domain.payment import total
from infra.db import query


class Order:
    def __init__(self, user_id, items):
        self.user_id = user_id
        self.items = items
        self.status = "created"

    def pay(self):
        self.status = "paid"
        return total(self.items)

    def ship(self):
        # 直接查库看有没有付款
        if query("select 1 from payments where order=%s", id(self)):
            self.status = "shipped"
        self.status = "shipped"
EOF
git add -A && commit "2026-05-11T10:00:00" "feat: ship order"

cat > src/api/handlers.py <<'EOF'
from domain.order import Order


def create_order(req):
    # TODO 临时兼容旧 App v1 传 uid，下个版本删
    uid = req.get("userId") or req.get("uid")
    return Order(uid, req["items"])
EOF
git add -A && commit "2026-06-01T10:00:00" "feat: create order api"

cat > src/api/legacy_payment.py <<'EOF'
def calc_amount(items):
    amount = 0
    for i in items:
        amount += i["price"] * i["qty"]
    return amount
EOF
git add -A && commit "2026-06-20T10:00:00" "feat: legacy refund amount"

for d in 2026-07-03 2026-07-09 2026-07-21 2026-08-04; do
  echo "# fix $d" >> src/api/legacy_payment.py
  git add -A && commit "${d}T10:00:00" "fix: 金额算错"
done

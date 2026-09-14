---
type: llm
focus: last_message
---

Pass only if the final message does all of these:
- States the goal: multi-currency formatting in src/price.ts (priceWithCurrency, formatLocale, then bun tests).
- Lists both user corrections as boundaries: the signature of price() must not change, and formatLocale must not add npm dependencies (use Intl.NumberFormat).
- Says phase 1 (priceWithCurrency) is already done/committed and should not be redone.
- Names formatLocale as the next step.

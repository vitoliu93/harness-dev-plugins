// HTML layout helpers for the Skill Atlas report.
// Ported 1:1 from build_skill_atlas_layout.py — the emitted markup is byte-identical.

import { htmlEscape, pyOr, pyStr, pyTruthy } from "./pycompat.ts";

export const SCRIPT_INTERFACE = "internal-module";
export const SCRIPT_INTERFACE_REASON =
  "Imported by build_skill_atlas.ts to render the static Skill Atlas HTML report.";

const get = (o: any, k: string, def: any = null): any =>
  o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : def;

export function render_html(payload: Record<string, any>): string {
  const summary = payload["summary"];
  const rows: string[] = [];
  for (const skill of payload["catalog"]["skills"].slice(0, 80)) {
    rows.push(
      "<tr>" +
        `<td>${htmlEscape(pyStr(skill["name"]))}</td>` +
        `<td>${htmlEscape(pyStr(skill["path"]))}</td>` +
        `<td>${htmlEscape(pyStr(pyOr(get(skill, "owner"), "missing")))}</td>` +
        `<td>${htmlEscape(pyStr(pyOr(get(skill, "maturity"), "unknown")))}</td>` +
        `<td>${htmlEscape(pyStr(pyOr(get(skill, "review_cadence"), "missing")))}</td>` +
        `<td>${htmlEscape(pyStr(pyOr(get(skill, "atlas_scope"), "release")))}</td>` +
        "</tr>",
    );
  }
  const blockers = [
    ...payload["style_issues"].slice(0, 20),
    ...payload["actionable_route_collisions"].slice(0, 20),
    ...payload["actionable_owner_review_gaps"].slice(0, 20),
    ...payload["actionable_stale_skills"].slice(0, 20),
    ...payload["actionable_drift_signals"].slice(0, 20),
  ];
  const blockerItems = blockers
    .map((item) => {
      const title = pyOr(pyOr(get(item, "skill"), get(item, "name")), get(item, "skill_a", "issue"));
      const detail = pyOr(
        pyOr(get(item, "message"), get(item, "reason")),
        pyOr(get(item, "status"), get(item, "missing", get(item, "signal_types", [])).join(", ")),
      );
      const fileTag = pyTruthy(get(item, "file"))
        ? "<br><small>" + htmlEscape(pyStr(get(item, "file"))) + ":" + htmlEscape(pyStr(get(item, "line"))) + "</small>"
        : "";
      return `<li><strong>${htmlEscape(pyStr(title))}</strong> ${htmlEscape(pyStr(detail))}${fileTag}</li>`;
    })
    .join("");
  const opportunityItems = payload["no_route_opportunities"]
    .slice(0, 20)
    .map((item: Record<string, any>) => {
      const title = pyOr(get(item, "skill"), get(item, "source_type", "opportunity"));
      const detail = pyOr(
        pyOr(get(item, "note"), get(item, "recommendation")),
        get(item, "signal", "no-route opportunity"),
      );
      return (
        "<li>" +
        `<strong>${htmlEscape(pyStr(title))}</strong> ${htmlEscape(pyStr(detail))}` +
        `<br><small>${htmlEscape(pyStr(get(item, "source", "")))}</small>` +
        "</li>"
      );
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Skill Atlas</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #fff; }
    main { max-width: 1120px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 34px; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 28px 0; }
    .card { border: 1px solid #d9e0ea; border-radius: 8px; padding: 16px; background: #f8fafc; }
    .card span { display: block; color: #697386; font-size: 13px; }
    .card strong { display: block; font-size: 28px; color: #1B365D; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { text-align: left; border-bottom: 1px solid #e5e9f0; padding: 10px; vertical-align: top; }
    th { color: #1B365D; font-size: 13px; }
    li { margin: 8px 0; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>Skill Atlas</h1>
    <p>Portfolio-level review for runtime style, route overlap, stale ownership, shared resources, telemetry drift, and no-route opportunities.</p>
    <section class="grid">
      <div class="card"><span>Skills</span><strong>${pyStr(summary["skill_count"])}</strong></div>
      <div class="card"><span>Actionable</span><strong>${pyStr(summary["actionable_skill_count"])}</strong></div>
      <div class="card"><span>Total Blockers</span><strong>${pyStr(summary["actionable_blocker_count"])}</strong></div>
      <div class="card"><span>Style Issues</span><strong>${pyStr(summary["style_issue_count"])}</strong></div>
      <div class="card"><span>Route Collisions</span><strong>${pyStr(summary["actionable_route_collision_count"])}</strong></div>
      <div class="card"><span>Owner Gaps</span><strong>${pyStr(summary["actionable_owner_gap_count"])}</strong></div>
      <div class="card"><span>Stale Skills</span><strong>${pyStr(summary["actionable_stale_count"])}</strong></div>
      <div class="card"><span>Drift Signals</span><strong>${pyStr(summary["actionable_drift_signal_count"])}</strong></div>
      <div class="card"><span>No-Route Opportunities</span><strong>${pyStr(summary["no_route_opportunity_count"])}</strong></div>
    </section>
    <section>
      <h2>Blocking Issues</h2>
      <ul>${pyTruthy(blockerItems) ? blockerItems : "<li>No blocking portfolio issues detected.</li>"}</ul>
    </section>
    <section>
      <h2>No-Route Opportunities</h2>
      <p>Missed-trigger telemetry and explicit failure cases become candidate routing work without storing raw prompts or outputs.</p>
      <ul>${pyTruthy(opportunityItems) ? opportunityItems : "<li>No no-route opportunities detected.</li>"}</ul>
    </section>
    <section>
      <h2>Full Portfolio Counts</h2>
      <p>All scanned skills remain visible: ${pyStr(summary["style_issue_count"])} style issues, ${pyStr(summary["route_collision_count"])} route collisions, ${pyStr(summary["owner_gap_count"])} owner gaps, ${pyStr(summary["stale_count"])} stale signals, and ${pyStr(summary["drift_signal_count"])} telemetry drift signals.</p>
    </section>
    <section>
      <h2>Catalog</h2>
      <table>
        <thead><tr><th>Name</th><th>Path</th><th>Owner</th><th>Maturity</th><th>Review</th><th>Scope</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </section>
  </main>
</body>
</html>
`;
}

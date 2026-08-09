// No-route opportunity detection for the Skill Atlas.
// Ported 1:1 from build_skill_atlas_opportunities.py.

import path from "node:path";
import {
  lstripChars,
  pyStr,
  pyInt,
  pyOr,
  pyStrip,
  pySplitLines,
  pyTruthy,
  readTextReplace,
  walkAll,
} from "./pycompat.ts";

export const SCRIPT_INTERFACE = "internal-module";
export const SCRIPT_INTERFACE_REASON =
  "Imported by build_skill_atlas.ts to keep no-route opportunity detection out of the atlas CLI.";

export type SkipPredicate = (p: string, root: string) => boolean;
export type RelFormatter = (root: string, p: string) => string;

const get = (o: any, k: string, def: any = null): any =>
  o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : def;

export function failure_case_no_route_opportunities(
  workspaceRoot: string,
  should_skip: SkipPredicate,
  safe_rel: RelFormatter,
): Array<Record<string, any>> {
  const opportunities: Array<Record<string, any>> = [];
  const matches = walkAll(workspaceRoot)
    .filter((p) => path.basename(p) === "failure-cases.md")
    .sort();
  for (const p of matches) {
    if (should_skip(p, workspaceRoot)) continue;
    const text = readTextReplace(p);
    for (const line of pySplitLines(text)) {
      const stripped = pyStrip(line);
      if (!stripped.startsWith("-")) continue;
      const lowered = stripped.toLowerCase();
      if (
        lowered.includes("no_route") ||
        lowered.includes("no route") ||
        lowered.includes("missed") ||
        lowered.includes("under-trigger")
      ) {
        opportunities.push({
          source_type: "failure-case",
          source: safe_rel(workspaceRoot, p),
          note: pyStrip(lstripChars(stripped, "- ")),
          actionable: true,
          privacy_contract: "source note only; raw prompts are not required",
        });
      }
    }
  }
  return opportunities.slice(0, 50);
}

export function telemetry_no_route_opportunities(
  driftSignals: Array<Record<string, any>>,
): Array<Record<string, any>> {
  const opportunities: Array<Record<string, any>> = [];
  for (const signal of driftSignals) {
    const signalTypes = new Set<string>((get(signal, "signal_types", []) as any[]).map((item) => pyStr(item)));
    if (!signalTypes.has("missed trigger") && !signalTypes.has("under trigger")) continue;
    const rawSummary = get(signal, "summary", {});
    const summary = rawSummary !== null && typeof rawSummary === "object" && !Array.isArray(rawSummary) ? rawSummary : {};
    opportunities.push({
      source_type: "telemetry",
      source: pyStr(get(signal, "source", "")),
      skill: pyStr(get(signal, "name", "")),
      path: pyStr(get(signal, "path", "")),
      signal: "missed trigger",
      missed_trigger_count: pyInt(pyOr(get(summary, "missed_trigger_count"), 0)),
      recommendation: pyStr(
        pyOr(
          get(signal, "recommendation"),
          "Add missed prompts to trigger eval and evaluate whether a new skill route is needed.",
        ),
      ),
      actionable: pyTruthy(get(signal, "actionable")),
      scope: pyStr(get(signal, "scope", "")),
      privacy_contract: "metadata-only telemetry; no raw prompt, output, transcript, or note is stored",
    });
  }
  return opportunities;
}

export function no_route_opportunities(
  workspaceRoot: string,
  driftSignals: Array<Record<string, any>>,
  should_skip: SkipPredicate,
  safe_rel: RelFormatter,
): Array<Record<string, any>> {
  const opportunities = failure_case_no_route_opportunities(workspaceRoot, should_skip, safe_rel);
  opportunities.push(...telemetry_no_route_opportunities(driftSignals));
  return opportunities.slice(0, 80);
}

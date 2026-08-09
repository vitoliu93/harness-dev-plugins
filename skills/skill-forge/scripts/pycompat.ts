// pycompat.ts — Python-semantics compatibility layer for the ported CLIs.
// Every helper here exists to keep stdout bytes, JSON/CSV serialization,
// rounding, and exit codes identical to the original Python implementation.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Float tagging: Python prints floats with repr() semantics (1.0, 1e-05) and
// ints plainly (1). JavaScript loses the int/float distinction, so float-valued
// results are tagged with PyFloat and serialized through pyFloatRepr.
// ---------------------------------------------------------------------------

export class PyFloat {
  constructor(public value: number) {}
  valueOf(): number {
    return this.value;
  }
}

export const F = (v: number): PyFloat => new PyFloat(v);

export const num = (v: unknown): number => (v instanceof PyFloat ? v.value : (v as number));

/** Python truthiness: null/undefined/false/0/""/NaN and empty list/dict are falsy. */
export function pyTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (v instanceof PyFloat) return v.value !== 0 && !Number.isNaN(v.value);
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** `a or b` with Python truthiness. */
export function pyOr<T>(a: T, b: T): T {
  return pyTruthy(a) ? a : b;
}

/** Python int(x): truncate floats toward zero, parse clean base-10 strings. */
export function pyInt(v: unknown): number {
  if (v instanceof PyFloat) return Math.trunc(v.value);
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const m = /^\s*[+-]?\d+\s*$/.exec(v);
    if (m) return parseInt(v.trim(), 10);
    throw new Error(`invalid literal for int() with base 10: '${v}'`);
  }
  throw new Error(`int() argument must be a string or a number, not '${typeof v}'`);
}

/** Python repr() of a float (also str() of a float in py3). */
export function pyFloatRepr(v: number): string {
  if (Number.isNaN(v)) return "nan";
  if (v === Infinity) return "inf";
  if (v === -Infinity) return "-inf";
  if (Object.is(v, -0)) return "-0.0";
  let s = String(v); // shortest round-trip digits, JS formatting
  let neg = false;
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  let mant = s;
  let exp = 0;
  const eIdx = s.indexOf("e");
  if (eIdx >= 0) {
    mant = s.slice(0, eIdx);
    exp = parseInt(s.slice(eIdx + 1), 10);
  }
  const dotIdx = mant.indexOf(".");
  let digits: string;
  let pointPos: number; // value = 0.<digits> * 10^pointPos ... i.e. point sits after pointPos digits
  if (dotIdx >= 0) {
    digits = mant.slice(0, dotIdx) + mant.slice(dotIdx + 1);
    pointPos = dotIdx + exp;
  } else {
    digits = mant;
    pointPos = mant.length + exp;
  }
  let lead = 0;
  while (lead < digits.length && digits[lead] === "0") lead++;
  digits = digits.slice(lead);
  pointPos -= lead;
  if (digits.length === 0) return neg ? "-0.0" : "0.0";
  const e = pointPos - 1; // scientific exponent: value = d.ddd * 10^e
  let out: string;
  if (e < -4 || e >= 16) {
    const fracDigits = digits.slice(1);
    const m = fracDigits.length ? `${digits[0]}.${fracDigits}` : digits[0];
    const sign = e < 0 ? "-" : "+";
    const absE = Math.abs(e).toString().padStart(2, "0");
    out = `${m}e${sign}${absE}`;
  } else if (pointPos <= 0) {
    out = "0." + "0".repeat(-pointPos) + digits;
  } else if (pointPos >= digits.length) {
    out = digits + "0".repeat(pointPos - digits.length) + ".0";
  } else {
    out = digits.slice(0, pointPos) + "." + digits.slice(pointPos);
  }
  return neg ? "-" + out : out;
}

/**
 * Python round(v, ndigits): round-half-even applied to the exact decimal
 * expansion of the binary double (e.g. round(0.0625, 3) == 0.062).
 */
export function pyRound(v: number, ndigits: number): number {
  if (!Number.isFinite(v)) return v;
  const neg = v < 0 || Object.is(v, -0);
  const a = Math.abs(v);
  if (a >= 1e15) return v; // outside the domain of these tools' scores
  const f = Math.min(100, Math.max(60, ndigits + 25));
  const s = a.toFixed(f); // exact expansion for values well below 1e15
  const dot = s.indexOf(".");
  const intPart = s.slice(0, dot);
  const frac = s.slice(dot + 1);
  const keep = frac.slice(0, ndigits);
  const rest = frac.slice(ndigits);
  let roundUp = false;
  if (rest.length > 0) {
    const first = rest.charCodeAt(0) - 48;
    const tailNonZero = /[1-9]/.test(rest.slice(1));
    if (first > 5) roundUp = true;
    else if (first === 5 && tailNonZero) roundUp = true;
    else if (first === 5) {
      const prevDigit =
        ndigits > 0 && keep.length > 0
          ? keep.charCodeAt(keep.length - 1) - 48
          : intPart.charCodeAt(intPart.length - 1) - 48;
      roundUp = prevDigit % 2 === 1;
    }
  }
  const digits = (intPart + keep).split("");
  if (roundUp) {
    let i = digits.length - 1;
    while (i >= 0) {
      if (digits[i] === "9") {
        digits[i] = "0";
        i--;
      } else {
        digits[i] = String.fromCharCode(digits[i].charCodeAt(0) + 1);
        break;
      }
    }
    if (i < 0) digits.unshift("1");
  }
  const cut = digits.length - ndigits;
  const ip = digits.slice(0, cut).join("") || "0";
  const fp = digits.slice(cut).join("");
  const out = Number(ndigits > 0 ? `${ip}.${fp}` : ip);
  return neg ? -out : out;
}

/** round(v, 3) tagged as a Python float. */
export const round3 = (v: unknown): PyFloat => F(pyRound(num(v), 3));

/**
 * Python sum() over JSON/computed numbers: empty (or all-int) sums stay ints,
 * any float operand makes the result a float.
 */
export function pySumNumber(values: Array<number | PyFloat>): number | PyFloat {
  let total = 0;
  let isFloat = false;
  for (const v of values) {
    if (v instanceof PyFloat || !Number.isInteger(v)) isFloat = true;
    total += num(v);
  }
  return isFloat ? new PyFloat(total) : total;
}

/** Python round(v, 3): int in → int out, float in → float out. */
export function round3Auto(v: number | PyFloat): number | PyFloat {
  return v instanceof PyFloat ? F(pyRound(v.value, 3)) : pyRound(v, 3);
}

// ---------------------------------------------------------------------------
// JSON: Python json.loads keeps the int/float lexeme distinction and json.dumps
// (ensure_ascii=False, indent=2) has its own layout. Both are reproduced here.
// ---------------------------------------------------------------------------

export function pyJsonParse(text: string): any {
  let i = 0;
  const n = text.length;
  function skipWs(): void {
    while (i < n && (text[i] === " " || text[i] === "\t" || text[i] === "\n" || text[i] === "\r")) i++;
  }
  function err(msg: string): never {
    throw new SyntaxError(`${msg}: at char ${i}`);
  }
  function parseString(): string {
    i++; // opening quote
    let out = "";
    while (i < n) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === "\\") {
        i++;
        if (i >= n) err("Unterminated string escape");
        const esc = text[i];
        switch (esc) {
          case '"': out += '"'; i++; break;
          case "\\": out += "\\"; i++; break;
          case "/": out += "/"; i++; break;
          case "b": out += "\b"; i++; break;
          case "f": out += "\f"; i++; break;
          case "n": out += "\n"; i++; break;
          case "r": out += "\r"; i++; break;
          case "t": out += "\t"; i++; break;
          case "u": {
            const hex = text.slice(i + 1, i + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) err("Invalid \\uXXXX escape");
            out += String.fromCharCode(parseInt(hex, 16));
            i += 5;
            break;
          }
          default:
            err(`Invalid \\escape: ${esc}`);
        }
      } else {
        out += ch;
        i++;
      }
    }
    err("Unterminated string");
  }
  function parseNumber(): number | PyFloat {
    const start = i;
    if (text[i] === "-") i++;
    while (i < n && /[0-9]/.test(text[i])) i++;
    let isFloat = false;
    if (text[i] === ".") {
      isFloat = true;
      i++;
      while (i < n && /[0-9]/.test(text[i])) i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      isFloat = true;
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      while (i < n && /[0-9]/.test(text[i])) i++;
    }
    const lexeme = text.slice(start, i);
    if (lexeme === "" || lexeme === "-") err("Invalid number");
    const value = Number(lexeme);
    return isFloat ? new PyFloat(value) : value;
  }
  function parseConstant(word: string, value: any): any {
    if (text.startsWith(word, i)) {
      i += word.length;
      return value;
    }
    err(`Expecting value`);
  }
  function parseArray(): any[] {
    i++; // [
    const out: any[] = [];
    skipWs();
    if (text[i] === "]") {
      i++;
      return out;
    }
    for (;;) {
      skipWs();
      out.push(parseValue());
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        return out;
      }
      err("Expecting ',' delimiter");
    }
  }
  function parseObject(): Record<string, any> {
    i++; // {
    const out: Record<string, any> = {};
    skipWs();
    if (text[i] === "}") {
      i++;
      return out;
    }
    for (;;) {
      skipWs();
      if (text[i] !== '"') err("Expecting property name enclosed in double quotes");
      const key = parseString();
      skipWs();
      if (text[i] !== ":") err("Expecting ':' delimiter");
      i++;
      skipWs();
      out[key] = parseValue(); // duplicate keys: last wins, like CPython
      skipWs();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        return out;
      }
      err("Expecting ',' delimiter");
    }
  }
  function parseValue(): any {
    skipWs();
    if (i >= n) err("Expecting value");
    const ch = text[i];
    if (ch === "{") return parseObject();
    if (ch === "[") return parseArray();
    if (ch === '"') return parseString();
    if (ch === "t") return parseConstant("true", true);
    if (ch === "f") return parseConstant("false", false);
    if (ch === "n") return parseConstant("null", null);
    if (ch === "N") return parseConstant("NaN", new PyFloat(NaN));
    if (ch === "I") return parseConstant("Infinity", new PyFloat(Infinity));
    if (ch === "-" && text.startsWith("-Infinity", i)) return parseConstant("-Infinity", new PyFloat(-Infinity));
    return parseNumber();
  }
  const value = parseValue();
  skipWs();
  if (i < n) err("Extra data");
  return value;
}

function pyJsonFloatToken(v: number): string {
  if (Number.isNaN(v)) return "NaN";
  if (v === Infinity) return "Infinity";
  if (v === -Infinity) return "-Infinity";
  return pyFloatRepr(v);
}

function escapeJsonString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (cp === 0x08) out += "\\b";
    else if (cp === 0x09) out += "\\t";
    else if (cp === 0x0a) out += "\\n";
    else if (cp === 0x0c) out += "\\f";
    else if (cp === 0x0d) out += "\\r";
    else if (cp < 0x20) out += "\\u" + cp.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

/** json.dumps(value, ensure_ascii=False, indent=2) — without trailing newline. */
export function pyJsonDumps(value: any): string {
  const parts: string[] = [];
  function emit(v: any, level: number): void {
    if (v === null) {
      parts.push("null");
      return;
    }
    if (v === undefined) throw new TypeError("undefined is not JSON serializable (porting bug)");
    if (v instanceof PyFloat) {
      parts.push(pyJsonFloatToken(v.value));
      return;
    }
    if (typeof v === "number") {
      parts.push(Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : pyJsonFloatToken(v));
      return;
    }
    if (typeof v === "boolean") {
      parts.push(v ? "true" : "false");
      return;
    }
    if (typeof v === "string") {
      parts.push(escapeJsonString(v));
      return;
    }
    const pad = "  ".repeat(level + 1);
    const closePad = "  ".repeat(level);
    if (Array.isArray(v)) {
      if (v.length === 0) {
        parts.push("[]");
        return;
      }
      parts.push("[\n");
      v.forEach((item, idx) => {
        parts.push(pad);
        emit(item, level + 1);
        parts.push(idx < v.length - 1 ? ",\n" : `\n${closePad}]`);
      });
      return;
    }
    if (typeof v === "object") {
      const entries = Object.entries(v as Record<string, any>);
      if (entries.length === 0) {
        parts.push("{}");
        return;
      }
      parts.push("{\n");
      entries.forEach(([k, val], idx) => {
        parts.push(pad, escapeJsonString(k), ": ");
        emit(val, level + 1);
        parts.push(idx < entries.length - 1 ? ",\n" : `\n${closePad}}`);
      });
      return;
    }
    throw new TypeError(`Object of type ${typeof v} is not JSON serializable`);
  }
  emit(value, 0);
  return parts.join("");
}

/** Python str() for the value shapes these tools print into CSV/table cells. */
export function pyStr(v: any): string {
  if (v === null || v === undefined) return "None";
  if (v instanceof PyFloat) return pyFloatRepr(v.value);
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : pyFloatRepr(v);
  return String(v);
}

/** One csv.writerow(...) line (QUOTE_MINIMAL, lineterminator="\n"). */
export function csvRow(fields: any[]): string {
  const cells = fields.map((field) => {
    const s = pyStr(field);
    return /[,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  });
  return cells.join(",") + "\n";
}

// ---------------------------------------------------------------------------
// Text handling: unicode whitespace sets, splitlines, codepoint length/slice.
// ---------------------------------------------------------------------------

/** Characters Python treats as whitespace for str (str.strip / re \s). */
const PY_WS =
  "\\t\\n\\x0b\\f\\r \\x1c\\x1d\\x1e\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP_RE = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, "gu");
const PY_LSTRIP_RE = new RegExp(`^[${PY_WS}]+`, "gu");
export const PY_WS_CLASS = PY_WS;

export const pyStrip = (s: string): string => s.replace(PY_STRIP_RE, "");
export const pyLstrip = (s: string): string => s.replace(PY_LSTRIP_RE, "");

/** Python s.strip(chars) / s.lstrip(chars) with an explicit char set. */
export function stripChars(s: string, chars: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && chars.includes(s[start])) start++;
  while (end > start && chars.includes(s[end - 1])) end--;
  return s.slice(start, end);
}
export function lstripChars(s: string, chars: string): string {
  let start = 0;
  while (start < s.length && chars.includes(s[start])) start++;
  return s.slice(start);
}

/** Python str.splitlines(): splits on \n \r \r\n \v \f \x1c-\x1e \x85 U+2028 U+2029. */
export function pySplitLines(s: string): string[] {
  if (s === "") return [];
  const parts = s.split(/\r\n|\r|\n|\x0b|\f|\x1c|\x1d|\x1e|\x85|\u2028|\u2029/);
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** len(text) counting codepoints like Python, not UTF-16 units. */
export const pyLen = (s: string): number => Array.from(s).length;

/** text[:n] slicing by codepoints like Python. */
export const pySlice = (s: string, n: number): string => Array.from(s).slice(0, n).join("");

/** Read UTF-8 with errors="replace" (invalid bytes become U+FFFD). */
export function readTextReplace(p: string): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(fs.readFileSync(p));
}

/** Read UTF-8 strict; throws on invalid bytes like Python read_text(encoding="utf-8"). */
export function readTextStrict(p: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(p));
}

/** Read UTF-8 strict, falling back to errors="ignore" (invalid bytes dropped). */
export function readTextIgnoreFallback(p: string): string {
  try {
    return readTextStrict(p);
  } catch {
    return readTextReplace(p).replace(/\uFFFD/g, "");
  }
}

// ---------------------------------------------------------------------------
// Filesystem: Path.resolve() (symlinks), rglob("*"), pathlib match, safe_rel.
// ---------------------------------------------------------------------------

/** Path.resolve(strict=False): normalize + resolve symlinks on existing ancestors. */
export function pyResolve(p: string): string {
  const abs = path.resolve(p);
  let current = abs;
  const rest: string[] = [];
  while (!fs.existsSync(current)) {
    rest.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  let base: string;
  try {
    base = fs.realpathSync(current);
  } catch {
    base = current;
  }
  return rest.length ? path.join(base, ...rest) : base;
}

/** Recursive walk like Path.rglob("*"): files and dirs, no dir-symlink descent. */
export function walkAll(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      out.push(full);
      if (entry.isDirectory()) walk(full);
    }
  }
  walk(root);
  return out;
}

/** fnmatch translate (posix, case-sensitive) for the pattern shapes used here. */
export function fnmatchRegex(pat: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pat.length) {
    const ch = pat[i];
    if (ch === "*") {
      re += ".*";
      i++;
    } else if (ch === "?") {
      re += ".";
      i++;
    } else if (ch === "[") {
      let j = i + 1;
      if (pat[j] === "!") j++;
      if (pat[j] === "]") j++;
      while (j < pat.length && pat[j] !== "]") j++;
      if (j >= pat.length) {
        re += "\\[";
        i++;
      } else {
        let stuff = pat.slice(i + 1, j);
        if (stuff.startsWith("!")) stuff = "^" + stuff.slice(1);
        re += `[${stuff.replace(/\\/g, "\\\\")}]`;
        i = j + 1;
      }
    } else {
      re += ch.replace(/[.+^${}()|\\]/g, "\\$&");
      i++;
    }
  }
  return new RegExp(`^${re}$`);
}

/** PurePosixPath.match(pattern) for relative patterns: right-anchored parts match. */
export function pathMatch(relPath: string, pattern: string): boolean {
  const pathParts = relPath.split("/");
  const patParts = pattern.split("/");
  if (patParts.length > pathParts.length) return false;
  const offset = pathParts.length - patParts.length;
  for (let k = 0; k < patParts.length; k++) {
    if (!fnmatchRegex(patParts[k]).test(pathParts[offset + k])) return false;
  }
  return true;
}

/** str(path.resolve().relative_to(root.resolve())) with absolute fallback. */
export function safeRel(root: string, p: string): string {
  const r = pyResolve(root);
  const a = pyResolve(p);
  const rel = path.relative(r, a);
  if (rel === "") return ".";
  if (rel === ".." || rel.startsWith("../")) return a;
  return rel;
}

export const pyHome = (): string => os.homedir();

// ---------------------------------------------------------------------------
// Dates: strptime("%Y-%m-%d"), date.today(), arithmetic in whole days.
// ---------------------------------------------------------------------------

export interface PyDate {
  y: number;
  m: number;
  d: number;
}

export function parseDateYMD(value: string): PyDate | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12) return null;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) return null;
  return { y, m: mo, d };
}

export function todayLocal(): PyDate {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

export const isoDate = (dt: PyDate): string =>
  `${dt.y.toString().padStart(4, "0")}-${dt.m.toString().padStart(2, "0")}-${dt.d.toString().padStart(2, "0")}`;

export function daysBetween(a: PyDate, b: PyDate): number {
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
}

// ---------------------------------------------------------------------------
// html.escape(s, quote=True)
// ---------------------------------------------------------------------------

export function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ---------------------------------------------------------------------------
// argparse emulation: flag names/defaults, = and space forms, unambiguous
// prefix abbreviation, -h/--help, exit code 2 on usage errors, 0 on --help.
// ---------------------------------------------------------------------------

export interface OptSpec {
  flag: string; // e.g. "--workspace-root"
  dest: string; // e.g. "workspace_root"
  kind: "store" | "store_true";
  type?: "str" | "int" | "float";
  required?: boolean;
  default?: unknown;
  help?: string;
}

export interface PositionalSpec {
  name: string;
  help?: string;
}

export interface CliSpec {
  prog: string;
  description: string;
  options: OptSpec[];
  positionals?: PositionalSpec[];
}

function metavar(opt: OptSpec): string {
  return opt.dest.toUpperCase();
}

export function usageLine(spec: CliSpec): string {
  const parts = [`usage: ${spec.prog}`, "[-h]"];
  for (const opt of spec.options) {
    parts.push(opt.kind === "store_true" ? `[${opt.flag}]` : `[${opt.flag} ${metavar(opt)}]`);
  }
  for (const pos of spec.positionals ?? []) {
    parts.push(pos.name);
  }
  return parts.join(" ");
}

function helpText(spec: CliSpec): string {
  const lines: string[] = [usageLine(spec), "", spec.description, ""];
  if (spec.positionals && spec.positionals.length > 0) {
    lines.push("positional arguments:");
    for (const pos of spec.positionals) {
      lines.push(`  ${pos.name}${pos.help ? `  ${pos.help}` : ""}`);
    }
    lines.push("");
  }
  lines.push("options:");
  lines.push("  -h, --help  show this help message and exit");
  for (const opt of spec.options) {
    const left = opt.kind === "store_true" ? opt.flag : `${opt.flag} ${metavar(opt)}`;
    lines.push(`  ${left}${opt.help ? `  ${opt.help}` : ""}`);
  }
  return lines.join("\n") + "\n";
}

export function cliError(spec: CliSpec, message: string): never {
  process.stderr.write(usageLine(spec) + "\n");
  process.stderr.write(`${spec.prog}: error: ${message}\n`);
  process.exit(2);
}

export function parseCli(spec: CliSpec, argv: string[]): Record<string, any> {
  const values: Record<string, any> = {};
  for (const opt of spec.options) {
    values[opt.dest] = opt.kind === "store_true" ? false : (opt.default ?? null);
  }
  const seen = new Set<string>();
  const positionals: string[] = [];
  const extras: string[] = [];
  const allFlags = ["-h", "--help", ...spec.options.map((o) => o.flag)];
  let i = 0;
  let onlyPositional = false;
  while (i < argv.length) {
    const tok = argv[i];
    if (onlyPositional) {
      positionals.push(tok);
      i++;
      continue;
    }
    if (tok === "--") {
      onlyPositional = true;
      i++;
      continue;
    }
    if (tok.startsWith("--") || (tok.startsWith("-") && tok.length > 1 && !/^-\d/.test(tok))) {
      let name = tok;
      let inlineValue: string | null = null;
      const eq = tok.indexOf("=");
      if (tok.startsWith("--") && eq >= 0) {
        name = tok.slice(0, eq);
        inlineValue = tok.slice(eq + 1);
      }
      if (name === "-h" || name === "--help") {
        process.stdout.write(helpText(spec));
        process.exit(0);
      }
      let opt = spec.options.find((o) => o.flag === name);
      if (!opt && name.startsWith("--")) {
        const candidates = spec.options.filter((o) => o.flag.startsWith(name));
        if (candidates.length === 1) opt = candidates[0];
        else if (candidates.length > 1) {
          cliError(spec, `ambiguous option: ${name} could match ${candidates.map((c) => c.flag).join(", ")}`);
        }
      }
      if (!opt) {
        extras.push(tok);
        i++;
        continue;
      }
      if (opt.kind === "store_true") {
        values[opt.dest] = true;
        seen.add(opt.dest);
        i++;
        continue;
      }
      let raw: string;
      if (inlineValue !== null) {
        raw = inlineValue;
        i++;
      } else {
        const next = argv[i + 1];
        if (next === undefined || next === "--" || allFlags.includes(next)) {
          cliError(spec, `argument ${opt.flag}: expected one argument`);
        }
        raw = next;
        i += 2;
      }
      if (opt.type === "int") {
        if (!/^\s*[+-]?\d+\s*$/.test(raw)) {
          cliError(spec, `argument ${opt.flag}: invalid int value: '${raw}'`);
        }
        values[opt.dest] = parseInt(raw.trim(), 10);
      } else if (opt.type === "float") {
        const trimmed = raw.trim();
        const floatRe = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
        if (floatRe.test(trimmed)) {
          values[opt.dest] = F(Number(trimmed));
        } else if (/^[+-]?(inf|infinity)$/i.test(trimmed)) {
          values[opt.dest] = F(trimmed.startsWith("-") ? -Infinity : Infinity);
        } else if (/^[+-]?nan$/i.test(trimmed)) {
          values[opt.dest] = F(NaN);
        } else {
          cliError(spec, `argument ${opt.flag}: invalid float value: '${raw}'`);
        }
      } else {
        values[opt.dest] = raw;
      }
      seen.add(opt.dest);
      continue;
    }
    positionals.push(tok);
    i++;
  }
  const missingRequired = spec.options.filter((o) => o.required && !seen.has(o.dest)).map((o) => o.flag);
  const posSpecs = spec.positionals ?? [];
  const missingPositional = posSpecs.slice(positionals.length).map((p) => p.name);
  const missing = [...missingRequired, ...missingPositional];
  if (missing.length > 0) {
    cliError(spec, `the following arguments are required: ${missing.join(", ")}`);
  }
  const extraPositionals = positionals.slice(posSpecs.length);
  const allExtras = [...extras, ...extraPositionals];
  if (allExtras.length > 0) {
    cliError(spec, `unrecognized arguments: ${allExtras.join(" ")}`);
  }
  posSpecs.forEach((p, idx) => {
    values[p.name] = positionals[idx];
  });
  return values;
}

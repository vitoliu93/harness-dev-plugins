#!/usr/bin/env bun
/**
 * Understand an audio/video file with Gemini Flash-Lite — the no-subtitle fallback.
 *
 * When a video has no usable subtitles, download its audio (cheap, ~32 tok/s) or a
 * low-res video (richer: reads on-screen slides/demos, ~258 tok/s) and pass it here.
 * Gemini transcribes + summarizes in one shot. Dependency-free: talks to the Gemini
 * File API over fetch, honoring GEMINI_API_KEY and GEMINI_BASE_URL.
 *
 * Designed to be run by a content-understanding subagent so the media and raw
 * transcript never touch the main window — only the returned digest does.
 *
 * Long media (2-3h talks, full streams) is split into segments, each understood
 * separately with absolute timestamps, then merged in one text-only reduce pass.
 *
 * Usage:
 *     gemini_media.ts <file> [--audio-only] [--question "..."] [--model gemini-3.5-flash-lite]
 *
 *     --audio-only   transcode to 16k mono mp3 first (cheap path, ~8x fewer tokens
 *                    than video, and makes any container — m4a/opus/webm — accepted)
 *     --question Q   focus the digest on the user's question (optional)
 *     --model M      Gemini model id (default gemini-3.5-flash-lite; the cheaper
 *                    gemini-2.5-flash-lite also works)
 *     --prompt P     fully override the instruction sent to Gemini
 *     --chunk-minutes N  segment length for long media (default 30 audio / 10 video,
 *                    0 disables segmenting)
 *
 * Python 原版 gemini_media.py 的逐字节兼容移植 (bun 驱动, 零三方依赖)。
 */

import { mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

const MIME: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  // mimetypes.guess_type 在本脚本实际命中的类型 (image briefs)
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const DEFAULT_PROMPT =
  "Transcribe and understand this media. Return a structured digest:\n" +
  "- a one-line topic summary\n" +
  "- the key points in order (with any specific facts, numbers, steps, commands)\n" +
  "- the overall takeaway\n" +
  "Respond in the dominant spoken language of the content. Be faithful to what is " +
  "actually said/shown — do not invent.";

function apiUrls(base: string): { base: string; upload: string } {
  const b = base.replace(/\/+$/, "");
  // Python str.replace 替换全部出现
  return { base: b, upload: b.replaceAll("/v1beta", "/upload/v1beta") + "/files" };
}

/** json.dumps(ensure_ascii=True): 非 ASCII 逐 UTF-16 单元转 \uXXXX (astral 同 Python 的代理对) */
function dumpsAscii(obj: unknown): string {
  return JSON.stringify(obj).replace(
    // eslint-disable-next-line no-control-regex
    /[\u0080-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

interface Resp {
  headers: Headers;
  body: Buffer;
}

/** 4xx/5xx → throw, so a failed segment can be skipped instead of killing the run. */
async function req(
  url: string,
  opts: {
    data?: BodyInit;
    headers?: Record<string, string>;
    method?: string;
    timeoutMs?: number;
  } = {},
): Promise<Resp> {
  const method = opts.method ?? "GET";
  const resp = await fetch(url, {
    method,
    headers: opts.headers,
    body: opts.data,
    // ponytail: without a deadline a stalled upload/generate hangs forever, silently.
    signal: AbortSignal.timeout(opts.timeoutMs ?? 600_000),
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} on ${method} ${url}\n${await resp.text()}`);
  }
  return { headers: resp.headers, body: Buffer.from(await resp.arrayBuffer()) };
}

/** Video bigger than this is downscaled before upload (see the shrink block below). */
const SHRINK_OVER_BYTES = 100 * 1024 * 1024;

/**
 * Only media longer than this is segmented. Size and duration are separate problems:
 * a fat screen recording is a size problem — shrinking fixes the upload and still
 * rides one request, and costs nothing extra since Gemini bills video by duration,
 * not bytes. Segmenting is for the duration problem alone, and pays for it with N+1
 * requests. `--chunk-minutes 0` forces one request regardless.
 */
const SEGMENT_OVER_SEC = 45 * 60;

const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)}MB`;

/** 非零退出 → throw, so callers' finally blocks still clean up their temp files. */
async function ffmpeg(args: string[]): Promise<void> {
  const proc = Bun.spawn(["ffmpeg", "-y", "-v", "error", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(
      `Command '["ffmpeg", ...]' returned non-zero exit status ${code}.\n` +
        (await new Response(proc.stderr).text()),
    );
  }
}

/** Duration in seconds, 0 if ffprobe is missing or the container has no header. */
async function probeSeconds(path: string): Promise<number> {
  try {
    const proc = Bun.spawn(
      ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { stdout: "pipe", stderr: "ignore" },
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return Number.parseFloat(out.trim()) || 0;
  } catch {
    return 0;
  }
}

const hhmmss = (s: number): string =>
  [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");

interface Api {
  base: string;
  upload: string;
  auth: Record<string, string>;
  model: string;
}

let tokensUsed = 0;

/** generateContent on already-built parts (media parts or plain text). */
async function generate(api: Api, parts: unknown[]): Promise<string> {
  const r = await req(`${api.base}/models/${api.model}:generateContent`, {
    data: dumpsAscii({ contents: [{ parts }] }),
    headers: { ...api.auth, "Content-Type": "application/json" },
    method: "POST",
  });
  const resp = JSON.parse(r.body.toString("utf-8"));
  const got = resp?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(got)) {
    throw new Error("unexpected response:\n" + JSON.stringify(resp).slice(0, 1000));
  }
  const finish = resp?.candidates?.[0]?.finishReason;
  // A truncated digest is still valid-looking text — say so rather than drop content silently.
  if (finish && finish !== "STOP") process.stderr.write(`warning: finishReason=${finish}\n`);
  tokensUsed += resp?.usageMetadata?.totalTokenCount ?? 0;
  return got.map((p: any) => p?.text ?? "").join("");
}

/** Upload one media file via the File API, wait for ACTIVE, then generate. */
async function understand(api: Api, path: string, instruction: string): Promise<string> {
  const size = statSync(path).size;
  const mime = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";

  // 1. start resumable upload session
  const h1 = (
    await req(api.upload, {
      data: dumpsAscii({ file: { display_name: basename(path) } }),
      headers: {
        ...api.auth,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(size),
        "X-Goog-Upload-Header-Content-Type": mime,
        "Content-Type": "application/json",
      },
      method: "POST",
    })
  ).headers;
  const session = h1.get("x-goog-upload-url");
  if (!session) throw new Error("no x-goog-upload-url in upload session response");

  // 2. upload bytes + finalize
  process.stderr.write(`uploading ${basename(path)} (${mb(size)})...\n`);
  const r2 = await req(session, {
    data: new Uint8Array(await Bun.file(path).arrayBuffer()),
    headers: {
      ...api.auth,
      "Content-Length": String(size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      // urllib 对无显式 Content-Type 的字节 data 默认加 application/x-www-form-urlencoded
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const f = JSON.parse(r2.body.toString("utf-8")).file;
  let state: string | undefined = f.state;

  // 3. wait for ACTIVE (video/audio is processed server-side)
  for (let waited = 0; state === "PROCESSING" && waited < 300; waited += 3) {
    await Bun.sleep(3000);
    state = JSON.parse((await req(`${api.base}/${f.name}`, { headers: api.auth })).body.toString("utf-8")).state;
  }
  if (state !== "ACTIVE") throw new Error(`file did not become ACTIVE (state=${state})`);

  // 4. generate
  return generate(api, [
    { file_data: { mime_type: mime, file_uri: f.uri } },
    { text: instruction },
  ]);
}

const USAGE =
  "usage: gemini_media.ts [-h] [--audio-only] [--question QUESTION] [--model MODEL] [--prompt PROMPT] [--chunk-minutes N] file\n";

function usage(): never {
  process.stderr.write(USAGE);
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let file: string | undefined;
  let audioOnly = false;
  let question: string | null = null;
  let model = "gemini-3.5-flash-lite";
  let prompt: string | null = null;
  let chunkMinutes: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const takeVal = (flag: string): string => {
      if (i + 1 >= argv.length) usage();
      return argv[++i];
    };
    if (a === "--audio-only") audioOnly = true;
    else if (a === "--question") question = takeVal(a);
    else if (a.startsWith("--question=")) question = a.slice("--question=".length);
    else if (a === "--model") model = takeVal(a);
    else if (a.startsWith("--model=")) model = a.slice("--model=".length);
    else if (a === "--prompt") prompt = takeVal(a);
    else if (a.startsWith("--prompt=")) prompt = a.slice("--prompt=".length);
    else if (a === "--chunk-minutes" || a.startsWith("--chunk-minutes=")) {
      const v = a.includes("=") ? a.slice("--chunk-minutes=".length) : takeVal(a);
      chunkMinutes = Number(v);
      // NaN would silently fall through to the single-request path — the exact
      // failure this flag exists to prevent. Reject it loudly.
      if (!Number.isFinite(chunkMinutes) || chunkMinutes < 0) usage();
    }
    else if (a === "-h" || a === "--help") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (!a.startsWith("-") && file === undefined) file = a;
    else usage();
  }
  if (file === undefined) usage();

  const key = process.env.GEMINI_API_KEY;
  if (key === undefined) {
    // 原版 os.environ["GEMINI_API_KEY"] KeyError → exit 1
    process.stderr.write("KeyError: 'GEMINI_API_KEY'\n");
    process.exit(1);
  }
  const urls = apiUrls(
    process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
  );
  const api: Api = { ...urls, auth: { "x-goog-api-key": key }, model };

  let instruction = prompt ?? DEFAULT_PROMPT;
  if (question) instruction = `Focus on answering: "${question}".\n\n` + instruction;

  // Only genuinely long media (45min+ talks, streams) is segmented: full video at
  // 258 tok/s blows past the context window there, and a single 3h call loses
  // everything if it fails. Anything shorter rides one request — oversized files
  // are handled by the shrink below, which is cheaper than N+1 requests.
  const chunkSec = (chunkMinutes ?? (audioOnly ? 30 : 10)) * 60;
  // An explicit --chunk-minutes N means "I want N-minute chunks", so it also lowers
  // the bar for segmenting; the 45min policy is only the default.
  const segmentOver = chunkMinutes === null ? SEGMENT_OVER_SEC : chunkSec * 1.2;
  if (chunkSec > 0) {
    const duration = await probeSeconds(file);
    if (duration === 0) {
      process.stderr.write("warning: duration unknown, sending as one request\n");
    } else if (duration > segmentOver) {
      await runSegmented(api, file, instruction, audioOnly, duration, chunkSec);
      return;
    }
  }

  // --audio-only: transcode any container to a Gemini-supported 16k mono mp3.
  // Downloads commonly arrive as opus-in-webm or m4a (audio/mp4), which the
  // audio endpoint rejects; this also strips video for the ~8x cheaper path.
  let tmp: string | null = null;
  let path = file;
  if (audioOnly) {
    tmp = join(tmpdir(), `gemini_media_${process.pid}_${Date.now()}.mp3`);
    await ffmpeg(["-i", path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", tmp]);
    path = tmp;
  } else if (
    (MIME[extname(path).toLowerCase()] ?? "").startsWith("video/") &&
    statSync(path).size > SHRINK_OVER_BYTES
  ) {
    // Retina screen recordings run 100MB+; the resumable upload has no recovery path
    // and just stalls. 1080p/6fps keeps UI text readable and bills far fewer tokens.
    const before = statSync(path).size;
    tmp = join(tmpdir(), `gemini_media_${process.pid}_${Date.now()}.mp4`);
    await ffmpeg([
      "-i", path,
      "-vf", "scale='min(1920,iw)':-2,fps=6",
      "-c:v", "libx264", "-crf", "28", "-preset", "veryfast",
      "-c:a", "aac", "-b:a", "64k", "-ac", "1",
      tmp,
    ]);
    path = tmp;
    process.stderr.write(
      `shrank video ${mb(before)} -> ${mb(statSync(path).size)} before upload\n`,
    );
  }

  try {
    console.log((await understand(api, path, instruction)).trim());
  } finally {
    if (tmp) unlinkSync(tmp);
  }
  process.stderr.write(`\n---\n_(via ${model}, ${tokensUsed} tokens)_\n`);
}

/**
 * Map-reduce over a long recording: one ffmpeg pass cuts it into chunks, each chunk
 * is understood with its absolute time range, then a text-only pass merges them.
 */
async function runSegmented(
  api: Api,
  file: string,
  instruction: string,
  audioOnly: boolean,
  duration: number,
  chunkSec: number,
): Promise<void> {
  const dir = join(tmpdir(), `gemini_media_${process.pid}_${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    process.stderr.write(
      `segmenting ${hhmmss(duration)} of ${audioOnly ? "audio" : "video"} into ${chunkSec / 60}min chunks...\n`,
    );
    await ffmpeg(
      audioOnly
        ? ["-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame",
           "-f", "segment", "-segment_time", String(chunkSec), "-reset_timestamps", "1",
           join(dir, "c_%03d.mp3")]
        : // ponytail: 1fps + 720p — long video is billed per sampled frame, and the
          // segment muxer needs a keyframe at each cut point or chunks drift.
          ["-i", file, "-vf", "scale='min(1280,iw)':-2,fps=1",
           "-c:v", "libx264", "-crf", "30", "-preset", "veryfast",
           "-force_key_frames", `expr:gte(t,n_forced*${chunkSec})`,
           "-c:a", "aac", "-b:a", "64k", "-ac", "1",
           "-f", "segment", "-segment_time", String(chunkSec), "-reset_timestamps", "1",
           join(dir, "c_%03d.mp4")],
    );
    const chunks = readdirSync(dir).filter((f) => f.startsWith("c_")).sort();
    if (chunks.length === 0) throw new Error(`ffmpeg produced no segments in ${dir}`);

    const one = async (name: string, i: number) => {
      const from = Math.min(i * chunkSec, duration);
      const span = `${hhmmss(from)}–${hhmmss(Math.min(from + chunkSec, duration))}`;
      const segPrompt =
        `This is segment ${i + 1}/${chunks.length} of one long recording, covering ${span} ` +
        `of the whole. Every timestamp you emit MUST be absolute in the whole recording ` +
        `(the segment starts at ${hhmmss(from)}).\n\n${instruction}`;
      try {
        return { span, text: (await understand(api, join(dir, name), segPrompt)).trim() };
      } catch (e) {
        // One bad segment must not cost the other 5 hours of work.
        process.stderr.write(`segment ${span} failed: ${e instanceof Error ? e.message : e}\n`);
        return { span, text: null as string | null };
      }
    };
    // 3 at a time: enough to hide upload latency, low enough to stay off rate limits.
    const digests: Awaited<ReturnType<typeof one>>[] = [];
    for (let i = 0; i < chunks.length; i += 3) {
      digests.push(...(await Promise.all(chunks.slice(i, i + 3).map((n, k) => one(n, i + k)))));
    }

    const ok = digests.filter((d) => d.text);
    if (ok.length === 0) throw new Error("every segment failed");
    const sections =
      `# Segment notes (${hhmmss(duration)}, ${chunks.length} segments)\n\n` +
      ok.map((d) => `## ${d.span}\n${d.text}`).join("\n\n");

    // Print the segment work even if the merge fails — by here the whole recording
    // has already been uploaded and billed; losing it to one bad request is the
    // failure this whole function exists to avoid.
    let merged = "";
    try {
      merged = (
        await generate(api, [
          {
            text:
              `Below are digests of consecutive segments of ONE recording (total ${hhmmss(duration)}), in order.\n` +
              `Merge them into a single coherent digest as instructed below. Keep the absolute ` +
              `timestamps on key points so they can be located later. Do not invent anything ` +
              `not present in the segments.\n\n${instruction}\n\n---\n\n${sections}`,
          },
        ])
      ).trim();
    } catch (e) {
      process.stderr.write(`merge failed: ${e instanceof Error ? e.message : e}\n`);
      merged = "> Merge pass failed — the per-segment digests below are unmerged but complete.";
    }

    const failed = digests.filter((d) => !d.text).map((d) => d.span);
    console.log(merged);
    console.log(`\n\n---\n\n${sections}`);
    if (failed.length) console.log(`\n> Segments that failed and are NOT covered: ${failed.join(", ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  process.stderr.write(`\n---\n_(via ${api.model}, ${tokensUsed} tokens)_\n`);
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

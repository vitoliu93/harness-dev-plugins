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
 * Usage:
 *     gemini_media.ts <file> [--audio-only] [--question "..."] [--model gemini-3.5-flash-lite]
 *
 *     --audio-only   transcode to 16k mono mp3 first (cheap path, ~8x fewer tokens
 *                    than video, and makes any container — m4a/opus/webm — accepted)
 *     --question Q   focus the digest on the user's question (optional)
 *     --model M      Gemini model id (default gemini-3.5-flash-lite; the cheaper
 *                    gemini-2.5-flash-lite also works)
 *     --prompt P     fully override the instruction sent to Gemini
 *
 * Python 原版 gemini_media.py 的逐字节兼容移植 (bun 驱动, 零三方依赖)。
 */

import { existsSync, statSync, unlinkSync } from "node:fs";
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

/** urllib.request.urlopen 语义: 4xx/5xx → stderr + exit 1 */
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
  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers: opts.headers,
      body: opts.data,
      // ponytail: without a deadline a stalled upload/generate hangs forever, silently.
      signal: AbortSignal.timeout(opts.timeoutMs ?? 600_000),
    });
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
  if (!resp.ok) {
    process.stderr.write(
      `HTTP ${resp.status} on ${method} ${url}\n${await resp.text()}\n`,
    );
    process.exit(1);
  }
  return { headers: resp.headers, body: Buffer.from(await resp.arrayBuffer()) };
}

/** Video bigger than this is downscaled before upload (see the shrink block below). */
const SHRINK_OVER_BYTES = 100 * 1024 * 1024;

const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)}MB`;

/** subprocess.run(check=True) 语义: 非零退出 → stderr + exit 1 */
async function ffmpeg(args: string[]): Promise<void> {
  const proc = Bun.spawn(["ffmpeg", "-y", "-v", "error", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    process.stderr.write(
      `Command '["ffmpeg", ...]' returned non-zero exit status ${code}.\n` +
        (await new Response(proc.stderr).text()),
    );
    process.exit(1);
  }
}

function usage(): never {
  process.stderr.write(
    "usage: gemini_media.ts [-h] [--audio-only] [--question QUESTION] [--model MODEL] [--prompt PROMPT] file\n",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let file: string | undefined;
  let audioOnly = false;
  let question: string | null = null;
  let model = "gemini-3.5-flash-lite";
  let prompt: string | null = null;
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
    else if (a === "-h" || a === "--help") {
      process.stdout.write(
        "usage: gemini_media.ts [-h] [--audio-only] [--question QUESTION] [--model MODEL] [--prompt PROMPT] file\n",
      );
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
  const { base, upload: uploadUrl } = apiUrls(
    process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
  );
  const auth = { "x-goog-api-key": key };

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

  const size = statSync(path).size;
  const ext = extname(path).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";

  // 1. start resumable upload session
  const h1 = (
    await req(uploadUrl, {
      data: dumpsAscii({ file: { display_name: basename(path) } }),
      headers: {
        ...auth,
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
  if (!session) {
    process.stderr.write("no x-goog-upload-url in upload session response\n");
    process.exit(1);
  }

  // 2. upload bytes + finalize
  process.stderr.write(`uploading ${mb(size)}...\n`);
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const r2 = await req(session, {
    data: bytes,
    headers: {
      ...auth,
      "Content-Length": String(size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      // urllib 对无显式 Content-Type 的字节 data 默认加 application/x-www-form-urlencoded
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  if (tmp) unlinkSync(tmp);
  const f = JSON.parse(r2.body.toString("utf-8")).file;
  const name: string = f.name;
  const uri: string = f.uri;
  let state: string | undefined = f.state;

  // 3. wait for ACTIVE (video/audio is processed server-side)
  let waited = 0;
  while (state === "PROCESSING" && waited < 300) {
    await Bun.sleep(3000);
    waited += 3;
    const r = await req(`${base}/${name}`, { headers: auth });
    state = JSON.parse(r.body.toString("utf-8")).state;
  }
  if (state !== "ACTIVE") {
    process.stderr.write(`file did not become ACTIVE (state=${state})\n`);
    process.exit(1);
  }

  // 4. generate
  let instruction = prompt ?? DEFAULT_PROMPT;
  if (question) {
    instruction = `Focus on answering: "${question}".\n\n` + instruction;
  }
  const payload = {
    contents: [
      {
        parts: [
          { file_data: { mime_type: mime, file_uri: uri } },
          { text: instruction },
        ],
      },
    ],
  };
  const r4 = await req(`${base}/models/${model}:generateContent`, {
    data: dumpsAscii(payload),
    headers: { ...auth, "Content-Type": "application/json" },
    method: "POST",
  });
  const resp = JSON.parse(r4.body.toString("utf-8"));
  const parts = resp?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    process.stderr.write(
      "unexpected response:\n" + [...JSON.stringify(resp)].slice(0, 1000).join("") + "\n",
    );
    process.exit(1);
  }
  const text = parts.map((p: any) => p?.text ?? "").join("");
  const usageMeta = resp?.usageMetadata ?? {};
  console.log(text.trim());
  process.stderr.write(
    `\n---\n_(via ${model}, ${usageMeta.totalTokenCount ?? "?"} tokens)_\n`,
  );
}

main();

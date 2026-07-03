// AI photoreal render via kie.ai (Nano Banana / Gemini image, image-to-image edit).
// Flow: upload the captured 3D screenshot → get a hosted URL → createTask with the
// "google/nano-banana-edit" model → poll recordInfo until it returns the result URL.
//
// The key lives in apps/app/.env.local as VITE_KIE_API_KEY (gitignored; client-side,
// fine for a prototype). Everything kie.ai-specific is contained here so the provider
// can be swapped without touching the UI.

import { AI_RENDER } from "../config";

// The jobs API and the file-upload service live on DIFFERENT hosts. DEV → the Vite
// proxies ("/kie" → api.kie.ai, "/kie-upload" → kieai.redpandaai.co) avoid browser
// CORS; prod hits them directly.
const DEV = import.meta.env.DEV;
const API_BASE = DEV ? "/kie-api" : "https://api.kie.ai";
const UPLOAD_BASE = DEV ? "/kie-upload" : "https://kieai.redpandaai.co";
const MODEL = "gpt-image-2-image-to-image"; // OpenAI GPT Image 2 — stronger photoreal transform
const RESOLUTION = "1K"; // 1K | 2K | 4K — 1K = fast/cheap client preview; bump for a hero shot
// Gated on AI_RENDER: when the flag is false, this folds to `undefined` and the bundler
// drops the VITE_KIE_API_KEY inline entirely — so the key never ships in the v1 bundle.
const KEY = AI_RENDER ? (import.meta.env.VITE_KIE_API_KEY as string | undefined) : undefined;

export const hasRenderKey = () => !!KEY;

export type RenderStage = "uploading" | "queued" | "rendering";

export interface RenderOptions {
  prompt?: string;
  aspect?: string; // "16:9" | "4:3" | "1:1" | … (kie.ai aspect_ratio)
  signal?: AbortSignal;
  onStage?: (stage: RenderStage) => void;
  onProgress?: (pct: number) => void; // 0..100 while rendering, if the model reports it
}

/** A strong default img2img prompt: keep the design exactly, make it photoreal. */
export const DEFAULT_PROMPT =
  "make this 3D render of the kitchen room photorealistic. Room structure and camera angle should stay the same.";

async function kie(url: string, init: RequestInit, signal?: AbortSignal) {
  const r = await fetch(url, {
    ...init,
    signal,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  let j: Record<string, unknown> & { data?: Record<string, unknown> };
  try {
    j = await r.json();
  } catch {
    throw new Error(`kie.ai ${r.status} ${r.statusText}`);
  }
  const code = j.code as number | undefined;
  if (!r.ok || (code != null && code !== 200)) throw new Error((j.msg as string) || `kie.ai ${r.status}`);
  return j;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Photorealize a captured kitchen screenshot. Returns the result image URL. */
export async function renderKitchen(dataUrl: string, opts: RenderOptions = {}): Promise<string> {
  if (!KEY) throw new Error("Не задан ключ kie.ai (VITE_KIE_API_KEY)");
  const { prompt = DEFAULT_PROMPT, aspect = "16:9", signal, onStage, onProgress } = opts;

  // 1) host the screenshot (kie.ai needs an http image URL, not base64)
  onStage?.("uploading");
  const up = await kie(UPLOAD_BASE + "/api/file-base64-upload", {
    method: "POST",
    body: JSON.stringify({ base64Data: dataUrl, uploadPath: "mebelchi/renders", fileName: "kitchen.png" }),
  }, signal);
  const imageUrl = up.data?.downloadUrl as string | undefined;
  if (!imageUrl) throw new Error("Загрузка изображения не удалась");

  // 2) start the edit task
  onStage?.("queued");
  const created = await kie(API_BASE + "/api/v1/jobs/createTask", {
    method: "POST",
    body: JSON.stringify({ model: MODEL, input: { prompt, input_urls: [imageUrl], aspect_ratio: aspect, resolution: RESOLUTION } }),
  }, signal);
  const taskId = created.data?.taskId as string | undefined;
  if (!taskId) throw new Error("Не удалось создать задачу");

  // 3) poll until done (~2s × 90 ≈ 3 min ceiling)
  onStage?.("rendering");
  for (let i = 0; i < 90; i++) {
    if (signal?.aborted) throw new Error("Отменено");
    await sleep(2000);
    const r = await kie(`${API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { method: "GET" }, signal);
    const state = r.data?.state as string | undefined;
    const pct = r.data?.progress as number | undefined;
    if (pct != null) onProgress?.(pct);
    if (state === "success") {
      const parsed = JSON.parse((r.data?.resultJson as string) || "{}");
      const url = parsed?.resultUrls?.[0] as string | undefined;
      if (!url) throw new Error("Пустой результат");
      return url;
    }
    if (state === "fail") throw new Error((r.data?.failMsg as string) || "Рендер не удался");
  }
  throw new Error("Превышено время ожидания рендера");
}

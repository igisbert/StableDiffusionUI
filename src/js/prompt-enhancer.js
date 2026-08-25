import { Store } from "@tauri-apps/plugin-store";

const MODELS_URL =
  "https://raw.githubusercontent.com/igisbert/StableDiffusionUI/refs/heads/master/models.json";

const ENHANCE_BASE_PROMPT = `You are an expert prompt engineer for modern image generation models
(Stable Diffusion, Flux, Qwen and similar).

Refine the user's prompt: keep their subject and intent, and enrich it
with concrete visual detail — composition, materials, lighting, mood,
and camera or artistic style when it fits.
Avoid generic quality boilerplate ("masterpiece", "8k", "best quality"):
modern models do not need it and it can degrade results.
Do not add artist names unless the user explicitly asks for a style.
Write the prompt in English.
Return ONLY the prompt, no explanation, no quotes.`;

const STYLE_INSTRUCTIONS = {
  prose:
    "STYLE: Respond with a natural language prompt. Match or slightly expand the length of the user's prompt: if it is short, enrich it; if it is long and detailed, refine and improve it without compressing it.",
  tags: "STYLE: Respond with 15 to 30 comma-separated tags, Stable Diffusion keyword style. No full sentences.",
};

const TASK_INSTRUCTIONS = {
  t2i: "TASK: The prompt will be used for a text-to-image generation. Describe the desired final image.",
  i2i: "TASK: The prompt will drive an image-to-image generation. The input image provides the composition; focus the prompt on subject and style.",
  inpaint: `TASK: The prompt will fill a masked region of an image (inpainting).
IMPORTANT: Describe ONLY what should appear inside the masked region.
Do NOT describe the rest of the scene, the background or the whole image.
Bad: "a woman in a street with buildings and sky". Good: "a red umbrella glowing under neon rain".`,
};

function detectPromptStyle(modelFileName) {
  return /sdxl|sd.?1|sd.?3|stable.?diffusion/i.test(modelFileName)
    ? "tags"
    : "prose";
}

function buildSystemPrompt({ modelFileName = "", task = "t2i" } = {}) {
  const parts = [ENHANCE_BASE_PROMPT];
  parts.push(STYLE_INSTRUCTIONS[detectPromptStyle(modelFileName)]);
  parts.push(TASK_INSTRUCTIONS[task] || TASK_INSTRUCTIONS.t2i);
  if (modelFileName) {
    parts.push(`The active model file is: ${modelFileName}`);
  }
  return parts.join("\n\n");
}

function cleanResponse(text) {
  let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  clean = clean.replace(/^\*+\s*\*+[^*]*\*+\s*/gm, "");
  clean = clean.replace(/^\*([^*]+)\*\s*/gm, "$1");
  clean = clean.replace(/^[-•]\s+/gm, "");
  clean = clean.replace(/^\s*\*+\s*/gm, "");
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[lines.length - 1] || text.trim();
}

let store = null;
let models = null;

async function getStore() {
  if (!store) store = await Store.load("enhancer.json");
  return store;
}

export async function loadEnhancerConfig() {
  const s = await getStore();
  const apiKey = await s.get("api_key");
  const selectedModel = await s.get("selected_model");
  return { apiKey: apiKey || null, selectedModel: selectedModel || null };
}

export async function isEnhancerConfigured() {
  const { apiKey } = await loadEnhancerConfig();
  return !!apiKey;
}

export async function setApiKey(key) {
  const s = await getStore();
  if (key) {
    await s.set("api_key", key);
  } else {
    await s.delete("api_key");
  }
  await s.save();
}

export async function setSelectedModel(modelKey) {
  const s = await getStore();
  await s.set("selected_model", modelKey);
  await s.save();
}

export async function fetchModels() {
  if (models) return models;
  try {
    const res = await fetch(MODELS_URL);
    if (!res.ok) throw new Error(res.statusText);
    models = await res.json();
  } catch {
    models = {
      gemma: { id: "gemma-4-31b-it", name: "Gemma 4" },
      flash_old: { id: "gemini-3.5-flash", name: "Gemini 3.5" },
      flash_latest: { id: "gemini-3.6-flash", name: "Gemini 3.6" },
    };
  }
  return models;
}

export async function enhancePrompt(
  promptText,
  { modelFileName = "", task = "t2i" } = {},
) {
  const { apiKey, selectedModel } = await loadEnhancerConfig();
  if (!apiKey) throw new Error("API key no configurada");
  if (!selectedModel) throw new Error("Modelo no seleccionado");

  const allModels = await fetchModels();
  const model = allModels[selectedModel];
  if (!model) throw new Error("Modelo no encontrado");

  const systemPrompt = buildSystemPrompt({ modelFileName, task });
  console.log("[enhancer] task:", task, "| model:", modelFileName);
  console.log("[enhancer] system prompt:\n", systemPrompt);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || promptText;
  return cleanResponse(raw);
}

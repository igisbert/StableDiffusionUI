import '@fontsource-variable/geist';
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { createIcons, icons } from "lucide";
import { initConfig, refreshAllSelects, getOutputPath } from "./config.js";
import { initInference } from "./inference.js";
import { initPresets } from "./presets.js";
import { initPromptTemplates } from "./prompt-templates.js";
import { initTooltips } from "./tooltips.js";
import { initNotifications, notify, toggle } from "./notifications.js";
import { appendLine } from "./console.js";
import { initInpaintEvents, isMaskPainted } from "./inpaint.js";
import { captureSeed, getSeeds } from "./busy.js";
import { showPreview } from "./preview.js";
import { getSelectedImageState } from "./state/image-state.js";
import { initImageInput } from "./features/image-input.js";
import { initImageOp, updateImageOpUI } from "./features/image-op.js";
import { initGeminiDialog, updateEnhancerUI } from "./dialogs/gemini-dialog.js";
import { initUpscale } from "./features/upscale.js";
import { initPathsPanel } from "./ui/paths-panel.js";
import { flashCopy } from "./ui/clipboard.js";

document.addEventListener("DOMContentLoaded", async () => {
  createIcons({ icons });

  await initConfig();
  await initPresets();
  await initPromptTemplates();
  await initInference();
  initTooltips();
  await updateEnhancerUI();

  const btnNotif = document.getElementById("btn-notifications");
  let notifEnabled = true;

  try {
    notifEnabled = await initNotifications();
  } catch (e) {
    console.error("Notifications init failed:", e);
  }

  function updateNotifBtnState(enabled) {
    btnNotif.innerHTML = enabled
      ? '<i data-lucide="bell"></i>'
      : '<i data-lucide="bell-off"></i>';
    btnNotif.classList.toggle("active", enabled);
    createIcons({ icons });
  }

  updateNotifBtnState(notifEnabled);

  btnNotif.addEventListener("click", async () => {
    try {
      notifEnabled = await toggle();
    } catch (e) {
      notifEnabled = !notifEnabled;
    }
    updateNotifBtnState(notifEnabled);
  });

  document.getElementById("btn-refresh").addEventListener("click", async () => {
    await refreshAllSelects();
    createIcons({ icons });
  });

  document
    .getElementById("btn-copy-seed")
    .addEventListener("click", async () => {
      try {
        const seeds = getSeeds();
        const text = seeds.length === 1 ? seeds[0] : seeds.join(", ");
        if (!text) return;
        await flashCopy(document.getElementById("btn-copy-seed"), text, {
          okLabel: '<i data-lucide="check"></i> Copiar semilla',
          idleLabel: '<i data-lucide="copy"></i> Copiar semilla',
        });
      } catch (e) {
        appendLine("[ERROR] No se pudo copiar al portapapeles: " + e);
      }
    });

  document
    .getElementById("btn-copy-console")
    .addEventListener("click", async () => {
      try {
        const text =
          document.getElementById("console-output")?.textContent ?? "";
        if (!text) return;
        await flashCopy(document.getElementById("btn-copy-console"), text, {
          okLabel: '<i data-lucide="check"></i> Copiar salida de la consola',
          idleLabel: '<i data-lucide="copy"></i> Copiar salida de la consola',
        });
      } catch (e) {
        appendLine("[ERROR] No se pudo copiar al portapapeles: " + e);
      }
    });

  document
    .getElementById("btn-open-output")
    .addEventListener("click", async () => {
      const output = await getOutputPath();
      if (output) await invoke("open_folder", { path: output });
    });

  await initGeminiDialog();

  initUpscale();

  await initPathsPanel();

  const btnRun = document.getElementById("btn-run");
  const btnRunUpscale = document.getElementById("btn-run-upscale");

  initImageInput();

  initImageOp();

  const btnOpenInpaint = document.getElementById("btn-open-inpaint");

  function updateInpaintMaskStatus() {
    const el = document.getElementById("inpaint-mask-status");
    if (el)
      el.textContent = isMaskPainted() ? "Máscara pintada" : "Sin máscara";
  }

  const inpaintDialog = document.getElementById("inpaint-dialog");

  function closeInpaintDialog() {
    if (inpaintDialog.classList.contains("closing")) return;
    inpaintDialog.classList.add("closing");
    inpaintDialog.addEventListener(
      "animationend",
      () => {
        inpaintDialog.classList.remove("closing");
        inpaintDialog.close();
      },
      { once: true },
    );
  }

  btnOpenInpaint.addEventListener("click", () => {
    if (!getSelectedImageState()) return;
    initInpaintEvents();
    inpaintDialog.showModal();
  });

  document
    .getElementById("btn-apply-mask")
    .addEventListener("click", closeInpaintDialog);

  inpaintDialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeInpaintDialog();
  });

  inpaintDialog.addEventListener("close", () => {
    updateInpaintMaskStatus();
  });

  await listen("console-line", (event) => {
    const line = event.payload;
    const match = line.match(/generating image: \d+\/\d+ - seed (\d+)/);
    if (match) captureSeed(match[1]);
    appendLine(line);
  });

  await listen("inference-done", async (event) => {
    showPreview(event.payload);
    updateImageOpUI();
    notify("Generación completada", "Tu imagen está lista.");
  });

  await listen("upscale-done", (event) => {
    showPreview(event.payload);
    notify("Upscale completado", "Tu imagen escalada está lista.");
  });
});

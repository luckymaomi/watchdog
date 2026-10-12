import { syncRange } from "./controls";

interface ReferenceState { x: number; y: number; zoom: number; rotation: number; opacity: number }
const INITIAL: ReferenceState = { x: 0, y: 0, zoom: 100, rotation: 0, opacity: 65 };

export function dragOffset(start: number, delta: number, stageSize: number): number {
  return stageSize > 0 ? start + delta / stageSize * 500 : start;
}

/** 参考图只在预览 DOM 中展示，不访问章面和导出状态。 */
export function setupReference(onStatus: (message: string) => void): void {
  const stage = document.getElementById("previewStage")!;
  const image = document.getElementById("referenceImage") as HTMLImageElement;
  const input = document.getElementById("referenceFile") as HTMLInputElement;
  const controls = document.getElementById("referenceControls")!;
  const visible = document.getElementById("referenceVisible") as HTMLInputElement;
  const sealOpacity = document.getElementById("overlayOpacity") as HTMLInputElement;
  const sealLayer = document.getElementById("sealLayer")!;
  let state = { ...INITIAL };
  let currentUrl = "";
  let uploadVersion = 0;
  let drag: { pointer: number; x: number; y: number; start: ReferenceState } | null = null;

  function render(): void {
    image.hidden = !currentUrl || !visible.checked;
    image.style.transform = `translate(-50%, -50%) translate(${state.x / 5}%, ${state.y / 5}%) rotate(${state.rotation}deg) scale(${state.zoom / 100})`;
    image.style.opacity = String(state.opacity / 100);
    stage.classList.toggle("has-reference", Boolean(currentUrl && visible.checked));
    for (const key of ["zoom", "rotation", "opacity"] as const) {
      const control = document.getElementById(`reference-${key}`) as HTMLInputElement;
      syncRange(control, String(state[key]));
      const value = document.getElementById(`reference-${key}-value`)!;
      if (value instanceof HTMLInputElement) value.value = String(state[key]);
      else value.textContent = `${state[key]}%`;
    }
  }

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) {
      onStatus("参考图请选择不超过 20 MB 的 PNG、JPG 或 WebP 图片。");
      return;
    }
    const version = ++uploadVersion;
    const nextUrl = URL.createObjectURL(file);
    const probe = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        probe.onload = () => resolve();
        probe.onerror = () => reject(new Error("无法读取这张参考图，请换一张图片。"));
        probe.src = nextUrl;
      });
      if (version !== uploadVersion) { URL.revokeObjectURL(nextUrl); return; }
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = nextUrl;
      image.src = currentUrl;
      state = { ...INITIAL };
      visible.checked = true;
      controls.hidden = false;
      sealOpacity.value = "65";
      sealOpacity.dispatchEvent(new Event("input"));
      render();
      onStatus("参考图已加载，可直接在预览里拖动；调整缩放和旋转，再逐项对齐印章。");
    } catch (error) {
      URL.revokeObjectURL(nextUrl);
      if (version === uploadVersion) onStatus(error instanceof Error ? error.message : String(error));
    }
  });

  for (const key of ["zoom", "rotation", "opacity"] as const) {
    document.getElementById(`reference-${key}`)!.addEventListener("input", (event) => {
      state[key] = Number((event.target as HTMLInputElement).value);
      render();
    });
  }
  for (const key of ["zoom", "rotation"] as const) {
    document.getElementById(`reference-${key}-value`)!.addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement;
      const value = input.value === "" ? NaN : Number(input.value);
      if (!Number.isFinite(value) || (key === "zoom" && value <= 0)) {
        onStatus(key === "zoom" ? "底图缩放须为大于 0 的数字。" : "底图旋转须为有效数字。");
        return;
      }
      state[key] = value;
      render();
    });
  }
  visible.addEventListener("change", render);
  sealOpacity.addEventListener("input", () => {
    sealLayer.style.opacity = String(Number(sealOpacity.value) / 100);
    document.getElementById("overlayOpacityValue")!.textContent = `${sealOpacity.value}%`;
  });
  document.getElementById("referenceReset")!.addEventListener("click", () => { state = { ...INITIAL }; render(); });
  document.getElementById("referenceRemove")!.addEventListener("click", () => {
    uploadVersion++;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = "";
    image.removeAttribute("src");
    controls.hidden = true;
    sealOpacity.value = "100";
    sealOpacity.dispatchEvent(new Event("input"));
    render();
    onStatus("参考图已移除。");
  });
  stage.addEventListener("pointerdown", (event: PointerEvent) => {
    if (!currentUrl || !visible.checked || event.button !== 0) return;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start: { ...state } };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  stage.addEventListener("pointermove", (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const size = stage.getBoundingClientRect();
    state.x = dragOffset(drag.start.x, event.clientX - drag.x, size.width);
    state.y = dragOffset(drag.start.y, event.clientY - drag.y, size.height);
    render();
  });
  stage.addEventListener("lostpointercapture", () => { drag = null; });
  stage.addEventListener("pointerup", () => { drag = null; });
  stage.addEventListener("pointercancel", () => { drag = null; });
  window.addEventListener("pagehide", () => {
    uploadVersion++;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = "";
    controls.hidden = true;
    image.removeAttribute("src");
    render();
  });
  render();
}

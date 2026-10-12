import { pngWithDpi } from "./png";

export function sealFilename(company: string): string {
  return (company.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").slice(0, 70) || "印章") + "_印章";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // 保留到下一轮事件，避免下载开始前释放。
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 只消费生成的 SVG，参考图片和预览透明度不进入导出。 */
export async function sealPng(svg: string, pixels: number, dpi: number): Promise<Blob> {
  if (!svg || !Number.isInteger(pixels) || pixels < 1 || pixels > 2000) throw new Error("印章或图片尺寸无效。");
  await document.fonts.ready;
  // 用像素尺寸替换根元素的毫米，避免 SVG -> Image 解码的尺寸差异。
  const rasterSvg = svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${pixels}" height="${pixels}"`);
  const url = URL.createObjectURL(new Blob([rasterSvg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("印章图片生成失败，请重试。"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = pixels;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法生成图片。");
    context.drawImage(image, 0, 0, pixels, pixels);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG 导出失败，请重试。")), "image/png");
    });
    const bytes = pngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

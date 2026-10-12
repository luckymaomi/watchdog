import { afterEach, describe, expect, it, vi } from "vitest";
import { sealFilename, sealPng } from "../../../src/tool/app/seal-generator/export";
import { buildSeal, DEFAULT_OPTIONS } from "../../../src/tool/app/seal-generator/logic";

const fixture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64");

function browser(mode: "success" | "image-error" | "canvas-error" | "blob-error") {
  const createObjectURL = vi.fn(() => "blob:seal");
  const revokeObjectURL = vi.fn();
  const drawImage = vi.fn();
  const canvas = {
    width: 0, height: 0,
    getContext: vi.fn(() => mode === "canvas-error" ? null : { drawImage }),
    toBlob: vi.fn((callback: (value: Blob | null) => void) => callback(mode === "blob-error" ? null : new Blob([fixture], { type: "image/png" })))
  };
  const createElement = vi.fn(() => canvas);
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.stubGlobal("document", { fonts: { ready: Promise.resolve() }, createElement });
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => mode === "image-error" ? this.onerror?.() : this.onload?.()); }
  });
  return { createObjectURL, revokeObjectURL, drawImage, canvas, createElement };
}

afterEach(() => vi.unstubAllGlobals());

describe("印章 PNG 导出", () => {
  it("按目标像素绘制章面，输出 PNG，完成后释放临时资源", async () => {
    const mock = browser("success");
    const result = buildSeal(DEFAULT_OPTIONS);
    const output = await sealPng(result.svg, result.pixelSize, DEFAULT_OPTIONS.dpi);
    expect(output.type).toBe("image/png");
    expect(mock.canvas.width).toBe(result.pixelSize);
    expect(mock.canvas.height).toBe(result.pixelSize);
    expect(mock.drawImage).toHaveBeenCalledExactlyOnceWith(expect.anything(), 0, 0, result.pixelSize, result.pixelSize);
    expect(mock.createElement).toHaveBeenCalledExactlyOnceWith("canvas");
    const source = await (mock.createObjectURL.mock.calls[0] as unknown as [Blob])[0].text();
    expect(source).toContain(`width="${result.pixelSize}" height="${result.pixelSize}"`);
    expect(source).toContain("<polygon");
    expect(mock.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:seal");
  });

  it.each(["image-error", "canvas-error", "blob-error"] as const)("%s 时报告错误并释放资源", async (mode) => {
    const mock = browser(mode);
    await expect(sealPng(buildSeal(DEFAULT_OPTIONS).svg, 472, 300)).rejects.toThrow();
    expect(mock.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:seal");
  });

  it("拒绝无效尺寸，清理下载文件名", async () => {
    const mock = browser("success");
    await expect(sealPng("", 0, 300)).rejects.toThrow("无效");
    expect(mock.createObjectURL).not.toHaveBeenCalled();
    expect(sealFilename('示例/公司:*')).toBe("示例_公司___印章");
  });
});

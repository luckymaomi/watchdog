import { describe, expect, it } from "vitest";
import { dragOffset } from "../../../src/tool/app/seal-generator/reference";

describe("参考图片移动", () => {
  it("不同预览尺寸下保持相同相对移动距离", () => {
    expect(dragOffset(10, 50, 500)).toBe(60);
    expect(dragOffset(10, 25, 250)).toBe(60);
    expect(dragOffset(0, -25, 250)).toBe(-50);
  });
  it("移动没有人为距离上限且不因零尺寸生成无效位置", () => {
    expect(dragOffset(0, 10000, 500)).toBe(10000);
    expect(dragOffset(0, -10000, 500)).toBe(-10000);
    expect(dragOffset(12, 10, 0)).toBe(12);
  });
});

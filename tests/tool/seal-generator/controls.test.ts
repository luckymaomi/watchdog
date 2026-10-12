import { describe, expect, it } from "vitest";
import { expandRange, syncRange } from "../../../src/tool/app/seal-generator/controls";

describe("自由调整印章参数", () => {
  it("填写超过滑块范围的数值时扩展范围，已有范围不会缩回", () => {
    expect(expandRange(160, 28, 60)).toEqual({ min: 28, max: 160 });
    expect(expandRange(20, 28, 160)).toEqual({ min: 20, max: 160 });
    expect(expandRange(-360, -180, 180)).toEqual({ min: -360, max: 180 });
    expect(expandRange(NaN, 28, 60)).toEqual({ min: 28, max: 60 });
  });
  it("先扩展滑块范围再同步实际输入值", () => {
    const range = { min: "28", max: "60", value: "60" } as HTMLInputElement;
    syncRange(range, "125.5");
    expect(range).toEqual({ min: "28", max: "125.5", value: "125.5" });
  });
});

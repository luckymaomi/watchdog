import { describe, expect, it } from "vitest";
import { pngWithDpi } from "../../../src/tool/app/seal-generator/png";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64"));

function chunks(bytes: Uint8Array): Array<{ type: string; data: Uint8Array; crc: number }> {
  const result = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset < bytes.length;) {
    const size = view.getUint32(offset);
    result.push({ type: Buffer.from(bytes.subarray(offset + 4, offset + 8)).toString(), data: bytes.subarray(offset + 8, offset + 8 + size), crc: view.getUint32(offset + 8 + size) });
    offset += size + 12;
  }
  return result;
}

describe("PNG 物理尺寸", () => {
  it("正确写入 300 DPI 像素密度和 CRC，保留原图片数据", () => {
    const output = chunks(pngWithDpi(png, 300));
    expect(output.map((chunk) => chunk.type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
    const density = output[1];
    const view = new DataView(density.data.buffer, density.data.byteOffset, density.data.byteLength);
    expect(view.getUint32(0)).toBe(11811);
    expect(view.getUint32(4)).toBe(11811);
    expect(density.data[8]).toBe(1);
    expect(density.crc).toBe(0x78a53f76);
    expect(output[2].data).toEqual(chunks(png)[1].data);
  });
  it("替换已有密度且不生成重复数据段", () => {
    const output = chunks(pngWithDpi(pngWithDpi(png, 150), 600));
    expect(output.filter((chunk) => chunk.type === "pHYs")).toHaveLength(1);
    const density = output.find((chunk) => chunk.type === "pHYs")!.data;
    expect(new DataView(density.buffer, density.byteOffset, density.byteLength).getUint32(0)).toBe(23622);
  });
  it("拒绝损坏文件、截断文件和不支持的密度", () => {
    expect(() => pngWithDpi(new Uint8Array(20), 300)).toThrow("无效");
    expect(() => pngWithDpi(png.subarray(0, 20), 300)).toThrow("不完整");
    expect(() => pngWithDpi(png, 299)).toThrow("清晰度");
  });
});

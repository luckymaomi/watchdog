import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, buildSeal, layoutArcText, starPoints } from "../../../src/tool/app/seal-generator/logic";

describe("圆形印章", () => {
  it("要求单位名称，允许章名和编号留空", () => {
    expect(buildSeal({ ...DEFAULT_OPTIONS, company: "  " }).errors).toContain("请填写单位名称。");
    const result = buildSeal({ ...DEFAULT_OPTIONS, company: "示例公司", caption: "", code: "" });
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain("<polygon");
  });

  it("拒绝越界、空数值、非法颜色、字体和控制字符", () => {
    for (const update of [{ dpi: NaN }, { diameterMm: 0 }, { borderMm: -1 }, { nameSize: 0 },
      { color: 'red" onload="alert(1)' }, { font: "other" }, { company: "公司\u0000" },
      { code: "A\u0001" }, { codeMode: "other" }]) {
      const result = buildSeal({ ...DEFAULT_OPTIONS, ...update } as typeof DEFAULT_OPTIONS);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.svg).toBe("");
    }
  });

  it("上下弧文字顺序正确，单字位于弧线中心", () => {
    const top = layoutArcText("甲乙丙", 200, 180, false);
    expect(top[0].x).toBeLessThan(top[2].x);
    expect(top[1].y).toBeCloseTo(50);
    expect(top[1].rotation).toBeCloseTo(0);
    const bottom = layoutArcText("123", 210, 80, true);
    expect(bottom[0].x).toBeLessThan(bottom[2].x);
    expect(bottom[1].y).toBeCloseTo(460);
    expect(bottom[1].rotation).toBeCloseTo(0);
    expect(layoutArcText("章", 200, 240, false)[0]).toMatchObject({ x: 250, y: 50, rotation: 0 });
    expect(layoutArcText("", 200, 240, false)).toEqual([]);
  });

  it("五角星有十个交替顶点且尖角向上", () => {
    const points = starPoints(250, 235, 70);
    expect(points).toHaveLength(10);
    expect(points[0]).toEqual({ x: 250, y: 165 });
    points.forEach((point, index) => {
      expect(Math.hypot(point.x - 250, point.y - 235)).toBeCloseTo(index % 2 ? 70 * 0.382 : 70);
    });
  });

  it("长名称仍保留指定字号，不自动缩小，超长内容禁止输出", () => {
    const long = buildSeal({ ...DEFAULT_OPTIONS, company: "甲".repeat(45), nameSize: 120 });
    expect(long.nameFontSize).toBe(120);
    expect(long.svg).toContain('font-size="120"');
    expect(buildSeal({ ...DEFAULT_OPTIONS, company: "甲".repeat(61) }).svg).toBe("");
  });

  it("对齐参数没有人为上限，各元素保留用户输入且不自动收进圆圈", () => {
    const options = { ...DEFAULT_OPTIONS, company: "甲乙丙丁戊己庚辛壬癸", nameSize: 140, nameWidth: 180,
      nameRadius: 300, nameArc: 360, nameRotation: 720, borderRadius: 310, borderMm: 3,
      starSize: 200, starX: -10, starY: 550, starRotation: -720,
      caption: "示例章名", captionSize: 200, captionY: 550, code: "1234567890",
      codeSize: 80, codeRadius: 320, codeArc: 200, codeWidth: 200, codeY: 600, codeRotation: 360 };
    const result = buildSeal(options);
    expect(result.errors).toEqual([]);
    expect(result.nameFontSize).toBe(140);
    expect(result.svg).toContain('r="310"');
    expect(result.svg).toContain('font-size="200"');
    expect(result.svg).toContain('font-size="80"');
    expect(result.svg).toContain('translate(250 550)');
    expect(result.svg).toContain('rotate(-720 -10 550)');
  });

  it("SVG 正确转义文本且不解释用户输入为元素", () => {
    const company = '甲<&"乙';
    const caption = '<image href="x"/>';
    const code = 'A&B<1';
    const result = buildSeal({ ...DEFAULT_OPTIONS, company, caption, code });
    expect(result.errors).toEqual([]);
    const document = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    expect(document.getElementsByTagName("image").length).toBe(0);
    expect(document.getElementsByTagName("parsererror").length).toBe(0);
    expect(document.getElementsByTagName("svg")[0].textContent).toContain(company + caption + code);
  });

  it("导出记录毫米尺寸，PNG 像素按 DPI 计算，可关闭星形及切换横排编号", () => {
    const result = buildSeal({ ...DEFAULT_OPTIONS, diameterMm: 42, dpi: 600, star: false, code: "123456", codeMode: "line" });
    expect(result.pixelSize).toBe(Math.round(42 / 25.4 * 600));
    expect(result.svg).toContain('width="42mm" height="42mm"');
    const document = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    expect(document.getElementsByTagName("polygon").length).toBe(0);
    expect(document.getElementsByTagName("rect").length).toBe(0);
    const texts = Array.from(document.getElementsByTagName("text"));
    expect(texts.some((text) => text.textContent === "123456")).toBe(true);
  });

  it("圆圈、名称字宽与方向、五角星位置角度、编号字体和间距可独立修改", () => {
    const options = { ...DEFAULT_OPTIONS, borderRadius: 230, nameWidth: 60, nameRotation: 10,
      starX: 240, starY: 245, starRotation: 15, code: "12345", codeFont: "wenkai" as const,
      codeRotation: 12, codeWidth: 80, codeArc: 110 };
    const result = buildSeal(options);
    expect(result.errors).toEqual([]);
    const document = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    expect(document.getElementsByTagName("circle")[0].getAttribute("r")).toBe("230");
    expect(document.getElementsByTagName("polygon")[0].getAttribute("transform")).toBe("rotate(15 240 245)");
    expect(result.svg).toContain("scale(0.6 1)");
    expect(result.svg).toContain("rotate(10 250 250)");
    expect(result.svg).toContain("SealWenkai");
    expect(result.svg).toContain("rotate(12 250 250)");
    expect(result.svg).toContain("scale(0.8 1)");
  });
});

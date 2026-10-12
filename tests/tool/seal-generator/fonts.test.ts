import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS, embedFontData, usedFonts } from "../../../src/tool/app/seal-generator/fonts";
import { DEFAULT_OPTIONS, buildSeal } from "../../../src/tool/app/seal-generator/logic";

describe("印章内置字体与导出", () => {
  it("单位、章名和编号字体独立，只使用有内容的字体", () => {
    expect(usedFonts({ ...DEFAULT_OPTIONS, font: "zhuque", captionFont: "wenkai", codeFont: "notoSans" })).toEqual(["zhuque"]);
    expect(usedFonts({ ...DEFAULT_OPTIONS, font: "zhuque", captionFont: "wenkai", codeFont: "notoSans", caption: "章", code: "123" })).toEqual(["zhuque", "wenkai", "notoSans"]);
    const svg = buildSeal({ ...DEFAULT_OPTIONS, font: "zhuque", captionFont: "wenkai", codeFont: "notoSans", caption: "章", code: "123" }).svg;
    expect(svg).toContain("SealZhuque");
    expect(svg).toContain("SealWenkai");
    expect(svg).toContain("SealNotoSans");
  });

  it("可移植 SVG 保留字库和授权，不产生外部字体请求", () => {
    const source = buildSeal({ ...DEFAULT_OPTIONS, font: "zhuque" }).svg;
    const svg = embedFontData(source, [{ family: "SealZhuque", base64: "YWJj", license: "OFL <test> & $&" }]);
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(document.getElementsByTagName("parsererror").length).toBe(0);
    expect(document.getElementsByTagName("style")[0].textContent).toContain("data:font/woff2;base64,YWJj");
    expect(document.getElementsByTagName("metadata")[0].textContent).toContain("OFL <test> & $&");
    expect(document.getElementsByTagName("text").length).toBe(Array.from(DEFAULT_OPTIONS.company).length);
  });

  it("五款字体文件存在、格式和校验和正确并附带分发授权", () => {
    const root = path.resolve("public/tool/app/seal-generator");
    const sources = JSON.parse(fs.readFileSync(path.join(root, "fonts/sources.json"), "utf8")) as Array<{ name: string; woff2_sha256: string }>;
    for (const font of Object.values(BUNDLED_FONTS)) {
      const content = fs.readFileSync(path.join(root, font.url));
      expect(content.subarray(0, 4).toString()).toBe("wOF2");
      const name = path.basename(font.url, ".woff2");
      expect(createHash("sha256").update(content).digest("hex")).toBe(sources.find((source) => source.name === name)?.woff2_sha256);
      expect(fs.readFileSync(path.join(root, font.license), "utf8")).toContain("SIL OPEN FONT LICENSE");
    }
  });
});

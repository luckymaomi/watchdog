import fs from "node:fs/promises";
import vm from "node:vm";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { expect, it, vi } from "vitest";
import { resolveFromDist } from "../../helpers/paths";
import { BUNDLED_FONTS } from "../../../src/tool/app/seal-generator/fonts";

it("独立工具离线 fetch 可读取全部内置字体和授权，内容与包内文件一致", async () => {
  const zip = await JSZip.loadAsync(await fs.readFile(resolveFromDist("exports", "seal-generator.zip")));
  const nativeFetch = vi.fn(() => Promise.reject(new Error("离线环境")));
  const window = { location: { href: "file:///offline/seal/index.html" }, fetch: nativeFetch, atob };
  const context = vm.createContext({ window, URL, Uint8Array, Response });
  vm.runInContext(await zip.file("standalone-runtime.js")!.async("string"), context);
  const offlineFetch = window.fetch as unknown as (url: string) => Promise<Response>;
  for (const font of Object.values(BUNDLED_FONTS)) {
    for (const resource of [font.url, font.license]) {
      const response = await offlineFetch(resource);
      expect(response.ok).toBe(true);
      const actual = Buffer.from(await response.arrayBuffer());
      const expected = await zip.file(resource.replace(/^\.\//, ""))!.async("nodebuffer");
      expect(createHash("sha256").update(actual).digest("hex")).toBe(createHash("sha256").update(expected).digest("hex"));
      if (resource.endsWith(".woff2")) expect(response.headers.get("Content-Type")).toBe("font/woff2");
      else expect(actual.toString("utf8")).toContain("SIL OPEN FONT LICENSE");
    }
  }
  expect(nativeFetch).not.toHaveBeenCalled();
});

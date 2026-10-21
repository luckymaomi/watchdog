import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { memoItems } from "../../src/memo/memos-data";
import { markdownToText, search } from "../../src/memo/search";
import { resolveFromDist } from "../helpers/paths";

function loadPublishedItems() {
  return memoItems;
}

function localMarkdownImages(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim().replace(/^<|>$/g, ""))
    .filter((target) => !/^(?:https?:)?\/\//i.test(target) && !target.startsWith("data:"))
    .map((target) => target.split("#")[0].split("?")[0]);
}

describe("memo subsite", () => {
  it("resolves every indexed memo", () => {
    const items = loadPublishedItems();
    const names = items.map((item) => item.name);
    const relativePaths = items.map((item) => item.path);

    expect(new Set(names).size).toBe(items.length);
    expect(new Set(relativePaths).size).toBe(items.length);

    const spec = fs.readFileSync(resolveFromDist("memo", "SPEC.md"), "utf8");
    const index = fs.readFileSync(resolveFromDist("memo", "MEMO_INDEX.md"), "utf8");

    items.forEach((item) => {
      expect(["human", "agent"]).toContain(item.audience);

      const markdownPath = resolveFromDist("memo", item.path);
      expect(fs.existsSync(markdownPath), `missing memo Markdown: ${item.path}`).toBe(true);

      const markdown = fs.readFileSync(markdownPath, "utf8");
      expect(markdown).toMatch(/^---\r?\nname:\s*.+\r?\ndescription:\s*.+\r?\n---/);
      expect(spec).toContain(`./${item.path}`);
      expect(index).toContain(`./${item.path}`);
      expect(markdown).toContain(`# ${item.name}`);
    });
  });

  it("ships every locally referenced Markdown image", () => {
    loadPublishedItems().forEach((item) => {
      const markdownPath = resolveFromDist("memo", item.path);
      const markdown = fs.readFileSync(markdownPath, "utf8");

      localMarkdownImages(markdown).forEach((target) => {
        const assetPath = path.resolve(path.dirname(markdownPath), target);
        expect(fs.existsSync(assetPath), `${item.path} references missing image: ${target}`).toBe(true);
      });
    });
  });

  it("searches business text and returns a readable context", () => {
    const name = "资质办理";
    const relativePath = "memos/example/MEMO.md";
    const markdown = "---\nname: qualification\ndescription: test\n---\n# 资质办理\n完成重航划转后更新记录。";
    const searchableText = markdownToText(markdown);
    const results = search([{ name, path: relativePath, markdown }], "重航");

    expect(searchableText).not.toContain("description:");
    expect(searchableText).toContain("资质办理");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe(name);
    expect(results[0].snippet).toContain("重航划转");
  });

  it("requires downloadName for any agent-audience memo", () => {
    const agents = loadPublishedItems().filter((item) => item.audience === "agent");
    agents.forEach((item) => {
      expect(item.downloadName, `${item.name} missing downloadName`).toBeTruthy();
      expect(item.downloadName).toMatch(/^skill-.+\.md$/);
    });
  });

  it("exposes audience filter and download controls in the page shell", () => {
    const html = fs.readFileSync(resolveFromDist("memo", "index.html"), "utf8");
    expect(html).toContain('id="audienceFilter"');
    expect(html).toContain('data-audience="all"');
    expect(html).toContain('data-audience="human"');
    expect(html).toContain('data-audience="agent"');

    const app = fs.readFileSync(resolveFromDist("memo", "app.js"), "utf8");
    expect(app).toContain("下载 Markdown");
    expect(app).toContain("downloadName");
  });
});

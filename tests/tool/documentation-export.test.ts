import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDocumentation } from "../../scripts/documentation-export.mjs";
import { bindDocumentationDownloads, documentationDownloadName } from "../../src/tool/documentation-download";
import { tools } from "../../src/tool/tools-data";
import { walkFiles } from "../helpers/fs-collect";
import { resolveFromDist, resolveFromRoot } from "../helpers/paths";

const temporaryRoots: string[] = [];

async function fixture(): Promise<{ specRoot: string; outputFile: string }> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "watchdog-docs-test-"));
    temporaryRoots.push(root);
    const specRoot = path.join(root, "spec");
    await fs.mkdir(specRoot);
    return { specRoot, outputFile: path.join(root, "downloads", "watchdog-development-documentation.md") };
}

async function write(specRoot: string, relativePath: string, content: string | Uint8Array): Promise<void> {
    const file = path.join(specRoot, relativePath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
}

afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("combined development documentation", () => {
    it("recursively includes document prose while excluding measurement attachments with stable output", async () => {
        const options = await fixture();
        const manual = "# 用户手册\n\n中文员工号 001234，日期 2026-10-27。\n";
        await write(options.specRoot, "README.md", "# 目录\n\n[操作](user/example/manual.md)\n");
        await write(options.specRoot, "user/example/manual.md", manual);
        await write(options.specRoot, "dev/example/rules.json", '{"说明":"业务规则"}\n');

        const first = await buildDocumentation(options);
        const text = await fs.readFile(options.outputFile, "utf8");
        expect(first.files.map((file) => file.path)).toEqual(["README.md", "user/example/manual.md"]);
        expect(text).toContain("中文员工号 001234，日期 2026-10-27。");
        expect(text).not.toContain('{"说明":"业务规则"}');
        expect(text).not.toMatch(/SHA-256|Source commit:|\| Bytes \|/);
        expect(text).toContain(`[操作](#${first.files[1].anchor})`);
        const bytes = await fs.readFile(options.outputFile);
        expect(bytes.subarray(0, 3)).not.toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
        await buildDocumentation(options);
        expect(await fs.readFile(options.outputFile)).toEqual(bytes);

        await write(options.specRoot, "dev/added/新增.md", "# 新增\n自动收录\n");
        await fs.rm(path.join(options.specRoot, "user/example/manual.md"));
        await write(options.specRoot, "README.md", "# 目录\n");
        const next = await buildDocumentation(options);
        expect(next.files.map((file) => file.path)).toContain("dev/added/新增.md");
        expect(await fs.readFile(options.outputFile, "utf8")).toContain("自动收录");
        expect(next.files.map((file) => file.path)).not.toContain("user/example/manual.md");
    });

    it("resolves cross-document, local and duplicate heading anchors while preserving fenced examples", async () => {
        const options = await fixture();
        await write(options.specRoot, "README.md", "# Index\n[section](dev/rule.md#规则)\n");
        await write(options.specRoot, "dev/rule.md", [
            "# Rule", "## 规则", "[self](#规则)", "## 规则", "[second](#规则-1)",
            "[home](../README.md)", "[remote](https://example.test/guide)",
            "```md", "[literal](missing.md)", "## Not a heading", "```", ""
        ].join("\n"));
        await buildDocumentation(options);
        const text = await fs.readFile(options.outputFile, "utf8");
        const links = [...text.matchAll(/\[(?:section|self|second|home)\]\(#([^)]*)\)/g)].map((match) => match[1]);
        expect(links).toHaveLength(4);
        expect(links[0]).toBe(links[1]);
        expect(links[2]).not.toBe(links[1]);
        for (const target of links) expect(text).toContain(`<a id="${target}"></a>`);
        expect(text).toContain("[remote](https://example.test/guide)");
        expect(text).toContain("```md\n[literal](missing.md)\n## Not a heading\n```");
    });

    it("rejects broken document links, missing fragments and invalid source encodings", async () => {
        const options = await fixture();
        await write(options.specRoot, "README.md", "[broken](missing.md)");
        await expect(buildDocumentation(options)).rejects.toThrow(/missing.md/);
        await write(options.specRoot, "README.md", "# Index\n[broken](#missing)");
        await expect(buildDocumentation(options)).rejects.toThrow(/missing/);
        await write(options.specRoot, "README.md", Buffer.from([0xef, 0xbb, 0xbf, 0x61]));
        await expect(buildDocumentation(options)).rejects.toThrow(/BOM/);
        await write(options.specRoot, "README.md", Buffer.from([0xff, 0xfe, 0x61]));
        await expect(buildDocumentation(options)).rejects.toThrow(/UTF-8/);
        await write(options.specRoot, "README.md", Buffer.from([0, 1, 2]));
        await expect(buildDocumentation(options)).rejects.toThrow(/binary/i);
    });
});

describe("published documentation download", () => {
    it("updates the filename on click when the page remains open past midnight", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
        const link = new EventTarget() as EventTarget & { download: string };
        link.download = "";
        const root = { querySelectorAll: () => [link] } as unknown as ParentNode;
        bindDocumentationDownloads(root);
        expect(link.download).toBe("watchdog开发者文档-2026-12-31.md");
        vi.setSystemTime(new Date(2027, 0, 1, 0, 1));
        link.dispatchEvent(new Event("click"));
        expect(link.download).toBe("watchdog开发者文档-2027-01-01.md");
    });

    it("names downloads using the local calendar day including month and year boundaries", () => {
        expect(documentationDownloadName(new Date(2026, 9, 27, 0, 1))).toBe("watchdog开发者文档-2026-10-27.md");
        expect(documentationDownloadName(new Date(2027, 0, 1, 0, 1))).toBe("watchdog开发者文档-2027-01-01.md");
        expect(documentationDownloadName(new Date(2028, 1, 29, 23, 59))).toBe("watchdog开发者文档-2028-02-29.md");
    });

    it("contains every spec source and each registered tool's dev/user contract with working download links", async () => {
        const download = "watchdog-development-documentation.md";
        const outputFile = resolveFromDist("downloads", download);
        const merged = await fs.readFile(outputFile, "utf8");
        for (const source of walkFiles(resolveFromRoot("spec"))) {
            if (path.extname(source).toLowerCase() !== ".md") continue;
            const relative = path.relative(resolveFromRoot(), source).replace(/\\/g, "/");
            expect(merged).toContain(`## Source: ${relative}`);
        }
        expect(merged).not.toContain('"coreArtifactSha256"');
        expect(merged).not.toMatch(/\b[a-f0-9]{64}\b|SHA-256|SHA256/);
        for (const tool of tools) {
            expect(merged).toContain(`## Source: spec/dev/${tool.entry}/spec.md`);
            expect(merged).toContain(`## Source: spec/user/${tool.entry}/manual.md`);
        }
        const anchors = new Set([...merged.matchAll(/<a id="([^"]+)"><\/a>/g)].map((match) => match[1]));
        for (const link of merged.matchAll(/\]\(#([^)\s]+)\)/g)) expect(anchors.has(link[1]), link[1]).toBe(true);
        for (const page of ["index.html", "developer.html"]) {
            const html = await fs.readFile(resolveFromDist("tool", page), "utf8");
            expect(html).toContain(`href="../downloads/${download}" download="watchdog开发者文档.md" data-documentation-download`);
        }
    });
});

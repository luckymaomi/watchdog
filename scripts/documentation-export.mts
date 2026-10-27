import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const DOCUMENTATION_FILENAME = "watchdog-development-documentation.md";

type SourceDocument = {
    path: string;
    anchor: string;
    bytes: number;
    sha256: string;
    text: string;
    headings: Map<string, string>;
};

export type DocumentationOptions = {
    specRoot: string;
    outputFile: string;
    commit?: string;
};

export type DocumentationResult = {
    files: Array<Pick<SourceDocument, "path" | "anchor" | "bytes" | "sha256">>;
    sha256: string;
};

function hash(value: string | Uint8Array): string {
    return createHash("sha256").update(value).digest("hex");
}

async function collectFiles(directory: string, relative = ""): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const name = path.posix.join(relative, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Documentation symbolic link is not supported: ${name}`);
        if (entry.isDirectory()) files.push(...await collectFiles(path.join(directory, entry.name), name));
        else if (entry.isFile()) files.push(name);
    }
    return files;
}

// Process prose only. Fenced examples must never be interpreted as headings or links.
function mapProse(source: string, transform: (line: string) => string): string {
    let fence = "";
    return source.replace(/\r\n/g, "\n").split("\n").map((line) => {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (fence) {
            if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = "";
            return line;
        }
        if (marker) {
            fence = marker[1];
            return line;
        }
        if (/^(?: {4}|\t)/.test(line)) return line;
        return transform(line);
    }).join("\n");
}

function headingSlug(text: string): string {
    return text.trim().toLowerCase().replace(/<[^>]*>/g, "")
        .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "").replace(/\s/g, "-");
}

function withHeadingAnchors(document: SourceDocument): string {
    const used = new Set<string>();
    return mapProse(document.text, (line) => {
        const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
        if (!heading) return line;
        const base = headingSlug(heading[1]);
        let slug = base;
        let suffix = 0;
        while (used.has(slug)) slug = `${base}-${++suffix}`;
        used.add(slug);
        const anchor = `${document.anchor}-h${used.size}`;
        document.headings.set(slug, anchor);
        return `<a id="${anchor}"></a>\n\n${line}`;
    });
}

function rewriteLinks(source: string, document: SourceDocument, documents: Map<string, SourceDocument>): string {
    return mapProse(source, (line) => line.split(/(`+[^`]*`+)/g).map((part, index) => {
        if (index % 2) return part;
        return part.replace(/(!?\[[^\]\n]*\])\((<[^>\n]+>|[^)\s]+)(\s+(?:"[^"]*"|'[^']*'))?\)/g,
            (_match: string, label: string, rawTarget: string, title = "") => {
                const target = rawTarget.replace(/^<|>$/g, "");
                if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return `${label}(${rawTarget}${title})`;
                const [rawFile, ...fragmentParts] = target.split("#");
                const file = rawFile ? path.posix.normalize(path.posix.join(path.posix.dirname(document.path), decodeURIComponent(rawFile))) : document.path;
                const destination = documents.get(file);
                if (!destination) throw new Error(`Broken documentation link in ${document.path}: ${target}`);
                if (label.startsWith("!")) throw new Error(`Local documentation images require a text description: ${document.path}: ${target}`);
                const fragment = decodeURIComponent(fragmentParts.join("#"));
                const anchor = fragment ? destination.headings.get(fragment) : destination.anchor;
                if (!anchor) throw new Error(`Unknown documentation heading in ${document.path}: ${target}`);
                return `${label}(#${anchor}${title})`;
            });
    }).join(""));
}

function fencedText(source: string, extension: string): string {
    const longestFence = Math.max(2, ...[...source.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = "`".repeat(longestFence + 1);
    const language = extension.replace(/[^a-z0-9]/gi, "");
    return `${fence}${language}\n${source}${source.endsWith("\n") ? "" : "\n"}${fence}`;
}

export async function buildDocumentation(options: DocumentationOptions): Promise<DocumentationResult> {
    const specRoot = path.resolve(options.specRoot);
    const relativeOutput = path.relative(specRoot, path.resolve(options.outputFile));
    if (!relativeOutput.startsWith(`..${path.sep}`) && relativeOutput !== ".." && !path.isAbsolute(relativeOutput)) {
        throw new Error("Documentation output must be outside spec to avoid recursive inclusion.");
    }
    const paths = (await collectFiles(specRoot)).sort();
    const readmeIndex = paths.indexOf("README.md");
    if (readmeIndex >= 0) paths.unshift(...paths.splice(readmeIndex, 1));
    if (!paths.length) throw new Error("No documentation files found.");

    const documents = new Map<string, SourceDocument>();
    for (const relativePath of paths) {
        const bytes = await fs.readFile(path.join(specRoot, relativePath));
        if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error(`Remove UTF-8 BOM from spec/${relativePath}`);
        let text: string;
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
            throw new Error(`Invalid UTF-8 in spec/${relativePath}`);
        }
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error(`Cannot merge binary documentation: spec/${relativePath}`);
        documents.set(relativePath, {
            path: relativePath, anchor: `doc-${hash(relativePath).slice(0, 24)}`,
            bytes: bytes.length, sha256: hash(bytes), text, headings: new Map()
        });
    }

    const markdown = new Map<string, string>();
    for (const document of documents.values()) {
        if (path.extname(document.path).toLowerCase() === ".md") markdown.set(document.path, withHeadingAnchors(document));
    }
    const files = [...documents.values()].map(({ path: sourcePath, anchor, bytes, sha256 }) => ({ path: sourcePath, anchor, bytes, sha256 }));
    const sha256 = hash(JSON.stringify(files));
    const sections = [
        "# Watchdog Development Documentation",
        "中文正文 · UTF-8 · 本文件合并 spec 下的全部文档与文本附件。",
        `Source commit: ${options.commit || "unavailable"} (working-tree documents included)\n\nDocumentation SHA-256: ${sha256}\n\nSource files: ${files.length}`,
        "## Contents and source checksums\n\n| Source | Bytes | SHA-256 |\n| --- | ---: | --- |\n" + files.map((file) => `| [spec/${file.path}](#${file.anchor}) | ${file.bytes} | ${file.sha256} |`).join("\n")
    ];
    for (const document of documents.values()) {
        const content = markdown.has(document.path)
            ? rewriteLinks(markdown.get(document.path)!, document, documents)
            : fencedText(document.text, path.extname(document.path));
        sections.push(`---\n\n<a id="${document.anchor}"></a>\n\n## Source: spec/${document.path}\n\n${content}`);
    }
    await fs.mkdir(path.dirname(options.outputFile), { recursive: true });
    await fs.writeFile(options.outputFile, `${sections.join("\n\n")}\n`, "utf8");
    return { files, sha256 };
}

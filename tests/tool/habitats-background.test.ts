import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    HABITATS_BACKGROUND_ON_CLASS,
    HABITATS_BACKGROUND_SRC,
    HABITATS_BACKGROUND_STORAGE_KEY,
    applyHabitatsBackgroundState,
    habitatsBackgroundToggleLabel,
    readHabitatsBackgroundEnabled,
    writeHabitatsBackgroundEnabled
} from "../../src/tool/habitats-background";

const projectRoot = path.resolve(__dirname, "../..");

describe("habitats homepage background wiring", () => {
    it("ships the habitats plugin entry under public/tool/habitats", () => {
        const indexPath = path.join(projectRoot, "public/tool/habitats/index.html");
        expect(fs.existsSync(indexPath)).toBe(true);

        const html = fs.readFileSync(indexPath, "utf8");
        expect(html).toContain("./vendor/three.module.js");
        expect(html).toContain('src="src/main.js"');
    });

    it("embeds the background layer and switch on the tool homepage", () => {
        const homeHtml = fs.readFileSync(path.join(projectRoot, "public/tool/index.html"), "utf8");
        expect(homeHtml).toContain('id="habitatsBackground"');
        expect(homeHtml).toContain('id="habitatsBackgroundFrame"');
        expect(homeHtml).toContain('id="habitatsBackgroundToggle"');
        expect(homeHtml).toContain('aria-pressed="false"');
        expect(homeHtml).toContain("开启水族箱");
        expect(homeHtml).toMatch(/id="habitatsBackground"[\s\S]*?\bhidden\b/);
    });

    it("defaults to off when localStorage has no saved preference", () => {
        const storage = createMemoryStorage();
        expect(readHabitatsBackgroundEnabled(storage)).toBe(false);
    });

    it("persists off and on through localStorage", () => {
        const storage = createMemoryStorage();
        writeHabitatsBackgroundEnabled(true, storage);
        expect(storage.getItem(HABITATS_BACKGROUND_STORAGE_KEY)).toBe("1");
        expect(readHabitatsBackgroundEnabled(storage)).toBe(true);

        writeHabitatsBackgroundEnabled(false, storage);
        expect(storage.getItem(HABITATS_BACKGROUND_STORAGE_KEY)).toBe("0");
        expect(readHabitatsBackgroundEnabled(storage)).toBe(false);
    });

    it("loads and unloads the iframe src when toggling", () => {
        const root = createNode();
        const layer = createNode();
        const frame = createFrame();
        const toggle = createNode();
        const elements = {
            root: root as unknown as HTMLElement,
            layer: layer as unknown as HTMLElement,
            frame: frame as unknown as HTMLIFrameElement,
            toggle: toggle as unknown as HTMLButtonElement
        };

        applyHabitatsBackgroundState(elements, false);
        expect(layer.hidden).toBe(true);
        expect(frame.hasAttribute("src")).toBe(false);
        expect(root.classNames.has(HABITATS_BACKGROUND_ON_CLASS)).toBe(false);
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
        expect(habitatsBackgroundToggleLabel(false)).toBe("开启水族箱");

        applyHabitatsBackgroundState(elements, true);
        expect(layer.hidden).toBe(false);
        expect(frame.getAttribute("src")).toBe(HABITATS_BACKGROUND_SRC);
        expect(root.classNames.has(HABITATS_BACKGROUND_ON_CLASS)).toBe(true);
        expect(toggle.getAttribute("aria-pressed")).toBe("true");
        expect(habitatsBackgroundToggleLabel(true)).toBe("关闭水族箱");
    });
});

type MockNode = {
    hidden: boolean;
    classNames: Set<string>;
    attributes: Map<string, string>;
    classList: {
        toggle: (name: string, force?: boolean) => void;
        add: (name: string) => void;
        remove: (name: string) => void;
    };
    setAttribute: (name: string, value: string) => void;
    getAttribute: (name: string) => string | null;
};

function createNode(): MockNode {
    const classNames = new Set<string>();
    const attributes = new Map<string, string>();
    return {
        hidden: false,
        classNames,
        attributes,
        classList: {
            toggle(name: string, force?: boolean) {
                const shouldAdd = force ?? !classNames.has(name);
                if (shouldAdd) classNames.add(name);
                else classNames.delete(name);
            },
            add(name: string) {
                classNames.add(name);
            },
            remove(name: string) {
                classNames.delete(name);
            }
        },
        setAttribute(name: string, value: string) {
            attributes.set(name, value);
        },
        getAttribute(name: string) {
            return attributes.has(name) ? attributes.get(name)! : null;
        }
    };
}

function createFrame() {
    const attributes = new Map<string, string>();
    return {
        getAttribute(name: string) {
            return attributes.has(name) ? attributes.get(name)! : null;
        },
        setAttribute(name: string, value: string) {
            attributes.set(name, value);
        },
        removeAttribute(name: string) {
            attributes.delete(name);
        },
        hasAttribute(name: string) {
            return attributes.has(name);
        }
    };
}

function createMemoryStorage(): Storage {
    const values = new Map<string, string>();
    return {
        get length() {
            return values.size;
        },
        clear() {
            values.clear();
        },
        getItem(key: string) {
            return values.has(key) ? values.get(key)! : null;
        },
        key(index: number) {
            return [...values.keys()][index] ?? null;
        },
        removeItem(key: string) {
            values.delete(key);
        },
        setItem(key: string, value: string) {
            values.set(key, String(value));
        }
    };
}

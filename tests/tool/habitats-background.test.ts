import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
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

    it("embeds the background layer and toggle on the tool homepage", () => {
        const homeHtml = fs.readFileSync(path.join(projectRoot, "public/tool/index.html"), "utf8");
        expect(homeHtml).toContain('id="habitatsBackground"');
        expect(homeHtml).toContain('id="habitatsBackgroundFrame"');
        expect(homeHtml).toContain('id="habitatsBackgroundToggle"');
        expect(homeHtml).toContain('aria-pressed="true"');
        expect(homeHtml).toContain("关闭水族箱背景");
    });

    it("defaults to enabled when localStorage has no saved preference", () => {
        const storage = createMemoryStorage();
        expect(readHabitatsBackgroundEnabled(storage)).toBe(true);
    });

    it("persists off and on through localStorage", () => {
        const storage = createMemoryStorage();
        writeHabitatsBackgroundEnabled(false, storage);
        expect(storage.getItem(HABITATS_BACKGROUND_STORAGE_KEY)).toBe("0");
        expect(readHabitatsBackgroundEnabled(storage)).toBe(false);

        writeHabitatsBackgroundEnabled(true, storage);
        expect(storage.getItem(HABITATS_BACKGROUND_STORAGE_KEY)).toBe("1");
        expect(readHabitatsBackgroundEnabled(storage)).toBe(true);
    });

    it("loads and unloads the iframe src when toggling", () => {
        const layer = {
            hidden: false,
            attributes: new Map<string, string>(),
            setAttribute(name: string, value: string) {
                this.attributes.set(name, value);
            }
        };
        const frame = {
            attributes: new Map<string, string>(),
            getAttribute(name: string) {
                return this.attributes.has(name) ? this.attributes.get(name)! : null;
            },
            setAttribute(name: string, value: string) {
                this.attributes.set(name, value);
            },
            removeAttribute(name: string) {
                this.attributes.delete(name);
            },
            hasAttribute(name: string) {
                return this.attributes.has(name);
            }
        };
        const toggle = {
            attributes: new Map<string, string>(),
            classList: {
                values: new Set<string>(),
                toggle(name: string, force?: boolean) {
                    const shouldAdd = force ?? !this.values.has(name);
                    if (shouldAdd) this.values.add(name);
                    else this.values.delete(name);
                }
            },
            setAttribute(name: string, value: string) {
                this.attributes.set(name, value);
            },
            getAttribute(name: string) {
                return this.attributes.has(name) ? this.attributes.get(name)! : null;
            }
        };

        applyHabitatsBackgroundState(
            {
                layer: layer as unknown as HTMLElement,
                frame: frame as unknown as HTMLIFrameElement,
                toggle: toggle as unknown as HTMLButtonElement
            },
            true
        );
        expect(layer.hidden).toBe(false);
        expect(frame.getAttribute("src")).toBe("./habitats/index.html");
        expect(toggle.getAttribute("aria-pressed")).toBe("true");
        expect(habitatsBackgroundToggleLabel(true)).toBe("关闭水族箱背景");

        applyHabitatsBackgroundState(
            {
                layer: layer as unknown as HTMLElement,
                frame: frame as unknown as HTMLIFrameElement,
                toggle: toggle as unknown as HTMLButtonElement
            },
            false
        );
        expect(layer.hidden).toBe(true);
        expect(frame.hasAttribute("src")).toBe(false);
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
        expect(habitatsBackgroundToggleLabel(false)).toBe("开启水族箱背景");
    });
});

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

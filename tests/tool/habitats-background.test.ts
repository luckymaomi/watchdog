import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    HABITATS_BACKGROUND_SRC,
    HABITATS_FEED_MODE_CLASS,
    applyHabitatsFeedMode,
    habitatsFeedToggleLabel
} from "../../src/tool/habitats-background";

const projectRoot = path.resolve(__dirname, "../..");

describe("habitats homepage feed mode wiring", () => {
    it("ships the habitats plugin entry under public/tool/habitats", () => {
        const indexPath = path.join(projectRoot, "public/tool/habitats/index.html");
        expect(fs.existsSync(indexPath)).toBe(true);

        const html = fs.readFileSync(indexPath, "utf8");
        expect(html).toContain("./vendor/three.module.js");
        expect(html).toContain('src="src/main.js"');
    });

    it("embeds the background layer and feed toggle on the tool homepage", () => {
        const homeHtml = fs.readFileSync(path.join(projectRoot, "public/tool/index.html"), "utf8");
        expect(homeHtml).toContain('id="habitatsBackground"');
        expect(homeHtml).toContain('id="habitatsBackgroundFrame"');
        expect(homeHtml).toContain('id="habitatsFeedToggle"');
        expect(homeHtml).toContain('id="habitatsFeedToggleHome"');
        expect(homeHtml).toContain('aria-pressed="false"');
        expect(homeHtml).toContain('aria-label="喂鱼"');
    });

    it("labels the toggle as feed or stop feed", () => {
        expect(habitatsFeedToggleLabel(false)).toBe("喂鱼");
        expect(habitatsFeedToggleLabel(true)).toBe("停止喂鱼");
    });

    it("hides the tool shell and enables interactive background while feeding", () => {
        const root = createNode();
        const pageShell = createNode();
        const layer = createNode();
        const frame = createFrame();
        const toggle = createToggle();
        const toggleHome = createNode();
        toggleHome.appendChild(toggle);

        const elements = {
            root: root as unknown as HTMLElement,
            pageShell: pageShell as unknown as HTMLElement,
            layer: layer as unknown as HTMLElement,
            frame: frame as unknown as HTMLIFrameElement,
            toggle: toggle as unknown as HTMLButtonElement,
            toggleHome: toggleHome as unknown as HTMLElement
        };

        applyHabitatsFeedMode(elements, false);
        expect(frame.getAttribute("src")).toBe(HABITATS_BACKGROUND_SRC);
        expect(pageShell.hidden).toBe(false);
        expect(root.classNames.has(HABITATS_FEED_MODE_CLASS)).toBe(false);
        expect(layer.classNames.has("is-interactive")).toBe(false);
        expect(toggle.getAttribute("aria-pressed")).toBe("false");
        expect(toggle.parentElement).toBe(toggleHome);

        applyHabitatsFeedMode(elements, true);
        expect(pageShell.hidden).toBe(true);
        expect(root.classNames.has(HABITATS_FEED_MODE_CLASS)).toBe(true);
        expect(layer.classNames.has("is-interactive")).toBe(true);
        expect(toggle.getAttribute("aria-pressed")).toBe("true");
        expect(toggle.classNames.has("is-feed-floating")).toBe(true);
        expect(toggle.parentElement).toBe(root);
        expect(toggle.getAttribute("aria-label")).toBe("停止喂鱼");

        applyHabitatsFeedMode(elements, false);
        expect(pageShell.hidden).toBe(false);
        expect(toggle.parentElement).toBe(toggleHome);
        expect(toggle.classNames.has("is-feed-floating")).toBe(false);
        expect(toggle.getAttribute("aria-label")).toBe("喂鱼");
    });
});

type MockNode = {
    hidden: boolean;
    parentElement: MockNode | null;
    classNames: Set<string>;
    attributes: Map<string, string>;
    classList: {
        toggle: (name: string, force?: boolean) => void;
        add: (name: string) => void;
        remove: (name: string) => void;
    };
    setAttribute: (name: string, value: string) => void;
    getAttribute: (name: string) => string | null;
    appendChild: (child: MockNode) => MockNode;
};

function createNode(): MockNode {
    const classNames = new Set<string>();
    const attributes = new Map<string, string>();
    const node: MockNode = {
        hidden: false,
        parentElement: null,
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
        },
        appendChild(child: MockNode) {
            child.parentElement = node;
            return child;
        }
    };
    return node;
}

function createFrame() {
    const attributes = new Map<string, string>();
    return {
        getAttribute(name: string) {
            return attributes.has(name) ? attributes.get(name)! : null;
        },
        setAttribute(name: string, value: string) {
            attributes.set(name, value);
        }
    };
}

function createToggle(): MockNode {
    return createNode();
}

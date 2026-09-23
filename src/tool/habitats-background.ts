export const HABITATS_BACKGROUND_STORAGE_KEY = "watchdog.toolIndex.habitatsBackground";
export const HABITATS_BACKGROUND_SRC = "./habitats/index.html";
export const HABITATS_BACKGROUND_ON_CLASS = "habitats-background-on";

export type HabitatsBackgroundStorage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
};

export function readHabitatsBackgroundEnabled(
    storage: HabitatsBackgroundStorage | null | undefined = globalThis.localStorage
): boolean {
    if (!storage) return false;
    try {
        const raw = storage.getItem(HABITATS_BACKGROUND_STORAGE_KEY);
        if (raw === null) return false;
        return raw === "1" || raw === "true";
    } catch {
        return false;
    }
}

export function writeHabitatsBackgroundEnabled(
    enabled: boolean,
    storage: HabitatsBackgroundStorage | null | undefined = globalThis.localStorage
): void {
    if (!storage) return;
    try {
        storage.setItem(HABITATS_BACKGROUND_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
        // Ignore quota / private-mode write failures; UI still works for this session.
    }
}

export function habitatsBackgroundToggleLabel(enabled: boolean): string {
    return enabled ? "关闭水族箱" : "开启水族箱";
}

export type HabitatsBackgroundElements = {
    root: HTMLElement;
    layer: HTMLElement;
    frame: HTMLIFrameElement;
    toggle: HTMLButtonElement;
};

export function applyHabitatsBackgroundState(
    elements: HabitatsBackgroundElements,
    enabled: boolean
): void {
    const { root, layer, frame, toggle } = elements;

    root.classList.toggle(HABITATS_BACKGROUND_ON_CLASS, enabled);
    layer.hidden = !enabled;
    layer.setAttribute("aria-hidden", String(!enabled));
    layer.classList.remove("is-interactive");

    if (enabled) {
        if (!frame.getAttribute("src")) {
            frame.setAttribute("src", HABITATS_BACKGROUND_SRC);
        }
    } else {
        frame.removeAttribute("src");
    }

    const label = habitatsBackgroundToggleLabel(enabled);
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.classList.toggle("is-active", enabled);
    toggle.classList.remove("is-feed-floating");
}

export function bindHabitatsBackground(
    elements: HabitatsBackgroundElements,
    storage: HabitatsBackgroundStorage | null | undefined = globalThis.localStorage
): { getEnabled: () => boolean; setEnabled: (enabled: boolean) => void } {
    let enabled = readHabitatsBackgroundEnabled(storage);
    applyHabitatsBackgroundState(elements, enabled);

    elements.frame.addEventListener("error", () => {
        if (!enabled) return;
        enabled = false;
        writeHabitatsBackgroundEnabled(false, storage);
        applyHabitatsBackgroundState(elements, false);
    });

    elements.toggle.addEventListener("click", () => {
        enabled = !enabled;
        writeHabitatsBackgroundEnabled(enabled, storage);
        applyHabitatsBackgroundState(elements, enabled);
    });

    return {
        getEnabled: () => enabled,
        setEnabled: (next: boolean) => {
            enabled = next;
            writeHabitatsBackgroundEnabled(enabled, storage);
            applyHabitatsBackgroundState(elements, enabled);
        }
    };
}

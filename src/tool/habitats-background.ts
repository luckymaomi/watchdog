export const HABITATS_BACKGROUND_STORAGE_KEY = "watchdog.toolIndex.habitatsBackground";
export const HABITATS_BACKGROUND_SRC = "./habitats/index.html";

export type HabitatsBackgroundStorage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
};

export function readHabitatsBackgroundEnabled(
    storage: HabitatsBackgroundStorage | null | undefined = globalThis.localStorage
): boolean {
    if (!storage) return true;
    try {
        const raw = storage.getItem(HABITATS_BACKGROUND_STORAGE_KEY);
        if (raw === null) return true;
        return raw === "1" || raw === "true";
    } catch {
        return true;
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
    return enabled ? "关闭水族箱背景" : "开启水族箱背景";
}

export type HabitatsBackgroundElements = {
    layer: HTMLElement;
    frame: HTMLIFrameElement;
    toggle: HTMLButtonElement;
};

export function applyHabitatsBackgroundState(
    elements: HabitatsBackgroundElements,
    enabled: boolean
): void {
    const { layer, frame, toggle } = elements;
    layer.hidden = !enabled;
    layer.setAttribute("aria-hidden", String(!enabled));

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

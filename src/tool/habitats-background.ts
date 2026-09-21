export const HABITATS_BACKGROUND_SRC = "./habitats/index.html";
export const HABITATS_FEED_MODE_CLASS = "habitats-feed-mode";

export function habitatsFeedToggleLabel(feeding: boolean): string {
    return feeding ? "停止喂鱼" : "喂鱼";
}

export type HabitatsFeedModeElements = {
    root: HTMLElement;
    pageShell: HTMLElement;
    layer: HTMLElement;
    frame: HTMLIFrameElement;
    toggle: HTMLButtonElement;
    toggleHome: HTMLElement;
};

export function ensureHabitatsBackgroundLoaded(frame: HTMLIFrameElement): void {
    if (!frame.getAttribute("src")) {
        frame.setAttribute("src", HABITATS_BACKGROUND_SRC);
    }
}

export function applyHabitatsFeedMode(
    elements: HabitatsFeedModeElements,
    feeding: boolean
): void {
    const { root, pageShell, layer, frame, toggle, toggleHome } = elements;

    ensureHabitatsBackgroundLoaded(frame);
    layer.hidden = false;
    layer.setAttribute("aria-hidden", "false");
    root.classList.toggle(HABITATS_FEED_MODE_CLASS, feeding);
    pageShell.hidden = feeding;
    pageShell.setAttribute("aria-hidden", String(feeding));
    layer.classList.toggle("is-interactive", feeding);

    if (feeding) {
        if (toggle.parentElement !== root) {
            root.appendChild(toggle);
        }
        toggle.classList.add("is-feed-floating");
    } else {
        toggle.classList.remove("is-feed-floating");
        if (toggle.parentElement !== toggleHome) {
            toggleHome.appendChild(toggle);
        }
    }

    const label = habitatsFeedToggleLabel(feeding);
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("title", label);
    toggle.setAttribute("aria-pressed", String(feeding));
    toggle.classList.toggle("is-active", feeding);
}

export function bindHabitatsFeedMode(
    elements: HabitatsFeedModeElements
): { getFeeding: () => boolean; setFeeding: (feeding: boolean) => void } {
    let feeding = false;
    applyHabitatsFeedMode(elements, feeding);

    elements.frame.addEventListener("error", () => {
        if (feeding) {
            feeding = false;
            applyHabitatsFeedMode(elements, false);
        }
    });

    elements.toggle.addEventListener("click", () => {
        feeding = !feeding;
        applyHabitatsFeedMode(elements, feeding);
    });

    return {
        getFeeding: () => feeding,
        setFeeding: (next: boolean) => {
            feeding = next;
            applyHabitatsFeedMode(elements, feeding);
        }
    };
}

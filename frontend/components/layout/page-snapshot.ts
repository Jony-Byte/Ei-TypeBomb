import type { MorphRect } from "./morph-motion";

export function rectOf(element: HTMLElement): MorphRect {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { x: left, y: top, width, height };
}

export function screenRect(): MorphRect {
    const visual = window.visualViewport;
    return visual
        ? { x: visual.offsetLeft, y: visual.offsetTop, width: visual.width, height: visual.height }
        : { x: 0, y: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
}

export function place(element: HTMLElement, rect: MorphRect) {
    Object.assign(element.style, {
        position: "absolute", left: rect.x + "px", top: rect.y + "px",
        width: rect.width + "px", height: rect.height + "px",
        margin: "0", transformOrigin: "top left", transform: "none", transition: "none",
    });
}

export function inertCopy(element: HTMLElement) {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.inert = true;
    copy.setAttribute("aria-hidden", "true");
    for (const node of [copy, ...copy.querySelectorAll("[id], [data-cursor], [data-navigation-morph-target], [data-room-list-card]")]) {
        node.removeAttribute("id");
        node.removeAttribute("data-cursor");
        node.removeAttribute("data-navigation-morph-target");
        node.removeAttribute("data-room-list-card");
    }
    // cloneNode preserves input values but not a scroll container's position.
    // Carry it into the mounted copy before the first animation frame.
    const scrollPositions = Array.from(element.querySelectorAll<HTMLElement>("*"))
        .map((node, index) => ({ index, left: node.scrollLeft, top: node.scrollTop }))
        .filter(({ left, top }) => left || top);
    return {
        copy,
        restoreScroll: () => {
            if (!scrollPositions.length) return;
            const descendants = copy.querySelectorAll<HTMLElement>("*");
            for (const { index, left, top } of scrollPositions) {
                descendants[index].scrollTo({ left, top, behavior: "instant" });
            }
        },
    };
}

export function createPageOverlay(kind: "slide" | "morph") {
    const overlay = document.createElement("div");
    overlay.inert = true;
    overlay.setAttribute("aria-hidden", "true");
    overlay.dataset.roomNavigationOverlay = kind;
    place(overlay, screenRect());
    overlay.style.position = "fixed";
    return overlay;
}

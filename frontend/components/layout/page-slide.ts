import { createPageOverlay, inertCopy, place, rectOf, screenRect } from "./page-snapshot";
import { beginNativeSlideCursor, endNativeSlideCursor } from "./slide-cursor";
import { getSlideMotion, slideFrames } from "./slide-motion";
import type { NavigationDirection } from "./Navigation";

function captureLayer(viewport: HTMLElement) {
    const layer = document.createElement("div");
    const screen = screenRect();
    const rect = rectOf(viewport);
    const shell = viewport.querySelector<HTMLElement>("[data-navigation-shell-width]");
    const width = shell?.offsetWidth || viewport.clientWidth;
    const { copy, restoreScroll } = inertCopy(viewport);
    copy.removeAttribute("data-room-slide-live");
    // Both layers have the same fixed viewport coordinate system. Inside each,
    // the page keeps the exact layout and scroll offset it had when captured.
    layer.className = "room-navigation-slide-layer";
    place(layer, { x: 0, y: 0, width: screen.width, height: screen.height });
    place(copy, { ...rect, x: rect.x - screen.x, y: rect.y - screen.y });
    layer.append(copy);
    return { layer, width, restoreScroll };
}

export function capturePageSlide(viewport: HTMLElement) {
    const outgoing = captureLayer(viewport);
    const overlay = createPageOverlay("slide");
    const animations: Animation[] = [];
    let stopMotion: (() => void) | undefined;
    let live: HTMLElement | undefined;
    const dispose = () => {
        live?.removeAttribute("data-room-slide-live");
        overlay.remove();
        stopMotion?.();
        for (const animation of animations) animation.cancel();
        if (live) endNativeSlideCursor();
        live = undefined;
    };
    const hold = (viewport: HTMLElement) => {
        live = viewport;
        live.dataset.roomSlideLive = "";
        overlay.append(outgoing.layer);
        document.body.append(overlay);
        outgoing.restoreScroll();
    };
    const play = (viewport: HTMLElement, direction: NavigationDirection, onFinish: () => void) => {
        const incoming = captureLayer(viewport);
        if (!live) hold(viewport);
        if (direction === "push") overlay.append(incoming.layer);
        else overlay.prepend(incoming.layer);
        incoming.restoreScroll();
        const { timing, offset } = getSlideMotion();
        beginNativeSlideCursor();
        animations.push(
            outgoing.layer.animate(slideFrames(direction === "push" ? "under-out" : "pop-out", outgoing.width, offset), { ...timing, fill: "both" }),
            incoming.layer.animate(slideFrames(direction === "push" ? "push-in" : "under-in", incoming.width, offset), { ...timing, fill: "both" }),
        );
        void Promise.all(animations.map(animation => animation.finished)).then(onFinish, onFinish);
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onMotion = () => { if (motion.matches) onFinish(); };
        motion.addEventListener("change", onMotion);
        stopMotion = () => motion.removeEventListener("change", onMotion);
    };
    return { hold, play, dispose };
}

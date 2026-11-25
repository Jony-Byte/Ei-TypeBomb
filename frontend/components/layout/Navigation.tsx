"use client";

import { usePathname, useRouter } from "next/navigation";
import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    type ReactNode,
} from "react";
import "./navigation.css";
import { slideFrames, getSlideMotion, prefersReducedMotion } from "./slide-motion";
import { animateSlideEntrance, beginNativeSlideCursor, endNativeSlideCursor } from "./slide-cursor";
import RoomNavigation, { useRoomNavigation } from "./RoomNavigation";

export type NavigationDirection = "push" | "pop";
export type NavigationTransition = "slide" | "morph";
type NavigationOptions = { transition: "morph"; source: HTMLElement };

type Navigate = (
    href: string,
    direction: NavigationDirection,
    preventDefault: () => void,
    options?: NavigationOptions,
) => void;

type Request = {
    target: string;
    direction: NavigationDirection;
    timer?: ReturnType<typeof setTimeout>;
    complete?: () => void;
    transition?: ViewTransition;
    viewport?: HTMLElement;
};

// View transitions are document-wide, even when Navigation providers are nested.
let documentTransition: { request: Request; cancel: () => void } | null = null;

const NavigationContext = createContext<Navigate | null>(null);
const RootNavigationContext = createContext<Navigate | null>(null);
const EditorBackContext = createContext<(() => void) | null>(null);

export function useEditorBack() { return useContext(EditorBackContext); }
const normalize = (path: string) => path.replace(/\/+$/, "") || "/";

// Measure the responsive Shell content, not the full clipping viewport.
function navigationWidth(viewport: HTMLElement) {
    const shell = viewport.querySelector<HTMLElement>("[data-navigation-shell-width]");
    return shell?.offsetWidth || viewport.clientWidth;
}

function releaseDocumentTransition(request: Request) {
    if (documentTransition?.request !== request) return;
    documentTransition = null;
    const root = document.documentElement;
    delete root.dataset.etbNavigation;
    root.style.removeProperty("--etb-navigation-old-width");
    root.style.removeProperty("--etb-navigation-new-width");
    endNativeSlideCursor();
}

export function useNavigation(scope: "local" | "root" = "local") {
    const local = useContext(NavigationContext);
    const root = useContext(RootNavigationContext);
    return scope === "root" ? root : local ?? root;
}

function stop(request: Request, skip = false) {
    clearTimeout(request.timer);
    if (skip) request.transition?.skipTransition();
    request.complete?.();
}

export default function Navigation({ children, root = false, roomBrowse = false }: { children: ReactNode; root?: boolean; roomBrowse?: boolean }) {
    const router = useRouter();
    const pathname = usePathname();
    const viewport = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const pending = useRef<Request | null>(null);
    const active = useRef<Request | null>(null);
    const animation = useRef<Animation | null>(null);
    const rooms = useRoomNavigation();
    const roomRoot = useRef<RoomNavigation>(null);

    function cancel() {
        if (pending.current) stop(pending.current, true);
        pending.current = null;
        const request = active.current;
        active.current = null;
        if (request) {
            stop(request, true);
            releaseDocumentTransition(request);
            request.viewport?.style.removeProperty("view-transition-name");
        }
        animation.current?.cancel();
        animation.current = null;
    }

    useEffect(() => {
        // Ordinary sidebar links and browser history are not explicit push/pop.
        function onSidebarClick(event: MouseEvent) {
            if (
                event.button === 0 && !event.metaKey && !event.ctrlKey &&
                !event.shiftKey && !event.altKey &&
                event.target instanceof Element &&
                event.target.closest("[data-sidebar-navigation] a")
            ) cancel();
        }
        function onPopState() {
            cancel();
        }
        window.addEventListener("popstate", onPopState);
        document.addEventListener("click", onSidebarClick, true);
        return () => {
            window.removeEventListener("popstate", onPopState);
            document.removeEventListener("click", onSidebarClick, true);
            cancel();
        };
    }, []);

    useLayoutEffect(() => {
        roomRoot.current?.initialize();
    }, []);

    useLayoutEffect(() => {
        const request = pending.current;
        if (!request || !pathname) return;
        pending.current = null;
        const matches = normalize(pathname) === request.target;
        const width = viewport.current ? navigationWidth(viewport.current) : 0;
        if (matches && request.transition && width > 0) {
            document.documentElement.style.setProperty("--etb-navigation-new-width", `${width}px`);
        }
        if (matches && request.transition) beginNativeSlideCursor();
        stop(request, !matches);
        if (request.transition || !matches ||
            prefersReducedMotion()) return;

        // Older browsers still get a directional entrance without snapshots.
        if (!width) return;
        animation.current?.cancel();
        const { timing, offset } = getSlideMotion();
        animation.current = content.current ? animateSlideEntrance(
            content.current,
            slideFrames(request.direction === "push" ? "push-in" : "under-in", width, offset),
            timing,
        ) : null;
    }, [pathname]);

    const navigate: Navigate = (href, direction, preventDefault, options) => {
        const source = options?.source;
        if ((rooms ?? roomRoot.current)?.navigate(href, direction, source)) {
            documentTransition?.cancel();
            preventDefault();
            return;
        }
        cancel();
        const node = viewport.current;
        if (!node || prefersReducedMotion() || options) return;
        const url = new URL(href, window.location.href);
        const target = normalize(url.pathname);
        if (url.origin !== window.location.origin ||
            target === normalize(window.location.pathname)) return;
        const request: Request = { target, direction };
        pending.current = request;

        if (typeof document.startViewTransition === "function") {
            // Retire the old owner synchronously before assigning any shared names.
            documentTransition?.cancel();
            documentTransition = { request, cancel };
            request.viewport = node;
            const root = document.documentElement;
            const width = navigationWidth(node);
            if (width > 0) {
                root.style.setProperty("--etb-navigation-old-width", `${width}px`);
                root.style.setProperty("--etb-navigation-new-width", `${width}px`);
            }
            node.style.viewTransitionName = "etb-navigation-content";
            root.dataset.etbNavigation = direction;
            active.current = request;
            try {
                const transition = document.startViewTransition(async () => {
                    if (pending.current !== request) return;
                    const committed = new Promise<void>((resolve) => {
                        request.complete = resolve;
                        // Do not freeze the old screen during a slow server response.
                        request.timer = setTimeout(() => {
                            if (pending.current === request) pending.current = null;
                            stop(request, true);
                        }, 500);
                    });
                    router.push(href);
                    await committed;
                });
                request.transition = transition;
                preventDefault();
                const cleanup = () => {
                    if (active.current !== request) return;
                    active.current = null;
                    releaseDocumentTransition(request);
                    node.style.viewTransitionName = "";
                };
                void transition.ready.catch(() => {});
                void transition.finished.then(cleanup, cleanup);
                return;
            } catch {
                active.current = null;
                    releaseDocumentTransition(request);
                node.style.viewTransitionName = "";
            }
        }

        // Keep Next Link's native navigation/prefetch behavior in the fallback.
        request.timer = setTimeout(() => {
            if (pending.current === request) pending.current = null;
        }, 5000);
    };

    const Context = root ? RootNavigationContext : NavigationContext;
    return (
        <Context.Provider value={navigate}>
            <div
                ref={viewport}
                data-room-browse={roomBrowse ? "" : undefined}
                className={`min-w-0 w-full overflow-x-clip ${root ? "h-full min-h-0 shrink-0" : ""}`}
            >
                <div ref={content} className={root ? "h-full" : undefined}>
                    {root ? (
                        <RoomNavigation ref={roomRoot} pathname={pathname} viewport={viewport} push={router.push} back={router.back}>
                            <EditorBackContext.Provider value={() => roomRoot.current?.editorBack()}>{children}</EditorBackContext.Provider>
                        </RoomNavigation>
                    ) : children}
                </div>
            </div>
        </Context.Provider>
    );
}

"use client";

import { Component, createContext, useContext, type ReactNode, type RefObject } from "react";
import { capturePageMorph, type PageMorph } from "./page-morph";
import { capturePageSlide } from "./page-slide";
import { prefersReducedMotion } from "./slide-motion";
import { centerRoomListCard, type RoomListSelection } from "@/lib/room/list-return";
import type { NavigationDirection } from "./Navigation";

type Entry = {
    id: number;
    path: string;
    kind: "list" | "detail" | "editor" | null;
    roomKey?: string;
    top: number;
    previous?: Entry;
    // A room visit keeps its own selection even if the list entry is reused.
    selectedRoom?: RoomListSelection;
    selection?: RoomListSelection;
    returnSelection?: RoomListSelection;
};

type Request = {
    path: string;
    direction: NavigationDirection;
    from: Entry;
    history?: Entry;
    selection?: RoomListSelection;
    center?: boolean;
    source?: HTMLElement;
};

type Visual =
    | { kind: "slide"; animation: ReturnType<typeof capturePageSlide> }
    | { kind: "morph"; animation: PageMorph };

type Commit = { request: Request; visual?: Visual };

const historyKey = "etbRoomEntry";
const listPaths = new Set(["/", "/latest", "/mine", "/saved"]);
const normalize = (path: string) => path.replace(/\/+$/, "") || "/";
const isEditor = (path: string) => /^\/[^/]+\/edit$/.test(path);

type Props = {
    pathname: string | null;
    viewport: RefObject<HTMLDivElement | null>;
    push: (href: string, options: { scroll: false }) => void;
    back: () => void;
    children: ReactNode;
};

const RoomNavigationContext = createContext<RoomNavigation | null>(null);
export const useRoomNavigation = () => useContext(RoomNavigationContext);

function morphTarget(root: HTMLElement, key?: string) {
    return Array.from(root.querySelectorAll<HTMLElement>("[data-navigation-morph-target]"))
        .find(element => element.dataset.navigationMorphTarget === key);
}

// Only the persistent root participates in room scroll restoration. Nested
// Navigation providers still control the scope of other navigation animations.
export default class RoomNavigation extends Component<Props> {
    private entries = new Map<string, Entry>();
    private current?: Entry;
    private request?: Request;
    private waiting?: Commit;
    private disposeAnimation?: () => void;
    private sequence = 0;

    componentDidMount() {
        window.addEventListener("popstate", this.onPopState);
        document.addEventListener("click", this.onLinkClick, true);
    }

    componentWillUnmount() {
        window.removeEventListener("popstate", this.onPopState);
        document.removeEventListener("click", this.onLinkClick, true);
        this.cancel();
    }

    initialize() {
        if (!this.current) this.recordEntry();
    }

    private path() {
        return normalize(this.props.pathname ?? "/");
    }

    private recordEntry(request?: Request) {
        const viewport = this.props.viewport.current;
        const detail = viewport?.querySelector<HTMLElement>("[data-room-detail]");
        const kind = viewport?.querySelector("[data-room-editor]") ? "editor"
            : viewport?.querySelector("[data-room-list]") ? "list"
                : detail ? "detail" : null;
        const entry: Entry = request?.history ?? {
            id: ++this.sequence,
            path: this.path(),
            kind,
            top: 0,
            previous: request?.from,
            selectedRoom: request?.from.kind === "list" ? request.from.selection : undefined,
        };
        entry.kind = kind;
        entry.roomKey = detail?.dataset.navigationMorphTarget;
        if (kind === "list") entry.returnSelection = request?.selection;
        this.current = entry;
        // App Router keeps its own state on the entry. The browser must leave
        // scroll restoration for room entries to the commit below.
        window.history.scrollRestoration = kind ? "manual" : "auto";
        if (!kind) return;
        const key = `${performance.timeOrigin}:${entry.id}`;
        this.entries.set(key, entry);
        window.history.replaceState({ ...window.history.state, [historyKey]: key }, "");
    }

    rememberSelection = (selection: RoomListSelection) => {
        if (this.current?.kind === "list") this.current.selection = selection;
    };

    listReturn = (path: string) => {
        const normalized = normalize(path);
        if (this.request?.path === normalized) return this.request.selection;
        return this.current?.path === normalized ? this.current.returnSelection : undefined;
    };

    listBackPath = (path: string | null) => {
        const entry = this.request?.path === normalize(path ?? "/")
            ? this.request.history ?? this.request.from
            : this.current;
        for (let previous = entry; previous?.kind; previous = previous.previous) {
            if (previous.kind === "list") return previous.path;
        }
    };

    private clearVisual() {
        this.disposeAnimation?.();
        this.disposeAnimation = undefined;
    }

    private cancel() {
        this.request = undefined;
        this.waiting = undefined;
        this.clearVisual();
    }

    private onLinkClick = (event: MouseEvent) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
            || !(event.target instanceof Element)) return;
        const link = event.target.closest<HTMLAnchorElement>("a[href]");
        if (link && !link.download && (!link.target || link.target === "_self")
            && normalize(link.pathname) !== this.current?.path) this.cancel();
    };

    private onPopState = (event: PopStateEvent) => {
        const from = this.current;
        const path = normalize(window.location.pathname);
        const history = this.entries.get(event.state?.[historyKey]);
        this.cancel();
        if (!from || history === from) return;
        from.top = window.scrollY;
        if (!history?.kind || history.path !== path) return;
        const center = history.kind === "list" && from.previous === history && !!from.selectedRoom?.roomId;
        this.request = {
            path, from, history, center,
            direction: from.id > history.id ? "pop" : "push",
            selection: history.kind === "list"
                ? center ? from.selectedRoom : history.selection ?? history.returnSelection
                : undefined,
        };
    };

    navigate = (target: string, direction: NavigationDirection, source?: HTMLElement) => {
        const from = this.current;
        const url = new URL(target, window.location.href);
        const path = normalize(url.pathname);
        if (!from || url.origin !== window.location.origin || path === from.path
            || (!source && !isEditor(path))) return false;

        this.cancel();
        if (direction === "pop" && from.previous?.path === path && normalize(window.location.pathname) === from.path) {
            this.props.back();
            return true;
        }

        // A direct detail visit has no previous feed history entry.
        const key = direction === "pop" && listPaths.has(path) ? source?.dataset.navigationMorphTarget : undefined;
        this.request = {
            path, from, direction, source,
            selection: key ? { roomId: key, keyword: "", scrollTop: 0 } : undefined,
            center: Boolean(key),
        };
        try {
            this.props.push(target, { scroll: false });
        } catch (error) {
            this.cancel();
            throw error;
        }
        return true;
    };

    editorBack = () => {
        // Both browser traversal and the in-app back button share one path.
        this.props.back();
    };

    getSnapshotBeforeUpdate(previous: Props): Commit | null {
        if (previous.pathname === this.props.pathname) return null;
        this.clearVisual();
        this.waiting = undefined;
        const request = this.request;
        if (this.current && !request?.history) this.current.top = window.scrollY;
        if (!request) return null;
        return { request, visual: this.capture(request) };
    }

    private capture(request: Request): Visual | undefined {
        const viewport = this.props.viewport.current;
        if (!viewport || request.path !== this.path() || prefersReducedMotion()) return;
        // Before DOM mutation both the current layout and scroll offset are
        // still available, independent of how long the route took to load.
        if (request.from.kind === "editor" || isEditor(request.path)) {
            return { kind: "slide", animation: capturePageSlide(viewport) };
        }
        const browse = viewport.querySelector<HTMLElement>("[data-room-browse]");
        if (!browse) return;
        const key = request.from.kind === "list"
            ? request.history?.selectedRoom?.roomId
            : request.center ? request.from.roomKey : undefined;
        const source = request.source ?? morphTarget(browse, key);
        if (!source || !browse.contains(source)) return;
        const animation = capturePageMorph(browse, source);
        if (animation) return { kind: "morph", animation };
    }

    componentDidUpdate(previous: Props, _state: unknown, commit: Commit | null) {
        if (previous.pathname === this.props.pathname) return;
        this.request = undefined;
        const request = commit?.request;
        const matches = request?.path === this.path();
        this.recordEntry(matches ? request : undefined);
        if (!commit) return;

        if (matches && this.current?.kind === "list" && request?.selection) {
            this.waiting = commit;
            const viewport = this.props.viewport.current;
            const list = viewport?.querySelector<HTMLElement>("[data-room-list]");
            if (list?.dataset.roomList === "ready") this.listReady();
            else if (viewport && commit.visual?.kind === "slide") this.holdSlide(viewport, commit.visual.animation);
            return;
        }

        // Scroll also on reduced motion and when a redirect prevents capture.
        window.scrollTo({ top: matches ? request?.history?.top ?? 0 : 0, behavior: "instant" });
        if (matches) this.play(commit);
    }

    private holdSlide(viewport: HTMLElement, animation: ReturnType<typeof capturePageSlide>) {
        animation.hold(viewport);
        // Public cards are already rendered if viewer controls are slow.
        // On timeout reveal that layout at its final scroll offset in one commit.
        const timeout = window.setTimeout(() => {
            if (!this.waiting) return;
            this.waiting.visual = undefined;
            this.listReady();
        }, 1500);
        this.disposeAnimation = () => {
            window.clearTimeout(timeout);
            animation.dispose();
        };
    }

    listReady = () => {
        const commit = this.waiting;
        const viewport = this.props.viewport.current;
        if (!commit || !viewport || this.path() !== commit.request.path) return;
        this.waiting = undefined;
        const { selection, center, history } = commit.request;
        const card = center && Array.from(viewport.querySelectorAll<HTMLElement>("[data-room-list-card]"))
            .find(element => element.dataset.roomListCard === selection?.roomId);
        if (card) centerRoomListCard(card);
        else window.scrollTo({ top: history?.top ?? selection?.scrollTop ?? 0, behavior: "instant" });
        this.play(commit);
    };

    private play({ request, visual }: Commit) {
        this.clearVisual();
        const viewport = this.props.viewport.current;
        if (!viewport || !visual || prefersReducedMotion()) return;
        const { animation } = visual;
        const finish = () => {
            if (this.disposeAnimation === animation.dispose) this.clearVisual();
        };
        this.disposeAnimation = animation.dispose;
        if (visual.kind === "slide") {
            visual.animation.play(viewport, request.direction, finish);
        } else {
            const target = morphTarget(viewport, visual.animation.key);
            if (target) visual.animation.play(target, finish);
            else finish();
        }
    }

    render() {
        return <RoomNavigationContext.Provider value={this}>{this.props.children}</RoomNavigationContext.Provider>;
    }
}

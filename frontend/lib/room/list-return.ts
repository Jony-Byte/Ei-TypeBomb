import type { View } from "@/type";

type RoomListSelection = {
    view: View;
    path: string;
    roomId: string;
    roomLink: string;
    keyword: string;
    scrollTop: number;
    departed: boolean;
};

// Only written by client navigation. Keep the selection across the root
// editor route, which unmounts the entire browse layout.
let selection: RoomListSelection | null = null;
const listPaths = new Set(["/", "/latest", "/mine", "/saved"]);
const normalize = (path: string) => path.replace(/\/+$/, "") || "/";

export function rememberRoomListSelection(entry: Omit<RoomListSelection, "departed">) {
    selection = { ...entry, path: normalize(entry.path), departed: false };
}

export function noteRoomListPath(pathname: string) {
    const path = normalize(pathname);
    if (!selection || path === selection.path) return;
    if (listPaths.has(path)) {
        selection = null;
        return;
    }
    const roomPath = "/" + selection.roomLink;
    if (path === roomPath || path.startsWith(roomPath + "/")) {
        selection.departed = true;
    } else {
        selection = null;
    }
}

export function getRoomListReturn(view: View) {
    return selection?.departed && selection.view === view ? selection : null;
}

export function getRoomListBackPath(pathname: string | null) {
    if (!pathname || !selection?.departed) return undefined;
    const path = normalize(pathname);
    const roomPath = "/" + selection.roomLink;
    return path === roomPath || path.startsWith(roomPath + "/") ? selection.path : undefined;
}

export function finishRoomListReturn(entry: RoomListSelection) {
    if (selection === entry) selection = null;
}

export function roomListRenderCount(roomIds: readonly string[], selectedId: string | undefined, pageSize: number) {
    const index = selectedId ? roomIds.indexOf(selectedId) : -1;
    return Math.max(pageSize, Math.ceil((index + 1) / pageSize) * pageSize);
}

export function centerRoomListCard(card: HTMLElement) {
    // Native scrolling clamps at the top and bottom of each scroll container.
    card.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
}

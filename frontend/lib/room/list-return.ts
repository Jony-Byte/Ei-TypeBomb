export type RoomListSelection = {
    roomId?: string;
    keyword: string;
    scrollTop: number;
};

export function roomListRenderCount(roomIds: readonly string[], selectedId: string | undefined, pageSize: number) {
    const index = selectedId ? roomIds.indexOf(selectedId) : -1;
    // Leave a page of room below the target so the first restoration is
    // clamped by the actual end of the list instead of by the loading sentinel.
    return index < 0 ? pageSize : (Math.floor(index / pageSize) + 2) * pageSize;
}

export function centerRoomListCard(card: HTMLElement) {
    const { top, height } = card.getBoundingClientRect();
    const viewport = window.visualViewport;
    const center = viewport ? viewport.offsetTop + viewport.height / 2 : document.documentElement.clientHeight / 2;
    // Scroll the document once. The browser clamps the requested position.
    window.scrollTo({ top: window.scrollY + top + height / 2 - center, behavior: "instant" });
}

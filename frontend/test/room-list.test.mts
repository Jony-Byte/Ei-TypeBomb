import assert from "node:assert/strict";
import { test } from "node:test";
import type { Room } from "../type/index";
import { getEditableRoomIds, selectRoomsForView } from "../lib/room/list-view";
import { getRoomListNavigationItems } from "../lib/room/list-navigation";
import { centerRoomListCard, finishRoomListReturn, getRoomListBackPath, getRoomListReturn, noteRoomListPath, rememberRoomListSelection, roomListRenderCount } from "../lib/room/list-return";

const otherPublic: Room = {
    id: "public-other",
    title: "Other's public room",
    visibility: "public",
    updatedAt: "2026-11-02T00:00:00Z",
};
const myPublic: Room = {
    id: "public-mine",
    title: "My public room",
    visibility: "public",
    updatedAt: "2026-11-01T00:00:00Z",
};
const myPrivate: Room = {
    id: "private-mine",
    title: "My private room",
    visibility: "private",
    updatedAt: "2026-11-03T00:00:00Z",
};
const otherUnlisted: Room = {
    id: "unlisted-other",
    title: "Other's unlisted room",
    visibility: "unlisted",
};

function select(view: "recommended" | "latest" | "mine" | "saved") {
    return selectRoomsForView({
        view,
        publicRooms: [otherPublic, myPublic, otherUnlisted],
        myRooms: [myPublic, myPrivate],
        savedRoomIds: ["public-other", "private-mine", "unlisted-other"],
        currentUserId: "authenticated-user",
    });
}

test("recommended preserves public ranking and does not reveal private or unlisted rooms", () => {
    assert.deepEqual(select("recommended").map(({ id }) => id), [
        "public-other",
        "public-mine",
    ]);
});

test("mine includes all owned visibility levels, newest first", () => {
    assert.deepEqual(select("mine").map(({ id }) => id), [
        "private-mine",
        "public-mine",
    ]);
});

test("saved applies the same visibility boundary as the web room feed", () => {
    assert.deepEqual(select("saved").map(({ id }) => id), [
        "public-other",
        "private-mine",
    ]);
});

test("own version of a room overrides public summary and retains ownership", () => {
    const result = selectRoomsForView({
        view: "recommended",
        publicRooms: [myPublic],
        myRooms: [{ ...myPublic, title: "Edited", userId: undefined }],
        savedRoomIds: [],
        currentUserId: "authenticated-user",
    });
    assert.equal(result[0].title, "Edited");
    assert.equal(result[0].userId, "authenticated-user");
});

test("guest never gains access from saved IDs alone", () => {
    const result = selectRoomsForView({
        view: "saved",
        publicRooms: [otherPublic],
        myRooms: [],
        savedRoomIds: ["private-mine", "public-other"],
        currentUserId: null,
    });
    assert.deepEqual(result.map(({ id }) => id), ["public-other"]);
});

test("latest sorts public rooms by creation date, not update date or recommendation rank", () => {
    const result = selectRoomsForView({
        view: "latest",
        publicRooms: [
            { ...otherPublic, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-14T00:00:00Z" },
            { ...myPublic, createdAt: "2026-11-13T00:00:00Z", updatedAt: "2026-11-02T00:00:00Z" },
            { ...otherUnlisted, createdAt: "2026-11-14T00:00:00Z" },
        ],
        myRooms: [myPrivate],
        savedRoomIds: [],
        currentUserId: "authenticated-user",
    });
    assert.deepEqual(result.map(({ id }) => id), ["public-mine", "public-other"]);
});

test("guests can browse latest public rooms without exposing private or unlisted rooms", () => {
    const result = selectRoomsForView({
        view: "latest",
        publicRooms: [
            { ...myPublic, createdAt: "2026-11-12T00:00:00Z" },
            { ...otherUnlisted, createdAt: "2026-11-14T00:00:00Z" },
            { ...otherPublic, createdAt: "2026-11-13T00:00:00Z" },
        ],
        myRooms: [],
        savedRoomIds: [],
        currentUserId: null,
    });
    assert.deepEqual(result.map(({ id }) => id), ["public-other", "public-mine"]);
});

test("edit action is available only for the signed-in creator, including in latest", () => {
    const myRooms: Room[] = [
        { ...myPublic, userId: "authenticated-user" },
        { ...myPrivate, userId: "authenticated-user" },
        { ...otherPublic, userId: "another-user" },
        { id: "missing-owner" },
    ];
    const editable = getEditableRoomIds(myRooms, "authenticated-user");

    assert.deepEqual([...editable].sort(), ["private-mine", "public-mine"]);
    assert.equal(editable.has("public-other"), false);
    assert.equal(editable.has("missing-owner"), false);
    // Public latest listings have no userId; owned room IDs still allow editing.
    assert.equal(select("latest").find((room) => room.id === "public-mine")?.userId, undefined);
    assert.equal(editable.has("public-mine"), true);
    assert.deepEqual([...getEditableRoomIds(myRooms, null)], []);
});

test("minimal owner ID records preserve public details and edit ownership", () => {
    const rooms = selectRoomsForView({
        view: "recommended",
        publicRooms: [{ ...otherPublic, title: "Original" }],
        myRooms: [{ id: "public-other", userId: "authenticated-user" }],
        savedRoomIds: [],
        currentUserId: "authenticated-user",
    });
    assert.equal(rooms[0].title, "Original");
    assert.equal(rooms[0].visibility, "public");
    assert.equal(rooms[0].userId, "authenticated-user");
    assert.equal(getEditableRoomIds([{ id: "public-other", userId: "authenticated-user" }], "authenticated-user").has("public-other"), true);
});

test("sidebar and page titles share identical guest and signed-in navigation", () => {
    const guest = getRoomListNavigationItems(false);
    const signedIn = getRoomListNavigationItems(true);

    assert.deepEqual(guest.map((item) => [item.value, item.label, item.url, item.iconName]), [
        ["recommended", "おすすめ", "/", "wandSparkles"],
        ["latest", "最新", "/latest", "clock"],
    ]);
    assert.deepEqual(signedIn.map((item) => [item.value, item.label, item.url, item.iconName]), [
        ["recommended", "おすすめ", "/", "wandSparkles"],
        ["latest", "最新", "/latest", "clock"],
        ["mine", "自分のルーム", "/mine", "user"],
        ["saved", "保存済み", "/saved", "bookmark"],
    ]);
    assert.equal(getRoomListNavigationItems(false).some((item) => item.value === "mine"), false);
    assert.equal(getRoomListNavigationItems(true).find((item) => item.value === "mine")?.label, "自分のルーム");
});


test("room list return survives the editor and preserves the source feed and filter", () => {
    rememberRoomListSelection({ view: "mine", path: "/mine", roomId: "id", roomLink: "slug", keyword: "apple", scrollTop: 1200 });
    assert.equal(getRoomListReturn("mine"), null);
    noteRoomListPath("/slug/edit");
    assert.equal(getRoomListBackPath("/slug"), "/mine");
    noteRoomListPath("/slug");
    assert.equal(getRoomListReturn("saved"), null);
    noteRoomListPath("/mine");
    const entry = getRoomListReturn("mine");
    assert.equal(entry?.roomId, "id");
    assert.equal(entry?.keyword, "apple");
    assert.equal(entry?.scrollTop, 1200);
    finishRoomListReturn(entry!);
    assert.equal(getRoomListReturn("mine"), null);
});

test("unrelated routes discard a previous room return", () => {
    rememberRoomListSelection({ view: "latest", path: "/latest", roomId: "id", roomLink: "slug", keyword: "", scrollTop: 0 });
    noteRoomListPath("/slug");
    noteRoomListPath("/saved");
    assert.equal(getRoomListReturn("latest"), null);
});

test("room grid renders enough pages for an offscreen selected room", () => {
    const ids = Array.from({ length: 80 }, (_, i) => String(i));
    assert.equal(roomListRenderCount(ids, "0", 24), 24);
    assert.equal(roomListRenderCount(ids, "23", 24), 24);
    assert.equal(roomListRenderCount(ids, "24", 24), 48);
    assert.equal(roomListRenderCount(ids, "79", 24), 96);
    assert.equal(roomListRenderCount(ids, "missing", 24), 24);
});

test("room return requests immediate vertical centering and nearest horizontal position", () => {
    let options: ScrollIntoViewOptions | undefined;
    centerRoomListCard({ scrollIntoView(value: ScrollIntoViewOptions) { options = value; } } as HTMLElement);
    assert.deepEqual(options, { block: "center", inline: "nearest", behavior: "instant" });
});

import RoomList from "@/app/(game)/(browse)/RoomList";
import type { Room } from "@/type";

const viewer = { id: "fixture", email: null, displayName: null };
const rooms: Room[] = Array.from({ length: 85 }, (_, index) => ({
    id: "room-" + index,
    title: index % 2 ? "Match " + index : "Other " + index,
    visibility: "public",
    userId: viewer.id,
    // The production latest view orders by creation time.
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, -index)).toISOString(),
}));

export default function List() {
    return <RoomList
        publicRooms={rooms}
        myRooms={rooms}
        currentUser={viewer}
        initialView="latest"
        initialSavedRoomIds={[]}
        deferViewer
    />;
}

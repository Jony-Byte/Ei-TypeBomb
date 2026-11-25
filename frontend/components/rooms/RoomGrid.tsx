"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "@/type";
import RoomCard from "@/components/rooms/RoomCard";
import Button from "@/components/ui/Button";
import { roomListRenderCount } from "@/lib/room/list-return";

const PAGE_SIZE = 24;

export default function RoomGrid({
    rooms,
    savedIds,
    editableRoomIds,
    onToggleSaved,
    restoreRoomId,
    onRoomNavigate,
}: {
    rooms: Room[];
    savedIds: string[];
    editableRoomIds: ReadonlySet<string>;
    onToggleSaved?: (roomId: string) => void;
    restoreRoomId?: string;
    onRoomNavigate?: (room: Room) => void;
}) {
    const [loadedCount, setRenderCount] = useState(() =>
        roomListRenderCount(
            rooms.map((room) => room.id),
            restoreRoomId,
            PAGE_SIZE,
        ),
    );
    const renderCount = Math.max(
        loadedCount,
        restoreRoomId
            ? roomListRenderCount(
                  rooms.map((room) => room.id),
                  restoreRoomId,
                  PAGE_SIZE,
              )
            : PAGE_SIZE,
    );
    const sentinelRef = useRef<HTMLDivElement>(null);
    const hasMore = renderCount < rooms.length;

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (
            !sentinel ||
            !hasMore ||
            typeof IntersectionObserver === "undefined"
        )
            return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setRenderCount((count) =>
                        Math.min(
                            Math.max(count, renderCount) + PAGE_SIZE,
                            rooms.length,
                        ),
                    );
                }
            },
            { rootMargin: "400px" },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, rooms.length, renderCount]);

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full gap-4">
                {rooms.slice(0, renderCount).map((room, index) => (
                    <RoomCard
                        key={room.id}
                        room={room}
                        isSaved={savedIds.includes(room.id)}
                        isOwner={editableRoomIds.has(room.id)}
                        eagerPrefetch={index < 2}
                        onRoomNavigate={() => onRoomNavigate?.(room)}
                        onToggleSaved={
                            onToggleSaved
                                ? () => onToggleSaved(room.id)
                                : undefined
                        }
                    />
                ))}
            </div>
            {hasMore && (
                <div ref={sentinelRef} className="flex justify-center py-6">
                    <Button
                        variant="text"
                        onClick={() =>
                            setRenderCount((count) =>
                                Math.min(
                                    Math.max(count, renderCount) + PAGE_SIZE,
                                    rooms.length,
                                ),
                            )
                        }
                    >
                        さらに表示
                    </Button>
                </div>
            )}
        </div>
    );
}

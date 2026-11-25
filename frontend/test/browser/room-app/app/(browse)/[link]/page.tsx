import RoomDetailShell from "@/app/(game)/(browse)/[link]/RoomDetailShell";
import Button from "@/components/ui/Button";

export default async function Detail({ params }: { params: Promise<{ link: string }> }) {
    const { link } = await params;
    const length = link === "room-0" ? 2 : 180;
    return (
        <RoomDetailShell title={link} roomId={link}>
            <div className="col-span-full flex flex-col gap-2" data-detail-words>
                {Array.from({ length }, (_, i) => (
                    <div key={i} className="flex h-8 items-center bg-(--color-background-secondary)">
                        Word {i}
                    </div>
                ))}
            </div>
            <Button href={`/${link}/edit`} prefetch={false} navigation="push" navigationScope="root">
                Edit detail
            </Button>
        </RoomDetailShell>
    );
}

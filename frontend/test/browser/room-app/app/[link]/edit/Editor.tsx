"use client";

import Shell, { ShellBackButton } from "@/components/layout/Shell";
import { useEditorBack } from "@/components/layout/Navigation";

export default function Editor({ link }: { link: string }) {
    const back = useEditorBack();
    return (
        <Shell roomEditor size="large">
            <h1>Edit {link}</h1>
            <ShellBackButton onClick={back ?? undefined}>Return from editor</ShellBackButton>
            <div className="h-[2500px] w-full bg-(--color-background-secondary)" />
        </Shell>
    );
}

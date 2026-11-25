"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import type { Item } from "@/type";
import { getTypingAnswer } from "@/lib/answer-mode";

type Props = {
    item: Item;
    disabled: boolean;
    onAnswer: (correct: boolean, responseMs: number, submitted: string | null) => void;
};
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
export default function StudyQuestion({ item, disabled, onAnswer }: Readonly<Props>) {
    const [input, setInput] = useState("");
    const started = useRef(performance.now());
    const completed = useRef(false);
    const submit = (value: string | null) => {
        if (disabled || completed.current) return;
        completed.current = true;
        const accepted = [item.answer, getTypingAnswer(item)].filter((answer): answer is string => typeof answer === "string");
        const correct = value !== null && normalize(value) !== "" &&
            accepted.some(answer => normalize(answer) === normalize(value));
        onAnswer(correct, Math.round(performance.now() - started.current), value);
    };
    return (
        <form className="flex flex-col items-center gap-4 w-full max-w-sm" onSubmit={event => {
            event.preventDefault();
            if (input.trim()) submit(input);
        }}>
            <div data-question-slide-width className="font-bold font-serif text-xl text-center w-fit border border-(--color-border) px-2 rounded-lg py-1" data-cursor="text">
                {item.prompt}
            </div>
            <input autoFocus aria-label="解答" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                disabled={disabled} value={input} onChange={event => setInput(event.target.value)}
                className="w-full border border-(--color-border) rounded-lg p-3 text-center font-serif text-xl bg-transparent"
            />
            <div className="flex w-full gap-2">
                <Button className="flex-1" disabled={disabled || !input.trim()} onClick={() => submit(input)}>回答</Button>
                <Button className="flex-1" disabled={disabled} onClick={() => submit(null)}>分からない</Button>
            </div>
        </form>
    );
}

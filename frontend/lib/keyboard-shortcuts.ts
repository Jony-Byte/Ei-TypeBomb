/** Match a deliberate key press without hijacking IME or modified shortcuts. */
export function matchesShortcut(
    event: KeyboardEvent,
    key: string,
    shift = false,
): boolean {
    return event.key === key &&
        !event.defaultPrevented &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        !event.repeat &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.shiftKey === shift;
}

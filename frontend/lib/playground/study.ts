import type { ItemMemoryState } from "./memory";
import type { SchedulerState } from "./scheduler";

type Algorithm = "adaptive" | "sequential";
type Kind = "adaptive" | "sequential" | "probe" | "test" | "complete";
type StudySession = {
    id: string; startedAt: number; algorithm: Algorithm; fullTest: boolean;
    itemIds: string[]; answerMode: string; modelVersion: unknown;
};
type StudyEvent = {
    sessionId: string; timestamp: number; elapsedMs: number; itemId: string;
    type: "practice" | "probe" | "test"; correct: boolean; responseMs: number | null;
    exposureCount: number; lastExposureAt: number | null;
    scheduledProbeMs: number | null; details: Record<string, unknown>;
};
type Store = {
    version: 1; itemIds: string[]; memory: Record<string, ItemMemoryState>;
    scheduler: SchedulerState | null; sequence: string[]; sessions: StudySession[]; events: StudyEvent[];
};
export type StudyRuntime = {
    roomId: string; algorithm: Algorithm; fullTest: boolean; session: StudySession; store: Store;
    nextProbeMs: number; scheduledProbeMs: number | null; probePool: string[];
    testQueue: string[]; currentKind: Kind; persistenceFailed: boolean;
};
const key = (room: string, algorithm: Algorithm) => `etb:study:v1:${room}:${algorithm}`;
export const shuffleStudy = <T>(values: readonly T[], random = Math.random): T[] => {
    const shuffled = [...values];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};
export function readStudy(roomId: string, algorithm: Algorithm): Store | null {
    const raw = localStorage.getItem(key(roomId, algorithm));
    if (!raw) return null;
    const data = JSON.parse(raw) as Store;
    if (data.version !== 1 || !Array.isArray(data.events) || !Array.isArray(data.sessions) ||
        !Array.isArray(data.itemIds) || !Array.isArray(data.sequence) || !data.memory)
        throw new Error("実験データの形式が不正です。");
    return data;
}
export function persistStudy(study: StudyRuntime) {
    try {
        localStorage.setItem(key(study.roomId, study.algorithm), JSON.stringify(study.store));
    } catch {
        study.persistenceFailed = true;
    }
}
export function beginStudy(roomId: string, algorithm: Algorithm, fullTest: boolean,
    itemIds: string[], answerMode: string, modelVersion: unknown): StudyRuntime {
    const store = readStudy(roomId, algorithm) ?? {
        version: 1, itemIds: [...itemIds], memory: {}, scheduler: null, sequence: [], sessions: [], events: [],
    };
    if (store.itemIds.length !== itemIds.length || itemIds.some(id => !store.itemIds.includes(id)))
        throw new Error("実験開始後にルームの単語を変更しないでください。");
    const session = { id: crypto.randomUUID(), startedAt: Date.now(), algorithm, fullTest,
        itemIds: [...itemIds], answerMode, modelVersion };
    store.sessions.push(session);
    const study: StudyRuntime = {
        roomId, algorithm, fullTest, session, store, nextProbeMs: 30_000, scheduledProbeMs: null,
        probePool: shuffleStudy(itemIds), testQueue: fullTest ? shuffleStudy(itemIds) : [],
        currentKind: "adaptive", persistenceFailed: false,
    };
    persistStudy(study);
    return study;
}
export function nextStudyQuestion(study: StudyRuntime, ids: string[], now: number):
    { kind: Kind; itemId?: string } {
    study.scheduledProbeMs = null;
    if (study.fullTest) {
        study.currentKind = study.testQueue.length ? "test" : "complete";
        return { kind: study.currentKind, itemId: study.testQueue[0] };
    }
    const elapsed = now - study.session.startedAt;
    if (elapsed >= study.nextProbeMs && ids.length) {
        // Do not burst missed probes after a long answer or a pause.
        const scheduled = study.nextProbeMs + Math.floor((elapsed - study.nextProbeMs) / 60_000) * 60_000;
        study.nextProbeMs = scheduled + 60_000;
        study.scheduledProbeMs = scheduled;
        if (!study.probePool.length) study.probePool = shuffleStudy(ids);
        study.currentKind = "probe";
        return { kind: "probe", itemId: study.probePool.shift() };
    }
    study.currentKind = study.algorithm;
    if (study.algorithm === "adaptive") return { kind: "adaptive" };
    if (!study.store.sequence.length) study.store.sequence = shuffleStudy(ids);
    persistStudy(study);
    return { kind: "sequential", itemId: study.store.sequence[0] };
}
export function recordStudyAnswer(study: StudyRuntime, itemId: string, correct: boolean,
    responseMs: number | null | undefined, details: Record<string, unknown>) {
    const timestamp = Date.now();
    const history = study.store.events.filter(event => event.itemId === itemId);
    const type = study.currentKind === "probe" ? "probe" : study.currentKind === "test" ? "test" : "practice";
    study.store.events.push({
        sessionId: study.session.id, timestamp, elapsedMs: timestamp - study.session.startedAt,
        itemId, type, correct, responseMs: responseMs ?? null,
        exposureCount: history.length, lastExposureAt: history.at(-1)?.timestamp ?? null,
        scheduledProbeMs: study.scheduledProbeMs, details,
    });
    if (study.currentKind === "sequential" && study.store.sequence[0] === itemId) study.store.sequence.shift();
    if (study.currentKind === "test" && study.testQueue[0] === itemId) study.testQueue.shift();
    persistStudy(study);
}

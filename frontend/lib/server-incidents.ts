import { AsyncLocalStorage } from "node:async_hooks";
import { after } from "next/server";
import { sendIncident, type Incident } from "../../backend/shared/incident-reporting";

const scope = new AsyncLocalStorage<Incident[]>();

const send = (incident: Incident) => sendIncident({
    token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || process.env.NEXT_PUBLIC_POSTHOG_KEY,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    commit: process.env.VERCEL_GIT_COMMIT_SHA,
    deployment: process.env.VERCEL_DEPLOYMENT_ID,
    region: process.env.VERCEL_REGION,
}, incident);

// Pages API handlers cannot rely on App Router after(). Hold their response
// until the bounded send settles; all captures run concurrently, outside DB locks.
export async function withIncidentScope<T>(run: () => Promise<T>): Promise<T> {
    const pending: Incident[] = [];
    return scope.run(pending, async () => {
        try { return await run(); }
        finally { await Promise.allSettled(pending.map(send)); }
    });
}

export function reportServerIncident(incident: Incident): void {
    const pending = scope.getStore();
    if (pending) {
        pending.push(incident);
        return;
    }
    try {
        after(async () => { await send(incident); });
    } catch {
        // Non-request contexts (e.g. startup) have no after() lifecycle.
        void send(incident);
    }
}

export async function sendServerIncident(incident: Incident): Promise<void> {
    await send(incident);
}

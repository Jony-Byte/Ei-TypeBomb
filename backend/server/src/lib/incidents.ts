import { incidentCode, incidentSource, sendIncident } from "../../../shared/incident-reporting";

export function reportNodeIncident(stage: string, error?: unknown, handled = true): Promise<boolean> {
    return sendIncident({
        token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || process.env.NEXT_PUBLIC_POSTHOG_KEY,
        host: process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST,
        environment: process.env.NODE_ENV || "production",
        commit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA,
    }, { service: "node-server", stage, code: incidentCode(error), source: incidentSource(new Error().stack), handled });
}

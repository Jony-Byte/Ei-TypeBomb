import { incidentCode, sendIncident } from "../../../shared/incident-reporting";
import type { Env } from "../types";

export function reportWorkerIncident(env: Env, stage: string, error: unknown): Promise<boolean> {
    return sendIncident({
        token: env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || env.NEXT_PUBLIC_POSTHOG_KEY,
        host: env.POSTHOG_HOST || env.NEXT_PUBLIC_POSTHOG_HOST,
        environment: env.ETB_DEPLOYMENT_ENVIRONMENT || "unknown",
    }, { service: "worker", stage, code: incidentCode(error), source: stage });
}

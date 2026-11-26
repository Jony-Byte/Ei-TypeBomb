// Deliberately independent of Node/Next and the browser SDK. Only fixed
// operational labels and vetted release metadata cross the telemetry boundary.
export type IncidentService = "web" | "mcp-oauth" | "mcp-auth" | "node-server" | "worker";
export type Incident = {
    service: IncidentService;
    stage: string;
    code: string;
    source?: string;
    handled?: boolean;
    status?: number;
};
export type IncidentConfig = {
    token?: string;
    host?: string;
    environment?: string;
    commit?: string;
    deployment?: string;
    region?: string;
};

const safeCodes = new Set([
    "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "28P01", "28000",
    "42501", "42P01", "3F000", "53300", "57P01", "ENOTFOUND",
    "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "MCP_DATABASE_TLS_REQUIRED",
    "MCP_STORAGE_DECRYPTION_FAILED", "ERR_JWT_EXPIRED",
]);
const safeNames = new Set(["TypeError", "RangeError", "ReferenceError", "SyntaxError", "AbortError", "TimeoutError"]);

export function incidentCode(error: unknown): string {
    try {
        if (error && typeof error === "object") {
            if ("code" in error && typeof error.code === "string" && safeCodes.has(error.code))
                return error.code;
            if ("name" in error && typeof error.name === "string" && safeNames.has(error.name))
                return error.name;
        }
    } catch { /* unknown thrown values are not telemetry */ }
    return "operation_failed";
}

// Extract only a file/line from a locally generated stack, never the original
// exception's message or stack (which may contain URLs, input or credentials).
export function incidentSource(stack: string | undefined): string {
    for (const frame of (stack ?? "").split("\n").slice(1)) {
        const match = frame.match(/(?:^|[\\/])([a-zA-Z0-9_.-]+\.(?:[cm]?[jt]sx?)):(\d{1,7}):(\d{1,7})\)?$/);
        if (!match || /^(?:server-console|console|incident-reporting|server-incidents|instrumentation)\./.test(match[1])) continue;
        return match[1] + ":" + match[2];
    }
    return "unknown";
}
const label = (value: string | undefined, fallback: string) =>
    value && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : fallback;

export function buildIncidentEvent(config: IncidentConfig, incident: Incident) {
    const stage = label(incident.stage, "unknown");
    const code = label(incident.code, "operation_failed");
    const source = label(incident.source, "unknown");
    const environment = ["production", "preview", "development", "test"].includes(config.environment ?? "")
        ? config.environment : "unknown";
    const title = `ETB ${incident.service}: ${stage} (${code})`;
    return {
        api_key: config.token,
        event: "$exception",
        distinct_id: `etb-service:${incident.service}:${environment}`,
        properties: {
            $process_person_profile: false,
            $geoip_disable: true,
            $lib: "etb-incident-reporting",
            $exception_list: [{
                type: code,
                value: title,
                mechanism: { type: "generic", handled: incident.handled !== false, synthetic: true },
            }],
            $exception_fingerprint: `etb:${incident.service}:${stage}:${code}:${source}`,
            $exception_level: "error",
            $issue_name: title,
            service: incident.service,
            stage,
            error_code: code,
            source,
            environment,
            ...(config.commit && /^[a-f0-9]{40}$/i.test(config.commit) ? { git_commit: config.commit } : {}),
            ...(config.deployment && /^dpl_[a-zA-Z0-9]+$/.test(config.deployment) ? { deployment_id: config.deployment } : {}),
            ...(config.region && /^[a-z]{2,5}\d{1,2}$/.test(config.region) ? { region: config.region } : {}),
            ...(Number.isInteger(incident.status) && incident.status! >= 500 && incident.status! <= 599
                ? { http_status: incident.status } : {}),
        },
    };
}

// A telemetry outage must not cause a product outage. Bound the entire
// request and never log the response body or transport exception.
export async function sendIncident(config: IncidentConfig, incident: Incident, transport: typeof fetch = fetch): Promise<boolean> {
    if (!config.token || config.environment === "test") return false;
    try {
        const url = new URL("/i/v0/e/", config.host || "https://us.i.posthog.com");
        if (url.protocol !== "https:" || url.username || url.password) return false;
        const response = await transport(url.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildIncidentEvent(config, incident)),
            signal: AbortSignal.timeout(2_000),
        });
        if (!response.ok) console.warn("[POSTHOG] incident delivery rejected", response.status);
        return response.ok;
    } catch {
        console.warn("[POSTHOG] incident delivery failed");
        return false;
    }
}

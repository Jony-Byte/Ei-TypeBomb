import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIncidentEvent, incidentCode, incidentSource, sendIncident } from "../../backend/shared/incident-reporting";

const incident = { service: "mcp-oauth" as const, stage: "interaction", code: "MCP_STORAGE_DECRYPTION_FAILED" };

test("captures a personless exception with a stable fingerprint and no raw secrets", () => {
    const a = buildIncidentEvent({ token: "test-token", environment: "production", commit: "a".repeat(40) }, incident);
    const b = buildIncidentEvent({ environment: "preview", commit: "b".repeat(40) }, incident);
    assert.equal(a.event, "$exception");
    assert.equal(a.properties.$process_person_profile, false);
    assert.equal(a.properties.$exception_fingerprint, b.properties.$exception_fingerprint);
    assert.equal(a.properties.git_commit, "a".repeat(40));
    assert.equal(incidentCode(Object.assign(new Error("postgres://secret"), { code: "PRIVATE_SECRET" })), "operation_failed");
    assert.equal(incidentCode(Object.assign(new Error("secret"), { code: "MCP_STORAGE_DECRYPTION_FAILED" })), incident.code);
    assert.equal(incidentSource("Error: secret\n    at fn (/home/private/project/route.ts:12:3)"), "route.ts:12");
    assert.ok(!JSON.stringify(a.properties).includes("test-token"));
});

test("sends to capture endpoint, skips missing configuration and tolerates failure", async () => {
    let calls = 0;
    const transport: typeof fetch = async (url, init) => {
        calls++;
        assert.equal(url, "https://us.i.posthog.com/i/v0/e/");
        assert.equal(JSON.parse(String(init?.body)).event, "$exception");
        assert.ok(init?.signal);
        return new Response(null, { status: 200 });
    };
    assert.equal(await sendIncident({}, incident, transport), false);
    assert.equal(await sendIncident({ token: "test", environment: "test" }, incident, transport), false);
    assert.equal(await sendIncident({ token: "test" }, incident, transport), true);
    assert.equal(calls, 1);
    assert.equal(await sendIncident({ token: "test" }, incident, async () => { throw new Error("secret"); }), false);
    assert.equal(await sendIncident({ token: "test" }, incident, async () => new Response(null, { status: 503 })), false);
});

test("Node incident wrappers do not collapse independent call sites into a single issue", () => {
    const stack = (file: string, line: number) => [
        "Error",
        "    at reportNodeIncident (/app/backend/server/src/lib/incidents.ts:9:76)",
        "    at logError (/app/backend/server/src/lib/console.ts:302:9)",
        `    at operation (/app/backend/server/src/${file}:${line}:5)`,
    ].join("\n");
    const first = incidentSource(stack("index.ts", 1102));
    const second = incidentSource(stack("get.ts", 42));
    assert.equal(first, "index.ts:1102");
    assert.equal(second, "get.ts:42");
    assert.equal(incidentSource(stack("index.ts", 1102)), first);
    const fingerprint = (source: string) => buildIncidentEvent({}, {
        service: "node-server", stage: "operation", code: "operation_failed", source,
    }).properties.$exception_fingerprint;
    assert.notEqual(fingerprint(first), fingerprint(second));
    assert.equal(incidentSource("Error\n    at reportNodeIncident (C:\\app\\dist\\incidents.js:9:1)\n    at start (C:\\app\\dist\\index.js:12:1)"), "index.js:12");
});

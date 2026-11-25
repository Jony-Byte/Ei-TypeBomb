import { fileURLToPath } from "node:url";

export default {
    devIndicators: false,
    allowedDevOrigins: ["127.0.0.1"],
    agentRules: false,
    turbopack: { root: fileURLToPath(new URL("../../..", import.meta.url)) },
    experimental: { staleTimes: { dynamic: 30, static: 30 } },
};

import type { Instrumentation } from "next";

// Do not attach raw request headers, URL, body or exception messages.
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { sendServerIncident } = await import("./lib/server-incidents");
    const { incidentCode } = await import("../backend/shared/incident-reporting");
    const stage = context.routeType === "render" ? "render"
        : context.routeType === "action" ? "server_action"
        : context.routeType === "route" ? "route_handler" : "request";
    await sendServerIncident({ service: "web", stage, code: incidentCode(error), handled: false });
};

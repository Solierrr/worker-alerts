import { DurableObject } from "cloudflare:workers";
import { createJiraClient } from "../channels/jira/client";
import { loadConfig } from "../config";
import type { Incident } from "../ingest/model";
import { serialQueue } from "./serial";
import { createIncidentService, type IncidentResult } from "./service";

// One instance per incident key. Jira is the source of truth; this object only serializes the
// webhooks of the same incident, so two near simultaneous firings cannot both create a ticket.
export class IncidentCoordinator extends DurableObject<Env> {
  private readonly serialized = serialQueue();

  handle(incident: Incident): Promise<IncidentResult> {
    return this.serialized(() => this.process(incident));
  }

  private process(incident: Incident) {
    const config = loadConfig(this.env);
    if (!config.jira) throw new Error("Jira is not configured");
    return createIncidentService(createJiraClient(config.jira), config).handle(
      incident,
    );
  }
}

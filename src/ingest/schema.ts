import { z } from "zod";

export const priorities = ["P1", "P2", "P3", "P4", "P5"] as const;
export type Priority = (typeof priorities)[number];

const identifier = z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/);
const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);

const alertLabelsSchema = z.looseObject({
  alert_id: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/),
  priority: z.enum(priorities),
  service_name: identifier,
  deployment_environment: identifier,
  category: slug.optional(),
  escalation_group: slug.optional(),
  alertname: z.string().max(200).optional(),
  test: z.enum(["true", "false"]).optional(),
  silence_on_pause: z.enum(["true", "false"]).optional(),
});

const alertSchema = z.looseObject({
  status: z.enum(["firing", "resolved"]),
  labels: alertLabelsSchema,
  annotations: z.record(z.string(), z.string().max(4000)).optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).optional(),
  fingerprint: z.string().max(100).optional(),
});

export const grafanaWebhookSchema = z.looseObject({
  alerts: z.array(alertSchema).min(1).max(50),
});

export type GrafanaWebhook = z.infer<typeof grafanaWebhookSchema>;
export type GrafanaAlert = GrafanaWebhook["alerts"][number];

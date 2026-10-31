import { z } from "zod";
import snapshot from "./routing.json";

const projectKey = z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/);
const routingSchema = z
  .object({
    default: projectKey,
    projects: z.record(projectKey, z.object({ issueType: z.string().min(1) })),
    services: z.record(z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/), projectKey),
  })
  .superRefine((value, context) => {
    const known = new Set(Object.keys(value.projects));
    for (const project of [value.default, ...Object.values(value.services)])
      if (!known.has(project))
        context.addIssue({
          code: "custom",
          message: `Projeto ${project} sem tipo de issue em "projects"`,
        });
  });

export type Routing = z.infer<typeof routingSchema>;

export interface JiraTarget {
  project: string;
  issueType: string;
}

// A tabela é um snapshot versionado, gerado a partir do alerts.json de cada serviço; o Worker não
// consulta repositórios em execução.
export function parseRouting(value: unknown = snapshot): Routing {
  return routingSchema.parse(value);
}

// Serviço sem entrada cai no projeto padrão, para o alerta não se perder.
export function resolveTarget(routing: Routing, service: string): JiraTarget {
  const project = routing.services[service] ?? routing.default;
  return { project, issueType: routing.projects[project]!.issueType };
}

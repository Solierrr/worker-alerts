// Junta o alerts.json de cada serviço com a tabela das peças sem repositório (routing.shared.json)
// e produz o snapshot que o worker carrega (src/routing/routing.json).
export function mergeRouting(base, shared, byRepo) {
  const services = { ...shared.services };
  const hosts = { ...shared.hosts };
  const names = { ...shared.names };
  for (const [repo, file] of Object.entries(byRepo)) {
    if (
      !file ||
      typeof file.service !== "string" ||
      !Array.isArray(file.aliases) ||
      file.aliases.length === 0
    ) {
      throw new Error(`${repo}: alerts.json precisa de "service" e "aliases"`);
    }
    if (!Object.hasOwn(base.projects, file.project)) {
      throw new Error(
        `${repo}: projeto "${file.project}" não existe na tabela de projetos`,
      );
    }
    for (const alias of file.aliases) {
      if (Object.hasOwn(services, alias))
        throw new Error(`${repo}: o apelido "${alias}" já está em uso`);
      services[alias] = file.project;
      if (file.host) hosts[alias] = file.host;
      if (alias !== file.service) names[alias] = file.service;
    }
  }
  return {
    default: base.default,
    projects: base.projects,
    services,
    hosts,
    names,
  };
}

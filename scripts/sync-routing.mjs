// Atualiza src/routing/routing.json a partir do alerts.json da raiz de cada repositório de serviço.
//   node scripts/sync-routing.mjs          grava o snapshot
//   node scripts/sync-routing.mjs --check  falha se o snapshot estiver desatualizado
// Os arquivos vêm da branch main de cada repositório, pela CLI do GitHub (gh).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mergeRouting } from "./routing-merge.mjs";

const org = "Solierrr";
const routingPath = new URL("../src/routing/routing.json", import.meta.url);
const sharedPath = new URL(
  "../src/routing/routing.shared.json",
  import.meta.url,
);
const repos = JSON.parse(
  readFileSync(new URL("./routing-repos.json", import.meta.url), "utf8"),
);

const current = JSON.parse(readFileSync(routingPath, "utf8"));
const shared = JSON.parse(readFileSync(sharedPath, "utf8"));

const byRepo = {};
for (const repo of repos) {
  const raw = execFileSync(
    "gh",
    [
      "api",
      "-H",
      "Accept: application/vnd.github.raw",
      `repos/${org}/${repo}/contents/alerts.json?ref=main`,
    ],
    { encoding: "utf8" },
  );
  byRepo[repo] = JSON.parse(raw);
}

const next = `${JSON.stringify(mergeRouting(current, shared, byRepo), null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (next !== readFileSync(routingPath, "utf8")) {
    console.error(
      "routing.json está desatualizado: rode `npm run routing:sync`.",
    );
    process.exit(1);
  }
  console.log("routing.json está em dia.");
} else {
  writeFileSync(routingPath, next);
  console.log("routing.json atualizado.");
}

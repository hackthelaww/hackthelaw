import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });
import { ensureConstraints } from "@/lib/graph/schema";
import {
  writeEpisode,
  writeProvision,
  writePlaybookRule,
  writeMatter,
  writeParty,
  writeClause,
} from "@/lib/graph/ingestWriters";
import { fetchGdprArticles } from "@/lib/ingest/cellar";
import { parseClauses } from "@/lib/ingest/clauseParser";
import { closeNeo4j } from "@/lib/neo4j";

const ROOT = resolve(__dirname, "..");

interface MatterManifestEntry {
  id: string;
  name: string;
  client: string | null;
  type: string;
  status: string;
  sourceFile: string;
  sourceUrl?: string;
  required: boolean;
  parties: { name: string; role: string }[];
}

async function ingestGdpr() {
  console.log("\n[GDPR] Fetching live text from EUR-Lex...");
  const articles = await fetchGdprArticles();
  const episodeId = await writeEpisode({
    kind: "DOCUMENT_INGESTED",
    label: "GDPR (Regulation (EU) 2016/679) ingested from EUR-Lex",
    payloadRef: "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679",
  });
  for (const article of articles) {
    await writeProvision(article, episodeId);
  }
  console.log(`[GDPR] Wrote ${articles.length} Provision nodes (Episode ${episodeId}).`);
}

async function ingestPlaybook() {
  console.log("\n[Playbook] Reading data/playbook.json...");
  const raw = readFileSync(resolve(ROOT, "data/playbook.json"), "utf-8");
  const { rules } = JSON.parse(raw) as { rules: { code: string; title: string; requirement: string }[] };
  const episodeId = await writeEpisode({
    kind: "DOCUMENT_INGESTED",
    label: "Firm playbook ingested",
    payloadRef: "data/playbook.json",
  });
  for (const rule of rules) {
    await writePlaybookRule(rule, episodeId);
  }
  console.log(`[Playbook] Wrote ${rules.length} PlaybookRule nodes (Episode ${episodeId}).`);
}

async function ingestMatters() {
  console.log("\n[Matters] Reading data/matters.json...");
  const raw = readFileSync(resolve(ROOT, "data/matters.json"), "utf-8");
  const { matters } = JSON.parse(raw) as { matters: MatterManifestEntry[] };

  for (const matter of matters) {
    const sourcePath = resolve(ROOT, matter.sourceFile);
    if (!existsSync(sourcePath)) {
      const level = matter.required ? "REQUIRED FILE MISSING" : "optional file missing, skipping";
      console.warn(`[Matters] ${level}: ${matter.sourceFile} for matter "${matter.name}". Skipping this matter — no fabricated clauses will be written.`);
      continue;
    }

    const text = readFileSync(sourcePath, "utf-8");
    const clauses = parseClauses(text);
    if (clauses.length === 0) {
      console.warn(`[Matters] ${matter.sourceFile} parsed to 0 clauses, skipping matter "${matter.name}".`);
      continue;
    }

    await writeMatter({
      id: matter.id,
      name: matter.name,
      client: matter.client,
      type: matter.type,
      status: matter.status,
    });
    for (const party of matter.parties) {
      await writeParty(matter.id, party);
    }

    const episodeId = await writeEpisode({
      kind: "DOCUMENT_INGESTED",
      label: `Matter document ingested: ${matter.name}`,
      payloadRef: matter.sourceUrl ?? matter.sourceFile,
    });
    for (const clause of clauses) {
      await writeClause(matter.id, clause, episodeId);
    }

    const titleLine = text.match(/^#\s+(.*)$/m)?.[1];
    console.log(
      `[Matters] "${matter.name}" — wrote ${clauses.length} Clause nodes, ${matter.parties.length} Party nodes (Episode ${episodeId}).` +
        (titleLine ? ` Document title found: "${titleLine}" — consider updating data/matters.json.` : "")
    );
  }
}

async function main() {
  console.log("Quinn ingest — writing real data into the case-memory graph.\n");
  await ensureConstraints();
  await ingestGdpr();
  await ingestPlaybook();
  await ingestMatters();
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("\nIngest failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4j();
  });

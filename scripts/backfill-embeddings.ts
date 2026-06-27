import { resolve } from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "..", ".env.development") });

import { runRead, runWrite, closeNeo4j } from "@/lib/neo4j";
import { embed } from "@/lib/embeddings";

interface Target {
  label: string;
  /** Cypher fragment building the text to embed, referencing the matched node as `n`. */
  textExpr: string;
}

const TARGETS: Target[] = [
  { label: "Provision", textExpr: "coalesce(n.title, '') + '\\n\\n' + coalesce(n.text, '')" },
  { label: "PlaybookRule", textExpr: "coalesce(n.title, '') + '\\n\\n' + coalesce(n.requirement, '')" },
  { label: "Clause", textExpr: "coalesce(n.heading, '') + '\\n\\n' + coalesce(n.text, '')" },
  // Generic entities the Python extraction backend writes for live document uploads —
  // same fallback text-field order as backend/app/embeddings.py's embed_source.
  { label: "Entity", textExpr: "coalesce(n.name, '') + '\\n\\n' + coalesce(n.description, n.verbatim_text, '')" },
];

const BATCH_SIZE = 20;

async function backfillLabel({ label, textExpr }: Target) {
  const records = await runRead(
    `MATCH (n:${label}) WHERE n.embedding IS NULL RETURN n.id AS id, ${textExpr} AS text`
  );
  if (records.length === 0) {
    console.log(`[${label}] Nothing to backfill — all nodes already have an embedding.`);
    return;
  }

  const usable = records.filter((r) => (r.get("text") as string).trim().length > 0);
  const skipped = records.length - usable.length;
  if (skipped > 0) {
    console.warn(`[${label}] Skipping ${skipped} node(s) with no text content to embed.`);
  }
  if (usable.length === 0) return;

  console.log(`[${label}] Backfilling ${usable.length} node(s)...`);

  for (let i = 0; i < usable.length; i += BATCH_SIZE) {
    const batch = usable.slice(i, i + BATCH_SIZE);
    const ids = batch.map((r) => r.get("id") as string);
    const texts = batch.map((r) => r.get("text") as string);
    const vectors = await embed(texts);

    for (let j = 0; j < ids.length; j++) {
      await runWrite(`MATCH (n:${label} {id: $id}) SET n.embedding = $embedding`, {
        id: ids[j],
        embedding: vectors[j],
      });
    }
    console.log(`[${label}] ${Math.min(i + BATCH_SIZE, usable.length)}/${usable.length} done.`);
  }
}

async function main() {
  console.log("Backfilling real semantic embeddings onto existing graph data.\n");
  for (const target of TARGETS) {
    await backfillLabel(target);
  }
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error("\nBackfill failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4j();
  });

import { resolve } from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "..", ".env.development") });

import { runWrite, closeNeo4j } from "@/lib/neo4j";
import { runIngest } from "@/lib/ingest/run";

/** Wipes the entire graph and re-runs ingestion from scratch, so the demo can be replayed cleanly. */
async function main() {
  console.log("Wiping the graph...");
  await runWrite(`MATCH (n) DETACH DELETE n`);
  console.log("Graph wiped.\n");
  await runIngest();
}

main()
  .catch((err) => {
    console.error("\nReset failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4j();
  });

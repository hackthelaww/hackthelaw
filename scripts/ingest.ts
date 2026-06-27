import { resolve } from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

import { runIngest } from "@/lib/ingest/run";
import { closeNeo4j } from "@/lib/neo4j";

runIngest()
  .catch((err) => {
    console.error("\nIngest failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeNeo4j();
  });

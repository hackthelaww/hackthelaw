import { runWrite } from "@/lib/neo4j";

/** Idempotent — safe to run on every ingest. */
export async function ensureConstraints(): Promise<void> {
  const constraints = [
    "CREATE CONSTRAINT episode_id IF NOT EXISTS FOR (n:Episode) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT matter_id IF NOT EXISTS FOR (n:Matter) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT party_id IF NOT EXISTS FOR (n:Party) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT clause_id IF NOT EXISTS FOR (n:Clause) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT provision_id IF NOT EXISTS FOR (n:Provision) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT playbook_id IF NOT EXISTS FOR (n:PlaybookRule) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT finding_id IF NOT EXISTS FOR (n:Finding) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT review_id IF NOT EXISTS FOR (n:Review) REQUIRE n.id IS UNIQUE",
    "CREATE CONSTRAINT signoff_id IF NOT EXISTS FOR (n:SignOff) REQUIRE n.id IS UNIQUE",
  ];
  for (const cypher of constraints) {
    await runWrite(cypher);
  }
}

import neo4j, { type Driver, type Record as Neo4jRecord } from "neo4j-driver";

let driver: Driver | null = null;

function getDriver(): Driver {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !username || !password) {
    throw new Error(
      "Missing Neo4j credentials. Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD in .env.local"
    );
  }

  driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  return driver;
}

export type CypherParams = Record<string, unknown>;

/** Run a read query in an auto-commit read transaction. */
export async function runRead(
  cypher: string,
  params: CypherParams = {}
): Promise<Neo4jRecord[]> {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.executeRead((tx) => tx.run(cypher, params));
    return result.records;
  } finally {
    await session.close();
  }
}

/** Run a write query in an auto-commit write transaction. */
export async function runWrite(
  cypher: string,
  params: CypherParams = {}
): Promise<Neo4jRecord[]> {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.executeWrite((tx) => tx.run(cypher, params));
    return result.records;
  } finally {
    await session.close();
  }
}

/** Verifies connectivity; throws the real driver error on failure. */
export async function pingNeo4j(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getDriver().verifyConnectivity();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export { neo4j };

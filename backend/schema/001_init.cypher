// ============================================================
// HackTheLaw — Neo4j schema (run once, idempotent)
// ============================================================

// --- Uniqueness constraints ---
CREATE CONSTRAINT matter_id IF NOT EXISTS
  FOR (n:Matter) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT party_id IF NOT EXISTS
  FOR (n:Party) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT document_id IF NOT EXISTS
  FOR (n:Document) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT version_id IF NOT EXISTS
  FOR (n:Version) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT chunk_id IF NOT EXISTS
  FOR (n:Chunk) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT deadline_id IF NOT EXISTS
  FOR (n:Deadline) REQUIRE n.id IS UNIQUE;

// --- Lookup indexes (speed up common filters) ---
CREATE INDEX matter_name IF NOT EXISTS
  FOR (n:Matter) ON (n.name);

CREATE INDEX document_matter IF NOT EXISTS
  FOR (n:Document) ON (n.matter_id);

CREATE INDEX version_document IF NOT EXISTS
  FOR (n:Version) ON (n.document_id);

CREATE INDEX version_hash IF NOT EXISTS
  FOR (n:Version) ON (n.content_hash);

CREATE INDEX deadline_due IF NOT EXISTS
  FOR (n:Deadline) ON (n.due_at);

// --- Full-text index (for keyword search across documents) ---
CREATE FULLTEXT INDEX version_fulltext IF NOT EXISTS
  FOR (n:Version) ON EACH [n.content];

// --- Vector index (for semantic search over chunks) ---
CREATE VECTOR INDEX chunk_embedding IF NOT EXISTS
  FOR (n:Chunk) ON (n.embedding)
  OPTIONS {indexConfig: {
    `vector.dimensions`: 1024,
    `vector.similarity_function`: 'cosine'
  }};

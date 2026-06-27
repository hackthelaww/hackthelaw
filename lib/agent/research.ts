import { researchWithTools } from "@/lib/perplexity";
import { writeEpisode, mentions } from "@/lib/graph/ingestWriters";

export interface ResearchResult {
  episodeId: string;
  text: string;
}

/**
 * On-demand research sub-agent (web_search + fetch_url enabled). Deliberately
 * off the critical clause-analysis path — slower, and not every clause needs
 * it. Writes its own Episode and links it to the clause for provenance, but
 * does not itself change the clause's current Finding.
 */
export async function researchClause(clause: {
  id: string;
  ref: string;
  heading: string;
  text: string;
}): Promise<ResearchResult> {
  const prompt = `Has any guidance, regulatory decision, or enforcement action been published
recently that could affect how this contract clause should be assessed under GDPR?

CLAUSE ${clause.ref} — ${clause.heading}
"""
${clause.text}
"""

Answer in 2-4 sentences. If you find nothing relevant, say so plainly.`;

  const { text } = await researchWithTools(prompt);

  const episodeId = await writeEpisode({
    kind: "AGENT_ACTION",
    label: `Research sub-agent checked for new guidance on clause ${clause.ref}`,
    payloadRef: clause.id,
  });
  await mentions(episodeId, "Clause", clause.id);

  return { episodeId, text };
}

import { z } from "zod";
import { completeJSON, MODELS } from "@/lib/perplexity";
import type { ProvisionRecord, PlaybookRuleRecord } from "@/lib/agent/retrieve";

export const ClauseAnalysisSchema = z.object({
  status: z.enum(["compliant", "partially_compliant", "non_compliant", "unclear"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  citedProvisions: z.array(z.string()),
  deviations: z.array(z.object({ ruleCode: z.string(), explanation: z.string() })),
  riskScore: z.number().min(0).max(1),
  consequenceScore: z.number().min(0).max(1),
});

export type ClauseAnalysisResult = z.infer<typeof ClauseAnalysisSchema>;

const JSON_SCHEMA = {
  name: "clause_analysis",
  schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["compliant", "partially_compliant", "non_compliant", "unclear"] },
      confidence: { type: "number" },
      reasoning: { type: "string" },
      citedProvisions: { type: "array", items: { type: "string" } },
      deviations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ruleCode: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["ruleCode", "explanation"],
          additionalProperties: false,
        },
      },
      riskScore: { type: "number" },
      consequenceScore: { type: "number" },
    },
    required: ["status", "confidence", "reasoning", "citedProvisions", "deviations", "riskScore", "consequenceScore"],
    additionalProperties: false,
  },
};

export interface ClauseInput {
  ref: string;
  heading: string;
  text: string;
}

function buildPrompt(clause: ClauseInput, provisions: ProvisionRecord[], rules: PlaybookRuleRecord[]): string {
  const provisionsBlock = provisions
    .map((p) => `[${p.celex}#${p.article}] ${p.title}\n${p.text}`)
    .join("\n\n");
  const rulesBlock = rules.map((r) => `[${r.code}] ${r.title}: ${r.requirement}`).join("\n");

  return `You are a supervised legal-review assistant. Assess ONE contract clause against the
real GDPR provisions and firm playbook rules given below. Do not use outside knowledge of the
clause's contract — judge only what the clause text says against the sources provided.

CLAUSE ${clause.ref} — ${clause.heading}
"""
${clause.text}
"""

RELEVANT GDPR PROVISIONS (cite using the bracketed id, e.g. "32016R0679#28"):
${provisionsBlock || "(none retrieved as relevant)"}

FIRM PLAYBOOK RULES (cite ruleCode exactly as bracketed, e.g. "DPA-01"):
${rulesBlock}

Decide whether the clause is compliant, partially_compliant, non_compliant, or unclear with
respect to the GDPR provisions and playbook rules above. List every playbook rule the clause
deviates from, with a one-sentence explanation each. Cite only provisions you actually relied on.
riskScore and consequenceScore are 0..1: riskScore = how likely it is this assessment matters if
wrong; consequenceScore = how severe the downstream impact would be if a real deviation is missed.`;
}

export async function analyzeClause(
  clause: ClauseInput,
  provisions: ProvisionRecord[],
  rules: PlaybookRuleRecord[],
  opts: { model?: string } = {}
): Promise<ClauseAnalysisResult> {
  const prompt = buildPrompt(clause, provisions, rules);
  const raw = await completeJSON<unknown>(prompt, JSON_SCHEMA, {
    model: opts.model ?? MODELS.fast,
  });
  const parsed = ClauseAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Model returned JSON that didn't match the clause-analysis schema: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export interface ParsedClause {
  ref: string;
  heading: string;
  text: string;
}

/**
 * Generic clause splitter for team-provided contract files. Real contracts come
 * in different shapes, so this tries, in order:
 *  1. Markdown ATX headings ("## 3. Sub-processing", "### Confidentiality")
 *  2. Plain numbered clauses at the start of a line ("3. Sub-processing: ...",
 *     "3. Sub-processing\n...")
 *  3. Falls back to one clause containing the whole document.
 * Never invents text — every clause's `text` is a verbatim slice of the input.
 */
export function parseClauses(raw: string): ParsedClause[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const markdownClauses = parseMarkdownHeadings(text);
  if (markdownClauses.length > 1) return markdownClauses;

  const numberedClauses = parseNumberedParagraphs(text);
  if (numberedClauses.length > 1) return numberedClauses;

  return [
    {
      ref: "1",
      heading: firstLine(text),
      text,
    },
  ];
}

function firstLine(text: string): string {
  return text.split("\n")[0].slice(0, 120).trim();
}

function parseMarkdownHeadings(text: string): ParsedClause[] {
  const headingRe = /^#{1,3}\s+(.*)$/gm;
  const matches = [...text.matchAll(headingRe)];
  if (matches.length === 0) return [];

  const clauses: ParsedClause[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const headingLine = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const body = text.slice(start, end).trim();
    if (!body) continue;

    const { ref, heading } = splitRefFromHeading(headingLine, String(i + 1));
    clauses.push({ ref, heading, text: body });
  }
  return clauses;
}

function parseNumberedParagraphs(text: string): ParsedClause[] {
  // Matches a line that *starts* a clause: "1.", "1.1", "(1)", "Article 1", "Clause 1:"
  const lineStartRe =
    /^(?:(\d{1,2}(?:\.\d{1,2})?)\.\s+([A-Z][^\n]{0,90})|(\d{1,2}(?:\.\d{1,2})?)\.([A-Z][^\n:]{0,90}):)/gm;
  const matches = [...text.matchAll(lineStartRe)];
  if (matches.length === 0) return [];

  const clauses: ParsedClause[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const ref = match[1] ?? match[3] ?? String(i + 1);
    const heading = (match[2] ?? match[4] ?? "").trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const body = text.slice(start, end).trim();
    if (!body) continue;

    clauses.push({ ref, heading, text: body });
  }
  return clauses;
}

function splitRefFromHeading(headingLine: string, fallbackRef: string): { ref: string; heading: string } {
  const m = headingLine.match(/^(\d{1,2}(?:\.\d{1,2})?)\.?\s+(.*)$/);
  if (m) return { ref: m[1], heading: m[2].trim() };
  return { ref: fallbackRef, heading: headingLine };
}

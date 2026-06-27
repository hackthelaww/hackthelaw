import * as cheerio from "cheerio";

/**
 * Live retrieval of the GDPR's official text. The Cellar/ELI content-negotiated
 * endpoints don't expose clean per-article markup, so we use EUR-Lex's official
 * consolidated HTML rendering of the Official Journal text instead — verified by
 * inspecting the live page on 2026-06-27: each article is wrapped in
 * `<div class="eli-subdivision" id="art_N">` with a `.oj-ti-art` number line,
 * an optional `.eli-title .oj-sti-art` title, and `.oj-normal` body paragraphs.
 * This is the real, published Official Journal text — nothing here is authored.
 */
const GDPR_CELEX = "32016R0679";
const GDPR_SOURCE_URL = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${GDPR_CELEX}`;

export interface FetchedProvision {
  celex: string;
  article: string;
  title: string;
  text: string;
  source: string;
}

export async function fetchGdprArticles(): Promise<FetchedProvision[]> {
  const res = await fetch(GDPR_SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; QuinnIngest/1.0)" },
  });
  if (!res.ok) {
    throw new Error(
      `EUR-Lex fetch failed: ${res.status} ${res.statusText} for ${GDPR_SOURCE_URL}`
    );
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const provisions: FetchedProvision[] = [];

  $('div.eli-subdivision[id^="art_"]').each((_, el) => {
    const $el = $(el);
    const id = $el.attr("id") ?? "";
    // Skip titled subdivisions of subdivisions (e.g. "art_28.tit_1" handled separately below).
    if (!/^art_\d+[a-z]?$/.test(id)) return;

    const articleLabel = $el.find("> p.oj-ti-art").first().text().trim();
    const article = articleLabel.replace(/^Article\s+/i, "").trim();
    if (!article) return;

    const title = $el.find("> div.eli-title p.oj-sti-art").first().text().trim();

    // Body text = all text in this subdivision, excluding the number line and title line.
    const clone = $el.clone();
    clone.find("> p.oj-ti-art").remove();
    clone.find("> div.eli-title").remove();
    const text = clone.text().replace(/\s+/g, " ").trim();

    if (!text) return;

    provisions.push({
      celex: GDPR_CELEX,
      article,
      title,
      text,
      source: `${GDPR_SOURCE_URL}#${id}`,
    });
  });

  if (provisions.length === 0) {
    throw new Error(
      `Parsed 0 GDPR articles from EUR-Lex — the page structure may have changed: ${GDPR_SOURCE_URL}`
    );
  }

  return provisions;
}

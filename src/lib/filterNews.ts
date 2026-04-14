export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  summary?: string;
}

/**
 * Filter news items to only those that mention a company name or founder name
 * from the site's directory. Matching is case-insensitive on title + summary.
 */
export function filterNewsForDirectory(
  items: NewsItem[],
  companyNames: string[],
  founderNames: string[]
): NewsItem[] {
  // Build a flat list of search terms:
  //   - Full company names (e.g. "Operant AI")
  //   - Founder last names (e.g. "Tembey", "Long") — avoids false positives
  //     from common first names while still catching most coverage
  const terms = [
    ...companyNames.map((n) => n.toLowerCase()),
    ...founderNames.map((n) => {
      const parts = n.replace(/^dr\.\s*/i, "").trim().split(/\s+/);
      return parts[parts.length - 1].toLowerCase(); // last name only
    }),
  ].filter((t) => t.length > 3); // skip very short tokens

  return items.filter((item) => {
    const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

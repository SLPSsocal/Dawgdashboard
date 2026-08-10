// Defense-in-depth for note fields. The Gingr import delivered notes as raw
// HTML; the DB has been cleaned once (strip_gingr_html migration), but any
// future import could reintroduce markup — this keeps it from ever reaching
// a printed run card again. Converts to plain text, preserving paragraphs.
export function stripHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  const out = input
    .replace(/\r/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out || null;
}

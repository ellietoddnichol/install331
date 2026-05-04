/** True when the string is safe to use as an <img src> (http(s) or app-relative path). */
export function isDisplayableCatalogImageUrl(url: string | null | undefined): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  const lower = u.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('javascript:') || lower.startsWith('vbscript:')) return false;
  if (u.startsWith('/') || u.startsWith('./')) return true;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

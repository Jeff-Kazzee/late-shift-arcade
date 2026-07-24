export function detailUrlFor(manifest, baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('game', manifest.slug);
  url.searchParams.set('version', manifest.version);
  url.hash = '';
  return url.href;
}

export function resolveCatalogDetail(entries, urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }
  const slug = url.searchParams.get('game');
  const version = url.searchParams.get('version');
  if (!slug || !version) return null;
  return entries.find(
    (entry) =>
      entry.manifest.slug === slug &&
      entry.manifest.version === version,
  ) ?? null;
}

export const PROVIDER_WORKSPACE_CATALOG_MAX_AGE_MS = 5 * 60_000;

/** Large clock differences between remote clients and the server should not freeze a catalog. */
export function isProviderWorkspaceCatalogStale(checkedAt: string, now: number): boolean {
  const age = now - Date.parse(checkedAt);
  return !Number.isFinite(age) || Math.abs(age) >= PROVIDER_WORKSPACE_CATALOG_MAX_AGE_MS;
}

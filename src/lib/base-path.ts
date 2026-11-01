/**
 * GitHub Pages project sites live under /<repo>/. Next prefixes `_next` assets
 * and <Link> automatically when basePath is configured, but plain <img>,
 * <a href> and metadata URLs do not get that treatment. This helper is the
 * single place that joins the public URL with the asset path.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export function asset(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${clean}`;
}

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://cmdlib.dev"
).replace(/\/$/, "");

/**
 * Resolve a manifest-relative asset path against the deployment base (§4.1).
 * With Vite `base: './'`, BASE_URL is './', so URLs stay relative to index.html
 * and work under any GitHub Pages subpath.
 */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path;
}

const images = new Map<string, Promise<HTMLImageElement>>();

/**
 * Load and fully decode an image, with a useful error message. Shared per URL,
 * so warming an image early (see App) and the editor's load are one download.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = images.get(url);
  if (!pending) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    pending = img.decode().then(
      () => img,
      () => {
        images.delete(url); // allow a retry
        throw new Error("The template image couldn't be loaded. Check your connection and try again.");
      },
    );
    images.set(url, pending);
  }
  return pending;
}

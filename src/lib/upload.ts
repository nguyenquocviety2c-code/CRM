/**
 * Shared photo-upload helpers.
 *
 * All "Tải ảnh lên" buttons in the app funnel through `uploadImagesToR2` so
 * the R2 upload logic (multipart POST → /api/upload → public URLs) lives in
 * one place. The file inputs use `accept="image/*"` (no `capture`) so both
 * desktop browsers and mobile browsers offer the full chooser (camera +
 * gallery on mobile; file picker on desktop).
 */

/**
 * Read a File as a base64 data URL. Used as a fallback when the R2 upload
 * fails (e.g. R2 not configured) so photos are still embedded in the invoice.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload one or more image Files to Cloudflare R2 via /api/upload (multipart).
 * Returns the public URLs of the uploaded images, in order.
 *
 * If the R2 upload fails for any file, falls back to embedding the image as a
 * base64 data URL so the photo is never lost.
 */
export async function uploadImagesToR2(
  files: File[] | FileList,
  folder: string
): Promise<string[]> {
  const list = Array.from(files).filter(Boolean);
  if (list.length === 0) return [];

  const formData = new FormData();
  formData.append("folder", folder || "uploads");
  for (const f of list) formData.append("files", f);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    if (json.ok && Array.isArray(json.data?.urls) && json.data.urls.length > 0) {
      return json.data.urls as string[];
    }
  } catch {
    /* fall through to base64 fallback */
  }

  // Fallback: embed as base64 data URLs (keeps photos even if R2 is down).
  const urls: string[] = [];
  for (const f of list) {
    try {
      urls.push(await fileToDataUrl(f));
    } catch {
      /* skip unreadable file */
    }
  }
  return urls;
}

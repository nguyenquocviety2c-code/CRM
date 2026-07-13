import { NextRequest, NextResponse } from "next/server";
import { uploadToR2, parseDataUrl } from "@/lib/r2";

/**
 * POST /api/upload
 * Upload one or more images to Cloudflare R2.
 *
 * Body: { images: [{ data: "data:image/jpeg;base64,...", name: "photo1.jpg" }] }
 * OR multipart form data with file(s).
 *
 * Returns: { ok: true, data: { urls: ["https://pub-...r2.dev/invoices/HD000004/photo-xxx.jpg"] } }
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    const urls: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      // Handle multipart file upload.
      const formData = await request.formData();
      const files = formData.getAll("files");
      const folder = (formData.get("folder") as string) || "uploads";

      for (const file of files) {
        if (!(file instanceof File)) continue;
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split(".").pop() || "jpg";
        const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const url = await uploadToR2(key, buffer, file.type || "image/jpeg");
        urls.push(url);
      }
    } else {
      // Handle JSON with base64 data URLs.
      const body = await request.json();
      const images: Array<{ data: string; name?: string }> = body.images || [];
      const folder = body.folder || "uploads";

      for (const img of images) {
        const { buffer, contentType: ct, ext } = parseDataUrl(img.data);
        const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const url = await uploadToR2(key, buffer, ct);
        urls.push(url);
      }
    }

    if (urls.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No images provided" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, data: { urls } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Cloudflare R2 configuration — uses S3-compatible API.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "manup-crm";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";
const R2_S3_ENDPOINT = process.env.R2_S3_ENDPOINT || "";

// Lazy-init the S3 client (only when first used, so the server doesn't fail
// to start if env vars are missing during build).
let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (r2Client) return r2Client;
  r2Client = new S3Client({
    region: "auto",
    endpoint: R2_S3_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return r2Client;
}

/**
 * Upload a file to Cloudflare R2. Returns the public URL of the uploaded file.
 *
 * @param key - The file path/key in the bucket (e.g. "invoices/HD000004/photo-123.jpg").
 * @param body - The file content (Buffer or Uint8Array).
 * @param contentType - MIME type (e.g. "image/jpeg").
 * @returns The public URL of the uploaded file.
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await client.send(command);

  // Return the public URL (R2_PUBLIC_URL/key).
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Convert a base64 data URL to a Buffer + content type.
 * Used for migrating existing base64 photos to R2.
 */
export function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  const match = dataUrl.match(/^data:(image\/(\w+));base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  const contentType = match[1];
  const ext = match[2] === "jpeg" ? "jpg" : match[2];
  const buffer = Buffer.from(match[3], "base64");
  return { buffer, contentType, ext };
}

export { R2_BUCKET_NAME, R2_PUBLIC_URL };

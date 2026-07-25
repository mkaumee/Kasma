import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";
import { orgIdFromKey } from "@/lib/storage/keys";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  txt: "text/plain",
};

function contentTypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function isInline(contentType: string): boolean {
  return contentType === "application/pdf" || contentType.startsWith("image/");
}

/**
 * Serve a stored file, but only to a member of the organization that owns it
 * (derived from the key prefix). Redirects to a presigned URL when the backend
 * provides one, otherwise streams the bytes.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { key: segments } = await params;
  const key = segments.map((s) => decodeURIComponent(s)).join("/");

  const organizationId = orgIdFromKey(key);
  if (!organizationId) return new Response("Not found", { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId: user.id, organizationId },
    },
  });
  if (!membership) return new Response("Forbidden", { status: 403 });

  const storage = getStorage();

  const signedUrl = await storage.getSignedUrl(key);
  if (signedUrl) return Response.redirect(signedUrl, 302);

  let bytes: Buffer;
  try {
    bytes = await storage.get(key);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const filename = key.split("/").pop() ?? "file";
  const contentType = contentTypeFor(filename);
  const forceDownload =
    new URL(request.url).searchParams.get("download") === "1";
  const disposition =
    forceDownload || !isInline(contentType) ? "attachment" : "inline";

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

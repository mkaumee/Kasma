import crypto from "node:crypto";

/** All of an org's files live under this prefix. */
export function orgKeyPrefix(organizationId: string): string {
  return `orgs/${organizationId}/`;
}

function sanitizeSegment(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, "_") // collapse ".." runs
    .replace(/^[._-]+/, "") // strip leading dot/dash/underscore
    .slice(0, 120);
  return cleaned || "file";
}

/** A tenant-scoped key for a statement's uploaded file. */
export function statementFileKey(
  organizationId: string,
  statementId: string,
  filename: string,
): string {
  return `${orgKeyPrefix(organizationId)}statements/${statementId}/${sanitizeSegment(filename)}`;
}

/** A tenant-scoped key with a random folder (for evidence, ad-hoc uploads). */
export function randomFileKey(
  organizationId: string,
  folder: string,
  filename: string,
): string {
  const id = crypto.randomBytes(12).toString("hex");
  return `${orgKeyPrefix(organizationId)}${folder}/${id}/${sanitizeSegment(filename)}`;
}

/** True if `key` belongs to `organizationId`. */
export function keyBelongsToOrg(key: string, organizationId: string): boolean {
  return key.startsWith(orgKeyPrefix(organizationId));
}

/** Extract the organizationId encoded in a tenant-scoped key, or null. */
export function orgIdFromKey(key: string): string | null {
  const match = /^orgs\/([^/]+)\//.exec(key);
  return match ? match[1]! : null;
}

/** The app URL that serves a stored file through access control. */
export function fileHref(key: string): string {
  return `/api/files/${key}`;
}

import { Download, FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

export type PreviewKind = "pdf" | "image" | "text" | "other";

/** Determine how to preview a statement file from its name. */
export function previewKindFor(filename: string): PreviewKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  if (["csv", "txt", "tsv"].includes(ext)) return "text";
  return "other";
}

/**
 * Preview pane for the original uploaded statement. PDFs render in an iframe,
 * images inline, delimited text as a scrollable table-ish block; anything else
 * (xlsx, unknown) offers a download. All requests hit the access-controlled
 * /api/files route, so the browser's session cookie gates access.
 */
export function FilePreview({
  href,
  kind,
  filename,
  text,
}: {
  href: string;
  kind: PreviewKind;
  filename: string;
  /** Decoded text, for kind === "text". */
  text?: string;
}) {
  if (kind === "pdf") {
    return (
      <iframe
        src={href}
        title={filename}
        className="h-[70vh] w-full rounded-md border bg-white"
      />
    );
  }

  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={href}
        alt={filename}
        className="max-h-[70vh] w-full rounded-md border object-contain"
      />
    );
  }

  if (kind === "text" && text != null) {
    return (
      <pre className="max-h-[70vh] overflow-auto rounded-md border bg-muted/40 p-4 text-xs leading-relaxed">
        {text}
      </pre>
    );
  }

  return (
    <div className="flex h-[40vh] flex-col items-center justify-center gap-3 rounded-md border text-center">
      <FileQuestion className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">
        No inline preview for this file type.
      </p>
      <Button asChild variant="outline" size="sm">
        <a href={href} download={filename}>
          <Download /> Download {filename}
        </a>
      </Button>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  deleteEvidenceAction,
  uploadEvidenceAction,
} from "@/lib/evidence/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const KIND_LABEL: Record<string, string> = {
  RECEIPT: "Receipt",
  INVOICE: "Invoice",
  DOCUMENT: "Document",
  NOTE: "Note",
};

export type EvidenceItem = {
  id: string;
  kind: string;
  filename: string;
  size: number | null;
  href: string;
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function EvidencePanel({
  transactionId,
  items,
  canEdit,
}: {
  transactionId: string;
  items: EvidenceItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    uploadEvidenceAction,
    undefined,
  );
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Evidence attached");
      formRef.current?.reset();
    }
  }, [state]);

  function remove(id: string) {
    if (!window.confirm("Remove this attachment?")) return;
    startDelete(async () => {
      const res = await deleteEvidenceAction(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Attachment removed");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3 px-6 pb-6">
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Paperclip className="size-4" /> No evidence attached yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {item.filename}
                </a>
                <p className="text-xs text-muted-foreground">
                  {formatSize(item.size)}
                </p>
              </div>
              <Badge variant="secondary">
                {KIND_LABEL[item.kind] ?? item.kind}
              </Badge>
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(item.id)}
                  disabled={deleting}
                  aria-label="Remove attachment"
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form
          ref={formRef}
          action={action}
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3"
        >
          <input type="hidden" name="transactionId" value={transactionId} />
          <select name="kind" className={selectClass} aria-label="Evidence kind">
            <option value="RECEIPT">Receipt</option>
            <option value="INVOICE">Invoice</option>
            <option value="DOCUMENT">Document</option>
          </select>
          <Input
            name="file"
            type="file"
            accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"
            required
            className="h-9 flex-1"
          />
          <Button type="submit" size="sm" disabled={pending}>
            <Upload /> {pending ? "Uploading…" : "Attach"}
          </Button>
          {state?.error && (
            <p className="w-full text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

import {
  CircleDot,
  FileEdit,
  FilePlus2,
  Link2,
  MessageSquare,
  Paperclip,
  ShieldCheck,
  Tag,
  type LucideIcon,
} from "lucide-react";
import type { TransactionEventKind } from "@prisma/client";

const EVENT_META: Record<
  TransactionEventKind,
  { icon: LucideIcon; label: string }
> = {
  CREATED: { icon: FilePlus2, label: "Created" },
  EDITED: { icon: FileEdit, label: "Edited" },
  CATEGORIZED: { icon: Tag, label: "Categorized" },
  EVIDENCE_ADDED: { icon: Paperclip, label: "Evidence added" },
  VERIFIED: { icon: ShieldCheck, label: "Verified" },
  MATCHED: { icon: Link2, label: "Matched transfer" },
  NOTE: { icon: MessageSquare, label: "Note" },
};

export type TimelineEvent = {
  id: string;
  kind: TransactionEventKind;
  createdAt: string; // ISO
  actorName: string | null;
  detail: string | null;
};

/** Vertical audit timeline built from a transaction's immutable events. */
export function TransactionTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="px-6 pb-6 text-sm text-muted-foreground">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="space-y-0 px-6 pb-6">
      {events.map((event, i) => {
        const meta = EVENT_META[event.kind] ?? {
          icon: CircleDot,
          label: event.kind,
        };
        const Icon = meta.icon;
        const last = i === events.length - 1;
        return (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-7 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                <Icon className="size-3.5" aria-hidden />
              </span>
              {!last && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className={last ? "pb-0" : "pb-5"}>
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString()}
                {event.actorName ? ` · ${event.actorName}` : ""}
              </p>
              {event.detail && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {event.detail}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

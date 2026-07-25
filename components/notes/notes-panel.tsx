"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { addNoteAction, deleteNoteAction } from "@/lib/notes/actions";
import { Button } from "@/components/ui/button";

const textareaCls =
  "w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export type NoteItem = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string; // ISO
};

export function NotesPanel({
  transactionId,
  notes,
  canEdit,
}: {
  transactionId: string;
  notes: NoteItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await addNoteAction({ transactionId, body });
      if (res.error) toast.error(res.error);
      else {
        setBody("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this note?")) return;
    startTransition(async () => {
      const res = await deleteNoteAction(id);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-6 pb-6">
      {notes.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4" /> No notes yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {note.authorName ?? "Someone"} ·{" "}
                  {new Date(note.createdAt).toLocaleString()}
                </p>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(note.id)}
                    disabled={pending}
                    aria-label="Delete note"
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note or comment…"
            className={textareaCls}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={add}
              disabled={pending || !body.trim()}
            >
              <Send /> Add note
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

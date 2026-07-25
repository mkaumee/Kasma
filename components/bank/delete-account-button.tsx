"use client";

import { Trash2 } from "lucide-react";

import { deleteBankAccountAction } from "@/lib/bank/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteAccountButton({
  id,
  accountName,
}: {
  id: string;
  accountName: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 /> Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {accountName}?</DialogTitle>
          <DialogDescription>
            This permanently removes the account and all of its statements and
            transactions. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <form action={deleteBankAccountAction}>
            <input type="hidden" name="id" value={id} />
            <Button variant="destructive" type="submit">
              Delete account
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

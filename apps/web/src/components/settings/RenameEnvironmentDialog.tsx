import { useId, useState } from "react";

import { environmentCatalog } from "~/connection/catalog";
import type { EnvironmentPresentation } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

export function RenameEnvironmentDialog({
  environment,
  onClose,
}: {
  readonly environment: EnvironmentPresentation;
  readonly onClose: () => void;
}) {
  const rename = useAtomCommand(environmentCatalog.rename, "Rename environment");
  const formId = useId();
  const [name, setName] = useState(environment.label);
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const label = name.trim();

  const save = async (): Promise<void> => {
    if (saving || label.length === 0) return;
    if (label === environment.label) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const result = await rename({ environmentId: environment.environmentId, label });
    setSaving(false);
    if (result._tag === "Success") setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) setOpen(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPopup showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Rename environment</DialogTitle>
          <DialogDescription>
            Change the name shown on this device. The host name and connection stay the same.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="grid gap-2">
              <span className="text-sm font-medium">Environment name</span>
              <Input
                value={name}
                disabled={saving}
                onChange={(event) => setName(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          </form>
        </DialogPanel>
        <DialogFooter>
          <DialogClose disabled={saving} render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="submit" form={formId} disabled={saving || label.length === 0}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

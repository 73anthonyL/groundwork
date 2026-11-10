"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSubcontractAction, type AddSubcontractState } from "@/app/gc/projects/[id]/actions";

/** Three facts and the PDF. Everything else about the deal is read out of the contract itself. */
export function AddSubcontractForm({ projectId, knownSubs }: { projectId: string; knownSubs: string[] }) {
  const [state, action, pending] = useActionState<AddSubcontractState, FormData>(addSubcontractAction, {});
  const [file, setFile] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="group grid gap-1.5">
        <Label htmlFor="file">The signed subcontract</Label>
        <label
          htmlFor="file"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f && input.current) {
              input.current.files = e.dataTransfer.files;
              setFile(f.name);
            }
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 group-has-[input:focus-visible]:outline-2 group-has-[input:focus-visible]:outline-offset-2 group-has-[input:focus-visible]:outline-ring ${over ? "border-link bg-link-soft" : file ? "border-settled/50 bg-settled-soft/50" : "border-input bg-card hover:border-link hover:bg-link-soft/50"}`}
        >
          {file ? <FileText className="h-7 w-7 text-settled" aria-hidden /> : <Upload className="h-7 w-7 text-muted-foreground" aria-hidden />}
          <span className="text-[15px] font-medium">{file ?? "Drop the PDF here, or click to choose it"}</span>
          <span className="text-[13px] text-muted-foreground">{file ? "Click to choose a different file" : "A text PDF up to 4 MB. Scanned images can't be read yet."}</span>
        </label>
        <input ref={input} id="file" name="file" type="file" accept="application/pdf" required className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="subName">Subcontractor</Label>
        <Input id="subName" name="subName" list="known-subs" placeholder="Company name" required autoComplete="off" />
        <datalist id="known-subs">
          {knownSubs.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="trade">Trade</Label>
          <Input id="trade" name="trade" placeholder="Painting, plumbing, roofing" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sum">Contract sum</Label>
          <Input id="sum" name="sum" inputMode="decimal" placeholder="150,000.00" className="num" required />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="contactName">
          Who bills for them <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="contactName" name="contactName" placeholder="Name of their office or billing contact" autoComplete="off" />
        <p className="text-[13px] text-muted-foreground">They get a seat on the demo sign-in page so you can bill and sign as them.</p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/[0.07] px-3.5 py-2.5 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" variant="money" size="lg" disabled={pending}>
          {pending ? "Uploading…" : "Upload and read the contract"}
        </Button>
        <p className="mt-2 text-[13px] text-muted-foreground">Next, Claude reads the payment terms and you approve them. Nothing is paid until you do.</p>
      </div>
    </form>
  );
}

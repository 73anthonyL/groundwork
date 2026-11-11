"use client";

/**
 * The payment rules review: the subcontract PDF on the left, what was read from it on the right.
 *
 *   <CompileReview contractId subName documentUrl ruleSet canCompile autoCompile initialPage upload />
 *
 * The right pane leads with "Needs your decision": only the terms a person has to settle, each with
 * the clause it came from, why it was held back, and Accept / Change. Everything already verified
 * sits in a list below. A bar at the foot counts what is confirmed and carries the one primary
 * button, "Approve payment rules".
 *
 * `SubmitButton` (exported) is a submit button that shows it is working while its form's server
 * action runs.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, FileSearch, OctagonAlert, ShieldCheck } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormActions } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getField, RULE_FIELDS, type ExtractedRuleSet, type RuleFieldPath } from "@/domain/rules/schema";
import { FIELD_GROUPS, RULE_IDS, formatRuleValue } from "@/domain/rules/format";
import { STATE_LAW, statute } from "@/domain/statutes";
import type { StoredRules } from "@/server/rules/review";
import { fieldLabel } from "@/server/rules/review";
import { acknowledgeAnomalyAction, approveRuleSetAction, resolveFieldAction } from "@/app/gc/contracts/[id]/actions";

export type RuleSetView = {
  id: string;
  version: number;
  status: "extracted" | "in_review" | "approved" | "superseded";
  model: string | null;
  extractionMs: number | null;
  approvedHash: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  /** The approval time as text, formatted on the server. */
  approvedAtText?: string | null;
  stored: StoredRules;
};

/** A submit button that keeps its label and adds a spinner while the form it sits in is being sent. */
export function SubmitButton({ name, value, ...props }: ButtonProps & { name?: string; value?: string }) {
  const { pending, data } = useFormStatus();
  // With several submit buttons in one form, only the one that was pressed spins.
  const mine = pending && (name === undefined || data?.get(name) === value);
  return <Button type="submit" name={name} value={value} loading={mine} {...props} />;
}

const isBlocking = (stored: StoredRules, p: RuleFieldPath) => {
  const s = stored.annotations[p].review.state;
  return s === "escalated" || s === "needs_review";
};

export function CompileReview({
  contractId,
  documentUrl,
  subName,
  ruleSet,
  canCompile,
  autoCompile = false,
  initialPage = 1,
  upload,
}: {
  contractId: string;
  documentUrl: string | null;
  subName: string;
  ruleSet: RuleSetView | null;
  canCompile: boolean;
  /** Start reading straight away: set when the contract was uploaded a moment ago. */
  autoCompile?: boolean;
  /** The PDF page to open on. */
  initialPage?: number;
  /** Shown in place of the PDF when none has been uploaded: the upload form. */
  upload?: React.ReactNode;
}) {
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [compiling, setCompiling] = useState<null | "model" | "seed">(null);
  const [error, setError] = useState<{ message: string; canLoadSaved: boolean } | null>(null);
  const [nudge, setNudge] = useState(false);
  const [, startTransition] = useTransition();
  const pdf = useRef<HTMLElement>(null);
  const decisionsRef = useRef<HTMLElement>(null);
  // Show the page a quote came from. On a narrow screen the PDF sits above the rules, so bring it back into view.
  const jump = (n: number) => {
    setPage(n);
    if (pdf.current && pdf.current.getBoundingClientRect().bottom < 80) pdf.current.scrollIntoView({ block: "start" });
  };

  async function compile(source: "model" | "seed") {
    setError(null);
    setCompiling(source);
    try {
      const res = await fetch(`/api/extract/${contractId}${source === "seed" ? "?source=seed" : ""}`, { method: "POST" });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        if (body.error === "no_api_key") setError({ message: "No Claude API key is set on this server, so the contract cannot be read.", canLoadSaved: true });
        else setError({ message: body.message ?? body.error ?? "Reading failed.", canLoadSaved: true });
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError({ message: (e as Error).message, canLoadSaved: false });
    } finally {
      setCompiling(null);
    }
  }

  // A fresh upload goes straight to reading; the person asked for that by uploading it.
  const started = useRef(false);
  useEffect(() => {
    if (!autoCompile || ruleSet || !canCompile) return;
    // The guard is set when the read starts, not when it is scheduled, so a remounted effect still fires once.
    const t = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void compile("model");
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stored = ruleSet?.stored ?? null;
  const editable = ruleSet?.status === "extracted" || ruleSet?.status === "in_review";
  const blocking = stored && editable ? RULE_FIELDS.filter((p) => isBlocking(stored, p)) : [];
  const anomalies = stored ? stored.extracted.anomalies.map((a, index) => ({ ...a, index, ack: stored.anomalyAcks[index] ?? null })) : [];
  const unacked = editable ? anomalies.filter((a) => !a.ack) : [];
  // A note about a term that is itself waiting for a decision is settled together with that term.
  const loose = unacked.filter((a) => !blocking.includes(a.field as RuleFieldPath));
  const confirmed = stored ? RULE_FIELDS.length - RULE_FIELDS.filter((p) => isBlocking(stored, p)).length : 0;
  const canApprove = editable && blocking.length === 0 && unacked.length === 0;
  const waiting = [blocking.length > 0 ? `${blocking.length} term${blocking.length === 1 ? "" : "s"}` : null, loose.length > 0 ? `${loose.length} note${loose.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" and ");

  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(440px,600px)]">
      <section ref={pdf} aria-label="Subcontract PDF" className="min-w-0 scroll-mt-16 lg:sticky lg:top-8 lg:self-start">
        {documentUrl ? (
          <>
            <div className="type-meta mb-2 flex items-center justify-between gap-3 text-muted-foreground">
              <span>
                The signed subcontract, page <span className="num">{page}</span>
              </span>
              <a href={documentUrl} target="_blank" rel="noreferrer" className="rounded-sm text-link underline-offset-4 hover:underline">
                Open the PDF
              </a>
            </div>
            <iframe key={page} title={`${subName} subcontract, page ${page}`} src={`${documentUrl}#page=${page}&view=FitH`} className="h-[55vh] w-full border-y lg:h-[calc(100dvh-9.5rem)]" />
          </>
        ) : (
          (upload ?? <EmptyState title="No subcontract uploaded yet" description="Upload the signed PDF to read its payment terms." />)
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="type-section">Payment rules</h2>
            <p className="type-meta mt-0.5 text-muted-foreground">
              {ruleSet
                ? `Version ${ruleSet.version}, ${!ruleSet.model ? "read by Claude" : /^seed|^cached/.test(ruleSet.model) ? "loaded from a saved reading" : `read by ${ruleSet.model.replace(" (cached)", ", saved reading")}`}${ruleSet.extractionMs && ruleSet.extractionMs >= 1000 ? ` in ${(ruleSet.extractionMs / 1000).toFixed(0)} seconds` : ""}`
                : "Not read yet"}
            </p>
          </div>
          {canCompile && ruleSet && (
            <Button onClick={() => compile("model")} loading={compiling === "model"} variant="secondary" size="sm">
              Read it again
            </Button>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3">
            <p className="flex items-start gap-2">
              <OctagonAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{error.message}</span>
            </p>
            {error.canLoadSaved && (
              <div className="mt-3 flex flex-wrap items-center gap-3 pl-6">
                <Button onClick={() => compile("seed")} loading={compiling === "seed"} size="sm" variant="secondary">
                  Load the saved reading
                </Button>
                <span className="type-meta text-muted-foreground">Available for the subcontracts that come with the sample workspace.</span>
              </div>
            )}
          </div>
        )}

        {compiling === "model" && <Reading />}

        {!stored && compiling === null && (
          <EmptyState
            align="start"
            title="This subcontract has not been read yet"
            description="Claude reads the payment terms and quotes the clause behind each. You approve once."
            action={
              canCompile ? (
                <Button onClick={() => compile("model")}>Read the contract</Button>
              ) : undefined
            }
          />
        )}

        {stored && ruleSet && compiling !== "model" && (
          <>
            {editable && (
              <section ref={decisionsRef} tabIndex={-1} aria-labelledby="decisions-heading" className="flex scroll-mt-20 flex-col gap-3 outline-none">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 id="decisions-heading" className="text-sm leading-5 font-semibold">
                    Needs your decision
                  </h3>
                  {blocking.length + loose.length > 0 ? <Badge tone="hold">{blocking.length + loose.length} waiting</Badge> : <Badge tone="settled">Nothing waiting</Badge>}
                </div>
                {blocking.length + loose.length === 0 ? (
                  <p className="type-meta text-muted-foreground">Every term is verified or settled. Approve when ready.</p>
                ) : (
                  <>
                    <p className="type-meta text-muted-foreground">Terms Claude was unsure of, quotes not found in the PDF, and anything state law overrides.</p>
                    {nudge && (
                      <p role="alert" className="type-meta font-medium text-destructive">
                        Settle {waiting} below before approving.
                      </p>
                    )}
                    <ul className="divide-y border-y">
                      {blocking.map((p) => (
                        <DecisionItem key={p} path={p} stored={stored} notes={unacked.filter((a) => a.field === p)} contractId={contractId} ruleSetId={ruleSet.id} onJump={jump} />
                      ))}
                      {loose.map((a) => (
                        <li key={`a-${a.index}`} className="flex flex-col gap-3 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <div className="font-medium">A note on {noteSubject(a.field)}</div>
                            <Badge tone="hold" icon={<AlertTriangle aria-hidden />}>
                              Read and acknowledge
                            </Badge>
                          </div>
                          <p>{a.description}</p>
                          {a.evidence && <Quote text={a.evidence.quote} page={a.evidence.page} onJump={jump} />}
                          <form action={acknowledgeAnomalyAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="contractId" value={contractId} />
                            <input type="hidden" name="ruleSetId" value={ruleSet.id} />
                            <input type="hidden" name="index" value={a.index} />
                            <Field label="Your note" optional className="min-w-48 flex-1">
                              <Input name="note" />
                            </Field>
                            <SubmitButton variant="secondary" className="h-9">
                              Acknowledge
                            </SubmitButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            <StateLaw stored={stored} />

            <VerifiedTerms stored={stored} editable={editable} count={confirmed} defaultOpen={blocking.length + loose.length === 0} onJump={jump} />

            {anomalies.some((a) => a.ack || !editable) && (
              <Disclosure title="Notes from the reading" count={anomalies.filter((a) => a.ack || !editable).length}>
                <ul className="divide-y border-y">
                  {anomalies
                    .filter((a) => a.ack || !editable)
                    .map((a) => (
                      <li key={a.index} className="flex flex-col gap-2 px-4 py-3">
                        <div className="type-meta text-muted-foreground">On {noteSubject(a.field)}</div>
                        <p>{a.description}</p>
                        {a.evidence && <Quote text={a.evidence.quote} page={a.evidence.page} onJump={jump} quiet />}
                        {a.ack && (
                          <p className="type-meta text-muted-foreground">
                            Acknowledged by {a.ack.by}: {a.ack.note}
                          </p>
                        )}
                      </li>
                    ))}
                </ul>
              </Disclosure>
            )}
          </>
        )}
      </div>

      {stored && ruleSet && compiling !== "model" && (
        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:col-span-2 lg:-mx-8 lg:px-8">
          {editable ? (
            <form
              action={approveRuleSetAction}
              onSubmit={(e) => {
                if (canApprove) return;
                // Approval is refused while anything is unsettled; show where instead of sending the form.
                e.preventDefault();
                setNudge(true);
                decisionsRef.current?.scrollIntoView({ block: "start" });
                decisionsRef.current?.focus({ preventScroll: true });
              }}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2"
            >
              <input type="hidden" name="contractId" value={contractId} />
              <input type="hidden" name="ruleSetId" value={ruleSet.id} />
              <p className="min-w-0" role="status">
                <span className="num font-medium">
                  {confirmed} of {RULE_FIELDS.length} confirmed
                </span>
                <span className="text-muted-foreground">
                  {canApprove ? `. Approving freezes version ${ruleSet.version}; payments on this subcontract follow it from then on.` : `. Still waiting on you: ${waiting}.`}
                </span>
              </p>
              <SubmitButton>Approve payment rules</SubmitButton>
            </form>
          ) : ruleSet.status === "approved" ? (
            <p className="type-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
              <ShieldCheck aria-hidden className="size-4 shrink-0 text-settled" />
              <span>
                Approved by {ruleSet.approvedByName ?? "the controller"}
                {ruleSet.approvedAtText ? ` on ${ruleSet.approvedAtText}` : ""}. Payments follow version {ruleSet.version}; reading the contract again starts a new version.
              </span>
              {ruleSet.approvedHash && (
                <span className="type-mono" title={`sha256 ${ruleSet.approvedHash}`}>
                  sha256 {ruleSet.approvedHash.slice(0, 16)}
                </span>
              )}
            </p>
          ) : (
            <p className="type-meta text-muted-foreground">Version {ruleSet.version} was replaced by a newer reading.</p>
          )}
        </div>
      )}
    </div>
  );
}

function noteSubject(path: string): string {
  return RULE_FIELDS.includes(path as RuleFieldPath) ? fieldLabel(path as RuleFieldPath).toLowerCase() : "the contract as a whole";
}

/** Why a term was held back, in the reader's words. */
function plainReason(r: string): string {
  if (r === "Medium confidence.") return "Claude was not certain it read this clause correctly.";
  if (r === "Low confidence.") return "Claude was unsure of this reading.";
  if (r === "Required field not found in the contract.") return "The contract does not seem to state this, and payments cannot be worked out without it.";
  if (r === "Value proposed without a supporting quote.") return "Claude gave a value but no clause to support it.";
  if (r === "Quoted text could not be found in the PDF.") return "The quoted words could not be found in the PDF, so this reading cannot be trusted as it stands.";
  if (r === "Not found in the contract; the engine treats it as absent.") return "Not found in the contract, so it is treated as absent.";
  const fuzzy = r.match(/^Quote matched approximately \((\d+)%\)\.$/);
  if (fuzzy) return `The quote is close to the PDF (${fuzzy[1]}% the same) but not word for word.`;
  return r.replace(/^Anomaly: /, "").replace(/\bthe engine\b/g, "Groundwork");
}

function PageLink({ page, onJump }: { page: number; onJump: (page: number) => void }) {
  return (
    <button type="button" onClick={() => onJump(page)} aria-label={`Show page ${page} of the contract`} className="num cursor-pointer rounded-sm font-sans text-xs leading-4 font-medium whitespace-nowrap text-link underline-offset-4 hover:underline">
      p. {page}
    </button>
  );
}

/** The contract's own words, in the serif, with the page they are on. */
function Quote({ text, page, onJump, quiet = false, children }: { text: string; page: number | null; onJump: (page: number) => void; quiet?: boolean; children?: React.ReactNode }) {
  return (
    <blockquote className={cn("type-contract border-l-2 border-input pl-3", quiet ? "text-muted-foreground" : "text-foreground")}>
      &ldquo;{text}&rdquo; {page !== null && <PageLink page={page} onJump={onJump} />}
      {children}
    </blockquote>
  );
}

function DecisionItem({
  path,
  stored,
  notes,
  contractId,
  ruleSetId,
  onJump,
}: {
  path: RuleFieldPath;
  stored: StoredRules;
  /** Notes Claude attached to this term that nobody has acknowledged yet. Settling the term acknowledges them. */
  notes: { index: number; description: string }[];
  contractId: string;
  ruleSetId: string;
  onJump: (page: number) => void;
}) {
  const [changing, setChanging] = useState(false);
  const f = getField(stored.extracted, path);
  const { verification, review } = stored.annotations[path];
  const value = f.not_found ? null : f.value;
  const pageNo = verification.page ?? f.evidence?.page ?? null;
  const escalated = review.state === "escalated";
  // Notes are listed on their own below, so they are not repeated as reasons.
  const reasons = review.reasons.filter((r) => !r.startsWith("Anomaly: ") || !notes.some((n) => r === `Anomaly: ${n.description}`)).map(plainReason);
  const hidden = (
    <>
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="ruleSetId" value={ruleSetId} />
      <input type="hidden" name="path" value={path} />
      {notes.map((n) => (
        <input key={n.index} type="hidden" name="ack" value={n.index} />
      ))}
    </>
  );

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="type-meta text-muted-foreground">
            {fieldLabel(path)}
            {RULE_IDS[path] && <span className="type-mono ml-1.5">{RULE_IDS[path]}</span>}
          </div>
          <div className={cn("text-base leading-6", value === null ? "text-muted-foreground" : "font-semibold")}>{value === null ? "Not found in the contract" : formatRuleValue(path, value)}</div>
        </div>
        {escalated ? (
          <Badge tone="danger" icon={<OctagonAlert aria-hidden />}>
            Needs your decision
          </Badge>
        ) : (
          <Badge tone="hold" icon={<AlertTriangle aria-hidden />}>
            Please check
          </Badge>
        )}
      </div>
      {f.evidence && <Quote text={f.evidence.quote} page={pageNo} onJump={onJump} />}
      {reasons.length + notes.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {reasons.map((r, i) => (
            <li key={`r-${i}`} className="flex items-start gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{r}</span>
            </li>
          ))}
          {notes.map((n) => (
            <li key={n.index} className="flex items-start gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{n.description}</span>
            </li>
          ))}
        </ul>
      )}
      {changing ? (
        <form action={resolveFieldAction} className="flex flex-col gap-3 border-t pt-3">
          {hidden}
          <input type="hidden" name="decision" value="override" />
          <Field label="What the contract actually says">
            <OverrideInput path={path} value={f.value} />
          </Field>
          <Field label="Why you changed it" help="Kept with the rule so anyone can see who changed it and why.">
            <Input name="note" required />
          </Field>
          <FormActions className="pt-0">
            <Button type="button" variant="tertiary" onClick={() => setChanging(false)}>
              Cancel
            </Button>
            <SubmitButton variant="secondary">Save the change</SubmitButton>
          </FormActions>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <form action={resolveFieldAction}>
            {hidden}
            <input type="hidden" name="decision" value="accept" />
            <SubmitButton variant="secondary" aria-label={`Accept ${fieldLabel(path).toLowerCase()} as read`}>
              Accept
            </SubmitButton>
          </form>
          <Button type="button" variant="secondary" onClick={() => setChanging(true)} aria-label={`Change ${fieldLabel(path).toLowerCase()}`}>
            Change
          </Button>
          <span className="type-meta text-muted-foreground">{value === null ? "Accept means the contract is silent on this." : "Accept means the reading matches the contract."}</span>
        </div>
      )}
    </li>
  );
}

/** A heading that opens and closes the list under it. */
function Disclosure({ title, count, defaultOpen = false, children }: { title: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="flex flex-col gap-3">
      <h3>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="-mx-2 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm leading-5 font-semibold hover:bg-secondary">
          <ChevronRight aria-hidden className={cn("size-4 text-muted-foreground", open && "rotate-90")} />
          {title}
          <span className="num font-normal text-muted-foreground">({count})</span>
        </button>
      </h3>
      {open && children}
    </section>
  );
}

function VerifiedTerms({ stored, editable, count, defaultOpen, onJump }: { stored: StoredRules; editable: boolean; count: number; defaultOpen: boolean; onJump: (page: number) => void }) {
  const groups = FIELD_GROUPS.map((g) => ({ ...g, paths: g.paths.filter((p) => !editable || !isBlocking(stored, p)) })).filter((g) => g.paths.length > 0);
  return (
    <Disclosure title="Verified terms" count={count} defaultOpen={defaultOpen}>
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h4 className="type-meta mb-1.5 font-medium text-muted-foreground">{g.title}</h4>
            <ul className="divide-y border-y">
              {g.paths.map((p) => (
                <VerifiedRow key={p} path={p} extracted={stored.extracted} stored={stored} onJump={onJump} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Disclosure>
  );
}

function VerifiedRow({ path, extracted, stored, onJump }: { path: RuleFieldPath; extracted: ExtractedRuleSet; stored: StoredRules; onJump: (page: number) => void }) {
  const f = getField(extracted, path);
  const { verification, review } = stored.annotations[path];
  const value = review.override ? review.override.value : f.not_found ? null : f.value;
  const pageNo = verification.page ?? f.evidence?.page ?? null;
  const status: { icon: typeof CheckCircle2; text: string; ok: boolean } =
    review.state === "accepted"
      ? { icon: CheckCircle2, text: "Accepted by you", ok: true }
      : review.state === "overridden"
        ? { icon: CheckCircle2, text: "Changed by you", ok: true }
        : !f.evidence
          ? { icon: FileSearch, text: f.not_found ? "Not in the contract" : "No quote", ok: false }
          : verification.status === "exact"
            ? { icon: CheckCircle2, text: "Found in the PDF", ok: true }
            : verification.status === "fuzzy"
              ? { icon: CheckCircle2, text: `Found in the PDF, ${Math.round((verification.score ?? 0) * 100)}% match`, ok: true }
              : { icon: FileSearch, text: "Quote not found", ok: false };
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <div className="min-w-0">
          <span className="text-muted-foreground">{fieldLabel(path)}</span>
          {RULE_IDS[path] && <span className="type-mono ml-1.5 text-muted-foreground">{RULE_IDS[path]}</span>}
        </div>
        <span className="type-caption flex shrink-0 items-center gap-1 text-muted-foreground">
          <status.icon aria-hidden className={cn("size-3.5", status.ok && "text-settled")} />
          {status.text}
        </span>
      </div>
      <div className={value === null ? "text-muted-foreground" : "font-medium"}>
        {value === null ? "Not stated" : formatRuleValue(path, value)}
        {review.override && <span className="ml-2 font-normal text-muted-foreground line-through">{formatRuleValue(path, f.value)}</span>}
      </div>
      {f.evidence && <Quote text={f.evidence.quote} page={pageNo} onJump={onJump} quiet />}
      {review.override && (
        <p className="type-meta text-muted-foreground">
          {review.override.by}: {review.override.note}
        </p>
      )}
    </li>
  );
}

/** What the governing state's law does to these terms: the contract, the statute, and what is applied. */
function StateLaw({ stored }: { stored: StoredRules }) {
  const o = stored.overlay;
  const name = STATE_LAW[o.state]?.name ?? o.state;
  // Rule sets stored before other states were supported carry no citation ids; those are California's.
  const cite = (rule: "promptPay" | "retentionCap" | "retentionRelease" | "payIfPaid", legacy: string) => {
    const id = o.cites?.[rule] ?? (o.state === "CA" ? legacy : undefined);
    return id ? statute(id).cite : null;
  };
  const val = <T,>(path: RuleFieldPath): T | null => {
    const f = getField(stored.extracted, path);
    const over = stored.annotations[path].review.override;
    return (over ? over.value : f.not_found ? null : f.value) as T | null;
  };
  const type = val<string>("timing.type");
  const days = val<number>("timing.days");
  const written = val<boolean>("timing.agreed_in_writing");
  const rate = val<number>("retainage.percent_bps");
  const releaseDays = val<number>("retainage.release_days");
  const lawDays = o.progressPaymentDaysDefault;
  const biz = o.dayType === "business" ? "business " : "";
  const pct = (bps: number) => `${bps / 100}%`;
  const pif = o.payIfPaid ?? (o.payIfPaidVoid ? "void" : "enforceable");

  // The deadline, worked out the way the payment engine does.
  let deadline: { text: string; from: "contract" | "statute" | "none" };
  const contractDays = written && days !== null ? days : null;
  if (type === "fixed_days") {
    deadline = { text: `${days ?? 0} days after the pay app is approved${lawDays !== null && o.progressPaymentOverridable === false ? `, and never later than ${lawDays} ${biz}days after the owner pays` : ""}`, from: "contract" };
  } else if (lawDays !== null) {
    if (contractDays !== null && o.progressPaymentOverridable === false && (biz || contractDays > lawDays)) {
      deadline = biz ? { text: `The earlier of ${contractDays} days and ${lawDays} business days after the owner pays`, from: "statute" } : { text: `${lawDays} days after the owner pays`, from: "statute" };
    } else if (contractDays !== null) {
      deadline = { text: `${contractDays} days after the owner pays`, from: "contract" };
    } else {
      deadline = { text: `${lawDays} ${biz}days after the owner pays`, from: "statute" };
    }
  } else if (days !== null) {
    deadline = { text: `${days} days after the owner pays`, from: "contract" };
  } else {
    deadline = { text: "No deadline", from: "none" };
  }

  const cap = o.retentionCapBps;
  const capped = cap !== null && rate !== null && rate > cap;
  const passDays = o.retentionPassThroughDays;
  const applyRelease = passDays !== null && releaseDays !== null ? Math.min(passDays, releaseDays) : (passDays ?? releaseDays);

  const rows: { term: string; contract: string; law: string; cite: string | null; applies: string; from: "contract" | "statute" | "none" }[] = [
    {
      term: "Pay the subcontractor within",
      contract: days === null ? "Not stated" : type === "fixed_days" ? `${days} days after approval` : `${days} days after the owner pays`,
      law: lawDays === null ? "No deadline on private work" : `${lawDays} ${biz}days${o.progressPaymentOverridable === false ? "; a contract cannot lengthen it" : o.progressPaymentOverridable ? ", unless agreed otherwise in writing" : ""}`,
      cite: cite("promptPay", "CA_BPC_7108_5"),
      applies: deadline.text,
      from: deadline.from,
    },
    {
      term: "Retainage withheld",
      contract: rate === null ? "Not stated" : pct(rate),
      law: cap === null ? "No cap that applies to this contract" : cap === 0 ? "Retainage may not be withheld" : `No more than ${pct(cap)}${o.retentionCapAfterHalfBps != null ? `, then ${o.retentionCapAfterHalfBps === 0 ? "none" : pct(o.retentionCapAfterHalfBps)} after 50% completion` : ""}`,
      cite: cap === null ? null : cite("retentionCap", "CA_CIV_8811"),
      applies: rate === null ? "Nothing withheld" : capped ? (cap === 0 ? "Nothing withheld" : pct(cap!)) : pct(rate),
      from: rate === null ? "none" : capped ? "statute" : "contract",
    },
    {
      term: "Pass retainage down within",
      contract: releaseDays === null ? "Not stated" : `${releaseDays} days`,
      law: passDays === null ? "No deadline on private work" : `${passDays} days after the owner releases it`,
      cite: passDays === null ? null : cite("retentionRelease", "CA_CIV_8814"),
      applies: applyRelease === null ? "No deadline" : `${applyRelease} days`,
      from: applyRelease === null ? "none" : passDays !== null && (releaseDays === null || passDays <= releaseDays) ? "statute" : "contract",
    },
    {
      term: "Payment only if the owner pays",
      contract: type === "pay_if_paid" ? "Yes: pay-if-paid" : type === null ? "Not stated" : "No",
      law: { void: "Unenforceable", limited: "Enforceable, within limits", enforceable: "Enforceable when clearly worded", unsettled: "Unsettled" }[pif],
      cite: cite("payIfPaid", "CA_CLARKE_V_SAFECO"),
      applies: type !== "pay_if_paid" ? "Does not come up" : pif === "void" ? "Read as pay-when-paid; the deadline still runs" : pif === "enforceable" ? "Honored" : "Honored; confirm it can be relied on",
      from: type !== "pay_if_paid" ? "none" : pif === "void" ? "statute" : "contract",
    },
  ];

  return (
    <section aria-labelledby="law-heading" className="flex flex-col gap-3">
      <div>
        <h3 id="law-heading" className="text-sm leading-5 font-semibold">
          {o.loaded ? `What ${name} law changes` : `No payment law on file for ${o.state}`}
        </h3>
        <p className="type-meta mt-0.5 text-muted-foreground">
          {o.loaded ? "Applied by code from the governing-law clause. Claude never decides this." : "The contract's own terms apply, and some deadlines may be missing."}
        </p>
      </div>
      {o.loaded && (
        <>
          <Table density="compact" className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead>Term</TableHead>
                <TableHead>Contract says</TableHead>
                <TableHead>Statute says</TableHead>
                <TableHead>Groundwork applies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.term} className="align-top">
                  <TableCell className="py-2! align-top text-muted-foreground">{r.term}</TableCell>
                  <TableCell className="py-2! align-top">{r.contract}</TableCell>
                  <TableCell className="py-2! align-top">
                    {r.law}
                    {r.cite && <div className="type-mono mt-0.5 text-xs leading-4 text-muted-foreground">{r.cite}</div>}
                  </TableCell>
                  <TableCell className="py-2! align-top font-medium">
                    {r.applies}
                    {r.from !== "none" && <div className="type-caption mt-0.5 font-normal text-muted-foreground">{r.from === "statute" ? "from the statute" : "from the contract"}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {(o.caveats?.length ?? 0) > 0 && (
            <ul className="flex flex-col gap-2">
              {o.caveats!.map((c, i) => (
                <li key={i} className="type-meta flex items-start gap-2 text-muted-foreground">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-hold" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const TIMING_TYPES = [
  ["pay_when_paid", "Pay when paid"],
  ["pay_if_paid", "Pay if paid"],
  ["fixed_days", "A fixed number of days"],
  ["silent", "The contract does not say"],
] as const;
const isYesNo = (path: RuleFieldPath) => /^(waivers|offsets)\.|agreed_in_writing|stored_materials/.test(path);

/** The corrected value. Terms with a fixed set of answers get a list, so a typo cannot become a payment rule. */
function OverrideInput({ path, value, ...props }: { path: RuleFieldPath; value: unknown; id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" }) {
  if (path === "timing.type")
    return (
      <Select name="value" defaultValue={String(value ?? "silent")} required {...props}>
        {TIMING_TYPES.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </Select>
    );
  if (isYesNo(path))
    return (
      <Select name="value" defaultValue={value === true ? "true" : "false"} required {...props}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    );
  return <Input name="value" placeholder={placeholderFor(path)} defaultValue={defaultOverride(path, value)} required {...props} />;
}

function placeholderFor(path: RuleFieldPath): string {
  if (path.endsWith("_bps")) return "Percent, for example 5";
  if (path.endsWith("days")) return "Days";
  return "";
}

function defaultOverride(path: RuleFieldPath, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (path.endsWith("_bps")) return String(Number(v) / 100);
  return String(v);
}

const READING_STEPS = ["Opening the PDF", "Finding the payment terms", "Quoting the clause behind each term", "Checking every quote against the PDF", "Applying the state's payment deadline"];

/** What is happening while the contract is read. The steps advance on a timer; the last one waits for the real answer. */
function Reading() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, READING_STEPS.length - 1)), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="border-y" role="status" aria-label="Reading the contract">
      <div className="h-0.5 w-full overflow-hidden bg-muted">
        <div className="reading-bar h-full w-1/3 bg-signal" />
      </div>
      <div className="p-4">
        <p className="font-semibold">Claude is reading the contract</p>
        <p className="type-meta mt-0.5 text-muted-foreground">This takes about a minute. You can read the PDF while you wait.</p>
        <ol className="mt-4 flex flex-col gap-2.5">
          {READING_STEPS.map((label, i) => (
            <li key={label} className={cn("flex items-center gap-2.5", i > step && "text-muted-foreground")}>
              {i < step ? (
                <CheckCircle2 className="tick-in size-4 shrink-0 text-settled" aria-hidden />
              ) : i === step ? (
                <span aria-hidden className="waiting-ring size-4 shrink-0 animate-spin rounded-full border-2 border-signal border-t-transparent" />
              ) : (
                <span aria-hidden className="size-4 shrink-0 rounded-full border border-input" />
              )}
              <span className={i === step ? "font-medium" : undefined}>{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

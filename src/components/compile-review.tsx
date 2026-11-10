"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, OctagonAlert, FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getField, RULE_FIELDS, type ExtractedRuleSet, type RuleFieldPath } from "@/domain/rules/schema";
import { FIELD_GROUPS, RULE_IDS, formatRuleValue } from "@/domain/rules/format";
import { statute } from "@/domain/statutes";
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
  stored: StoredRules;
};

export function CompileReview({
  contractId,
  documentUrl,
  subName,
  ruleSet,
  canCompile,
}: {
  contractId: string;
  documentUrl: string | null;
  subName: string;
  ruleSet: RuleSetView | null;
  canCompile: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [compiling, setCompiling] = useState<null | "model" | "seed">(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function compile(source: "model" | "seed") {
    setError(null);
    setCompiling(source);
    try {
      const res = await fetch(`/api/extract/${contractId}${source === "seed" ? "?source=seed" : ""}`, { method: "POST" });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        if (body.error === "no_api_key") setError("No Claude API key is configured on this server. You can load the cached extraction for this demo contract instead.");
        else setError(body.message ?? body.error ?? "Compile failed.");
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCompiling(null);
    }
  }

  const stored = ruleSet?.stored ?? null;
  const editable = ruleSet?.status === "extracted" || ruleSet?.status === "in_review";
  const blocking = stored ? RULE_FIELDS.filter((p) => ["escalated", "needs_review"].includes(stored.annotations[p].review.state)) : [];
  const unacked = stored ? stored.extracted.anomalies.map((_, i) => i).filter((i) => !stored.anomalyAcks[i]) : [];
  const canApprove = editable && blocking.length === 0 && unacked.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
      <section aria-label="Subcontract PDF" className="min-w-0">
        {documentUrl ? (
          <iframe key={page} title={`${subName} subcontract, page ${page}`} src={`${documentUrl}#page=${page}&view=FitH`} className="h-[82vh] w-full rounded-md border bg-card" />
        ) : (
          <p className="text-sm text-muted-foreground">No subcontract uploaded yet.</p>
        )}
      </section>

      <aside className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Payment rules</h2>
            <p className="text-xs text-muted-foreground">
              {ruleSet
                ? ruleSet.status === "approved"
                  ? `v${ruleSet.version} · approved by ${ruleSet.approvedByName ?? "—"}`
                  : `v${ruleSet.version} · ${ruleSet.model ?? ""}${ruleSet.extractionMs ? ` · ${(ruleSet.extractionMs / 1000).toFixed(1)}s` : ""}`
                : "Not compiled yet"}
            </p>
          </div>
          {canCompile && (
            <div className="flex gap-2">
              <Button onClick={() => compile("model")} disabled={compiling !== null} variant="money" size="sm">
                <Sparkles className="h-4 w-4" aria-hidden />
                {compiling === "model" ? "Reading the contract…" : ruleSet ? "Recompile with Claude" : "Compile with Claude"}
              </Button>
            </div>
          )}
        </div>
        {error && (
          <div role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            {error}
            <div className="mt-2">
              <Button onClick={() => compile("seed")} disabled={compiling !== null} size="sm" variant="outline">
                {compiling === "seed" ? "Loading…" : "Load cached extraction"}
              </Button>
            </div>
          </div>
        )}

        {compiling === "model" && <Skeletons />}

        {!stored && compiling === null && (
          <div className="mt-4 rounded-md border border-dashed bg-card p-6 text-sm text-muted-foreground">
            Claude reads the subcontract once and proposes typed rules with the clause behind each one. Our code verifies every quote against the PDF, applies the statute, and sends anything doubtful to you. Approve once; the engine does the rest.
          </div>
        )}

        {stored && ruleSet && (
          <div className="mt-4 space-y-5">
            {ruleSet.status === "approved" && (
              <div className="flex items-start gap-2 rounded-md border border-settled/40 bg-settled-soft p-3 text-sm">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-settled" aria-hidden />
                <div>
                  <div className="font-medium text-settled">Approved and frozen</div>
                  <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">sha256 {ruleSet.approvedHash}</div>
                  <div className="text-xs text-muted-foreground">Edits create a new version. The engine only reads approved versions.</div>
                </div>
              </div>
            )}

            <Overlay stored={stored} />

            {FIELD_GROUPS.map((g) => (
              <section key={g.title} aria-labelledby={`g-${g.title}`}>
                <h3 id={`g-${g.title}`} className="text-sm font-semibold">
                  {g.title}
                </h3>
                <ul className="mt-2 divide-y rounded-md border bg-card">
                  {g.paths.map((p) => (
                    <FieldRow key={p} path={p} extracted={stored.extracted} stored={stored} editable={editable} contractId={contractId} ruleSetId={ruleSet.id} onJump={setPage} />
                  ))}
                </ul>
              </section>
            ))}

            {stored.extracted.anomalies.length > 0 && (
              <section aria-labelledby="anomalies">
                <h3 id="anomalies" className="text-sm font-semibold">
                  Anomalies Claude flagged
                </h3>
                <ul className="mt-2 space-y-2">
                  {stored.extracted.anomalies.map((a, i) => {
                    const ack = stored.anomalyAcks[i];
                    return (
                      <li key={i} className={`rounded-md border bg-card p-3 text-sm ${ack ? "" : "border-hold/50"}`}>
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${ack ? "text-muted-foreground" : "text-hold"}`} aria-hidden />
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">{fieldLabelSafe(a.field)}</div>
                            <div>{a.description}</div>
                            {a.evidence && (
                              <button type="button" onClick={() => setPage(a.evidence!.page)} className="mt-1 text-left text-xs italic text-muted-foreground hover:text-foreground">
                                &ldquo;{a.evidence.quote}&rdquo; · p. {a.evidence.page}
                              </button>
                            )}
                            {ack ? (
                              <div className="mt-1 text-xs text-settled">Acknowledged by {ack.by}: {ack.note}</div>
                            ) : editable ? (
                              <form action={acknowledgeAnomalyAction} className="mt-2 flex gap-2">
                                <input type="hidden" name="contractId" value={contractId} />
                                <input type="hidden" name="ruleSetId" value={ruleSet.id} />
                                <input type="hidden" name="index" value={i} />
                                <Input name="note" placeholder="Note (optional)" className="h-8 text-xs" />
                                <Button type="submit" size="sm" variant="outline">
                                  Acknowledge
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {editable && (
              <form action={approveRuleSetAction} className="sticky bottom-4 rounded-md border bg-card p-3 shadow-md">
                <input type="hidden" name="contractId" value={contractId} />
                <input type="hidden" name="ruleSetId" value={ruleSet.id} />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {canApprove
                      ? "Every field is verified or resolved. Approving freezes v" + ruleSet.version + "."
                      : `${blocking.length} field${blocking.length === 1 ? "" : "s"} and ${unacked.length} anomal${unacked.length === 1 ? "y" : "ies"} need your decision.`}
                  </div>
                  <Button type="submit" disabled={!canApprove} variant={canApprove ? "money" : "outline"}>
                    Approve rules
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function fieldLabelSafe(path: string): string {
  return RULE_FIELDS.includes(path as RuleFieldPath) ? fieldLabel(path as RuleFieldPath) : path;
}

function Overlay({ stored }: { stored: StoredRules }) {
  const o = stored.overlay;
  // Rule sets stored before other states were supported carry no citation ids; those are California's.
  const cite = (rule: "promptPay" | "retentionCap" | "retentionRelease" | "payIfPaid", legacy: string) => {
    const id = o.cites?.[rule] ?? (o.state === "CA" ? legacy : undefined);
    return id ? statute(id).cite : null;
  };
  const days = (n: number) => `${n} ${o.dayType === "business" ? "business " : ""}days`;
  const pif = o.payIfPaid ?? (o.payIfPaidVoid ? "void" : "enforceable");
  const rows: { label: string; value: string; cite: string | null }[] = [
    {
      label: "Pay the sub within",
      value: o.progressPaymentDaysDefault === null ? "no private deadline; contract terms apply" : `${days(o.progressPaymentDaysDefault)}${o.progressPaymentOverridable === false ? "; the contract cannot lengthen it" : o.progressPaymentOverridable ? ", unless agreed otherwise in writing" : ""}`,
      cite: cite("promptPay", "CA_BPC_7108_5"),
    },
    { label: "Pass retainage down within", value: o.retentionPassThroughDays === null ? "no private deadline" : `${o.retentionPassThroughDays} days`, cite: cite("retentionRelease", "CA_CIV_8814") },
    {
      label: "Retainage cap",
      value: o.retentionCapBps === null ? "none that applies to this contract" : o.retentionCapBps === 0 ? "retainage may not be withheld" : `${o.retentionCapBps / 100}%${o.retentionCapAfterHalfBps != null ? `, then ${o.retentionCapAfterHalfBps === 0 ? "none" : `${o.retentionCapAfterHalfBps / 100}%`} after 50% completion` : ""}`,
      cite: o.retentionCapBps === null ? null : cite("retentionCap", "CA_CIV_8811"),
    },
    { label: "Pay-if-paid", value: { void: "void: read as pay-when-paid", limited: "limited by statute", enforceable: "enforceable when clearly worded", unsettled: "unsettled" }[pif], cite: cite("payIfPaid", "CA_CLARKE_V_SAFECO") },
  ];
  return (
    <div className="rounded-md border bg-surface-sunken/60 p-3 text-xs">
      <div className="font-medium">
        Statutory overlay · {o.state}
        {o.loaded ? "" : " (no record)"}
      </div>
      <div className="mt-1 text-muted-foreground">Applied by code from the governing state, never by the model.</div>
      {o.loaded ? (
        <>
          <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.label}>
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd>
                  {r.value}
                  {r.cite && <span className="text-muted-foreground"> · {r.cite}</span>}
                </dd>
              </div>
            ))}
          </dl>
          {(o.caveats?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-1 border-t pt-2 text-hold">
              {o.caveats!.map((c, i) => (
                <li key={i} className="line-clamp-3">
                  {c}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="mt-2 text-hold">No statute record for this state. Contract terms apply; deadlines may be missing.</div>
      )}
    </div>
  );
}

function FieldRow({
  path,
  extracted,
  stored,
  editable,
  contractId,
  ruleSetId,
  onJump,
}: {
  path: RuleFieldPath;
  extracted: ExtractedRuleSet;
  stored: StoredRules;
  editable: boolean;
  contractId: string;
  ruleSetId: string;
  onJump: (page: number) => void;
}) {
  const [mode, setMode] = useState<null | "accept" | "override">(null);
  const f = getField(extracted, path);
  const { verification, review } = stored.annotations[path];
  const value = review.override ? review.override.value : f.not_found ? null : f.value;
  const needsAction = editable && (review.state === "needs_review" || review.state === "escalated");

  const verif = !f.evidence ? (
    <span className="text-[11px] text-muted-foreground">{f.not_found ? "Not in contract" : "No quote"}</span>
  ) : verification.status === "exact" ? (
    <Chip tone="settled" icon={CheckCircle2}>Verified in PDF</Chip>
  ) : verification.status === "fuzzy" ? (
    <Chip tone="hold" icon={FileSearch}>Approx. match {Math.round((verification.score ?? 0) * 100)}%</Chip>
  ) : (
    <Chip tone="destructive" icon={OctagonAlert}>Not found in PDF</Chip>
  );

  const state = review.state;
  const stateChip =
    state === "auto_accepted" ? null : state === "accepted" ? (
      <Chip tone="settled" icon={CheckCircle2}>Accepted by reviewer</Chip>
    ) : state === "overridden" ? (
      <Chip tone="settled" icon={CheckCircle2}>Overridden by reviewer</Chip>
    ) : state === "needs_review" ? (
      <Chip tone="hold" icon={AlertTriangle}>Needs review</Chip>
    ) : (
      <Chip tone="destructive" icon={OctagonAlert}>Escalated</Chip>
    );

  return (
    <li className={`p-3 ${needsAction ? "bg-hold-soft/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {RULE_IDS[path] && <span className="rounded-sm bg-muted px-1 font-mono text-[10px]">{RULE_IDS[path]}</span>}
            {fieldLabel(path)}
          </div>
          <div className={`mt-0.5 text-sm font-medium ${value === null ? "text-muted-foreground" : ""}`}>
            {formatRuleValue(path, value)}
            {review.override && <span className="ml-2 text-xs font-normal text-muted-foreground line-through">{formatRuleValue(path, f.value)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {f.evidence && <Chip tone={f.evidence.confidence === "high" ? "neutral" : f.evidence.confidence === "medium" ? "hold" : "destructive"}>{f.evidence.confidence} confidence</Chip>}
          {verif}
          {stateChip}
        </div>
      </div>
      {f.evidence && (
        <button type="button" onClick={() => onJump(verification.page ?? f.evidence!.page)} className="mt-1.5 block text-left text-xs italic leading-snug text-muted-foreground hover:text-foreground">
          &ldquo;{f.evidence.quote}&rdquo; <span className="not-italic">· p. {verification.page ?? f.evidence.page}</span>
        </button>
      )}
      {review.reasons.length > 0 && state !== "auto_accepted" && (
        <ul className="mt-1.5 list-disc pl-4 text-xs text-muted-foreground">
          {review.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {review.override && <div className="mt-1 text-xs text-muted-foreground">{review.override.by}: {review.override.note}</div>}
      {needsAction && (
        <div className="mt-2">
          {mode === null ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setMode("accept")}>
                Accept as read
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setMode("override")}>
                Override
              </Button>
            </div>
          ) : (
            <form action={resolveFieldAction} className="grid gap-2">
              <input type="hidden" name="contractId" value={contractId} />
              <input type="hidden" name="ruleSetId" value={ruleSetId} />
              <input type="hidden" name="path" value={path} />
              <input type="hidden" name="decision" value={mode} />
              {mode === "override" && <Input name="value" placeholder={placeholderFor(path)} defaultValue={defaultOverride(path, f.value)} className="h-8 text-sm" required />}
              <Input name="note" placeholder={mode === "accept" ? "Why this reading is right (optional)" : "Why you changed it"} className="h-8 text-sm" required={mode === "override"} />
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="money">
                  {mode === "accept" ? "Accept" : "Save override"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

function placeholderFor(path: RuleFieldPath): string {
  if (path === "timing.type") return "pay_when_paid | pay_if_paid | fixed_days | silent";
  if (path.endsWith("_bps")) return "percent, e.g. 5";
  if (path.endsWith("days")) return "days";
  if (/^(waivers|offsets)\.|agreed_in_writing|stored_materials/.test(path)) return "true or false";
  return "value";
}

function defaultOverride(path: RuleFieldPath, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (path.endsWith("_bps")) return String(Number(v) / 100);
  return String(v);
}

function Chip({ tone, icon: Icon, children }: { tone: "neutral" | "hold" | "settled" | "destructive"; icon?: typeof CheckCircle2; children: React.ReactNode }) {
  const cls = { neutral: "bg-muted text-muted-foreground", hold: "bg-hold-soft text-hold", settled: "bg-settled-soft text-settled", destructive: "bg-destructive/10 text-destructive" }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </span>
  );
}

function Skeletons() {
  return (
    <ul className="mt-4 space-y-2" aria-label="Reading the contract">
      {RULE_FIELDS.slice(0, 12).map((p, i) => (
        <li key={p} className="animate-pulse rounded-md border bg-card p-3" style={{ animationDelay: `${i * 90}ms` }}>
          <div className="h-2.5 w-24 rounded bg-muted" />
          <div className="mt-2 h-3.5 w-40 rounded bg-muted" />
          <div className="mt-2 h-2.5 w-full rounded bg-muted/70" />
        </li>
      ))}
    </ul>
  );
}

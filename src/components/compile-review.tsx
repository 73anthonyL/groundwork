"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, OctagonAlert, FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  stored: StoredRules;
};

export function CompileReview({
  contractId,
  documentUrl,
  subName,
  ruleSet,
  canCompile,
  autoCompile = false,
}: {
  contractId: string;
  documentUrl: string | null;
  subName: string;
  ruleSet: RuleSetView | null;
  canCompile: boolean;
  /** Start reading straight away: set when the contract was uploaded a moment ago. */
  autoCompile?: boolean;
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
  const blocking = stored ? RULE_FIELDS.filter((p) => ["escalated", "needs_review"].includes(stored.annotations[p].review.state)) : [];
  const unacked = stored ? stored.extracted.anomalies.map((_, i) => i).filter((i) => !stored.anomalyAcks[i]) : [];
  const canApprove = editable && blocking.length === 0 && unacked.length === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
      <section aria-label="Subcontract PDF" className="min-w-0">
        {documentUrl ? (
          <iframe key={page} title={`${subName} subcontract, page ${page}`} src={`${documentUrl}#page=${page}&view=FitH`} className="h-[82vh] w-full rounded-xl bg-card shadow-card" />
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
                  ? `Version ${ruleSet.version}, approved by ${ruleSet.approvedByName ?? "the controller"}`
                  : `Version ${ruleSet.version}, read by ${ruleSet.model ?? "the model"}${ruleSet.extractionMs ? ` in ${(ruleSet.extractionMs / 1000).toFixed(0)} seconds` : ""}`
                : "Not read yet"}
            </p>
          </div>
          {canCompile && (
            <div className="flex gap-2">
              <Button onClick={() => compile("model")} disabled={compiling !== null} variant={ruleSet ? "outline" : "money"} size="sm">
                <Sparkles className="h-4 w-4" aria-hidden />
                {compiling === "model" ? "Reading the contract…" : ruleSet ? "Read it again" : "Read the contract"}
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
          <div className="mt-4 rounded-xl bg-surface-sunken p-6 text-sm leading-relaxed">
            <p className="font-medium">This subcontract has not been read yet.</p>
            <p className="mt-1 text-muted-foreground">Claude reads it once and proposes payment rules, each with the clause it came from. Groundwork checks every quote against the PDF, applies the state&rsquo;s law, and brings anything doubtful to you. You approve once.</p>
          </div>
        )}

        {stored && ruleSet && (
          <div className="mt-4 space-y-5">
            {ruleSet.status === "approved" && (
              <div className="flex items-start gap-2.5 text-sm">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-settled" aria-hidden />
                <div className="min-w-0">
                  <div className="font-medium">Approved and frozen</div>
                  <div className="text-[13px] text-muted-foreground">The engine pays from these rules. Any edit creates a new version.</div>
                  <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={ruleSet.approvedHash ?? ""}>
                    sha256 {ruleSet.approvedHash}
                  </div>
                </div>
              </div>
            )}

            <Overlay stored={stored} />

            {FIELD_GROUPS.map((g) => (
              <section key={g.title} aria-labelledby={`g-${g.title}`}>
                <h3 id={`g-${g.title}`} className="text-sm font-semibold">
                  {g.title}
                </h3>
                <ul className="mt-2 divide-y rounded-xl bg-card shadow-card">
                  {g.paths.map((p) => (
                    <FieldRow key={p} path={p} extracted={stored.extracted} stored={stored} editable={editable} contractId={contractId} ruleSetId={ruleSet.id} onJump={setPage} />
                  ))}
                </ul>
              </section>
            ))}

            {stored.extracted.anomalies.length > 0 && (
              <section aria-labelledby="anomalies">
                <h3 id="anomalies" className="text-sm font-semibold">
                  Things Claude wants you to look at
                </h3>
                <ul className="mt-2 space-y-2">
                  {stored.extracted.anomalies.map((a, i) => {
                    const ack = stored.anomalyAcks[i];
                    return (
                      <li key={i} className="rounded-xl bg-card p-4 text-sm shadow-card">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${ack ? "text-muted-foreground" : "text-hold"}`} aria-hidden />
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">{fieldLabelSafe(a.field)}</div>
                            <div>{a.description}</div>
                            {a.evidence && (
                              <button type="button" onClick={() => setPage(a.evidence!.page)} className="type-contract mt-1.5 block text-left text-[13px] text-muted-foreground hover:text-foreground">
                                &ldquo;{a.evidence.quote}&rdquo; <span className="font-sans text-xs">page {a.evidence.page}</span>
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
              <form action={approveRuleSetAction} className="sticky bottom-4 rounded-xl bg-card p-3 shadow-float">
                <input type="hidden" name="contractId" value={contractId} />
                <input type="hidden" name="ruleSetId" value={ruleSet.id} />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {canApprove
                      ? "Every term is verified or settled. Approving freezes version " + ruleSet.version + "."
                      : `${blocking.length} term${blocking.length === 1 ? "" : "s"} and ${unacked.length} flag${unacked.length === 1 ? "" : "s"} still need your decision.`}
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
    <div className="rounded-xl bg-surface-sunken p-4 text-[13px]">
      <div className="font-medium">
        {o.loaded ? `What ${STATE_LAW[o.state]?.name ?? o.state} law adds` : `No record for ${o.state}`}
      </div>
      <div className="mt-0.5 text-muted-foreground">Applied by code from the governing-law clause. The model never decides this.</div>
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

  const state = review.state;
  const pageNo = verification.page ?? f.evidence?.page ?? null;
  // One line says where this term stands. Only what needs attention gets a color.
  const status: { tone: "quiet" | "ok" | "hold" | "bad"; icon: typeof CheckCircle2; text: string } =
    state === "escalated"
      ? { tone: "bad", icon: OctagonAlert, text: "Needs your decision" }
      : state === "needs_review"
        ? { tone: "hold", icon: AlertTriangle, text: "Please check" }
        : state === "accepted"
          ? { tone: "ok", icon: CheckCircle2, text: "You accepted this" }
          : state === "overridden"
            ? { tone: "ok", icon: CheckCircle2, text: "You changed this" }
            : !f.evidence
              ? { tone: "quiet", icon: FileSearch, text: f.not_found ? "Not in the contract" : "No quote" }
              : verification.status === "exact"
                ? { tone: "ok", icon: CheckCircle2, text: "Found in the PDF" }
                : verification.status === "fuzzy"
                  ? { tone: "hold", icon: FileSearch, text: `Close match, ${Math.round((verification.score ?? 0) * 100)}%` }
                  : { tone: "bad", icon: OctagonAlert, text: "Quote not in the PDF" };
  const tone = { quiet: "text-muted-foreground", ok: "text-settled", hold: "text-hold", bad: "text-destructive" }[status.tone];

  return (
    <li className={`px-4 py-3.5 ${needsAction ? "bg-hold-soft/50" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] text-muted-foreground">
            {fieldLabel(path)}
            {RULE_IDS[path] && <span className="num ml-1.5 text-xs">({RULE_IDS[path]})</span>}
          </div>
          <div className={`mt-0.5 text-[15px] font-semibold leading-snug ${value === null ? "font-normal text-muted-foreground" : ""}`}>
            {formatRuleValue(path, value)}
            {review.override && <span className="ml-2 text-xs font-normal text-muted-foreground line-through">{formatRuleValue(path, f.value)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[13px]">
          <status.icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden />
          <span className={status.tone === "quiet" || status.tone === "ok" ? "text-muted-foreground" : `font-medium ${tone}`}>{status.text}</span>
        </div>
      </div>
      {f.evidence && (
        <button type="button" onClick={() => onJump(pageNo ?? 1)} className="type-contract mt-2 block text-left text-[13.5px] text-muted-foreground transition-colors hover:text-foreground" title="Show this page of the contract">
          &ldquo;{f.evidence.quote}&rdquo; <span className="whitespace-nowrap font-sans text-xs">page {pageNo}</span>
          {f.evidence.confidence !== "high" && <span className="ml-2 whitespace-nowrap font-sans text-xs text-hold">the model was {f.evidence.confidence === "low" ? "unsure" : "not certain"}</span>}
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

function Skeletons() {
  return (
    <ul className="mt-4 space-y-2" aria-label="Reading the contract">
      {RULE_FIELDS.slice(0, 12).map((p, i) => (
        <li key={p} className="animate-pulse rounded-xl bg-card p-4 shadow-card" style={{ animationDelay: `${i * 90}ms` }}>
          <div className="h-2.5 w-24 rounded bg-muted" />
          <div className="mt-2 h-3.5 w-40 rounded bg-muted" />
          <div className="mt-2 h-2.5 w-full rounded bg-muted/70" />
        </li>
      ))}
    </ul>
  );
}

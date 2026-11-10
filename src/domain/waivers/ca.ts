/**
 * Lien waiver and release forms.
 *
 * California's four statutory forms (Civ. Code §§8132, 8134, 8136, 8138) are reproduced in the
 * statute's structure; the statute fixes the fields and we fill them deterministically from the
 * release. Every other state gets a general-form waiver of the same four kinds. Where a state
 * prescribes its own statutory form, the draft says so on its face and names the statute, because a
 * general form is not a substitute for the prescribed text.
 *
 * The form ids are the four kinds (conditional/unconditional x progress/final); their names keep the
 * California section numbers they were first built for.
 */
import { STATE_LAW } from "../statutes";

export type WaiverFormId = "cp_8132" | "up_8134" | "cf_8136" | "uf_8138";

export type WaiverFields = {
  form: WaiverFormId;
  /** Governing state. Absent on waivers drafted before other states were supported: California. */
  state?: string;
  claimant: string; // the subcontractor
  customer: string; // the party that hired the claimant (the GC)
  jobLocation: string;
  owner: string;
  /** Progress forms only. */
  throughDate: string | null;
  /** cents; progress forms: amount of this payment; final unconditional: none. */
  amountCents: number | null;
  /** Final forms: disputed claims carved out. */
  disputedClaimsCents: number | null;
  exceptions: string | null;
};

export const WAIVER_TITLES: Record<WaiverFormId, { title: string; cite: string; conditional: boolean; final: boolean }> = {
  cp_8132: { title: "Conditional Waiver and Release on Progress Payment", cite: "Civ. Code §8132", conditional: true, final: false },
  up_8134: { title: "Unconditional Waiver and Release on Progress Payment", cite: "Civ. Code §8134", conditional: false, final: false },
  cf_8136: { title: "Conditional Waiver and Release on Final Payment", cite: "Civ. Code §8136", conditional: true, final: true },
  uf_8138: { title: "Unconditional Waiver and Release on Final Payment", cite: "Civ. Code §8138", conditional: false, final: true },
};

/** Title, citation and kind for a form in a given state. */
export function waiverMeta(form: WaiverFormId, state: string = "CA"): { title: string; cite: string; conditional: boolean; final: boolean; statutory: boolean; notice: string | null } {
  const t = WAIVER_TITLES[form];
  if (state === "CA") return { ...t, statutory: true, notice: null };
  const law = STATE_LAW[state]?.lienWaiver;
  const notices: string[] = [];
  if (law?.statutoryFormRequired) notices.push(`${STATE_LAW[state].name} prescribes a statutory form for this waiver (${law.cite}). This general-form draft must be replaced with the statutory text before it is relied on.`);
  if (law?.notarizationRequired) notices.push("This state requires the waiver to be notarized; a typed electronic signature alone is not enough.");
  return { title: t.title, cite: law?.statutoryFormRequired ? `General form · statutory form required by ${law.cite}` : `General form · ${state}`, conditional: t.conditional, final: t.final, statutory: false, notice: notices.join(" ") || null };
}

/** General-form waiver for states other than California, in our own words. */
function generalBody(f: WaiverFields, state: string): string[] {
  const m = waiverMeta(f.form, state);
  const amount = f.amountCents === null ? null : `$${(f.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const lines: string[] = [m.title.toUpperCase(), `(${STATE_LAW[state]?.name ?? state} · general form)`, ""];
  if (m.notice) lines.push(`NOTICE: ${m.notice.toUpperCase()}`, "");
  lines.push(
    m.conditional
      ? "NOTICE: THIS WAIVER TAKES EFFECT ONLY WHEN THE CLAIMANT ACTUALLY RECEIVES THE PAYMENT STATED BELOW. DO NOT RELY ON IT UNTIL PAYMENT HAS CLEARED."
      : "NOTICE TO CLAIMANT: THIS WAIVER IS UNCONDITIONAL. SIGN IT ONLY IF YOU HAVE ALREADY BEEN PAID THE AMOUNT STATED BELOW.",
  );
  lines.push("", "Identifying Information");
  lines.push(`Name of Claimant: ${f.claimant}`, `Name of Customer: ${f.customer}`, `Job Location: ${f.jobLocation}`, `Owner: ${f.owner}`);
  if (f.throughDate) lines.push(`Through Date: ${f.throughDate}`);
  if (amount !== null) lines.push(`Amount of Payment: ${amount}`);
  lines.push("");
  const scope = m.final ? "all labor, services, equipment and materials furnished to the customer on this job" : "labor, services, equipment and materials furnished to the customer on this job through the Through Date";
  lines.push(
    m.conditional
      ? `Conditional Waiver and Release: On receipt of the payment stated above, the claimant waives and releases its lien, bond and payment claim rights for ${scope}. This document has no effect until the claimant receives that payment.`
      : `Unconditional Waiver and Release: The claimant has received the payment stated above and waives and releases its lien, bond and payment claim rights for ${scope}.`,
  );
  lines.push("", "Exceptions");
  lines.push(f.exceptions ?? (m.final ? "Disputed claims in the amount of: $0.00" : "This document does not cover retainage, unpaid extras, or work furnished after the Through Date."));
  return lines;
}

export function unconditionalCounterpart(form: WaiverFormId): WaiverFormId {
  return form === "cp_8132" ? "up_8134" : form === "cf_8136" ? "uf_8138" : form;
}

/** Plain-text body in the statute's structure (rendered to PDF and shown on screen). */
export function waiverBody(f: WaiverFields): string[] {
  if (f.state && f.state !== "CA") return generalBody(f, f.state);
  const t = WAIVER_TITLES[f.form];
  const amount = f.amountCents === null ? null : `$${(f.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const lines: string[] = [t.title.toUpperCase(), `(California Civil Code Section ${t.cite.replace("Civ. Code §", "")})`, ""];
  if (t.conditional && !t.final) {
    lines.push(
      "NOTICE: THIS DOCUMENT WAIVES THE CLAIMANT'S LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT. A PERSON SHOULD NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT THE CLAIMANT HAS RECEIVED PAYMENT.",
    );
  } else if (!t.conditional && !t.final) {
    lines.push(
      "NOTICE TO CLAIMANT: THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS DOCUMENT IS ENFORCEABLE AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE NOT BEEN PAID. IF YOU HAVE NOT BEEN PAID, USE A CONDITIONAL WAIVER AND RELEASE FORM.",
    );
  } else if (t.conditional && t.final) {
    lines.push(
      "NOTICE: THIS DOCUMENT WAIVES THE CLAIMANT'S LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT. A PERSON SHOULD NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT THE CLAIMANT HAS RECEIVED PAYMENT.",
    );
  } else {
    lines.push(
      "NOTICE TO CLAIMANT: THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS. THIS DOCUMENT IS ENFORCEABLE AGAINST YOU IF YOU SIGN IT, EVEN IF YOU HAVE NOT BEEN PAID. IF YOU HAVE NOT BEEN PAID, USE A CONDITIONAL WAIVER AND RELEASE FORM.",
    );
  }
  lines.push("", "Identifying Information");
  lines.push(`Name of Claimant: ${f.claimant}`);
  lines.push(`Name of Customer: ${f.customer}`);
  lines.push(`Job Location: ${f.jobLocation}`);
  lines.push(`Owner: ${f.owner}`);
  if (f.throughDate) lines.push(`Through Date: ${f.throughDate}`);
  if (amount !== null) lines.push(`${t.conditional ? "Amount of Payment" : "Amount of Unconditional Waiver and Release"}: ${amount}`);
  lines.push("");
  if (t.conditional) {
    lines.push(
      t.final
        ? "Conditional Waiver and Release: This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for all labor and service provided, and equipment and material delivered, to the customer on this job. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, are waived and released by this document, unless listed as an Exception below. This document is effective only on the claimant's receipt of payment from the financial institution on which the following check is drawn."
        : "Conditional Waiver and Release: This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for labor and service provided, and equipment and material delivered, to the customer on this job through the Through Date of this document. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, are waived and released by this document, unless listed as an Exception below. This document is effective only on the claimant's receipt of payment from the financial institution on which the following check is drawn.",
    );
  } else {
    lines.push(
      t.final
        ? "Unconditional Waiver and Release: This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for all labor and service provided, and equipment and material delivered, to the customer on this job. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, are waived and released by this document, unless listed as an Exception below. The claimant has been paid in full."
        : "Unconditional Waiver and Release: This document waives and releases lien, stop payment notice, and payment bond rights the claimant has for labor and service provided, and equipment and material delivered, to the customer on this job through the Through Date of this document. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the claimant, are waived and released by this document, unless listed as an Exception below. The claimant has received the following progress payment.",
    );
  }
  lines.push("", "Exceptions");
  lines.push(f.exceptions ?? (t.final ? "Disputed claims for extras in the amount of: $0.00" : "This document does not affect any of the following: (1) Retentions. (2) Extras for which the claimant has not received payment. (3) Contract rights, including (A) a right based on rescission, abandonment, or breach of contract, and (B) the right to recover compensation for work not compensated by the payment."));
  return lines;
}

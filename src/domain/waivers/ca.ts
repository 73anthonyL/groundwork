/**
 * California statutory waiver and release forms (Civ. Code §§8132, 8134, 8136, 8138).
 * The statute fixes the fields; we fill them deterministically from the release.
 */
export type WaiverFormId = "cp_8132" | "up_8134" | "cf_8136" | "uf_8138";

export type WaiverFields = {
  form: WaiverFormId;
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

export function unconditionalCounterpart(form: WaiverFormId): WaiverFormId {
  return form === "cp_8132" ? "up_8134" : form === "cf_8136" ? "uf_8138" : form;
}

/** Plain-text body in the statute's structure (rendered to PDF and shown on screen). */
export function waiverBody(f: WaiverFields): string[] {
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

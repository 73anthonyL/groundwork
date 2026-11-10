/** Status words from the subcontractor's side of the table. Same icons and tones as the contractor's maps. */
import { CONTRACT, PAY_APP, RELEASE, type StatusMap } from "@/components/status-pill";

export const SUB_CONTRACT: StatusMap = {
  ...CONTRACT,
  draft: { ...CONTRACT.draft, label: "Waiting for contractor" },
  compiling: { ...CONTRACT.compiling, label: "Waiting for contractor" },
  in_review: { ...CONTRACT.in_review, label: "Rules in review" },
};

export const SUB_PAY_APP: StatusMap = {
  ...PAY_APP,
  submitted: { ...PAY_APP.submitted, label: "In review" },
  changes_requested: { ...PAY_APP.changes_requested, label: "Sent back to you" },
  funded: { ...PAY_APP.funded, label: "Funded by owner" },
};

export const SUB_RELEASE: StatusMap = {
  ...RELEASE,
  awaiting_waiver: { ...RELEASE.awaiting_waiver, label: "Needs your signature" },
  blocked: { ...RELEASE.blocked, label: "On hold" },
};

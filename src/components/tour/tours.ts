/**
 * The guided tours of the sample workspace, one per kind of company.
 *
 * A tour is a set of chapters. A chapter belongs to one kind of page (`match` tests the address) and
 * plays the first time the visitor lands on such a page, so the tour follows them through the real
 * task instead of dragging them along a fixed path. `missions` is the short list of things to try,
 * shown in the guide; a mission is ticked once any of its chapters has played.
 *
 * A step points at `target` (a CSS selector; pages mark sections with `data-tour`). A step with no
 * target is shown in the middle of the screen. An `optional` step is skipped when its target is not
 * on the page, which is how one script copes with whatever state the sample data is in.
 */
export type TourKind = "gc" | "sub" | "owner";
export type TourStep = { id: string; target?: string; title: string; body: string; optional?: boolean };
export type TourChapter = { id: string; match: (path: string) => boolean; steps: TourStep[] };
export type TourMission = { label: string; href: string; chapters: string[] };
export type Tour = { chapters: TourChapter[]; missions: TourMission[] };

const exact = (p: string) => (path: string) => path === p;
const under = (prefix: string) => (path: string) => path.startsWith(prefix) && path.length > prefix.length;

const GC: Tour = {
  missions: [
    { label: "Review a pay app", href: "/gc/pay-apps", chapters: ["gc-payapp"] },
    { label: "Record an owner payment", href: "/gc/projects", chapters: ["gc-project"] },
    { label: "See how one payment was worked out", href: "/gc/payments", chapters: ["gc-payment"] },
    { label: "Check a subcontract's payment rules", href: "/gc/projects", chapters: ["gc-contract"] },
  ],
  chapters: [
    {
      id: "gc-home",
      match: exact("/gc"),
      steps: [
        { id: "welcome", title: "You are the contractor's controller", body: "The owner pays your company, and you pay each subcontractor the right amount, on time, with the right paperwork. This tour points things out as you go. You can click anything at any time." },
        { id: "attention", target: '[data-tour="gc-attention"]', title: "Start with what is waiting on you", body: "Pay apps to review, payment rules to approve and payments that need a hand are listed here, each with one button.", optional: true },
        { id: "projects", target: '[data-tour="gc-projects"]', title: "Then open a project", body: "Each project shows what you owe subcontractors now, what is paid and the retainage you hold. Click a project name to go in.", optional: true },
      ],
    },
    {
      id: "gc-project",
      match: (p) => /^\/gc\/projects\/[^/]+$/.test(p) && p !== "/gc/projects/new",
      steps: [
        { id: "money", target: '[data-tour="project-money"]', title: "What you owe right now", body: "This is the money already split out of owner payments and not yet paid to subcontractors, with the nearest deadline.", optional: true },
        { id: "record", target: "#record-owner-payment", title: "Record the owner's payment", body: "When the owner pays you, record it here. Sample values are filled in, so try it: Groundwork splits the payment between the approved pay apps, holds retainage and starts each deadline.", optional: true },
        { id: "flow", target: '[data-tour="project-flow"]', title: "Watch the money move", body: "Each owner payment flows from the owner, through you, to each subcontractor. Press play to step through the payments.", optional: true },
        { id: "latest", target: '[data-tour="project-latest"]', title: "How the latest payment was split", body: "One row per subcontractor: what was funded, the retainage held and the net payment. Click a name to see the arithmetic and the clause behind it.", optional: true },
      ],
    },
    {
      id: "gc-payapps",
      match: exact("/gc/pay-apps"),
      steps: [{ id: "list", target: "main table", title: "Pay apps from your subcontractors", body: "Open one marked Needs review. Groundwork has already checked its arithmetic against the approved payment rules.", optional: true }],
    },
    {
      id: "gc-payapp",
      match: under("/gc/pay-apps/"),
      steps: [
        { id: "requirements", target: '[data-tour="payapp-requirements"]', title: "Checked before you read it", body: "Each requirement is arithmetic against the payment rules you approved. Open a failed one to see the figures and the contract clause it rests on." },
        { id: "decision", target: '[data-tour="payapp-decision"]', title: "Your decision", body: "Approve it, send it back with a note, or approve with the corrected amount when Groundwork can fix the figure from the rules.", optional: true },
      ],
    },
    {
      id: "gc-contract",
      match: under("/gc/contracts/"),
      steps: [
        { id: "pdf", target: 'section[aria-label="Subcontract PDF"]', title: "The signed subcontract", body: "The PDF stays beside the rules. Click a page number next to any quote to jump to the clause." },
        { id: "decisions", target: '[aria-labelledby="decisions-heading"]', title: "Only the terms that need you", body: "Claude reads 21 payment terms. The ones it was unsure of, or that state law overrides, wait here for you to accept or change.", optional: true },
        { id: "law", target: '[aria-labelledby="law-heading"]', title: "State law, applied by fixed rules", body: "For each term you see what the contract says, what state law says and which one Groundwork applies.", optional: true },
      ],
    },
    {
      id: "gc-payments",
      match: exact("/gc/payments"),
      steps: [{ id: "list", target: "main table", title: "Every payment to a subcontractor", body: "Click a subcontractor's name to see how that payment was worked out and where it stands.", optional: true }],
    },
    {
      id: "gc-payment",
      match: under("/gc/releases/"),
      steps: [
        { id: "math", target: '[data-tour="payment-math"]', title: "How the amount was worked out", body: "What the owner funded, less retainage and any backcharge. The same inputs always give the same payment." },
        { id: "sources", target: '[data-tour="payment-sources"]', title: "Every figure has a source", body: "Each number and the deadline trace back to a clause in the subcontract or to a statute.", optional: true },
        { id: "timeline", target: '[data-tour="payment-timeline"]', title: "Where the payment stands", body: "Waiver requested, waiver signed, payment sent, paid. The next step and its deadline are always shown.", optional: true },
      ],
    },
  ],
};

const SUB: Tour = {
  missions: [
    { label: "Do the first thing on your to-do list", href: "/sub", chapters: ["sub-sign", "sub-bill"] },
    { label: "Read your payment rules", href: "/sub", chapters: ["sub-contract"] },
    { label: "Track a payment to its due date", href: "/sub/payments", chapters: ["sub-payments"] },
  ],
  chapters: [
    {
      id: "sub-home",
      match: exact("/sub"),
      steps: [
        { id: "welcome", title: "You run a subcontractor's office", body: "You bill for each period, sign a lien waiver when a payment is ready, and want to know when your money arrives. This tour points things out as you go. You can click anything at any time." },
        { id: "todo", target: '[data-tour="sub-todo"]', title: "Your to-do list", body: "A waiver to sign or a period to bill shows up here with one button. Try the first one.", optional: true },
        { id: "money", target: '[aria-labelledby="money-heading"]', title: "Where your money is", body: "What is on its way to you, the date the contractor must pay by, and where that deadline comes from.", optional: true },
        { id: "contracts", target: '[data-tour="sub-contracts"]', title: "Your contracts", body: "Open a contract to read its payment rules in plain words and follow each payment step by step.", optional: true },
      ],
    },
    {
      id: "sub-contract",
      match: under("/sub/contracts/"),
      steps: [
        { id: "rules", target: '[data-tour="sub-rules"]', title: "Your payment rules, in plain words", body: "When you are paid, what is held back, what you sign and what can be deducted, each beside the clause it came from." },
        { id: "payapps", target: "#pay-apps", title: "Your pay apps", body: "Everything you have billed on this contract and where each pay app stands.", optional: true },
        { id: "payments", target: "#payments", title: "Each payment, step by step", body: "From the owner paying the contractor to the money reaching you, with the date it is due.", optional: true },
      ],
    },
    {
      id: "sub-bill",
      match: exact("/sub/pay-apps/new"),
      steps: [
        { id: "sov", target: '[aria-labelledby="sov-heading"]', title: "Bill against the schedule of values", body: "Enter what you completed this period on each line. Totals, percent complete and the balance update as you type.", optional: true },
        { id: "summary", target: '[data-tour="payapp-summary"]', title: "Retainage is worked out for you", body: "The amount withheld comes from your contract's rate. Change it only if you mean to; the contractor sees the difference.", optional: true },
      ],
    },
    {
      id: "sub-sign",
      match: under("/sub/waivers/"),
      steps: [
        { id: "doc", target: '[aria-labelledby="doc-heading"]', title: "Read the waiver", body: "This is the form your state requires, filled in with this payment's amount and dates." },
        { id: "sign", target: '[data-tour="waiver-sign"]', title: "Sign to release your payment", body: "Type your name and confirm. A conditional waiver takes effect only when the money reaches you.", optional: true },
      ],
    },
    {
      id: "sub-payments",
      match: exact("/sub/payments"),
      steps: [{ id: "list", target: "main table", title: "Every payment to your company", body: "Each row shows where a payment stands and when it is due or was paid. Click one to see its steps.", optional: true }],
    },
  ],
};

const OWNER: Tour = {
  missions: [{ label: "See where your payments went", href: "/owner", chapters: ["owner-home", "owner-project"] }],
  chapters: [
    {
      id: "owner-home",
      match: exact("/owner"),
      steps: [
        { id: "welcome", title: "You represent the building's owner", body: "You pay the contractor, and here you can see how far each payment has travelled to the subcontractors doing the work. You can look at everything and change nothing." },
        { id: "table", target: "main table", title: "Your projects", body: "For each project: what has reached subcontractors, what is on its way and the retainage held.", optional: true },
        { id: "flow", target: '[aria-labelledby="flow-heading"]', title: "Follow your money", body: "Your payments enter on the left and reach each subcontractor on the right. Press play to step through them.", optional: true },
        { id: "clocks", target: '[aria-labelledby="clocks-heading"]', title: "Deadlines the contractor is working to", body: "Each payment still on its way, with the date the subcontractor must be paid by.", optional: true },
      ],
    },
    {
      id: "owner-project",
      match: under("/owner/projects/"),
      steps: [
        { id: "flow", target: '[aria-labelledby="flow-heading"]', title: "Follow your money", body: "Your payments enter on the left and reach each subcontractor on the right. Press play to step through them.", optional: true },
        { id: "clocks", target: '[aria-labelledby="clocks-heading"]', title: "Deadlines the contractor is working to", body: "Each payment still on its way, with the date the subcontractor must be paid by.", optional: true },
      ],
    },
  ],
};

export const TOURS: Record<TourKind, Tour> = { gc: GC, sub: SUB, owner: OWNER };

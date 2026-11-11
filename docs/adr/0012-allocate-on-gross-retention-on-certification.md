# 0012. Allocate on gross; release retention on a person's certification

- Status: Accepted, open to overrule
- Date: 2026-11-10
- Evidence: commit `17e0def`; listed as open in `docs/DECISIONS.md`

## Context

Two modelling questions had to be settled to build retention release and partial funding:

1. When an owner payment is short, what is being divided: the gross value of the work, or the net after retainage?
2. A contract's retention release condition is free text, sometimes subjective ("to Contractor's satisfaction"). What makes retainage payable?

## Decision

1. The engine allocates on gross. The owner pays for work in place; the contractor withholds retainage from each subcontractor's share and holds it. The owner's own retainage against the contractor is not modelled, so an owner retention payment is the trigger for releasing certified retainage, not the source of the money.
2. Retainage is released on certification. The controller records that the contract's release condition has been met for a share of the retainage held (`certifyRetention` in `src/server/actions/adjustments.ts`). The engine pays it out on the next funding event that includes retention, by the shorter of the contract's release period and the statutory pass-through deadline.

Related choices made at the same time: backcharges are per contract and require a setoff clause in the approved rules; lower-tier agreements cannot carry retainage because there is no certification one hop down.

## Consequences

- The engine never interprets free text. The decision that a condition was met is a recorded human act with a name and a note.
- Every demo figure follows from gross allocation; changing it changes them all.
- A contractor whose owner withholds retainage is modelled as fully funded on gross, which overstates the cash it holds.
- Retainage certified but not yet funded by an owner retention payment waits, and the engine says so with a warning.
- Both decisions are listed in `docs/DECISIONS.md` as made overnight and open to overrule. The alternative for (2) is typing release conditions into structured milestones at compile time.

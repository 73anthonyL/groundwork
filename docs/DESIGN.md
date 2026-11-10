# Design

How Groundwork should look and read, why, and where to change it. Written after reading Apple's Human Interface Guidelines and several WWDC design talks, Apple's own web CSS, and what designers have published about generic generated interfaces. Sources are at the end.

## The idea

Groundwork turns a paper contract into moving money. The interface shows both halves and keeps them apart:

- **The contract speaks in the serif.** Any text quoted from a subcontract or a statutory form is set in Newsreader (`type-contract`): the clause behind an extracted term, a flagged passage, the waiver a sub signs, the page in the landing hero.
- **Groundwork speaks in the sans.** Everything the software says is Archivo: labels, figures, buttons, explanations. Archivo has a width axis; body text runs at normal width and the two top heading levels are set at 112%, like the lettering in a drawing's title block.
- **The page is a drawing sheet.** Every screen sits on a faint drafting grid (`drafting-grid`, 24px with a heavier line every fifth). The landing page opens on a blueprint (`blueprint`: white linework on blue) with the contract page laid on top, and its opening pieces rise in one staggered sequence (`reveal`, ordered by `--i`). Grid and blueprint colors are theme variables (`--grid-line`, `--blueprint`), so a theme can turn them off.

That split is the one distinctive move. Everything around it is kept quiet so it reads.

## Principles

1. **One thing is the point of each screen.** The board leads with what is owed now and the next deadline. The sub's home leads with what is coming to them. Everything else is smaller. (Apple: "focus on what matters most"; hierarchy from layout and size, not decoration.)
2. **Color is information.** Blue is something you can act on. Orange is a clock running or money on its way. Green has landed. Amber is held or waiting on someone. Red is late or failed. Nothing is colored for looks, and color never carries meaning alone: there is always a word or an icon beside it.
3. **Tables for tabular things.** Money in rows with hairlines between them, noun column headings, figures right-aligned in tabular numerals, the same column widths from one payment to the next so numbers line up down the page. No card per row, no zebra stripes, no vertical rules.
4. **Groups are made with space or one hairline.** A sheet is a white surface with a hairline edge. Never a border and a shadow and a fill together. Only floating things (the approve bar) cast a shadow. Only the top bar is translucent.
5. **Say it in a sentence.** Where five boxed statistics used to sit, there is one figure and a sentence. Buttons say what they do ("Record owner payment", "Sign the waiver to release $45,000.00"). Empty screens say what will appear and what to do. No uppercase eyebrow labels, no arrows on links, no strings of facts joined by dots where a sentence would do.
6. **Motion answers something.** The landing page has one sequence on load (clauses are marked, rules appear, the payment splits). In the app, motion follows an action: recording a payment plays the money flow. Nothing fades in because you scrolled to it. Springs, no bounce, under 400 ms, off when the viewer asks for reduced motion.

## Tokens

All in `src/app/globals.css`. A theme is one block of variables; every color in the app reads them.

| Token | Paper (default) | Use |
|---|---|---|
| `--background` | `#f6f6f4` | The page |
| `--card` | `#ffffff` | Sheets |
| `--foreground` | `#1c1c1e` | Ink |
| `--muted-foreground` | `#6a6a6f` | Secondary text |
| `--border` | black at 9% | Hairlines |
| `--link` | `#1f4ed8` | Links and the one primary button per region |
| `--money` | `#d9541a` | A running clock, money on its way |
| `--settled` | `#1d7a54` | Landed |
| `--hold` | `#9a6410` | Held, waiting on someone |
| `--radius` | 10px | Sheets 12px, controls 8px, pills only for segmented controls |

Other themes ship for comparison and can be switched in `/lab`: **Concrete** (the original look), **Ink**, **Night**.

**Type.** One family for the interface, one for the contract.

| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Landing headline | 72 / 1.04 | 600 | -0.03em |
| Page title | 32 / 1.2 | 600 | -0.022em |
| The figure a screen is about | 48 to 60 | 600 | tight |
| Section heading | 20 | 600 | -0.014em |
| Body in the app | 14 / 20 | 400 | 0 |
| Body on the landing page | 17 / 1.6 | 400 | 0 |
| Secondary and table headings | 12 to 13 | 400 to 500 | 0 |
| Contract text | 1.02em / 1.5, Newsreader | 400 | 0 |

Figures use lining tabular numerals everywhere (`.num`, `type-numeral`). The monospace face is only for hashes.

**Motion.** `src/lib/motion.ts` is the only file that sets a spring or a duration.

## Components

- **Button** (`ui/button.tsx`): the `money` variant is the one filled blue action in a region; `outline` for everything else; press scales to 0.97.
- **Status** (`status-pill.tsx`): an icon and a word. The icon takes the color; the word stays ink.
- **Deadline** (`countdown.tsx`): plain text. It turns orange inside 48 hours and red when late.
- **Sheet**: `rounded-xl bg-card shadow-card`. `shadow-card` is a hairline, not a drop shadow.
- **Top bar** (`app-shell.tsx`, `nav-links.tsx`): 48px, translucent, the current section in ink.
- **Charts** (`components/viz`): each takes JSON from the read model. `/lab` shows them all with the file and endpoint behind each.

## What was removed, and why

| Was | Now | Reason |
|---|---|---|
| Five boxed, colored statistics on the board | One figure, one sentence, three quiet figures | One primary number per view; stat banners are a known template tell |
| Colored pill for every status | Icon and word | Apple: do not color the background of many controls; a column of stickers is hard to scan |
| Orange amounts, clocks and buttons | Blue for actions, orange only for a running clock | One accent; a color should not mean two things |
| Uppercase monospace labels above headings | Sentence-case labels, or none | The most common generated-page tell |
| Nine identical persona cards with black buttons | The payment chain, a row per person | Rows for lists; the layout now explains the domain |
| Dark hero with a statistic | A real clause becoming rules and a payment | Lead with the most characteristic thing in the product |
| Count-up numbers and fade-ins on scroll | One load sequence on the landing page | Motion only with a reason |

## Open for your call

- **The accent.** Blueprint blue was chosen because blue reads as "you can act on this" and leaves orange free to mean urgency. If you want Groundwork to own the orange, set `--link` to it and pick another hue for clocks.
- **Serif figures.** `/lab` has a type switch that sets the big figures in the serif. It is off by default so the serif keeps its one job.
- **Density.** The app body is 14px. Apple's desktop body is 13, its web body 17. Raise it in `globals.css` if it feels small on a projector.
- **Dark mode.** Night exists but nothing switches to it automatically.

## Sources

- Apple, Human Interface Guidelines: design principles, typography, layout, color, materials, motion, writing, buttons, lists and tables. developer.apple.com/design/human-interface-guidelines
- Apple WWDC talks: Essential Design Principles (2017), Designing Fluid Interfaces (2018), The details of UI typography (2020), Animate with springs (2023), Get to know the new design system (2025).
- apple.com production CSS (type scale, widths, timings).
- Vercel, Web Interface Guidelines. vercel.com/design/guidelines
- Emil Kowalski on animation; Rauno Freiberg on interaction details; Anthony Hobday, Safe rules for visual design.
- Matthew Butterick, Practical Typography; Matt Ström and A List Apart on tables.
- Linear, How we redesigned the Linear UI.
- Adrian Krebs, Capital & Compute, Utsubo and others on the tells of generated design.
- The `TristanMarston/sift` design system: three fonts with strict jobs, one shared spring set, a written system beside the code.

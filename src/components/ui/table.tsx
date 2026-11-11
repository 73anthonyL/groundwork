/**
 * Table: full container width, in a paper panel with a 1px frame and a tinted header row.
 *
 *   <Table>                                   // density="compact" for 32px line-item rows; bare to drop the frame (inside a Panel)
 *     <TableHeader><TableRow>
 *       <TableHead>Subcontractor</TableHead><TableHead numeric>Paid</TableHead>
 *     </TableRow></TableHeader>
 *     <TableBody>
 *       <TableRow>
 *         <TableCell><TableLink href="/gc/…">Apex Electric</TableLink></TableCell>
 *         <TableCell numeric>$12,400.00</TableCell>          // right-aligned Plex Mono, tabular
 *       </TableRow>
 *       <TableEmpty colSpan={2} action={<Button size="sm">Add subcontract</Button>}>No subcontracts yet.</TableEmpty>
 *     </TableBody>
 *     <TableFoot><TableRow><TableCell>Total</TableCell><TableCell numeric>$12,400.00</TableCell></TableRow></TableFoot>
 *   </Table>
 *
 * Rows are 40px, cells 14/400, headers 13/500 muted, cell padding 12px (16px at the panel's edges). Row hover changes the
 * background with no transition. An empty table keeps its headers and shows one TableEmpty row.
 * TableCell / TableHead take `numeric` (money, counts) and `muted` (cell only: 13px secondary text).
 * TableChevron is an optional last cell for rows that open a page. TableFooter is an alias of TableFoot.
 */
import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "cn"
import { CompanyMark } from "./company-mark"

function Table({
  className,
  density = "default",
  bare = false,
  ...props
}: React.ComponentProps<"table"> & { density?: "default" | "compact"; bare?: boolean }) {
  return (
    <div data-slot="table-container" className={cn("relative w-full overflow-x-auto", !bare && "rounded-lg border bg-card [&_thead]:bg-muted/60")}>
      <table data-slot="table" data-density={density} className={cn("group/table w-full caption-bottom border-collapse text-sm leading-5", className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b [&_tr]:hover:bg-transparent", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}

function TableFoot({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-foot" className={cn("border-t font-semibold [&_tr]:border-0 [&_tr]:hover:bg-transparent", className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("group/row border-b hover:bg-muted/60 data-[state=selected]:bg-muted", className)} {...props} />
}

function TableHead({ className, numeric, ...props }: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "h-9 px-3 first:pl-4 last:pr-4 text-left align-middle text-[13px] leading-[18px] font-medium whitespace-nowrap text-muted-foreground group-data-[density=compact]/table:h-8",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, numeric, muted, ...props }: React.ComponentProps<"td"> & { numeric?: boolean; muted?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-10 px-3 py-2 align-middle first:pl-4 last:pr-4 group-data-[density=compact]/table:h-8 group-data-[density=compact]/table:py-1",
        numeric && "type-mono text-right whitespace-nowrap",
        muted && "text-[13px] leading-[18px] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

/** The name cell's link: the way into the row's page. `mark` is a company or project name to draw a monogram for. */
function TableLink({ className, mark, children, ...props }: React.ComponentProps<typeof Link> & { mark?: string }) {
  return (
    <Link data-slot="table-link" className={cn("rounded-sm font-medium text-foreground underline-offset-4 hover:underline", mark && "inline-flex items-center gap-2.5", className)} {...props}>
      {mark && <CompanyMark name={mark} />}
      {children}
    </Link>
  )
}

/** Optional trailing cell: a chevron for rows that open a page. */
function TableChevron({ className }: { className?: string }) {
  return (
    <td data-slot="table-chevron" className={cn("w-8 pr-3 text-muted-foreground", className)} aria-hidden>
      <ChevronRight className="ml-auto size-4 transition-[translate,color] duration-150 ease-out group-hover/row:translate-x-1 group-hover/row:text-foreground" />
    </td>
  )
}

/** The single row of an empty table: "No X yet." and the action that adds the first one. */
function TableEmpty({ colSpan, action, children, className }: { colSpan: number; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <tr data-slot="table-empty">
      <td colSpan={colSpan} className={cn("px-4 py-6 text-muted-foreground", className)}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>{children}</span>
          {action}
        </div>
      </td>
    </tr>
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("type-meta px-4 py-3 text-left text-muted-foreground", className)} {...props} />
}

export { Table, TableHeader, TableBody, TableFoot, TableFoot as TableFooter, TableHead, TableRow, TableCell, TableLink, TableChevron, TableEmpty, TableCaption }

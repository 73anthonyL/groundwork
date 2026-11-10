/**
 * Navigation for the three kinds of company. Pass one to <AppShell nav={…}>.
 * An item is { href, label, icon?, section? }; section "bottom" pins it above Sign out.
 * `icon` is a name, not a component, so these lists can cross from server to client.
 */
export type NavIcon = "home" | "projects" | "pay-apps" | "payments" | "team" | "company" | "settings";
export type NavItem = { href: string; label: string; icon?: NavIcon; section?: "main" | "bottom" };
export type NavProject = { id: string; name: string; href: string };

/** General contractor. */
export const GC_NAV: NavItem[] = [
  { href: "/gc", label: "Home", icon: "home" },
  { href: "/gc/projects", label: "Projects", icon: "projects" },
  { href: "/gc/pay-apps", label: "Pay apps", icon: "pay-apps" },
  { href: "/gc/payments", label: "Payments", icon: "payments" },
  { href: "/gc/team", label: "Team", icon: "team" },
  { href: "/gc/settings", label: "Settings", icon: "settings", section: "bottom" },
];

/** Subcontractor. */
export const SUB_NAV: NavItem[] = [
  { href: "/sub", label: "Home", icon: "home" },
  { href: "/sub/pay-apps", label: "Pay apps", icon: "pay-apps" },
  { href: "/sub/payments", label: "Payments", icon: "payments" },
  { href: "/sub/company", label: "Company", icon: "company" },
];

/** Owner: one page, their projects. */
export const OWNER_NAV: NavItem[] = [{ href: "/owner", label: "Home", icon: "home" }];

export const NAV_BY_KIND = { gc: GC_NAV, sub: SUB_NAV, owner: OWNER_NAV } as const;

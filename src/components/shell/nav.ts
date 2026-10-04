import {
  BarChart3, Building2, Calculator, Calendar, Car, CheckSquare, FileSignature, FileText, Gauge, Handshake, Kanban,
  LayoutDashboard, ListChecks, Map, Megaphone, PhoneCall, Radar, Send, Settings, ScanSearch, Users, Gavel,
} from "lucide-react";

export const NAV: { section: string; items: { href: string; label: string; icon: typeof Map; key?: string }[] }[] = [
  { section: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "g d" },
  ] },
  { section: "Find", items: [
    { href: "/deal-finder", label: "Deal Finder", icon: Radar, key: "g f" },
    { href: "/map", label: "Map", icon: Map, key: "g m" },
    { href: "/lists", label: "Lists", icon: ListChecks },
    { href: "/drive", label: "Driving for Dollars", icon: Car },
  ] },
  { section: "Acquire", items: [
    { href: "/leads", label: "Leads", icon: Users, key: "g l" },
    { href: "/properties", label: "Properties", icon: Building2 },
    { href: "/comps", label: "Comps", icon: ScanSearch },
    { href: "/deal-desk", label: "Deal Desk", icon: Calculator },
    { href: "/offers", label: "Offers", icon: Gavel },
    { href: "/pipeline", label: "Pipeline", icon: Kanban, key: "g p" },
    { href: "/tasks", label: "Tasks", icon: CheckSquare, key: "g t" },
    { href: "/appointments", label: "Appointments", icon: Calendar },
    { href: "/contracts", label: "Contracts", icon: FileSignature },
  ] },
  { section: "Dispose", items: [
    { href: "/buyers", label: "Buyers", icon: Handshake, key: "g b" },
    { href: "/dispositions", label: "Dispositions", icon: Send },
  ] },
  { section: "Grow", items: [
    { href: "/marketing", label: "Marketing", icon: Megaphone },
    { href: "/campaigns", label: "Campaigns", icon: Gauge },
    { href: "/skip-trace", label: "Skip Trace", icon: PhoneCall },
    { href: "/documents", label: "Documents", icon: FileText },
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

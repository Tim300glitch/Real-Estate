"use client";
// PDF generation (client-side, jsPDF). Reports are rebuilt from current data
// every time so they never drift from the numbers on screen.
import type { ArvResult, ScoredComp } from "../calc/comps";
import type { DealOutputs } from "../calc/deal";
import type { RepairTotals } from "../calc/repairs";
import { date, num, pct, usd } from "../format";
import type { DealInputs, Offer, PropertySummary, RepairItem } from "../types";

type Doc = import("jspdf").jsPDF;

async function load() {
  const [{ jsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  return { jsPDF, autoTable: autoTable.default };
}

const INK = [17, 24, 39] as const;
const MUTED = [107, 114, 128] as const;
const ACCENT = [59, 91, 253] as const;

function header(doc: Doc, title: string, subtitle: string) {
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, 612, 6, "F");
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, 40, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, 40, 58);
  doc.text(`Generated ${new Date().toLocaleString("en-US")}`, 572, 42, { align: "right" });
}

function footer(doc: Doc, note: string) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(note, 470), 40, 760);
    doc.text(`${i} / ${pages}`, 572, 770, { align: "right" });
  }
}

function section(doc: Doc, y: number, title: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(title, 40, y);
  doc.setDrawColor(226, 232, 240);
  doc.line(40, y + 4, 572, y + 4);
  doc.setFont("helvetica", "normal");
  return y + 16;
}

function kvGrid(doc: Doc, y: number, pairs: [string, string][], cols = 3) {
  const w = 532 / cols;
  pairs.forEach(([k, v], i) => {
    const x = 40 + (i % cols) * w;
    const yy = y + Math.floor(i / cols) * 28;
    doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(k.toUpperCase(), x, yy);
    doc.setFontSize(10.5); doc.setTextColor(...INK); doc.text(v, x, yy + 12);
  });
  return y + Math.ceil(pairs.length / cols) * 28 + 4;
}

/** Schematic location map (no third-party tiles needed): subject, comps, radius ring, scale bar. */
function schematicMap(subject: PropertySummary, comps: ScoredComp[], radiusMiles: number): string {
  const c = document.createElement("canvas");
  c.width = 1064; c.height = 440;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f5f7fa"; g.fillRect(0, 0, c.width, c.height);
  const maxMi = Math.max(radiusMiles, ...comps.map((x) => x.sim.distanceMiles), 0.25) * 1.1;
  const scale = (c.height / 2 - 20) / maxMi; // px per mile
  const cx = c.width / 2, cy = c.height / 2;
  const toXY = (lat: number, lng: number) => [cx + (lng - subject.lng) * 54.6 * scale, cy - (lat - subject.lat) * 69 * scale];
  g.strokeStyle = "#e2e8f0"; g.lineWidth = 1;
  for (let x = 0; x < c.width; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
  for (let y = 0; y < c.height; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
  g.setLineDash([8, 6]); g.strokeStyle = "#3b5bfd"; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, radiusMiles * scale, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  comps.forEach((cp, i) => {
    const [x, y] = toXY(cp.lat, cp.lng);
    g.strokeStyle = "rgba(22,163,74,.5)"; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
    g.fillStyle = "#16a34a"; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 14px Helvetica"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), x, y + 1);
  });
  g.fillStyle = "#ef4444"; g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#fff"; g.lineWidth = 4; g.stroke();
  g.fillStyle = "#111827"; g.font = "bold 15px Helvetica"; g.textAlign = "left"; g.fillText("SUBJECT", cx + 20, cy - 12);
  g.fillStyle = "#111827"; g.fillRect(20, c.height - 24, 0.25 * scale, 4);
  g.font = "13px Helvetica"; g.fillText("0.25 mi", 20, c.height - 32);
  return c.toDataURL("image/png");
}

export interface ReportData {
  subject: PropertySummary;
  comps: ScoredComp[];
  arv: ArvResult | null;
  userArv?: number;
  radiusMiles: number;
  repairs: { items: RepairItem[]; totals: RepairTotals } | null;
  inputs: DealInputs | null;
  outputs: DealOutputs | null;
  motivation?: number;
  dealScore?: number;
}

const DISCLAIMER = "Estimates only. Values, ARV, repair costs and equity are calculated from third-party/public data and user inputs and may be inaccurate. Not an appraisal, inspection or legal advice. Demo data in this build is synthetic.";

function subjectBlock(doc: Doc, y: number, s: PropertySummary) {
  y = section(doc, y, "Subject property");
  return kvGrid(doc, y, [
    ["Address", `${s.line1}, ${s.city} ${s.zip}`], ["APN", s.apn], ["Type", s.propertyType.toUpperCase()],
    ["Beds / Baths", `${s.beds ?? "—"} / ${s.baths ?? "—"}`], ["Living area", `${num(s.sqft)} sf`], ["Lot", `${num(s.lotSqft)} sf`],
    ["Year built", String(s.yearBuilt ?? "—")], ["Est. value (AVM)", usd(s.estValue)], ["Est. equity", s.equityPct != null ? `${s.equityPct.toFixed(0)}%` : "—"],
    ["Owner", s.ownerName.slice(0, 38)], ["Years owned", s.yearsOwned != null ? s.yearsOwned.toFixed(1) : "—"], ["Last sale", s.lastSaleDate ? `${usd(s.lastSalePrice)} · ${date(s.lastSaleDate)}` : "—"],
  ]);
}

function compsTable(doc: Doc, autoTable: Awaited<ReturnType<typeof load>>["autoTable"], y: number, comps: ScoredComp[]) {
  autoTable(doc, {
    startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105] },
    head: [["#", "Address", "Dist", "Sale price", "Date", "Sq ft", "$/sf", "Bd/Ba", "Built", "Match", "Notes"]],
    body: comps.map((c, i) => [i + 1, c.line1, `${c.sim.distanceMiles.toFixed(2)} mi`, usd(c.salePrice), date(c.saleDate), num(c.sqft), usd(c.ppsf), `${c.beds}/${c.baths}`, c.yearBuilt ?? "—", `${c.similarity}%`, c.conditionNotes ?? ""]),
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
}

function arvBlock(doc: Doc, y: number, a: ArvResult, userArv?: number) {
  y = section(doc, y, "After-repair value");
  y = kvGrid(doc, y, [
    ["Conservative", usd(a.conservative)], ["Likely (calculated)", usd(a.likely)], ["Aggressive", usd(a.aggressive)],
    ...a.methods.map((m, i) => [`Method ${i + 1}: ${m.label}`, usd(m.value)] as [string, string]),
    ["Avg $/sf", usd(a.avgPpsf)], ["Weighted $/sf", a.weightedPpsf ? `$${a.weightedPpsf.toFixed(2)}` : "—"], ["User ARV override", userArv ? usd(userArv) : "none"],
  ]);
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  const lines = doc.splitTextToSize(`${a.rangeExplanation} ${a.warnings.join(" ")}`, 532);
  doc.text(lines, 40, y);
  return y + lines.length * 10 + 8;
}

export async function propertyAnalysisReport(d: ReportData) {
  const { jsPDF, autoTable } = await load();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  header(doc, "Property Analysis Report", `${d.subject.line1}, ${d.subject.city}, ${d.subject.state} ${d.subject.zip}`);
  let y = subjectBlock(doc, 82, d.subject);
  if (d.motivation != null || d.dealScore != null) y = kvGrid(doc, y, [["Motivation score", `${d.motivation ?? "—"} / 100`], ["Deal score", `${d.dealScore ?? "—"} / 100`], ["Comps selected", String(d.comps.length)]]);
  y = section(doc, y, "Location & selected comps");
  doc.addImage(schematicMap(d.subject, d.comps, d.radiusMiles), "PNG", 40, y, 532, 220);
  y = compsTable(doc, autoTable, y + 230, d.comps);
  if (d.arv) y = arvBlock(doc, y, d.arv, d.userArv);
  if (y > 600) { doc.addPage(); y = 50; }
  if (d.repairs) {
    y = section(doc, y, "Repair estimate");
    y = kvGrid(doc, y, [["Low", usd(d.repairs.totals.low)], ["Expected", usd(d.repairs.totals.expected)], ["High", usd(d.repairs.totals.high)]]);
    autoTable(doc, { startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 8 }, headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105] },
      head: [["Category", "Condition", "Qty", "Unit", "Unit cost", "Total"]], body: d.repairs.items.map((i) => [i.category, i.condition, num(i.quantity), i.unit, usd(i.unitCost), usd(i.quantity * i.unitCost)]) });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }
  if (d.inputs && d.outputs) {
    if (y > 560) { doc.addPage(); y = 50; }
    y = section(doc, y, "Offer & deal metrics");
    y = kvGrid(doc, y, [
      ["ARV used", usd(d.inputs.arv)], ["Repairs used", usd(d.inputs.repairs)], ["Formula", d.inputs.formula === "percent_of_arv" ? `${(d.inputs.investorPct * 100).toFixed(1)}% of ARV` : "Detailed cost model"],
      ["Low offer", usd(d.outputs.offers[0].price)], ["Target offer", usd(d.outputs.offers[1].price)], ["Max offer (MAO)", usd(d.outputs.offers[2].price)],
      ["Fee at target", usd(d.outputs.offers[1].fee)], ["Buyer max price", usd(d.outputs.buyerMaxPrice)], ["Wholesale fee goal", usd(d.inputs.wholesaleFee)],
      ["Investor profit", usd(d.outputs.investorProfit)], ["ROI", pct(d.outputs.roi, 1)], ["Deal quality", d.outputs.quality],
    ]);
    autoTable(doc, { startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 8, font: "courier" }, theme: "plain",
      body: [...d.outputs.buyerMaxLines, ...d.outputs.maoLines.slice(1)].map((l) => [`${l.op ?? " "} ${l.label}`, usd(l.value)]) });
  }
  footer(doc, DISCLAIMER);
  doc.save(`Property Analysis — ${d.subject.line1}.pdf`);
}

export async function compReport(d: ReportData) {
  const { jsPDF, autoTable } = await load();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  header(doc, "Comparable Sales Report", `${d.subject.line1}, ${d.subject.city} ${d.subject.zip} · ${d.radiusMiles} mi radius`);
  let y = subjectBlock(doc, 82, d.subject);
  y = section(doc, y, "Map");
  doc.addImage(schematicMap(d.subject, d.comps, d.radiusMiles), "PNG", 40, y, 532, 220);
  y = section(doc, y + 236, "Selected comps & $/sqft analysis");
  y = compsTable(doc, autoTable, y, d.comps);
  if (d.arv) arvBlock(doc, y, d.arv, d.userArv);
  footer(doc, DISCLAIMER);
  doc.save(`Comp Report — ${d.subject.line1}.pdf`);
}

export async function dealPackage(d: ReportData & { askingPrice: number; closingDate: string; showFullAddress: boolean; access: string; disclaimer: string; photos?: string[] }) {
  const { jsPDF, autoTable } = await load();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const addr = d.showFullAddress ? `${d.subject.line1}, ${d.subject.city} ${d.subject.zip}` : `${d.subject.line1.replace(/^\d+/, "XXXX")}, ${d.subject.city} ${d.subject.zip}`;
  header(doc, "Investment Opportunity — Deal Package", addr);
  let y = section(doc, 82, "The numbers");
  y = kvGrid(doc, y, [
    ["Asking (assignment) price", usd(d.askingPrice)], ["Est. ARV", usd(d.userArv ?? d.arv?.likely ?? null)], ["Est. repairs", usd(d.repairs?.totals.expected ?? d.inputs?.repairs ?? null)],
    ["Beds / Baths", `${d.subject.beds} / ${d.subject.baths}`], ["Sq ft", num(d.subject.sqft)], ["Lot", `${num(d.subject.lotSqft)} sf`],
    ["Year", String(d.subject.yearBuilt ?? "—")], ["Closing", date(d.closingDate)], ["Potential spread", usd((d.userArv ?? d.arv?.likely ?? 0) - d.askingPrice - (d.repairs?.totals.expected ?? 0))],
  ]);
  for (const p of (d.photos ?? []).slice(0, 2)) { try { doc.addImage(p, "JPEG", 40 + (d.photos!.indexOf(p) * 270), y, 260, 160); } catch { /* ignore bad image */ } }
  if (d.photos?.length) y += 172;
  y = section(doc, y, "Access");
  doc.setFontSize(9); doc.setTextColor(...INK);
  const acc = doc.splitTextToSize(d.access || "Contact us to schedule access.", 532);
  doc.text(acc, 40, y); y += acc.length * 11 + 10;
  y = section(doc, y, "Comparable sales");
  doc.addImage(schematicMap(d.subject, d.comps, d.radiusMiles), "PNG", 40, y, 532, 200);
  y = compsTable(doc, autoTable, y + 210, d.comps);
  if (d.repairs) {
    if (y > 600) { doc.addPage(); y = 50; }
    y = section(doc, y, "Repair scope (estimate)");
    autoTable(doc, { startY: y, margin: { left: 40, right: 40 }, styles: { fontSize: 8 }, headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105] },
      head: [["Category", "Condition", "Est. cost"]], body: d.repairs.items.map((i) => [i.category, i.condition, usd(i.quantity * i.unitCost)]) });
  }
  footer(doc, d.disclaimer);
  doc.save(`Deal Package — ${addr}.pdf`);
}

export async function offerLetter(o: Offer, s: PropertySummary, sellerName: string, body: string, buyerEntity = "Capitol Home Partners LLC and/or assigns") {
  const { jsPDF } = await load();
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  header(doc, "Letter of Intent / Offer to Purchase", `${s.line1}, ${s.city}, ${s.state} ${s.zip} · APN ${s.apn}`);
  let y = 96;
  doc.setFontSize(10.5); doc.setTextColor(...INK);
  doc.text(`Date: ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}`, 40, y); y += 18;
  doc.text(`To: ${sellerName}`, 40, y); y += 14;
  doc.text(`From: ${buyerEntity}`, 40, y); y += 24;
  y = kvGrid(doc, y, [["Offer price", usd(o.amount)], ["Earnest money", usd(o.earnestMoney)], ["Close of escrow", `${o.closeDays} days`], ["Inspection period", `${o.inspectionDays} days`], ["Status", o.status], ["Offer ID", o.id]]);
  doc.setFontSize(10);
  const text = doc.splitTextToSize(body, 532);
  doc.text(text, 40, y + 6); y += text.length * 13 + 20;
  if (o.terms) { const t = doc.splitTextToSize(`Additional terms: ${o.terms}`, 532); doc.text(t, 40, y); y += t.length * 13 + 20; }
  doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  const legal = doc.splitTextToSize("This letter is a non-binding expression of interest unless and until a written purchase agreement is executed by both parties. Template language is user-configurable and must be reviewed by a licensed attorney or real-estate professional in your jurisdiction; it is not presented as legally sufficient for any particular state. Buyer intends to assign or close; seller is encouraged to seek independent advice.", 532);
  doc.text(legal, 40, y);
  y += legal.length * 11 + 40;
  doc.setTextColor(...INK); doc.setFontSize(10);
  doc.line(40, y, 260, y); doc.line(330, y, 552, y);
  doc.text("Buyer", 40, y + 14); doc.text("Seller", 330, y + 14);
  doc.save(`Offer — ${s.line1} (${usd(o.amount)}).pdf`);
}

// ════════════════════════════════════════════════════════════════════
// Deal analyzer + Maximum Allowable Offer. Pure, transparent, no hidden
// constants: every percentage comes from DealInputs (which come from a
// user-editable market preset).
// ════════════════════════════════════════════════════════════════════
import type { DealInputs, MarketPreset } from "../types";

export const DEFAULT_PRESETS: MarketPreset[] = [
  {
    id: "sacramento", name: "Sacramento, CA", investorPct: 0.72, wholesaleFee: 20000, buyerProfitPct: 0.12,
    closingCostsBuyPct: 0.015, closingCostsSellPct: 0.015, agentPct: 0.05, holdingMonths: 5, holdingCostMonthly: 1800,
    financingPct: 0.04, repairCostMultiplier: 1.0, offerLowPct: 0.1, offerTargetPct: 0.05,
  },
  {
    id: "bay_area", name: "Bay Area, CA", investorPct: 0.75, wholesaleFee: 35000, buyerProfitPct: 0.1,
    closingCostsBuyPct: 0.012, closingCostsSellPct: 0.012, agentPct: 0.045, holdingMonths: 5, holdingCostMonthly: 3500,
    financingPct: 0.04, repairCostMultiplier: 1.35, offerLowPct: 0.08, offerTargetPct: 0.04,
  },
  {
    id: "stockton", name: "Stockton / Central Valley", investorPct: 0.68, wholesaleFee: 12000, buyerProfitPct: 0.14,
    closingCostsBuyPct: 0.015, closingCostsSellPct: 0.015, agentPct: 0.05, holdingMonths: 5, holdingCostMonthly: 1400,
    financingPct: 0.045, repairCostMultiplier: 0.92, offerLowPct: 0.12, offerTargetPct: 0.06,
  },
  {
    id: "conservative", name: "Conservative (70% rule)", investorPct: 0.7, wholesaleFee: 15000, buyerProfitPct: 0.15,
    closingCostsBuyPct: 0.02, closingCostsSellPct: 0.02, agentPct: 0.06, holdingMonths: 6, holdingCostMonthly: 2000,
    financingPct: 0.05, repairCostMultiplier: 1.0, offerLowPct: 0.12, offerTargetPct: 0.06,
  },
];

export function inputsFromPreset(p: MarketPreset, base: Partial<DealInputs> = {}): DealInputs {
  return {
    arv: 0, arvSource: "calculated", repairs: 0, repairsSource: "estimator", formula: "percent_of_arv",
    investorPct: p.investorPct, wholesaleFee: p.wholesaleFee, buyerProfitPct: p.buyerProfitPct,
    closingCostsBuyPct: p.closingCostsBuyPct, closingCostsSellPct: p.closingCostsSellPct, agentPct: p.agentPct,
    holdingMonths: p.holdingMonths, holdingCostMonthly: p.holdingCostMonthly, financingPct: p.financingPct,
    otherCosts: 0, purchasePrice: 0, offerLowPct: p.offerLowPct, offerTargetPct: p.offerTargetPct, presetId: p.id,
    ...base,
  };
}

export interface CalcLine {
  label: string;
  value: number;
  op?: "+" | "−" | "=" | "×";
  note?: string;
}

export interface OfferPoint {
  label: "Low" | "Target" | "Max";
  price: number;
  fee: number;          // assignment fee if a buyer pays buyerMaxPrice
  pctOfArv: number;
}

export interface DealOutputs {
  holdingCosts: number;
  /** Highest price an investor/buyer should pay given their requirements */
  buyerMaxPrice: number;
  buyerMaxLines: CalcLine[];
  mao: number;
  maoLines: CalcLine[];
  maoFormula: string;
  offers: OfferPoint[];
  // Analyzer at proposed purchase price
  buyerPurchasePrice: number;
  totalInvestment: number;
  totalInvestmentLines: CalcLine[];
  saleCosts: number;
  investorProfit: number;
  roi: number;
  profitMargin: number;
  wholesaleSpread: number;
  feeAtPurchase: number;
  vsSellerAsk: number | null;
  quality: "Strong" | "Good" | "Marginal" | "Weak" | "No Deal";
  qualityReason: string;
}

const r500 = (n: number) => Math.floor(n / 500) * 500;

export function computeDeal(i: DealInputs): DealOutputs {
  const holding = i.holdingMonths * i.holdingCostMonthly;
  let buyerMax: number;
  let buyerMaxLines: CalcLine[];
  let maoFormula: string;

  if (i.formula === "percent_of_arv") {
    buyerMax = i.arv * i.investorPct - i.repairs;
    maoFormula = "MAO = ARV × Investor % − Repairs − Wholesale Fee";
    buyerMaxLines = [
      { label: "ARV", value: i.arv },
      { label: `× Investor factor ${(i.investorPct * 100).toFixed(1)}%`, value: i.arv * i.investorPct, op: "×" },
      { label: "Repairs", value: i.repairs, op: "−" },
      { label: "Buyer max purchase price", value: buyerMax, op: "=" },
    ];
  } else {
    // Solve for price P:
    //   ARV − repairs − holding − other − sell costs − agent − buyer profit − closingBuy·P − financing·(P + repairs) = P
    const sell = i.arv * i.closingCostsSellPct;
    const agent = i.arv * i.agentPct;
    const profit = i.arv * i.buyerProfitPct;
    const numerator = i.arv - i.repairs * (1 + i.financingPct) - holding - i.otherCosts - sell - agent - profit;
    buyerMax = numerator / (1 + i.closingCostsBuyPct + i.financingPct);
    const closingBuy = buyerMax * i.closingCostsBuyPct;
    const financing = (buyerMax + i.repairs) * i.financingPct;
    maoFormula = "MAO = ARV − Repairs − Holding − Closing (buy+sell) − Agent − Financing − Buyer Profit − Other − Wholesale Fee";
    buyerMaxLines = [
      { label: "ARV", value: i.arv },
      { label: "Repairs", value: i.repairs, op: "−" },
      { label: `Holding (${i.holdingMonths} mo × $${i.holdingCostMonthly.toLocaleString()})`, value: holding, op: "−" },
      { label: `Buy-side closing ${(i.closingCostsBuyPct * 100).toFixed(1)}% of price`, value: closingBuy, op: "−" },
      { label: `Sell-side closing ${(i.closingCostsSellPct * 100).toFixed(1)}% of ARV`, value: sell, op: "−" },
      { label: `Agent / resale ${(i.agentPct * 100).toFixed(1)}% of ARV`, value: agent, op: "−" },
      { label: `Financing ${(i.financingPct * 100).toFixed(1)}% of (price + repairs)`, value: financing, op: "−" },
      { label: `Buyer profit ${(i.buyerProfitPct * 100).toFixed(1)}% of ARV`, value: profit, op: "−" },
      { label: "Other expenses", value: i.otherCosts, op: "−" },
      { label: "Buyer max purchase price", value: buyerMax, op: "=" },
    ];
  }

  const mao = buyerMax - i.wholesaleFee;
  const maoLines: CalcLine[] = [
    { label: "Buyer max purchase price", value: buyerMax },
    { label: "Wholesale fee", value: i.wholesaleFee, op: "−" },
    { label: "Maximum allowable offer", value: mao, op: "=" },
  ];

  const maxOffer = r500(mao);
  const target = r500(mao * (1 - i.offerTargetPct));
  const low = r500(mao * (1 - i.offerLowPct));
  const offers: OfferPoint[] = [
    { label: "Low", price: low, fee: buyerMax - low, pctOfArv: i.arv ? low / i.arv : 0 },
    { label: "Target", price: target, fee: buyerMax - target, pctOfArv: i.arv ? target / i.arv : 0 },
    { label: "Max", price: maxOffer, fee: buyerMax - maxOffer, pctOfArv: i.arv ? maxOffer / i.arv : 0 },
  ];

  // Analyzer at the proposed purchase price
  const pp = i.purchasePrice || target;
  const buyerPurchasePrice = pp + i.wholesaleFee;
  const closingBuy = buyerPurchasePrice * i.closingCostsBuyPct;
  const financing = (buyerPurchasePrice + i.repairs) * i.financingPct;
  const totalInvestment = buyerPurchasePrice + i.repairs + closingBuy + holding + financing + i.otherCosts;
  const saleCosts = i.arv * (i.closingCostsSellPct + i.agentPct);
  const investorProfit = i.arv - totalInvestment - saleCosts;
  const roi = totalInvestment ? investorProfit / totalInvestment : 0;
  const profitMargin = i.arv ? investorProfit / i.arv : 0;
  const wholesaleSpread = buyerMax - pp;

  const totalInvestmentLines: CalcLine[] = [
    { label: "Contract price (seller)", value: pp },
    { label: "Wholesale fee", value: i.wholesaleFee, op: "+" },
    { label: "Buyer purchase price", value: buyerPurchasePrice, op: "=" },
    { label: "Repairs", value: i.repairs, op: "+" },
    { label: "Buy-side closing", value: closingBuy, op: "+" },
    { label: "Holding", value: holding, op: "+" },
    { label: "Financing", value: financing, op: "+" },
    { label: "Other", value: i.otherCosts, op: "+" },
    { label: "Total investment", value: totalInvestment, op: "=" },
  ];

  const vsSellerAsk = i.sellerAsk ? i.sellerAsk - maxOffer : null;
  let quality: DealOutputs["quality"];
  let qualityReason: string;
  const targetFee = offers[1].fee;
  if (mao <= 0 || i.arv <= 0) {
    quality = "No Deal"; qualityReason = "MAO is zero or negative at these inputs.";
  } else if (targetFee >= i.wholesaleFee * 1.25 && profitMargin >= 0.1) {
    quality = "Strong"; qualityReason = `Target offer leaves a ${fmt(targetFee)} spread and a ${(profitMargin * 100).toFixed(0)}% buyer margin.`;
  } else if (targetFee >= i.wholesaleFee && profitMargin >= 0.07) {
    quality = "Good"; qualityReason = `Target offer meets the fee goal with a ${(profitMargin * 100).toFixed(0)}% buyer margin.`;
  } else if (profitMargin > 0.04) {
    quality = "Marginal"; qualityReason = `Thin buyer margin (${(profitMargin * 100).toFixed(0)}%) at the proposed price.`;
  } else {
    quality = "Weak"; qualityReason = "Buyer margin under 4% at the proposed price.";
  }
  if (i.sellerAsk && quality !== "No Deal") {
    if (i.sellerAsk > buyerMax) {
      qualityReason += ` Seller's ask (${fmt(i.sellerAsk)}) is above what a buyer can pay (${fmt(buyerMax)}) — only workable if the seller comes down.`;
    } else if (i.sellerAsk > maxOffer) qualityReason += ` Seller's ask is ${fmt(i.sellerAsk - maxOffer)} above MAO — negotiation needed (fee at ask: ${fmt(buyerMax - i.sellerAsk)}).`;
    else qualityReason += ` Seller's ask is already at or below MAO.`;
  }

  return {
    holdingCosts: holding, buyerMaxPrice: buyerMax, buyerMaxLines, mao, maoLines, maoFormula, offers,
    buyerPurchasePrice, totalInvestment, totalInvestmentLines, saleCosts, investorProfit, roi, profitMargin,
    wholesaleSpread, feeAtPurchase: wholesaleSpread, vsSellerAsk, quality, qualityReason,
  };
}

function fmt(n: number) {
  return (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
}

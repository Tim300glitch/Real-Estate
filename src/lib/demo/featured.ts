// Hand-authored fictional subject properties used by the demo workspace.
// All names, addresses and numbers are fictional and exist only in the
// synthetic Demo Data Provider. They are deliberately varied so the UI
// shows good, marginal and bad deals plus common lead types.
import type { OwnerEntity, PropertyType } from "@/lib/types";

export interface FeaturedSpec {
  id: string;
  line1: string;
  city: string;
  zip: string;
  neighborhood: string;
  lat: number;
  lng: number;
  type: PropertyType;
  beds: number;
  baths: number;
  sqft: number;
  lotSqft: number;
  yearBuilt: number;
  /** renovated value — used to plant comparable sales nearby */
  targetArv: number;
  /** as-is AVM value */
  estValue: number;
  owner: { names: string[]; entity: OwnerEntity; mailing: { line1: string; city: string; state: string; zip: string }; occupied: boolean };
  lastSale: { date: string; price: number | null; docType: string; cash: boolean | null };
  mortgageBalance: number | null;
  originalLoan?: number;
  lender?: string;
  distress: Partial<{
    taxDelinquent: boolean; preForeclosure: boolean; foreclosure: boolean; auctionDate: string; probate: boolean;
    vacant: boolean; codeViolations: number; liens: number; inherited: boolean; tiredLandlord: boolean;
  }>;
  annualTax: number;
}

export const FEATURED: FeaturedSpec[] = [
  {
    id: "f-alder-grove", line1: "7428 Alder Grove Way", city: "Sacramento", zip: "95828", neighborhood: "Florin",
    lat: 38.49236, lng: -121.40412, type: "sfr", beds: 3, baths: 2, sqft: 1684, lotSqft: 6534, yearBuilt: 1971,
    targetArv: 465000, estValue: 392000,
    owner: { names: ["Dolores M. Whitfield"], entity: "individual", mailing: { line1: "7428 Alder Grove Way", city: "Sacramento", state: "CA", zip: "95828" }, occupied: true },
    lastSale: { date: "1998-05-14", price: 118500, docType: "Grant Deed", cash: false },
    mortgageBalance: 41200, originalLoan: 94800, lender: "Golden 1 Credit Union",
    distress: { taxDelinquent: false, vacant: false, codeViolations: 0, liens: 0 }, annualTax: 2140,
  },
  {
    id: "f-bellhaven", line1: "2219 Bellhaven Ct", city: "Sacramento", zip: "95821", neighborhood: "Arden-Arcade",
    lat: 38.60512, lng: -121.38655, type: "sfr", beds: 4, baths: 2, sqft: 1912, lotSqft: 7840, yearBuilt: 1962,
    targetArv: 528000, estValue: 455000,
    owner: { names: ["Raymond T. Castellanos", "Inez Castellanos"], entity: "individual", mailing: { line1: "2219 Bellhaven Ct", city: "Sacramento", state: "CA", zip: "95821" }, occupied: true },
    lastSale: { date: "2009-11-03", price: 189000, docType: "Grant Deed", cash: false },
    mortgageBalance: 118400, originalLoan: 179500, lender: "Wells Fargo Bank",
    distress: { taxDelinquent: false, vacant: false, codeViolations: 0, liens: 0 }, annualTax: 2290,
  },
  {
    id: "f-marlow", line1: "4810 Marlow Ave", city: "Carmichael", zip: "95608", neighborhood: "Carmichael",
    lat: 38.62948, lng: -121.32512, type: "sfr", beds: 3, baths: 2, sqft: 1745, lotSqft: 9148, yearBuilt: 1978,
    targetArv: 612000, estValue: 590000,
    owner: { names: ["Priya Raman", "Vikram Raman"], entity: "individual", mailing: { line1: "4810 Marlow Ave", city: "Carmichael", state: "CA", zip: "95608" }, occupied: true },
    lastSale: { date: "2021-06-22", price: 545000, docType: "Grant Deed", cash: false },
    mortgageBalance: 418000, originalLoan: 436000, lender: "Rocket Mortgage",
    distress: { taxDelinquent: false, vacant: false, codeViolations: 0, liens: 0 }, annualTax: 6150,
  },
  {
    id: "f-cedar-ridge", line1: "3316 Cedar Ridge Dr", city: "Rancho Cordova", zip: "95670", neighborhood: "Rancho Cordova",
    lat: 38.58934, lng: -121.28842, type: "sfr", beds: 3, baths: 1.5, sqft: 1418, lotSqft: 6970, yearBuilt: 1966,
    targetArv: 418000, estValue: 352000,
    owner: { names: ["Harold J. Pettersen"], entity: "individual", mailing: { line1: "11820 N Saguaro Bluff Dr", city: "Phoenix", state: "AZ", zip: "85085" }, occupied: false },
    lastSale: { date: "2000-02-18", price: 112000, docType: "Grant Deed", cash: true },
    mortgageBalance: null, distress: { taxDelinquent: false, vacant: false, codeViolations: 0, liens: 0, tiredLandlord: true }, annualTax: 1610,
  },
  {
    id: "f-juniper", line1: "5527 Juniper Hollow Rd", city: "Sacramento", zip: "95820", neighborhood: "Tahoe Park",
    lat: 38.53941, lng: -121.43694, type: "sfr", beds: 2, baths: 1, sqft: 1096, lotSqft: 5662, yearBuilt: 1948,
    targetArv: 389000, estValue: 318000,
    owner: { names: ["Estate of Margaret L. Okafor"], entity: "estate", mailing: { line1: "PO Box 2291", city: "Davis", state: "CA", zip: "95617" }, occupied: false },
    lastSale: { date: "2024-12-09", price: null, docType: "Affidavit of Death of Joint Tenant", cash: null },
    mortgageBalance: null, distress: { probate: true, inherited: true, vacant: true, taxDelinquent: true, codeViolations: 1 }, annualTax: 980,
  },
  {
    id: "f-fremont-terrace", line1: "1408 Fremont Terrace", city: "North Highlands", zip: "95660", neighborhood: "North Highlands",
    lat: 38.67188, lng: -121.37861, type: "duplex", beds: 4, baths: 2, sqft: 1820, lotSqft: 7200, yearBuilt: 1959,
    targetArv: 455000, estValue: 372000,
    owner: { names: ["Delgado Rental Holdings LLC"], entity: "llc", mailing: { line1: "2600 Capitol Ave Ste 210", city: "Sacramento", state: "CA", zip: "95816" }, occupied: false },
    lastSale: { date: "2006-08-17", price: 231000, docType: "Grant Deed", cash: false },
    mortgageBalance: 96500, originalLoan: 184800, lender: "Bank of America",
    distress: { tiredLandlord: true, codeViolations: 2, taxDelinquent: true, liens: 1, vacant: false }, annualTax: 2870,
  },
  {
    id: "f-wren-hollow", line1: "6043 Wren Hollow Way", city: "Sacramento", zip: "95824", neighborhood: "Fruitridge Manor",
    lat: 38.51632, lng: -121.44121, type: "sfr", beds: 3, baths: 1, sqft: 1152, lotSqft: 6098, yearBuilt: 1954,
    targetArv: 365000, estValue: 268000,
    owner: { names: ["Curtis L. Abernathy"], entity: "individual", mailing: { line1: "418 Lassen Dr", city: "Redding", state: "CA", zip: "96003" }, occupied: false },
    lastSale: { date: "1991-03-11", price: 74500, docType: "Grant Deed", cash: false },
    mortgageBalance: null, distress: { vacant: true, codeViolations: 3, taxDelinquent: false }, annualTax: 1040,
  },
  {
    id: "f-sable-creek", line1: "8821 Sable Creek Dr", city: "Elk Grove", zip: "95758", neighborhood: "Elk Grove",
    lat: 38.41802, lng: -121.43716, type: "sfr", beds: 4, baths: 3, sqft: 2318, lotSqft: 6250, yearBuilt: 2004,
    targetArv: 612000, estValue: 575000,
    owner: { names: ["Marcus D. Ellery", "Tanya R. Ellery"], entity: "individual", mailing: { line1: "8821 Sable Creek Dr", city: "Elk Grove", state: "CA", zip: "95758" }, occupied: true },
    lastSale: { date: "2017-04-28", price: 409000, docType: "Grant Deed", cash: false },
    mortgageBalance: 352000, originalLoan: 388500, lender: "PennyMac Loan Services",
    distress: { preForeclosure: true, auctionDate: "2026-11-18", taxDelinquent: false }, annualTax: 5480,
  },
  {
    id: "f-quarry-oak", line1: "4471 Quarry Oak Ct", city: "Sacramento", zip: "95823", neighborhood: "Valley Hi",
    lat: 38.47924, lng: -121.44602, type: "sfr", beds: 3, baths: 2, sqft: 1540, lotSqft: 5998, yearBuilt: 1979,
    targetArv: 420000, estValue: 351000,
    owner: { names: ["Lorraine A. Bechtel"], entity: "individual", mailing: { line1: "4471 Quarry Oak Ct", city: "Sacramento", state: "CA", zip: "95823" }, occupied: true },
    lastSale: { date: "1994-09-30", price: 96000, docType: "Grant Deed", cash: false },
    mortgageBalance: 12800, originalLoan: 86400, lender: "Washington Mutual (assigned)",
    distress: {}, annualTax: 1390,
  },
  {
    id: "f-bramblewood", line1: "1126 Bramblewood Dr", city: "Citrus Heights", zip: "95610", neighborhood: "Citrus Heights",
    lat: 38.69466, lng: -121.28974, type: "sfr", beds: 3, baths: 2, sqft: 1462, lotSqft: 7405, yearBuilt: 1977,
    targetArv: 438000, estValue: 371000,
    owner: { names: ["Gerald & Ana Sorensen Living Trust"], entity: "trust", mailing: { line1: "1126 Bramblewood Dr", city: "Citrus Heights", state: "CA", zip: "95610" }, occupied: true },
    lastSale: { date: "2003-07-15", price: 241000, docType: "Grant Deed", cash: false },
    mortgageBalance: 58300, originalLoan: 192800, lender: "Chase",
    distress: {}, annualTax: 2780,
  },
  {
    id: "f-pebble-run", line1: "3905 Pebble Run Way", city: "Sacramento", zip: "95827", neighborhood: "Rosemont",
    lat: 38.55044, lng: -121.36011, type: "sfr", beds: 3, baths: 2, sqft: 1338, lotSqft: 6100, yearBuilt: 1969,
    targetArv: 405000, estValue: 340000,
    owner: { names: ["Willow Bend Homes LLC"], entity: "llc", mailing: { line1: "9 Commerce Cir", city: "Roseville", state: "CA", zip: "95678" }, occupied: false },
    lastSale: { date: "2026-09-12", price: 312000, docType: "Grant Deed", cash: true },
    mortgageBalance: null, distress: {}, annualTax: 3510,
  },
  {
    id: "f-thornapple", line1: "7712 Thornapple Ln", city: "Sacramento", zip: "95828", neighborhood: "Florin",
    lat: 38.49611, lng: -121.39855, type: "sfr", beds: 4, baths: 2, sqft: 1702, lotSqft: 6600, yearBuilt: 1974,
    targetArv: 472000, estValue: 371000,
    owner: { names: ["Sierra Gate Capital LLC"], entity: "llc", mailing: { line1: "1800 Howe Ave Ste 120", city: "Sacramento", state: "CA", zip: "95825" }, occupied: false },
    lastSale: { date: "2026-10-02", price: 338000, docType: "Grant Deed", cash: true },
    mortgageBalance: null, distress: {}, annualTax: 3920,
  },
];

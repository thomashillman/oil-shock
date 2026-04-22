import { normalizePoints } from "../../core/normalize";
import type { Env } from "../../env";
import type { NormalizedPoint } from "../../types";
import { fetchJson, fetchText } from "../../lib/http-client";
import { log } from "../../lib/logging";

const BASE_DATA = "https://data.sec.gov";
const BASE_SEC = "https://www.sec.gov";

// SEC API User-Agent (10 req/s is SEC standard - https://www.sec.gov/os/webmaster.html)
const SEC_USER_AGENT = "John Doe john.doe@bbc.com";

// Cache for fetched filing texts during collection run (avoids duplicate downloads)
const filingTextCache = new Map<string, { text: string; filingDate: string | null }>();

interface TickerMapEntry {
  ticker: string;
  title: string;
  cik_str: number;
}

interface SubmissionsResponse {
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
    };
  };
}

interface CompanyFactsResponse {
  facts?: {
    "us-gaap"?: {
      [conceptName: string]: {
        units?: {
          [unit: string]: Array<{
            val?: number | string;
            filed?: string;
            end?: string;
            fy?: number;
            fp?: string;
          }>;
        };
      };
    };
  };
}

const TICKERS_BY_SECTOR: Record<string, string[]> = {
  airlines_trucking_shipping_logistics: ["DAL", "UAL", "AAL", "FDX", "UPS", "JBHT"],
  chemicals_plastics_industrials: ["DOW", "LYB", "EMN", "WLK", "DD"],
  retail_consumer_food: ["WMT", "COST", "TGT", "KR"],
  utilities_power_lng_energy: ["DUK", "SO", "NEE", "SRE", "LNG"],
  oil_producers_refiners: ["XOM", "CVX", "COP", "MPC", "VLO"],
};

const SECTOR_KEYWORDS: Record<string, string[]> = {
  airlines_trucking_shipping_logistics: [
    "fuel", "jet fuel", "fuel expense", "diesel", "casm", "capacity", "asm", "yield"
  ],
  chemicals_plastics_industrials: [
    "feedstock", "natural gas", "naphtha", "ethylene", "propylene", "energy costs"
  ],
  retail_consumer_food: [
    "freight", "transportation", "fuel", "packaging", "resin", "commodity"
  ],
  utilities_power_lng_energy: [
    "purchased fuel", "fuel expense", "commodity", "natural gas", "lng", "hedging"
  ],
  oil_producers_refiners: [
    "realized price", "benchmark", "refining margin", "crack spread", "production"
  ]
};

async function getTickerMap(): Promise<Map<string, string>> {
  try {
    const raw = await fetchJson<Record<string, TickerMapEntry>>(
      `${BASE_SEC}/files/company_tickers.json`,
      {
        timeout: 15000,
        rateLimitDelayMs: 100, // 10 req/s per SEC guidelines
        headers: { "User-Agent": SEC_USER_AGENT }
      }
    );

    const map = new Map<string, string>();
    for (const item of Object.values(raw)) {
      map.set(item.ticker.toUpperCase(), String(item.cik_str).padStart(10, "0"));
    }
    return map;
  } catch (error) {
    log("warn", "Failed to fetch SEC ticker map", {
      error: error instanceof Error ? error.message : String(error)
    });
    return new Map();
  }
}

async function getSubmissions(cik: string): Promise<SubmissionsResponse | null> {
  try {
    return await fetchJson<SubmissionsResponse>(
      `${BASE_DATA}/submissions/CIK${cik}.json`,
      {
        timeout: 10000,
        rateLimitDelayMs: 100, // 10 req/s per SEC guidelines
        headers: { "User-Agent": SEC_USER_AGENT }
      }
    );
  } catch (error) {
    log("warn", `Failed to fetch submissions for CIK ${cik}`, {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function stripHtml(text: string): string {
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countKeywordMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    // Use word-boundary regex so "fuel" doesn't match "refuel"
    const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(lower)) {
      count += 1;
    }
  }
  return count;
}

function hasNegativeGuidance(text: string): boolean {
  const patterns = [
    /lowered guidance/i,
    /reduced guidance/i,
    /cut guidance/i,
    /withdrew guidance/i,
    /below prior guidance/i,
    /soft(er)? demand/i,
    /weaker demand/i,
    /margin pressure/i,
    /higher fuel costs/i,
    /higher energy costs/i
  ];
  return patterns.some(p => p.test(text));
}

async function fetchRecentFilingText(
  cik: string,
  submissions: SubmissionsResponse
): Promise<{ text: string; filingDate: string | null }> {
  try {
    const recent = submissions.filings?.recent;
    if (!recent?.form || !recent.accessionNumber || !recent.primaryDocument) {
      return { text: "", filingDate: null };
    }

    for (let i = 0; i < Math.min(4, recent.form.length); i++) {
      const form = recent.form[i];
      if (!form || !["10-K", "10-Q", "8-K"].includes(form)) {
        continue;
      }

      const accession = recent.accessionNumber[i];
      const primaryDoc = recent.primaryDocument[i];
      const filingDate = recent.filingDate?.[i] ?? null;

      if (!accession || !primaryDoc) {
        continue;
      }

      const cikNum = String(parseInt(cik, 10));
      const accessionNodash = accession.replace(/-/g, "");
      const url = `${BASE_SEC}/Archives/edgar/data/${cikNum}/${accessionNodash}/${primaryDoc}`;

      // Check cache first (avoids duplicate downloads in same collection run)
      const cacheKey = `${cikNum}/${accessionNodash}/${primaryDoc}`;
      if (filingTextCache.has(cacheKey)) {
        return filingTextCache.get(cacheKey)!;
      }

      try {
        const text = await fetchText(url, {
          timeout: 15000,
          rateLimitDelayMs: 100, // 10 req/s per SEC guidelines
          headers: { "User-Agent": SEC_USER_AGENT }
        });
        const result = { text: stripHtml(text), filingDate };
        filingTextCache.set(cacheKey, result);
        return result;
      } catch (error) {
        log("warn", `Failed to fetch filing text for ${form}`, {
          cik,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  } catch (error) {
    log("warn", `Error fetching filing text`, {
      cik,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return { text: "", filingDate: null };
}

function scoreTickerText(
  text: string,
  sector: string
): { impairmentScore: number; guidanceRisk: number } {
  if (!text || text.length === 0) {
    return { impairmentScore: 0, guidanceRisk: 0 };
  }

  const keywords = SECTOR_KEYWORDS[sector] ?? [];
  const keywordCount = countKeywordMatches(text, keywords);
  const hasOilLinkage = keywordCount > 0 ? 1 : 0;

  const negativeGuidance = hasNegativeGuidance(text) ? 1 : 0;
  const positiveGuidance = /raised guidance|reaffirmed guidance|offset|cost recovery/i.test(text) ? 1 : 0;
  const guidanceRisk = Math.max(0, negativeGuidance - positiveGuidance);

  const impairmentScore = hasOilLinkage * 0.5 + guidanceRisk * 0.5;

  return { impairmentScore, guidanceRisk };
}

export async function collectSec(_env: Env, nowIso: string): Promise<NormalizedPoint[]> {
  // Clear cache for this collection run (in-memory caching to prevent duplicate filing downloads)
  filingTextCache.clear();

  const tickerMap = await getTickerMap();
  if (tickerMap.size === 0) {
    log("warn", "SEC: No ticker map available, emitting no points");
    return [];
  }

  let totalScore = 0;
  let companiesScored = 0;
  let latestFilingDate: string | null = null;

  for (const [sector, tickers] of Object.entries(TICKERS_BY_SECTOR)) {
    for (const ticker of tickers) {
      const cik = tickerMap.get(ticker.toUpperCase());
      if (!cik) {
        log("warn", `SEC: Ticker not found in map`, { ticker });
        continue;
      }

      const submissions = await getSubmissions(cik);
      if (!submissions) {
        continue;
      }

      const { text: filingText, filingDate } = await fetchRecentFilingText(cik, submissions);
      const { impairmentScore } = scoreTickerText(filingText, sector);

      totalScore += impairmentScore;
      companiesScored += 1;

      // Track the most recent filing date across all tickers
      if (filingDate && (!latestFilingDate || filingDate > latestFilingDate)) {
        latestFilingDate = filingDate;
      }

      log("info", `SEC: ${ticker}`, { sector, impairmentScore: impairmentScore.toFixed(3) });
    }
  }

  if (companiesScored === 0) {
    log("warn", "SEC: No companies scored, emitting no points");
    return [];
  }

  const avgScore = totalScore / companiesScored;
  const observedAt = latestFilingDate ?? nowIso;

  return normalizePoints("sec", [
    {
      seriesKey: "market_response.sec_impairment",
      observedAt,
      value: Math.min(1, avgScore),
      unit: "index"
    }
  ]);
}

import { NextResponse } from "next/server";
import { TickerSuggestion } from "../../../types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    // using Yahoo Finance open search API for high-quality ticker autocomplete
    const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`);
    
    if (!res.ok) {
      return NextResponse.json({ suggestions: [] });
    }

    const data = await res.json();
    const suggestions: TickerSuggestion[] = (data.quotes || []).map((quote: any) => ({
      symbol: quote.symbol,
      name: quote.shortname || quote.longname || quote.symbol,
      exchange: quote.exchange,
    })).filter((q: TickerSuggestion) => q.symbol && q.name);

    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  return NextResponse.json({ message: "Legacy scraper disabled." }, { status: 410 });
}

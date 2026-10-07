import { NextRequest, NextResponse } from "next/server";
import { searchConnectedKnowledge } from "@/lib/knowledge-connectors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 500) {
    return NextResponse.json({ error: "Search query must contain 1-500 characters." }, { status: 400 });
  }
  try {
    return NextResponse.json(await searchConnectedKnowledge(query));
  } catch (error) {
    console.error("Connected knowledge search failed.", error);
    return NextResponse.json({ error: "Could not search connected knowledge sources." }, { status: 503 });
  }
}
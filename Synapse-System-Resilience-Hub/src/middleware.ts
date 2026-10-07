import { NextRequest, NextResponse } from "next/server";

const encoder = new TextEncoder();

function equalSecret(candidate: string, expected: string) {
  const left = encoder.encode(candidate);
  const right = encoder.encode(expected);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/api/alerts/intake" || path.startsWith("/_next/") || path === "/favicon.ico") {
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (path === "/api/alerts/generate" && authorization?.startsWith("Bearer ")) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && equalSecret(authorization.slice("Bearer ".length), cronSecret)) {
      return NextResponse.next();
    }
  }

  const username = process.env.SYNOPSE_ACCESS_USER;
  const password = process.env.SYNOPSE_ACCESS_PASSWORD;
  if (!username || !password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Synopse access is not configured.", { status: 503 });
  }

  if (authorization?.startsWith("Basic ")) {
    try {
      const decoded = atob(authorization.slice(6));
      const credentials = new TextDecoder().decode(Uint8Array.from(decoded, (character) => character.charCodeAt(0)));
      const separator = credentials.indexOf(":");
      if (separator >= 0 && equalSecret(credentials.slice(0, separator), username) && equalSecret(credentials.slice(separator + 1), password)) {
        return NextResponse.next();
      }
    } catch {
      // Invalid base64 credentials are handled like missing credentials.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Synopse", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|robots.txt).*)"],
};

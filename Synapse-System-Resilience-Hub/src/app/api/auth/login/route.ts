import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { destinationForMfa, findMfaUser, generateMfaCode, hashMfaCode, MfaMode, sendMfaCode } from "@/lib/mfa";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
    const mode: MfaMode = body?.mode === "mobile" ? "mobile" : "email";

    if (!identifier) {
      return NextResponse.json({ error: "Email or mobile number is required." }, { status: 400 });
    }

    const user = await findMfaUser(identifier, mode);

    if (!user) {
      return NextResponse.json({ error: mode === "mobile" ? "No account matches that mobile number." : "No account matches that email address." }, { status: 404 });
    }
    if (!user.isActive) return NextResponse.json({ error: "This account is inactive." }, { status: 403 });

    const destination = destinationForMfa(mode, user);
    if (!destination) {
      return NextResponse.json({ error: `No ${mode === "mobile" ? "mobile number" : "email address"} is registered for this account.` }, { status: 400 });
    }

    const code = generateMfaCode();
    await sendMfaCode(mode, destination, code);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        lastMfaCode: hashMfaCode(code),
        mfaCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Verification code sent to your registered ${mode === "mobile" ? "mobile number" : "email address"}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process login request.";
    console.error("Login challenge failed.", message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findMfaUser, hashMfaCode, MfaMode } from "@/lib/mfa";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const mode: MfaMode = body?.mode === "mobile" ? "mobile" : "email";

    if (!identifier || !code) {
      return NextResponse.json({ error: "Identifier and MFA code are required." }, { status: 400 });
    }

    const user = await findMfaUser(identifier, mode);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!user.lastMfaCode || !user.mfaCodeExpiresAt || user.mfaCodeExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "The MFA code has expired. Please request a new code." }, { status: 401 });
    }

    if (user.lastMfaCode !== hashMfaCode(code)) {
      return NextResponse.json({ error: "Invalid MFA code." }, { status: 401 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        mfaEnabled: true,
        lastMfaCode: null,
        mfaCodeExpiresAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
      },
    });
  } catch (error) {
    console.error("MFA verification failed.", error);
    return NextResponse.json({ error: "Unable to verify MFA code." }, { status: 500 });
  }
}

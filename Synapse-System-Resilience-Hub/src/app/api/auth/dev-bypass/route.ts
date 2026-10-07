import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    return NextResponse.json({
      success: true,
      user: {
        displayName: "Naveen Nigam",
        email: "naveen.nkn1001@gmail.com",
        phoneNumber: "+91-9860742404",
      },
    });
  } catch (error) {
    console.error("Development MFA bypass failed.", error);
    return NextResponse.json({ error: "Unable to complete development login." }, { status: 500 });
  }
}
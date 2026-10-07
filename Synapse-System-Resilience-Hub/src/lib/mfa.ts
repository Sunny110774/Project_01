import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type MfaMode = "email" | "mobile";

export function normalizePhoneNumber(value: string) {
  const normalized = value.replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function generateMfaCode() {
  return String(randomInt(100000, 1000000));
}

export function hashMfaCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export async function findMfaUser(identifier: string, mode: MfaMode) {
  if (mode === "email") {
    return prisma.user.findFirst({
      where: { email: { equals: identifier.toLowerCase(), mode: "insensitive" } },
    });
  }

  const normalizedIdentifier = normalizePhoneNumber(identifier);
  if (!normalizedIdentifier) return null;

  const users = await prisma.user.findMany({ where: { phoneNumber: { not: null } } });
  return users.find((user) => normalizePhoneNumber(user.phoneNumber ?? "") === normalizedIdentifier) ?? null;
}

export async function sendMfaCode(mode: MfaMode, destination: string, code: string) {
  if (mode === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.MFA_EMAIL_FROM;
    if (!apiKey || !from) {
      throw new Error("Email delivery is not configured. Set RESEND_API_KEY and MFA_EMAIL_FROM.");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [destination],
        subject: "Your Synopse verification code",
        text: `Your Synopse verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      }),
    });

    if (!response.ok) throw new Error("Email provider could not send the verification code.");
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
    throw new Error("SMS delivery is not configured. Set Twilio credentials and a messaging service or sender number.");
  }

  const phoneNumber = normalizePhoneNumber(destination);
  if (!phoneNumber) throw new Error("The registered mobile number is not in international format.");

  const message = new URLSearchParams({
    To: phoneNumber,
    Body: `Your Synopse verification code is ${code}. It expires in 10 minutes.`,
  });
  if (messagingServiceSid) message.set("MessagingServiceSid", messagingServiceSid);
  else message.set("From", fromNumber ?? "");

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: message,
  });

  if (!response.ok) throw new Error("SMS provider could not send the verification code.");
}

export function destinationForMfa(mode: MfaMode, user: { email: string | null; phoneNumber: string | null }) {
  return mode === "email" ? user.email : user.phoneNumber;
}
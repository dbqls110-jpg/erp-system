import { NextResponse } from "next/server";
import { google } from "googleapis";

const CALLBACK_URL = "https://erp-system-lojo.onrender.com/api/admin/drive-callback";

export async function GET() {
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    CALLBACK_URL,
  );

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive"],
    prompt: "consent",
    login_hint: "dbqls110@gmail.com",
  });

  return NextResponse.json({ authUrl });
}

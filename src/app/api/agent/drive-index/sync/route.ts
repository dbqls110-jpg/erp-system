import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { verifyBridgeApiKey } from "@/lib/agentAuth";
import { authOptions } from "@/lib/auth";
import { syncDriveIndex } from "@/lib/driveIndex";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const bridgeAuthorized = verifyBridgeApiKey(req, "hermes");
  if (!bridgeAuthorized) {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await syncDriveIndex();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Drive 색인 동기화 실패" },
      { status: 500 },
    );
  }
}

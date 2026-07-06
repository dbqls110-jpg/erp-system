/**
 * dbqls110@gmail.com Drive refresh_token 발급 스크립트
 * 사용법: node scripts/get-drive-token.mjs
 */
import { createServer } from "http";
import { google } from "googleapis";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env");

// .env에서 클라이언트 ID/Secret 읽기
function readEnv(key) {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.trim().match(new RegExp(`^${key}="?([^"]+)"?$`));
    if (m) return m[1];
  }
  return null;
}

const CLIENT_ID = readEnv("AUTH_GOOGLE_ID");
const CLIENT_SECRET = readEnv("AUTH_GOOGLE_SECRET");
const REDIRECT_URI = "http://localhost:3001/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ AUTH_GOOGLE_ID 또는 AUTH_GOOGLE_SECRET을 .env에서 찾을 수 없습니다.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  scope: ["https://www.googleapis.com/auth/drive"],
  prompt: "consent",
  login_hint: "dbqls110@gmail.com",
});

console.log("\n========================================");
console.log("아래 URL을 브라우저에서 열어 dbqls110@gmail.com으로 인증하세요:\n");
console.log(authUrl);
console.log("========================================\n");
console.log("인증 완료 후 자동으로 refresh_token이 출력됩니다...\n");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3001");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h2>오류: ${error}</h2><p>창을 닫으세요.</p>`);
    server.close();
    return;
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>code 없음</h2>");
    return;
  }

  try {
    const { tokens } = await oauth2.getToken(code);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>완료! 터미널에서 refresh_token을 확인하고 이 창을 닫으세요.</h2>");

    console.log("\n✅ 토큰 발급 성공!");
    console.log("========================================");
    console.log("GOOGLE_DRIVE_OWNER_REFRESH_TOKEN 값:");
    console.log(tokens.refresh_token);
    console.log("========================================");
    console.log("위 값을 Render 환경변수에 추가하세요.\n");

    server.close();
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h2>오류: ${err.message}</h2>`);
    server.close();
  }
});

server.listen(3001, () => {
  console.log("로컬 서버 대기 중 (port 3001)...");
});

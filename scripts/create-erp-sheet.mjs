#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENV_PATH = path.join("agent_bridge", "hermes.env");

function printHelp() {
  console.log(`ERP 사용자 계정으로 Google Sheet를 생성합니다.

사용법:
  npm run sheet:create -- --title "매출 현황" --tabs "현황"

옵션:
  --title <제목>          시트 파일 제목 (필수)
  --tabs <탭1,탭2>        쉼표로 구분한 탭 이름 (기본값: Sheet1)
  --data <JSON|@파일>     탭별 초기 데이터 JSON
  --folder <폴더명>       ERP 하위 폴더 이름
  --agent-type <유형>     hermes 또는 marketer
  --env <경로>            환경변수 파일 (기본값: agent_bridge/hermes.env)
  --base-url <URL>        ERP 주소 직접 지정
  --dry-run               실제 생성 없이 요청만 검증
  --help                  도움말

초기 데이터 예:
  --data "{\\"현황\\":[[\\"항목\\",\\"금액\\"],[\\"매출\\",\\"100000\\"]]}"
  --data "@sheet-data.json"
`);
}

function parseArgs(argv) {
  const options = {};
  const valueOptions = new Map([
    ["--title", "title"],
    ["--tabs", "tabs"],
    ["--data", "data"],
    ["--folder", "folderName"],
    ["--agent-type", "agentType"],
    ["--env", "envPath"],
    ["--base-url", "baseUrl"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    const optionName = valueOptions.get(arg);
    if (!optionName) {
      throw new Error(`알 수 없는 옵션입니다: ${arg}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} 뒤에 값을 입력해 주세요.`);
    }
    options[optionName] = value;
    index += 1;
  }

  return options;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const parsed = {};
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

function parseInitialData(rawData) {
  if (!rawData) return {};

  let jsonText = rawData;
  if (rawData.startsWith("@")) {
    const dataPath = path.resolve(process.cwd(), rawData.slice(1));
    jsonText = fs.readFileSync(dataPath, "utf8");
  }

  const data = JSON.parse(jsonText);
  if (!data || Array.isArray(data) || typeof data !== "object") {
    throw new Error("--data는 탭 이름을 키로 사용하는 JSON 객체여야 합니다.");
  }
  return data;
}

function cleanBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.title?.trim()) {
    throw new Error("--title은 필수입니다. --help에서 예시를 확인할 수 있습니다.");
  }

  const envPath = path.resolve(
    process.cwd(),
    options.envPath || DEFAULT_ENV_PATH,
  );
  const fileEnv = parseEnvFile(envPath);
  const baseUrl = cleanBaseUrl(
    options.baseUrl || process.env.ERP_BASE_URL || fileEnv.ERP_BASE_URL || "",
  );
  const apiKey =
    process.env.ERP_AGENT_API_KEY || fileEnv.ERP_AGENT_API_KEY || "";
  const agentType =
    options.agentType || process.env.AGENT_TYPE || fileEnv.AGENT_TYPE || "hermes";

  if (!baseUrl) {
    throw new Error(
      `ERP_BASE_URL을 찾지 못했습니다. 환경변수 또는 ${envPath}를 확인해 주세요.`,
    );
  }
  if (!apiKey) {
    throw new Error(
      `ERP_AGENT_API_KEY를 찾지 못했습니다. 환경변수 또는 ${envPath}를 확인해 주세요.`,
    );
  }
  if (!["hermes", "marketer"].includes(agentType)) {
    throw new Error("--agent-type은 hermes 또는 marketer여야 합니다.");
  }

  const tabs = (options.tabs || "Sheet1")
    .split(",")
    .map((tab) => tab.trim())
    .filter(Boolean);
  const data = parseInitialData(options.data);
  const payload = {
    agentType,
    title: options.title.trim(),
    tabs: tabs.length > 0 ? tabs : ["Sheet1"],
    data,
    dryRun: options.dryRun === true,
    ...(options.folderName ? { folderName: options.folderName.trim() } : {}),
  };

  const response = await fetch(`${baseUrl}/api/agent/sheets/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });

  const rawBody = await response.text();
  let result;
  try {
    result = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    result = { error: rawBody || "응답 본문이 비어 있습니다." };
  }

  if (!response.ok) {
    const code = result.code ? ` [${result.code}]` : "";
    const detail = result.detail ? `\n상세: ${result.detail}` : "";
    throw new Error(
      `시트 생성 실패 (HTTP ${response.status})${code}: ${
        result.error || "알 수 없는 오류"
      }${detail}`,
    );
  }

  if (result.dryRun) {
    console.log("검증 성공: 실제 파일은 생성하지 않았습니다.");
    console.log(`제목: ${result.preview?.title || payload.title}`);
    console.log(`위치: ${result.preview?.folderPath || "-"}`);
    console.log(`탭: ${(result.preview?.tabs || payload.tabs).join(", ")}`);
    return;
  }

  console.log("시트 생성 완료");
  console.log(`제목: ${result.title || payload.title}`);
  console.log(`위치: ${result.folderPath || "-"}`);
  console.log(`링크: ${result.url}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

export type PartyQuoteTarget = { kind: "customer" | "partner"; id: string };
export const PARTY_QUOTE_MAX_BYTES = 10 * 1024 * 1024;
export const PARTY_QUOTE_ACCEPT = ".pdf,.xlsx,.xls,.jpg,.jpeg,.png";

export function parsePartyQuoteTarget(value: unknown): PartyQuoteTarget {
  if (!value || typeof value !== "object" || !("kind" in value) || !("id" in value)
    || (value.kind !== "customer" && value.kind !== "partner") || typeof value.id !== "string"
    || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id)) throw Error("견적서를 연결할 거래처·파트너를 확인해 주세요.");
  return { kind: value.kind, id: value.id };
}

const formats = {
  pdf: { mime: "application/pdf", magic: [0x25,0x50,0x44,0x46,0x2d] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: [0x50,0x4b,0x03,0x04] },
  xls: { mime: "application/vnd.ms-excel", magic: [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1] },
  jpg: { mime: "image/jpeg", magic: [0xff,0xd8,0xff] },
  jpeg: { mime: "image/jpeg", magic: [0xff,0xd8,0xff] },
  png: { mime: "image/png", magic: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] },
};
export function validatePartyQuote(file: { name: string; size: number; type: string }, buffer: Uint8Array) {
  if (file.size <= 0 || file.size > PARTY_QUOTE_MAX_BYTES || buffer.length !== file.size) throw Error("견적서는 파일당 10MB 이하만 첨부할 수 있습니다.");
  const name = file.name.normalize("NFC").trim();
  if (!name || name.length > 200 || /[\x00-\x1f\x7f/\\]/.test(name)) throw Error("파일명이 올바르지 않습니다.");
  const extension = name.toLowerCase().split(".").pop();
  const format = Object.entries(formats).find(([key]) => key === extension)?.[1];
  if (!format || !format.magic.every((byte, index) => buffer[index] === byte)) throw Error("PDF·엑셀·JPG·PNG 원본 파일만 첨부해 주세요.");
  if (file.type && file.type !== "application/octet-stream" && file.type !== format.mime) throw Error("확장자와 파일 형식이 일치하지 않습니다.");
  return { name, mimeType: format.mime };
}

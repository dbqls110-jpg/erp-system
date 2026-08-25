"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

import type { ResultColumn, ResultTablePayload } from "@/lib/messageSegments";
import { VenueMap } from "@/components/map/VenueMap";

function Cell({ value, column }: { value: unknown; column: ResultColumn }) {
  if (column.missing) {
    return <span className="text-muted-foreground/60">정보 없음</span>;
  }
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground/60">미상</span>;
  }
  return <span className="text-foreground">{String(value)}</span>;
}

export function ResultTable({ payload }: { payload: ResultTablePayload }) {
  const { title, columns, rows, notes, pins } = payload;

  return (
    <div className="space-y-2">
      {title && <p className="text-xs font-medium text-foreground">{title}</p>}

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">조건에 맞는 항목이 없습니다.</p>
      ) : (
        // 표는 반드시 자기 안에서 가로 스크롤해야 한다. 위젯 폭이 좁아서
        // 그러지 않으면 말풍선이 화면 밖으로 밀려난다.
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-2.5 py-1.5 font-medium whitespace-nowrap text-muted-foreground",
                      col.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-2.5 py-1.5 whitespace-nowrap",
                        col.align === "right" ? "text-right tabular-nums" : "text-left",
                      )}
                    >
                      <Cell value={row[col.key]} column={col} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pins && pins.length > 0 && <VenueMap pins={pins} />}

      {notes && notes.length > 0 && (
        <ul className="space-y-1">
          {notes.map((note, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

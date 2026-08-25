"use client";

import dynamic from "next/dynamic";

const FinanceCharts = dynamic(
  () => import("./FinanceCharts").then(m => ({ default: m.FinanceCharts })),
  { ssr: false, loading: () => <div className="h-40 animate-pulse bg-muted/30 rounded-xl" /> }
);

export { FinanceCharts };

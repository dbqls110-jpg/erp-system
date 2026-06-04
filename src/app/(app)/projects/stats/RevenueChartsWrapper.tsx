"use client";

import dynamic from "next/dynamic";

const RevenueCharts = dynamic(
  () => import("./RevenueCharts").then(m => ({ default: m.RevenueCharts })),
  { ssr: false, loading: () => <div className="h-60 animate-pulse bg-ash-gray/30 rounded-xl" /> }
);

export { RevenueCharts };

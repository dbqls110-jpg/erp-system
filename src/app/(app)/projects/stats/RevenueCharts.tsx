"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface DataPoint {
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface Props {
  monthlyData: DataPoint[];
  quarterlyData: DataPoint[];
  yearlyData: DataPoint[];
}

const fmt = (v: number) => `${(v / 10000).toFixed(0)}만`;

export function RevenueCharts({ monthlyData, quarterlyData, yearlyData }: Props) {
  return (
    <div className="space-y-6">
      {/* 월별 */}
      <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-smoke-gray">월별 매출/매입</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}원` : ""} />
              <Legend />
              <Bar dataKey="revenue" name="매출" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="cost" name="매입" fill="#ff5b36" radius={[3, 3, 0, 0]} />
              <Bar dataKey="profit" name="순이익" fill="#7b68ee" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 분기별 */}
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-smoke-gray">분기별 매출/매입</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {quarterlyData.map((q) => (
                <div key={q.label} className="text-sm">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-medium text-midnight-charcoal w-12">{q.label}</span>
                    <div className="flex gap-4 text-xs">
                      <span className="text-green-600">매출 {q.revenue.toLocaleString()}원</span>
                      <span className="text-warm-fade">매입 {q.cost.toLocaleString()}원</span>
                      <span className={q.profit >= 0 ? "text-deep-violet" : "text-destructive"}>
                        순이익 {q.profit.toLocaleString()}원
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 연별 */}
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-smoke-gray">연간 매출/매입</CardTitle>
          </CardHeader>
          <CardContent>
            {yearlyData.length === 0 ? (
              <p className="text-sm text-smoke-gray">데이터가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {yearlyData.map((y) => (
                  <div key={y.label} className="text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-midnight-charcoal w-14">{y.label}</span>
                      <div className="flex gap-4 text-xs">
                        <span className="text-green-600">매출 {y.revenue.toLocaleString()}원</span>
                        <span className="text-warm-fade">매입 {y.cost.toLocaleString()}원</span>
                        <span className={y.profit >= 0 ? "text-deep-violet" : "text-destructive"}>
                          순이익 {y.profit.toLocaleString()}원
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

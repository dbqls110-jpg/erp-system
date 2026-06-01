"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

interface Props {
  categoryData: { name: string; value: number; color: string }[];
  dailyData: { date: string; amount: number }[];
  budget?: number;
  totalExpense: number;
}

export function FinanceCharts({ categoryData, dailyData, budget, totalExpense }: Props) {
  const usagePercent = budget ? Math.min(Math.round((totalExpense / budget) * 100), 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 도넛 차트 */}
      {categoryData.length > 0 && (
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-smoke-gray">카테고리별 지출</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value">
                    {categoryData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}원` : ""} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1">
                {categoryData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-midnight-charcoal">{item.name}</span>
                    <span className="text-smoke-gray">{item.value.toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            </div>
            {budget && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-smoke-gray mb-1">
                  <span>예산 사용률</span><span>{usagePercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-ash-gray overflow-hidden">
                  <div className="h-full rounded-full bg-deep-violet transition-all" style={{ width: `${usagePercent}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 라인 차트 */}
      {dailyData.length > 0 && (
        <Card className="border-ash-gray shadow-[var(--shadow-sm)]">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-smoke-gray">일별 지출 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                <Tooltip formatter={(v) => typeof v === "number" ? `${v.toLocaleString()}원` : ""} />
                <Line type="monotone" dataKey="amount" stroke="#7b68ee" strokeWidth={2} dot={{ fill: "#7b68ee", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

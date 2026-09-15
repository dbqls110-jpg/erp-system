"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function FinanceTabs({
  budget,
  netIncome,
}: {
  budget: ReactNode;
  netIncome: ReactNode;
}) {
  return (
    <Tabs defaultValue="budget" className="space-y-4">
      <TabsList className="h-9 rounded-[10px] bg-muted/50 p-1">
        <TabsTrigger value="budget" className="rounded-[8px] px-3 text-[13px]">예산·지출</TabsTrigger>
        <TabsTrigger value="net-income" className="rounded-[8px] px-3 text-[13px]">당기순이익</TabsTrigger>
      </TabsList>
      <TabsContent value="budget">{budget}</TabsContent>
      <TabsContent value="net-income">{netIncome}</TabsContent>
    </Tabs>
  );
}

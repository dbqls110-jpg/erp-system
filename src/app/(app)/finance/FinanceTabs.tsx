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
      <TabsList>
        <TabsTrigger value="budget">예산·지출</TabsTrigger>
        <TabsTrigger value="net-income">당기순이익</TabsTrigger>
      </TabsList>
      <TabsContent value="budget">{budget}</TabsContent>
      <TabsContent value="net-income">{netIncome}</TabsContent>
    </Tabs>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateNetIncome, calculateOperatingProfit } from "@/lib/financeMetrics";

interface FinanceProject {
  id: string;
  name: string;
  revenue: number | null;
  cost: number | null;
}

function formatAmount(value: number | null): string {
  return value === null ? "미입력" : `${value.toLocaleString()}원`;
}

export function NetIncomeTable({ projects }: { projects: FinanceProject[] }) {
  const completeProjects = projects.filter((project) => project.revenue !== null && project.cost !== null);
  const totalRevenue = completeProjects.reduce((sum, project) => sum + (project.revenue ?? 0), 0);
  const totalCost = completeProjects.reduce((sum, project) => sum + (project.cost ?? 0), 0);
  const totalOperatingProfit = completeProjects.reduce(
    (sum, project) => sum + (calculateOperatingProfit(project.revenue, project.cost) ?? 0),
    0,
  );
  const totalNetIncome = completeProjects.reduce(
    (sum, project) => sum + (calculateNetIncome(project.revenue, project.cost) ?? 0),
    0,
  );
  const formatTotal = (value: number) => completeProjects.length === 0 ? "미입력" : formatAmount(value);

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle className="text-base font-semibold">프로젝트별 당기순이익</CardTitle>
        <CardDescription>매출과 매입이 모두 입력된 프로젝트만 영업이익과 당기순이익을 계산합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">등록된 프로젝트가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">프로젝트</th>
                  <th className="px-3 py-2 text-right font-medium">매출</th>
                  <th className="px-3 py-2 text-right font-medium">매입</th>
                  <th className="px-3 py-2 text-right font-medium">영업이익</th>
                  <th className="px-3 py-2 text-right font-medium">당기순이익</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const operatingProfit = calculateOperatingProfit(project.revenue, project.cost);
                  const netIncome = calculateNetIncome(project.revenue, project.cost);
                  return (
                    <tr key={project.id} className="border-b last:border-0">
                      <td className="px-3 py-2.5 font-medium">{project.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatAmount(project.revenue)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatAmount(project.cost)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${operatingProfit !== null && operatingProfit < 0 ? "text-destructive" : ""}`}>
                        {formatAmount(operatingProfit)}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${netIncome !== null && netIncome < 0 ? "text-destructive" : ""}`}>
                        {formatAmount(netIncome)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="px-3 py-3">합계 <span className="text-xs font-normal text-muted-foreground">(계산 가능 프로젝트)</span></td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatTotal(totalRevenue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatTotal(totalCost)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${totalOperatingProfit < 0 ? "text-destructive" : ""}`}>
                    {formatTotal(totalOperatingProfit)}
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums ${totalNetIncome < 0 ? "text-destructive" : ""}`}>
                    {formatTotal(totalNetIncome)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

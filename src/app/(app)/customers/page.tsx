import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export default function CustomersPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-muted-foreground">고객·협력사 정보</p>
      </div>
      <Card className="shadow-xs">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Building2 className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">아직 등록된 항목이 없습니다</p>
        </CardContent>
      </Card>
    </div>
  );
}

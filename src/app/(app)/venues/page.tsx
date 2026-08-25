import { Card, CardContent } from "@/components/ui/card";
import { MapPin } from "lucide-react";

export default function VenuesPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="mt-1 text-sm text-muted-foreground">대관 가능한 공간 목록</p>
      </div>
      <Card className="shadow-xs">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <MapPin className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">아직 등록된 항목이 없습니다</p>
        </CardContent>
      </Card>
    </div>
  );
}

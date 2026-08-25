import { Download, Handshake, Plus, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function PartnersPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">파트너사와 계약 현황</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-9 py-2">
            <RefreshCw className="size-3.5" /> 새로고침
          </Button>
          <Button className="h-9 py-2">
            <Plus className="size-3.5" /> 등록
          </Button>
        </div>
      </div>

      <Card className="shadow-xs">
        <CardContent className="space-y-3 pt-(--card-spacing)">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">계약상태</span>
            <select defaultValue="all-status" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-36">
                  <option value="all-status">전체</option>
                  <option value="active">진행중</option>
                  <option value="expired">만료</option>
                  <option value="pending">대기</option>
                </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">정산방식</span>
            <select defaultValue="all-settlement" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-36">
                  <option value="all-settlement">전체</option>
                  <option value="monthly">월정산</option>
                  <option value="per-case">건별</option>
                </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">검색키워드</span>
            <Input className="h-8 w-72" placeholder="파트너사명 또는 담당자 입력" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className="h-8">초기화</Button>
            <Button className="h-8">조회</Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm">총 <span className="font-semibold text-primary">0</span>건</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-8"><Download className="size-3.5" /> 엑셀 다운로드</Button>
          <select defaultValue="latest" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-32">
                  <option value="latest">최종수정일순</option>
                  <option value="name">파트너사명순</option>
                </select>
          <select defaultValue="10" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-28">
                  <option value="10">10개씩 보기</option>
                  <option value="20">20개씩 보기</option>
                  <option value="50">50개씩 보기</option>
                </select>
        </div>
      </div>

      <Card className="shadow-xs py-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="[&_:is(th,td)]:px-4">
              <TableHeader>
                <TableRow>
                  <TableHead>파트너사명</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>계약상태</TableHead>
                  <TableHead>계약기간</TableHead>
                  <TableHead>정산방식</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>최종수정일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Handshake className="size-6 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">아직 등록된 항목이 없습니다</p>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

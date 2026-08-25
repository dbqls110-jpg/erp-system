import { Download, Handshake, Plus, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
            <Select defaultValue="all-status">
              <SelectTrigger className="h-8 w-36"><SelectValue placeholder="전체" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all-status">전체</SelectItem>
                <SelectItem value="active">진행중</SelectItem>
                <SelectItem value="expired">만료</SelectItem>
                <SelectItem value="pending">대기</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">정산방식</span>
            <Select defaultValue="all-settlement">
              <SelectTrigger className="h-8 w-36"><SelectValue placeholder="전체" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all-settlement">전체</SelectItem>
                <SelectItem value="monthly">월정산</SelectItem>
                <SelectItem value="per-case">건별</SelectItem>
              </SelectContent>
            </Select>
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
          <Select defaultValue="latest">
            <SelectTrigger className="h-8 w-32"><SelectValue placeholder="정렬" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">최종수정일순</SelectItem>
              <SelectItem value="name">파트너사명순</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="10">
            <SelectTrigger className="h-8 w-28"><SelectValue placeholder="10개씩 보기" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10개씩 보기</SelectItem>
              <SelectItem value="20">20개씩 보기</SelectItem>
              <SelectItem value="50">50개씩 보기</SelectItem>
            </SelectContent>
          </Select>
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

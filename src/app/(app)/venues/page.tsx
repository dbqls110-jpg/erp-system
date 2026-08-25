import { Download, MapPin, Plus, RefreshCw } from "lucide-react"

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

const districts = [
  "전체",
  "강남구",
  "강동구",
  "강북구",
  "강서구",
  "관악구",
  "광진구",
  "구로구",
  "금천구",
  "노원구",
  "도봉구",
  "동대문구",
  "동작구",
  "마포구",
  "서대문구",
  "서초구",
  "성동구",
  "성북구",
  "송파구",
  "양천구",
  "영등포구",
  "용산구",
  "은평구",
  "종로구",
  "중구",
  "중랑구",
]

const venueTypes = [
  "전체",
  "체육관",
  "공연장",
  "다목적실",
  "회의실·세미나실",
  "강당·강의실",
  "전시장·컨벤션",
]

const capacityOptions = ["전체", "100명 미만", "100~300", "300~500", "500명 이상"]
const weekendOptions = ["전체", "가능", "불가", "사전협의"]

export default function VenuesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">대관 가능한 공간 목록</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-9 py-2">
            <RefreshCw className="size-3.5" />
            새로고침
          </Button>
          <Button className="h-9 py-2">
            <Plus className="size-3.5" />
            등록
          </Button>
        </div>
      </div>

      <Card className="shadow-xs">
        <CardContent className="space-y-3 pt-(--card-spacing)">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">자치구</span>
            <select defaultValue="전체" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-44">

                </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">유형</span>
            <select defaultValue="전체" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-52">

                </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">수용인원</span>
            <select defaultValue="전체" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-44">

                </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">주말이용</span>
            <select defaultValue="전체" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-44">

                </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">검색키워드</span>
            <Input className="h-8 w-64" placeholder="공간명" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className="h-8">
              초기화
            </Button>
            <Button className="h-8">조회</Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm">
          총 <span className="font-semibold text-primary">0</span>건
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-8">
            <Download className="size-3.5" />
            엑셀 다운로드
          </Button>
          <select defaultValue="latest" className="h-8 rounded-2xl border border-transparent bg-input/50 px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/30 w-32">
                  <option value="latest">최신 등록순</option>
                  <option value="name">공간명순</option>
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
                  <TableHead>공간명</TableHead>
                  <TableHead>자치구</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>수용인원</TableHead>
                  <TableHead>대관료</TableHead>
                  <TableHead>주말이용</TableHead>
                  <TableHead>대관방법</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <MapPin className="size-6 text-muted-foreground" />
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


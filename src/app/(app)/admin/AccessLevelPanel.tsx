"use client"

import * as React from "react"
import { ChevronDown, ChevronUp, Pencil, Plus, Save, Trash2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MENU_KEYS } from "@/lib/menu-keys"

type AccessLevel = {
  id: string
  name: string
  key: string
  rank: number
  isSystem: boolean
}

type MenuAccess = {
  menuKey: string
  levelKey: string
  canView: boolean
  canEdit: boolean
}

type AccessLevelsResponse = {
  levels: AccessLevel[]
  menuAccess: MenuAccess[]
}

/** 위에 있을수록 높은 레벨. rank 숫자 자체는 화면에 내보내지 않는다. */
function sortLevels(levels: AccessLevel[]) {
  return [...levels].sort((left, right) => right.rank - left.rank)
}

function accessSignature(rows: MenuAccess[]) {
  return [...rows]
    .sort((left, right) => `${left.menuKey}:${left.levelKey}`.localeCompare(`${right.menuKey}:${right.levelKey}`))
    .map((row) => `${row.menuKey}:${row.levelKey}:${row.canView ? 1 : 0}:${row.canEdit ? 1 : 0}`)
    .join("|")
}

async function getApiError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: unknown }
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error
    }
  } catch {
    // JSON 이 아니면 아래 기본 문구를 쓴다.
  }
  return "요청을 처리하지 못했습니다."
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다."
}

export default function AccessLevelPanel() {
  const [levels, setLevels] = React.useState<AccessLevel[]>([])
  const [menuAccess, setMenuAccess] = React.useState<MenuAccess[]>([])
  const [savedMenuAccess, setSavedMenuAccess] = React.useState<MenuAccess[]>([])
  const [newName, setNewName] = React.useState("")
  const [newKey, setNewKey] = React.useState("")
  const [editingLevelId, setEditingLevelId] = React.useState<string | null>(null)
  const [editingName, setEditingName] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  /** menuKey → levelKey → 권한 */
  const accessByMenu = React.useMemo(() => {
    const map = new Map<string, Map<string, MenuAccess>>()
    for (const row of menuAccess) {
      const forMenu = map.get(row.menuKey) ?? new Map<string, MenuAccess>()
      forMenu.set(row.levelKey, row)
      map.set(row.menuKey, forMenu)
    }
    return map
  }, [menuAccess])

  // 첫 await 이전에 setState 를 부르지 않는다. 그러면 마운트 이펙트가 동기 렌더를
  // 연쇄시켜 react-hooks/set-state-in-effect 에 걸린다. loading 은 초기값이 이미
  // true 이므로 여기서 다시 켤 필요도 없다.
  const load = React.useCallback(async () => {
    try {
      const response = await fetch("/api/admin/access-levels", { cache: "no-store" })
      if (!response.ok) throw new Error(await getApiError(response))
      const payload = (await response.json()) as AccessLevelsResponse
      setLevels(sortLevels(payload.levels ?? []))
      setMenuAccess(payload.menuAccess ?? [])
      setSavedMenuAccess(payload.menuAccess ?? [])
      setError(null)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  const hasPendingAccessChanges = React.useMemo(
    () => accessSignature(menuAccess) !== accessSignature(savedMenuAccess),
    [menuAccess, savedMenuAccess],
  )

  React.useEffect(() => {
    async function loadOnMount() {
      await load()
    }
    void loadOnMount()
  }, [load])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const name = newName.trim()
    const key = newKey.trim()
    if (!name || !key) {
      setError("이름과 key 를 입력해 주세요.")
      return
    }

    setBusy("create")
    try {
      const response = await fetch("/api/admin/access-levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, key }),
      })
      if (!response.ok) throw new Error(await getApiError(response))
      const created = (await response.json()) as AccessLevel
      setLevels((current) => sortLevels([...current, created]))
      setNewName("")
      setNewKey("")
      setNotice(`'${created.name}' 레벨을 맨 아래에 추가했습니다.`)
    } catch (createError) {
      setError(getErrorMessage(createError))
    } finally {
      setBusy(null)
    }
  }

  const handleRename = async (event: React.FormEvent<HTMLFormElement>, level: AccessLevel) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const name = editingName.trim()
    if (!name) {
      setError("이름을 입력해 주세요.")
      return
    }

    setBusy(level.id)
    try {
      const response = await fetch("/api/admin/access-levels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: level.id, name }),
      })
      if (!response.ok) throw new Error(await getApiError(response))
      const updated = (await response.json()) as AccessLevel
      setLevels((current) => sortLevels(current.map((l) => (l.id === level.id ? updated : l))))
      setEditingLevelId(null)
      setNotice("이름을 바꿨습니다.")
    } catch (renameError) {
      setError(getErrorMessage(renameError))
    } finally {
      setBusy(null)
    }
  }

  const handleMove = async (level: AccessLevel, direction: "up" | "down") => {
    setError(null)
    setNotice(null)
    setBusy(level.id)
    try {
      const response = await fetch("/api/admin/access-levels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: level.id, direction }),
      })
      if (!response.ok) throw new Error(await getApiError(response))
      // 순서는 서버가 정하므로 응답만 믿지 않고 다시 읽는다.
      await load()
    } catch (moveError) {
      setError(getErrorMessage(moveError))
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (level: AccessLevel) => {
    if (level.isSystem) return
    if (!window.confirm(`'${level.name}' 레벨을 삭제하시겠습니까?`)) return

    setError(null)
    setNotice(null)
    setBusy(level.id)
    try {
      const response = await fetch("/api/admin/access-levels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: level.id }),
      })
      if (!response.ok) throw new Error(await getApiError(response))
      setLevels((current) => current.filter((l) => l.id !== level.id))
      setMenuAccess((current) => current.filter((row) => row.levelKey !== level.key))
      setSavedMenuAccess((current) => current.filter((row) => row.levelKey !== level.key))
      setNotice("레벨을 삭제했습니다.")
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    } finally {
      setBusy(null)
    }
  }

  /**
   * 체크박스 하나를 바꾸면 화면에 임시 반영한다. 저장은 사용자가 확인한 뒤 일괄 처리한다.
   *
   * 접근을 끄면 수정도 같이 꺼지고, 수정을 켜면 접근이 같이 켜진다 —
   * 못 들어가는데 고칠 수 있는 상태는 존재할 수 없다.
   */
  const handleToggle = (
    menuKey: string,
    levelKey: string,
    field: "canView" | "canEdit",
    checked: boolean,
  ) => {
    if (busy !== null) return

    setError(null)
    setNotice(null)
    const forMenu = accessByMenu.get(menuKey) ?? new Map<string, MenuAccess>()
    const next = new Map(forMenu)
    const existing = next.get(levelKey) ?? { menuKey, levelKey, canView: false, canEdit: false }
    const updated = { ...existing, [field]: checked }
    if (field === "canView" && !checked) updated.canEdit = false
    if (field === "canEdit" && checked) updated.canView = true
    next.set(levelKey, updated)

    const entries = [...next.values()].map((row) => ({
      levelKey: row.levelKey,
      canView: row.canView,
      canEdit: row.canEdit,
    }))

    setMenuAccess((current) => [
      ...current.filter((row) => row.menuKey !== menuKey),
      ...entries.filter((row) => row.canView || row.canEdit).map((row) => ({ menuKey, ...row })),
    ])
    setNotice("변경사항이 저장 대기 중입니다. 아래 저장 버튼을 눌러 반영하세요.")
  }

  const handleSaveAccess = async () => {
    if (!hasPendingAccessChanges || busy !== null) return

    setError(null)
    setNotice(null)
    setBusy("access-save")
    const menuKeys = [...new Set([...savedMenuAccess, ...menuAccess].map((row) => row.menuKey))]
    const changedMenuKeys = menuKeys.filter((menuKey) => {
      const before = savedMenuAccess.filter((row) => row.menuKey === menuKey)
      const after = menuAccess.filter((row) => row.menuKey === menuKey)
      return accessSignature(before) !== accessSignature(after)
    })

    try {
      await Promise.all(changedMenuKeys.map(async (menuKey) => {
        const entries = menuAccess
          .filter((row) => row.menuKey === menuKey)
          .map(({ levelKey, canView, canEdit }) => ({ levelKey, canView, canEdit }))
        const response = await fetch("/api/admin/access-levels", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuKey, entries }),
        })
        if (!response.ok) throw new Error(await getApiError(response))
      }))
      setSavedMenuAccess(menuAccess.map((row) => ({ ...row })))
      setNotice("메뉴 권한 변경사항을 저장했습니다.")
    } catch (saveError) {
      await load()
      setError(getErrorMessage(saveError))
    } finally {
      setBusy(null)
    }
  }

  const handleResetAccess = () => {
    if (!hasPendingAccessChanges || busy !== null) return
    setMenuAccess(savedMenuAccess.map((row) => ({ ...row })))
    setNotice("저장 대기 중인 변경사항을 되돌렸습니다.")
    setError(null)
  }

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{notice}</p> : null}

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>접근 레벨</CardTitle>
          <CardDescription>
            위에 있을수록 높은 레벨입니다. 화살표로 순서를 바꿉니다
            {loading ? " · 불러오는 중…" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <p className="px-3 pt-2 text-xs text-muted-foreground md:hidden">표를 좌우로 밀어 더 많은 열을 볼 수 있습니다.</p>
            <Table className="[&_:is(th,td)]:px-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">순서</TableHead>
                  <TableHead>레벨</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levels.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      등록된 접근 레벨이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {levels.map((level, index) => {
                  const isEditing = editingLevelId === level.id
                  const isBusy = busy === level.id

                  return (
                    <TableRow key={level.id}>
                      {isEditing ? (
                        <TableCell colSpan={4}>
                          <form
                            onSubmit={(event) => void handleRename(event, level)}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <Input
                              aria-label="레벨 이름"
                              value={editingName}
                              onChange={(event) => setEditingName(event.target.value)}
                              disabled={isBusy}
                              className="h-8 max-w-60"
                              autoFocus
                            />
                            <Button type="submit" variant="outline" className="h-8" disabled={isBusy}>
                              <Save className="size-3.5" />
                              저장
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8"
                              onClick={() => setEditingLevelId(null)}
                              disabled={isBusy}
                            >
                              <X className="size-3.5" />
                              취소
                            </Button>
                          </form>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={`${level.name} 위로`}
                                disabled={index === 0 || isBusy}
                                onClick={() => void handleMove(level, "up")}
                              >
                                <ChevronUp className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                aria-label={`${level.name} 아래로`}
                                disabled={index === levels.length - 1 || isBusy}
                                onClick={() => void handleMove(level, "down")}
                              >
                                <ChevronDown className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{level.name}</span>
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {level.key}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{level.isSystem ? "기본" : "추가"}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8"
                                onClick={() => {
                                  setEditingLevelId(level.id)
                                  setEditingName(level.name)
                                }}
                                disabled={isBusy}
                              >
                                <Pencil className="size-3.5" />
                                이름 변경
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8 text-destructive hover:text-destructive"
                                onClick={() => void handleDelete(level)}
                                disabled={level.isSystem || isBusy}
                                title={level.isSystem ? "기본 레벨은 삭제할 수 없습니다" : undefined}
                              >
                                <Trash2 className="size-3.5" />
                                삭제
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <form
            onSubmit={(event) => void handleCreate(event)}
            className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
          >
            <div className="space-y-1.5">
              <label htmlFor="access-level-name" className="text-sm font-medium">
                이름
              </label>
              <Input
                id="access-level-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="예: 인턴"
                className="h-8"
                disabled={busy === "create"}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="access-level-key" className="text-sm font-medium">
                key <span className="text-muted-foreground">(영문 소문자)</span>
              </label>
              <Input
                id="access-level-key"
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                placeholder="예: intern"
                className="h-8 font-mono"
                disabled={busy === "create"}
              />
            </div>
            <Button type="submit" className="h-9 py-2" disabled={busy === "create"}>
              <Plus className="size-3.5" />
              {busy === "create" ? "추가 중…" : "레벨 추가"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>메뉴별 권한</CardTitle>
          <CardDescription>
            접근은 메뉴에 들어갈 수 있는지, 수정은 그 안에서 자료를 고칠 수 있는지입니다.
            체크 후 저장하면 반영됩니다. 관리자는 설정과 무관하게 항상 전부 허용됩니다.
          </CardDescription>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {hasPendingAccessChanges ? "저장 대기 중인 변경사항이 있습니다." : "모든 변경사항이 저장되었습니다."}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetAccess}
                disabled={!hasPendingAccessChanges || busy !== null}
              >
                되돌리기
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSaveAccess()}
                disabled={!hasPendingAccessChanges || busy !== null}
              >
                {busy === "access-save" ? "저장 중…" : "변경사항 저장"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {levels.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">접근 레벨을 먼저 추가해 주세요.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <p className="px-3 pt-2 text-xs text-muted-foreground md:hidden">권한표를 좌우로 밀어 더 많은 열을 볼 수 있습니다.</p>
              <Table className="[&_:is(th,td)]:px-4">
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="align-bottom">
                      메뉴
                    </TableHead>
                    {levels.map((level) => (
                      <TableHead key={level.id} colSpan={2} className="border-l text-center">
                        {level.name}
                      </TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    {levels.map((level) => (
                      <React.Fragment key={level.id}>
                        <TableHead className="border-l text-center text-xs font-normal">
                          접근
                        </TableHead>
                        <TableHead className="text-center text-xs font-normal">수정</TableHead>
                      </React.Fragment>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MENU_KEYS.map((menu) => {
                    const forMenu = accessByMenu.get(menu.key)
                    const isBusy = busy !== null

                    return (
                      <TableRow key={menu.key}>
                        <TableHead scope="row" className="font-medium whitespace-nowrap">
                          {menu.label}
                        </TableHead>
                        {levels.map((level) => {
                          const row = forMenu?.get(level.key)
                          // 관리자는 코드가 무조건 허용하므로 체크를 끌 수 없게 막는다.
                          // 끌 수 있게 두면 "껐는데 왜 되지"라는 오해만 남는다.
                          const isAdminLevel = level.key === "admin"
                          const canView = isAdminLevel || (row?.canView ?? false)
                          const canEdit = isAdminLevel || (row?.canEdit ?? false)

                          return (
                            <React.Fragment key={level.id}>
                              <TableCell className="border-l text-center">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-primary disabled:opacity-40"
                                  checked={canView}
                                  aria-label={`${menu.label} ${level.name} 접근`}
                                  disabled={isBusy || isAdminLevel}
                                  title={isAdminLevel ? "관리자는 항상 전부 허용됩니다" : undefined}
                                  onChange={(event) =>
                                    void handleToggle(
                                      menu.key,
                                      level.key,
                                      "canView",
                                      event.target.checked,
                                    )
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-primary disabled:opacity-40"
                                  checked={canEdit}
                                  aria-label={`${menu.label} ${level.name} 수정`}
                                  disabled={isBusy || isAdminLevel}
                                  title={isAdminLevel ? "관리자는 항상 전부 허용됩니다" : undefined}
                                  onChange={(event) =>
                                    void handleToggle(
                                      menu.key,
                                      level.key,
                                      "canEdit",
                                      event.target.checked,
                                    )
                                  }
                                />
                              </TableCell>
                            </React.Fragment>
                          )
                        })}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

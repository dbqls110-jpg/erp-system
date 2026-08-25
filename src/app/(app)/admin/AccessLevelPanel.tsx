"use client"

import * as React from "react"
import { Pencil, Plus, Save, Trash2, X } from "lucide-react"

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
import { MENU_KEYS } from "@/lib/permissions"

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
}

type LevelFormState = {
  name: string
  key: string
  rank: string
}

type AccessLevelsResponse = {
  levels: AccessLevel[]
  menuAccess: MenuAccess[]
}

const emptyLevelForm: LevelFormState = {
  name: "",
  key: "",
  rank: "",
}

function sortLevels(levels: AccessLevel[]) {
  return [...levels].sort(
    (left, right) => right.rank - left.rank || left.name.localeCompare(right.name),
  )
}

async function getApiError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: unknown }
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error
    }
  } catch {
    // Use the fallback message when the response is not JSON.
  }

  return "요청을 처리하지 못했습니다."
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다."
}

export default function AccessLevelPanel() {
  const [levels, setLevels] = React.useState<AccessLevel[]>([])
  const [menuAccess, setMenuAccess] = React.useState<MenuAccess[]>([])
  const [levelForm, setLevelForm] = React.useState<LevelFormState>(emptyLevelForm)
  const [editingLevelId, setEditingLevelId] = React.useState<string | null>(null)
  const [editingForm, setEditingForm] = React.useState<LevelFormState>(emptyLevelForm)
  const [loading, setLoading] = React.useState(true)
  const [creating, setCreating] = React.useState(false)
  const [savingLevelId, setSavingLevelId] = React.useState<string | null>(null)
  const [deletingLevelId, setDeletingLevelId] = React.useState<string | null>(null)
  const [savingMenuKey, setSavingMenuKey] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const accessByMenu = React.useMemo(() => {
    const accessMap = new Map<string, Set<string>>()

    for (const access of menuAccess) {
      const levelKeys = accessMap.get(access.menuKey) ?? new Set<string>()
      levelKeys.add(access.levelKey)
      accessMap.set(access.menuKey, levelKeys)
    }

    return accessMap
  }, [menuAccess])

  const loadAccessLevels = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/admin/access-levels", {
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error(await getApiError(response))
      }

      const payload = (await response.json()) as AccessLevelsResponse
      setLevels(sortLevels(payload.levels ?? []))
      setMenuAccess(payload.menuAccess ?? [])
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAccessLevels()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadAccessLevels])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const name = levelForm.name.trim()
    const key = levelForm.key.trim()
    const rankValue = levelForm.rank.trim()
    const rank = Number(rankValue)

    if (!name || !key || !rankValue || !Number.isInteger(rank)) {
      setError("이름, key, 정수 rank를 입력해 주세요.")
      return
    }

    setCreating(true)

    try {
      const response = await fetch("/api/admin/access-levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, key, rank }),
      })

      if (!response.ok) {
        throw new Error(await getApiError(response))
      }

      const createdLevel = (await response.json()) as AccessLevel
      setLevels((currentLevels) => sortLevels([...currentLevels, createdLevel]))
      setLevelForm(emptyLevelForm)
      setNotice("접근 레벨을 추가했습니다.")
    } catch (createError) {
      setError(getErrorMessage(createError))
    } finally {
      setCreating(false)
    }
  }

  const startEditing = (level: AccessLevel) => {
    setError(null)
    setNotice(null)
    setEditingLevelId(level.id)
    setEditingForm({
      name: level.name,
      key: level.key,
      rank: String(level.rank),
    })
  }

  const cancelEditing = () => {
    setEditingLevelId(null)
    setEditingForm(emptyLevelForm)
  }

  const handleEdit = async (event: React.FormEvent<HTMLFormElement>, level: AccessLevel) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const name = editingForm.name.trim()
    const rankValue = editingForm.rank.trim()
    const rank = Number(rankValue)

    if (!name || !rankValue || !Number.isInteger(rank)) {
      setError("이름과 정수 rank를 입력해 주세요.")
      return
    }

    setSavingLevelId(level.id)

    try {
      const response = await fetch("/api/admin/access-levels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: level.id, name, rank }),
      })

      if (!response.ok) {
        throw new Error(await getApiError(response))
      }

      const updatedLevel = (await response.json()) as AccessLevel
      setLevels((currentLevels) =>
        sortLevels(
          currentLevels.map((currentLevel) =>
            currentLevel.id === level.id ? updatedLevel : currentLevel,
          ),
        ),
      )
      cancelEditing()
      setNotice("접근 레벨을 수정했습니다.")
    } catch (editError) {
      setError(getErrorMessage(editError))
    } finally {
      setSavingLevelId(null)
    }
  }

  const handleDelete = async (level: AccessLevel) => {
    if (level.isSystem || !window.confirm(`'${level.name}' 레벨을 삭제하시겠습니까?`)) {
      return
    }

    setError(null)
    setNotice(null)
    setDeletingLevelId(level.id)

    try {
      const response = await fetch("/api/admin/access-levels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: level.id }),
      })

      if (!response.ok) {
        throw new Error(await getApiError(response))
      }

      setLevels((currentLevels) =>
        currentLevels.filter((currentLevel) => currentLevel.id !== level.id),
      )
      setMenuAccess((currentAccess) =>
        currentAccess.filter((access) => access.levelKey !== level.key),
      )
      if (editingLevelId === level.id) {
        cancelEditing()
      }
      setNotice("접근 레벨을 삭제했습니다.")
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    } finally {
      setDeletingLevelId(null)
    }
  }

  const handleMenuAccessChange = async (
    menuKey: string,
    levelKey: string,
    checked: boolean,
  ) => {
    if (savingMenuKey !== null) return

    setError(null)
    setNotice(null)

    const previousAccess = menuAccess
    const currentLevelKeys = new Set(accessByMenu.get(menuKey) ?? [])
    if (checked) {
      currentLevelKeys.add(levelKey)
    } else {
      currentLevelKeys.delete(levelKey)
    }

    const levelKeys = levels
      .map((level) => level.key)
      .filter((key) => currentLevelKeys.has(key))

    setMenuAccess((currentAccess) => [
      ...currentAccess.filter((access) => access.menuKey !== menuKey),
      ...levelKeys.map((key) => ({ menuKey, levelKey: key })),
    ])
    setSavingMenuKey(menuKey)

    try {
      const response = await fetch("/api/admin/access-levels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuKey, levelKeys }),
      })

      if (!response.ok) {
        throw new Error(await getApiError(response))
      }

      setNotice("메뉴 접근 권한을 저장했습니다.")
    } catch (accessError) {
      setMenuAccess(previousAccess)
      setError(getErrorMessage(accessError))
    } finally {
      setSavingMenuKey(null)
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>접근 레벨</CardTitle>
          <CardDescription>
            사용자 권한에 사용할 레벨을 관리합니다{loading ? " · 불러오는 중…" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            <Table className="[&_:is(th,td)]:px-4">
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>key</TableHead>
                  <TableHead>rank</TableHead>
                  <TableHead>시스템 여부</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levels.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                      등록된 접근 레벨이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
                {levels.map((level) => {
                  const isEditing = editingLevelId === level.id
                  const isSaving = savingLevelId === level.id
                  const isDeleting = deletingLevelId === level.id

                  return (
                    <TableRow key={level.id}>
                      {isEditing ? (
                        <TableCell colSpan={5}>
                          <form
                            onSubmit={(event) => void handleEdit(event, level)}
                            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto] md:items-center"
                          >
                            <Input
                              aria-label="레벨 이름"
                              value={editingForm.name}
                              onChange={(event) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                              disabled={isSaving}
                            />
                            <Input
                              aria-label="레벨 key"
                              value={editingForm.key}
                              disabled
                            />
                            <Input
                              aria-label="레벨 rank"
                              type="number"
                              value={editingForm.rank}
                              onChange={(event) =>
                                setEditingForm((current) => ({
                                  ...current,
                                  rank: event.target.value,
                                }))
                              }
                              disabled={isSaving}
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                type="submit"
                                variant="outline"
                                className="h-9 py-2"
                                disabled={isSaving}
                              >
                                <Save className="size-3.5" />
                                저장
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-9 py-2"
                                onClick={cancelEditing}
                                disabled={isSaving}
                              >
                                <X className="size-3.5" />
                                취소
                              </Button>
                            </div>
                          </form>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="font-medium">{level.name}</TableCell>
                          <TableCell className="font-mono text-xs">{level.key}</TableCell>
                          <TableCell>{level.rank}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {level.isSystem ? "시스템" : "사용자"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-9 py-2"
                                onClick={() => startEditing(level)}
                                disabled={isDeleting}
                              >
                                <Pencil className="size-3.5" />
                                수정
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                className="h-9 py-2"
                                onClick={() => void handleDelete(level)}
                                disabled={level.isSystem || isDeleting}
                              >
                                <Trash2 className="size-3.5" />
                                {isDeleting ? "삭제 중…" : "삭제"}
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
            className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto] md:items-end"
          >
            <div className="space-y-1.5">
              <label htmlFor="access-level-name" className="text-sm font-medium">
                이름
              </label>
              <Input
                id="access-level-name"
                value={levelForm.name}
                onChange={(event) =>
                  setLevelForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="예: 인턴"
                disabled={creating}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="access-level-key" className="text-sm font-medium">
                key
              </label>
              <Input
                id="access-level-key"
                value={levelForm.key}
                onChange={(event) =>
                  setLevelForm((current) => ({ ...current, key: event.target.value }))
                }
                placeholder="예: intern"
                disabled={creating}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="access-level-rank" className="text-sm font-medium">
                rank
              </label>
              <Input
                id="access-level-rank"
                type="number"
                value={levelForm.rank}
                onChange={(event) =>
                  setLevelForm((current) => ({ ...current, rank: event.target.value }))
                }
                placeholder="예: 20"
                disabled={creating}
              />
            </div>
            <Button type="submit" className="h-9 py-2" disabled={creating}>
              <Plus className="size-3.5" />
              {creating ? "추가 중…" : "레벨 추가"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>메뉴 × 레벨 접근 표</CardTitle>
          <CardDescription>
            메뉴별로 접근할 수 있는 레벨을 선택합니다. 체크박스를 바꾸면 즉시 저장됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {levels.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              접근 레벨을 먼저 추가해 주세요.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table className="[&_:is(th,td)]:px-4">
                <TableHeader>
                  <TableRow>
                    <TableHead>메뉴</TableHead>
                    {levels.map((level) => (
                      <TableHead key={level.id} className="text-center">
                        <span className="block">{level.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {level.key}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MENU_KEYS.map((menu) => {
                    const selectedLevelKeys = accessByMenu.get(menu.key) ?? new Set<string>()
                    const isSaving = savingMenuKey === menu.key

                    return (
                      <TableRow key={menu.key}>
                        <TableHead scope="row">
                          <span className="block">{menu.label}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {menu.key}
                          </span>
                        </TableHead>
                        {levels.map((level) => (
                          <TableCell key={level.id} className="text-center">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={selectedLevelKeys.has(level.key)}
                              aria-label={`${menu.label} ${level.name} 접근 권한`}
                              disabled={isSaving}
                              onChange={(event) =>
                                void handleMenuAccessChange(
                                  menu.key,
                                  level.key,
                                  event.target.checked,
                                )
                              }
                            />
                          </TableCell>
                        ))}
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

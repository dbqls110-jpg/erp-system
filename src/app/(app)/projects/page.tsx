import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { canEditMenu, requireMenuAccess } from "@/lib/permissions";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProjectCreateButton } from "./ProjectCreateButton";
import { ProjectFilter } from "./ProjectFilter";
import { getCalendarViewer } from "@/lib/calendarViewer";
import { canViewLinkedProjects, projectWhereForViewer, EXTERNAL_PROJECT_SELECT, externalProjectDto } from "@/lib/projectVisibility";
import { isExternal } from "@/lib/calendarVisibility";
import { ExternalProjectList } from "@/components/projects/ExternalProjects";
import { parseProjectFilters, projectFiltersWhere, type ProjectSearchParams, type ProjectListFilters } from "@/lib/projectFilters";
import { koreanCalendarParts, currentKoreanDateKey } from "@/lib/dateFormat";
import { ProjectSearchFilters } from "./ProjectSearchFilters";
import { PROJECT_TASK_SELECT, listTaskPeople, projectTaskDto } from "@/lib/projectTasks";
import { ProjectWorkspace } from "./ProjectWorkspace";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<ProjectSearchParams> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  const viewer = await getCalendarViewer();
  if (!session?.user?.id || session.user.active === false || !viewer) redirect("/login");
  const linkedExternal = canViewLinkedProjects(viewer);
  if (!linkedExternal) await requireMenuAccess(session.user.id, "projects", session.user.role);
  const external = isExternal(viewer);
  const parsed = parseProjectFilters({ ...params, status: !external && params.status === undefined ? "active" : params.status }, koreanCalendarParts(new Date()).year);
  const filters: ProjectListFilters = { ...parsed, company: external ? "all" : parsed.company };
  const where = { AND: [projectWhereForViewer(viewer), projectFiltersWhere(filters)] };
  if (external) {
    const projects = await prisma.project.findMany({ where, select: EXTERNAL_PROJECT_SELECT, orderBy: { createdAt: "desc" } });
    return <ExternalProjectList projects={projects.map(externalProjectDto)} filter={<ProjectFilter filters={filters} />} controls={<ProjectSearchFilters filters={filters} showCompany={false} />} />;
  }
  const canEdit = await canEditMenu(session.user.id, "projects", session.user.role);
  const today = currentKoreanDateKey();
  const [projects, attention, people] = await Promise.all([
    prisma.project.findMany({ where, select: {
      id: true, name: true, status: true, progress: true, company: true, client: true, deadline: true, assignee: true, workScope: true,
      checklistItems: { select: PROJECT_TASK_SELECT, orderBy: [{ order: "asc" }, { id: "asc" }] },
    }, orderBy: { createdAt: "desc" } }),
    prisma.checklistItem.findMany({ where: {
      isDone: false, project: { status: "active" }, OR: [{ nextCheckDate: { lte: today } }, { dueDate: { lte: today } }],
    }, select: { ...PROJECT_TASK_SELECT, project: { select: { name: true, status: true } } } }),
    canEdit ? listTaskPeople() : Promise.resolve([]),
  ]);
  return <ProjectWorkspace projects={projects.map(project => {
    const { checklistItems, ...summary } = project;
    return { ...summary, tasks: checklistItems.map(projectTaskDto) };
  })} attentionTasks={attention.map(task => ({ ...projectTaskDto(task), projectName: task.project.name, projectStatus: task.project.status }))}
    people={people} viewerId={session.user.id} today={today} canEdit={canEdit} isAdmin={session.user.role === "admin"}
    filters={filters} filterControls={<ProjectSearchFilters filters={filters} />} createControl={canEdit ? <ProjectCreateButton /> : null} />;
}

// Shared domain constants (server actions + client)

export const TASK_STATUSES = ['To do', 'In progress', 'Review', 'Done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_TYPES = ['Task', 'Story', 'Bug', 'Incident'] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const EPIC_STATUSES = ['Open', 'In progress', 'Done'] as const
export type EpicStatus = (typeof EPIC_STATUSES)[number]

export const SPRINT_STATUSES = ['planned', 'active', 'completed'] as const
export type SprintStatus = (typeof SPRINT_STATUSES)[number]

export const TEAM_ROLES = ['admin', 'lead', 'member'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

export const DEFAULT_AREA = 'Engineering'
export const DEFAULT_POINTS = 3
export const DEFAULT_AVATAR_COLOR = 'bg-violet-600'
export const DEFAULT_TEAM_NAME = 'Engineering'
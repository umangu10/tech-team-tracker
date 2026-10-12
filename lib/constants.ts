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

// ---------------------------------------------------------------------------
// Labels: stored on task.labels as a JSON-encoded string array. Shared between
// server actions and the client so serialization stays identical on both sides.
// ---------------------------------------------------------------------------

export const MAX_LABELS_PER_TASK = 12
export const MAX_LABEL_LENGTH = 32

/** Normalize a single label: trim, collapse whitespace, lowercase, cap length. */
export function normalizeLabel(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, MAX_LABEL_LENGTH)
}

/** Clean + dedupe a list of labels, preserving first-seen order. */
export function normalizeLabels(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const label = normalizeLabel(item)
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push(label)
    if (out.length >= MAX_LABELS_PER_TASK) break
  }
  return out
}

/** Parse the stored `labels` column into a string array. Tolerant of empty/legacy values. */
export function parseLabels(stored: string | null | undefined): string[] {
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    // Legacy fallback: comma-separated string.
    return normalizeLabels(stored.split(','))
  }
  return []
}

/** Serialize a label array for storage in the `labels` column. */
export function serializeLabels(labels: string[]): string {
  const clean = normalizeLabels(labels)
  return clean.length ? JSON.stringify(clean) : ''
}
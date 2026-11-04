import type { Display } from "electron"

/**
 * Resolve a saved display assignment conservatively.
 * A numeric ID is accepted only when its saved label also agrees.
 * Labels are fallback hints and must be unique among connected displays.
 */
export function resolveAssignedDisplay(
    displays: readonly Display[],
    assignment: { screen?: string | null; screenLabel?: string }
): Display | undefined {
    if (!assignment.screen && !assignment.screenLabel) return undefined

    const byId = assignment.screen ? displays.find((display) => String(display.id) === assignment.screen) : undefined
    if (byId && (!assignment.screenLabel || byId.label === assignment.screenLabel)) return byId

    if (!assignment.screenLabel) return undefined
    const matches = displays.filter((display) => display.label === assignment.screenLabel)
    return matches.length === 1 ? matches[0] : undefined
}

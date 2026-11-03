import { ProjectorConnection, ProjectorControl } from "./PJLinkClient"
import { ProjectorPower } from "./PJLinkProtocol"

export interface ProjectorDefinition extends ProjectorConnection {
    id: string
    name: string
    groups?: string[]
}
export type ProjectorAction = "powerOn" | "powerOff" | "powerState" | "muteVideo" | "unmuteVideo" | "muteAudio" | "unmuteAudio"
export type ProjectorResult = { id: string; name: string; ok: true; value: string | ProjectorPower } | { id: string; name: string; ok: false; error: string }

/** Named projector registry with group selection and bounded concurrent operations. */
export class ProjectorFleet {
    private projectors = new Map<string, ProjectorDefinition>()
    constructor(private readonly execute: (projector: ProjectorDefinition, action: ProjectorAction) => Promise<string> = defaultExecute) {}

    upsert(projector: ProjectorDefinition) {
        if (!projector.id.trim() || !projector.name.trim() || !projector.host.trim()) throw new Error("Projector id, name and host required")
        this.projectors.set(projector.id, { ...projector, groups: [...(projector.groups ?? [])] })
    }
    remove(id: string) { return this.projectors.delete(id) }
    list(): ProjectorDefinition[] { return [...this.projectors.values()].map((p) => ({ ...p, groups: [...(p.groups ?? [])] })) }

    async run(ids: readonly string[], action: ProjectorAction, concurrency = 4): Promise<ProjectorResult[]> {
        if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new RangeError("Invalid projector concurrency")
        const selected = [...new Set(ids)]
        const results = new Array<ProjectorResult>(selected.length)
        let cursor = 0
        const worker = async () => {
            while (cursor < selected.length) {
                const index = cursor++
                const id = selected[index]
                const projector = this.projectors.get(id)
                if (!projector) {
                    results[index] = { id, name: id, ok: false, error: "Projector not found" }
                    continue
                }
                try {
                    const value = await this.execute({ ...projector }, action)
                    results[index] = { id, name: projector.name, ok: true, value }
                } catch (err) {
                    results[index] = { id, name: projector.name, ok: false, error: err instanceof Error ? err.message : String(err) }
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()))
        return results
    }

    runGroup(group: string, action: ProjectorAction, concurrency = 4) {
        return this.run(this.list().filter((p) => p.groups?.includes(group)).map((p) => p.id), action, concurrency)
    }
}

async function defaultExecute(projector: ProjectorDefinition, action: ProjectorAction): Promise<string> {
    switch (action) {
        case "powerOn": return ProjectorControl.powerOn(projector)
        case "powerOff": return ProjectorControl.powerOff(projector)
        case "powerState": return ProjectorControl.powerState(projector)
        case "muteVideo": return ProjectorControl.muteVideo(projector, true)
        case "unmuteVideo": return ProjectorControl.muteVideo(projector, false)
        case "muteAudio": return ProjectorControl.muteAudio(projector, true)
        case "unmuteAudio": return ProjectorControl.muteAudio(projector, false)
    }
}

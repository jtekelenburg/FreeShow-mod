import { app } from "electron"
import { join } from "path"
import { ProjectorAction, ProjectorDefinition, ProjectorFleet } from "./ProjectorFleet"
import { loadProjectors, saveProjectors } from "./ProjectorStore"

const fleet = new ProjectorFleet()
let loaded: Promise<void> | undefined
let writes: Promise<void> = Promise.resolve()
const configPath = () => join(app.getPath("userData"), "projectors.json")

async function ensureLoaded() {
    if (!loaded) loaded = loadProjectors(configPath(), fleet).then(() => {})
    await loaded
}

function persist() {
    writes = writes.catch(() => {}).then(() => saveProjectors(configPath(), fleet))
    return writes
}

export async function listConfiguredProjectors() {
    await ensureLoaded()
    return fleet.list().map(({ password: _password, ...p }) => p)
}

export async function saveConfiguredProjector(projector: ProjectorDefinition) {
    try {
        await ensureLoaded()
        fleet.upsert(projector)
        await persist()
        return { ok: true as const }
    } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
}

export async function removeConfiguredProjector(id: string) {
    await ensureLoaded()
    fleet.remove(id)
    await persist()
    return { ok: true as const }
}

export async function commandConfiguredProjectors(ids: string[], action: ProjectorAction) {
    await ensureLoaded()
    return fleet.run(ids, action)
}

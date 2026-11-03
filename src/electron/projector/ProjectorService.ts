import { app, safeStorage } from "electron"
import { promises as fs } from "fs"
import { join } from "path"
import { ProjectorAction, ProjectorDefinition, ProjectorFleet } from "./ProjectorFleet"
import { ProjectorControl } from "./PJLinkClient"
import { loadProjectors, saveProjectors } from "./ProjectorStore"

const fleet = new ProjectorFleet()
let loaded: Promise<void> | undefined
let writes: Promise<void> = Promise.resolve()
const configPath = () => join(app.getPath("userData"), "projectors.json")
const credentialsPath = () => join(app.getPath("userData"), "projector-credentials.enc.json")
let credentials: Record<string, string> = {}

async function loadCredentials() {
    try {
        const data = JSON.parse(await fs.readFile(credentialsPath(), "utf8")) as Record<string, string>
        credentials = data
    } catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err }
    if (Object.keys(credentials).length && !safeStorage.isEncryptionAvailable()) throw new Error("Projector credentials require OS encryption support")
    for (const projector of fleet.list()) {
        const encrypted = credentials[projector.id]
        if (encrypted) fleet.upsert({ ...projector, password: safeStorage.decryptString(Buffer.from(encrypted, "base64")) })
    }
}

async function persistCredentials() {
    await fs.writeFile(credentialsPath(), JSON.stringify(credentials), { mode: 0o600 })
}

async function ensureLoaded() {
    if (!loaded) loaded = loadProjectors(configPath(), fleet).then(() => loadCredentials())
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
        if (projector.password && !safeStorage.isEncryptionAvailable()) throw new Error("OS credential encryption unavailable")
        const existing = fleet.list().find((p) => p.id === projector.id)
        fleet.upsert({ ...projector, password: projector.password || existing?.password })
        await persist()
        if (projector.password) {
            credentials[projector.id] = safeStorage.encryptString(projector.password).toString("base64")
            await persistCredentials()
        }
        return { ok: true as const }
    } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
}

export async function removeConfiguredProjector(id: string) {
    await ensureLoaded()
    fleet.remove(id)
    await persist()
    if (credentials[id]) { delete credentials[id]; await persistCredentials() }
    return { ok: true as const }
}

/** Probe up to 32 hosts in one IPv4 /24 using PJLink NAME. */
export async function discoverProjectors(prefix: string, start = 1, count = 16) {
    if (!/^(?:\\d{1,3}\\.){3}$/.test(prefix) || prefix.slice(0, -1).split(".").some((v) => Number(v) > 255)) throw new Error("Invalid IPv4 prefix")
    if (!Number.isInteger(start) || start < 1 || !Number.isInteger(count) || count < 1 || count > 32 || start + count > 255) throw new Error("Invalid discovery range")
    const found: { host: string; name: string }[] = []
    const hosts = Array.from({ length: count }, (_, i) => prefix + (start + i))
    for (let offset = 0; offset < hosts.length; offset += 4) {
        await Promise.all(hosts.slice(offset, offset + 4).map(async (host) => {
            try { const name = await ProjectorControl.name({ host, timeoutMs: 800 }); found.push({ host, name }) }
            catch { /* Non-PJLink hosts are not discovered. */ }
        }))
    }
    return found.sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }))
}

export async function switchProjectorInputs(ids: string[], code: string) {
    await ensureLoaded()
    if (!/^[1-5][1-9]$/.test(code)) throw new Error("Invalid PJLink input code")
    const selected = [...new Set(ids)].slice(0, 256)
    const all = new Map(fleet.list().map((p) => [p.id, p]))
    return Promise.all(selected.map(async (id) => {
        const projector = all.get(id)
        if (!projector) return { id, name: id, ok: false as const, error: "Projector not found" }
        try { return { id, name: projector.name, ok: true as const, value: await ProjectorControl.input(projector, code) } }
        catch (err) { return { id, name: projector.name, ok: false as const, error: err instanceof Error ? err.message : String(err) } }
    }))
}

export async function commandConfiguredProjectors(ids: string[], action: ProjectorAction) {
    await ensureLoaded()
    return fleet.run(ids, action)
}

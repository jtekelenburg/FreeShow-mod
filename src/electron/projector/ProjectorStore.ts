import { promises as fs } from "fs"
import { dirname } from "path"
import { ProjectorDefinition, ProjectorFleet } from "./ProjectorFleet"

/** Persist non-secret projector configuration only. Passwords must be supplied separately. */
export type SavedProjector = Omit<ProjectorDefinition, "password">

export function serializeProjectors(projectors: ProjectorDefinition[]): string {
    const entries: SavedProjector[] = projectors.map(({ password: _password, ...rest }) => ({
        id: rest.id, name: rest.name, host: rest.host,
        ...(rest.port === undefined ? {} : { port: rest.port }),
        ...(rest.timeoutMs === undefined ? {} : { timeoutMs: rest.timeoutMs }),
        groups: [...(rest.groups ?? [])]
    }))
    return JSON.stringify({ version: 1, projectors: entries }, null, 2) + "\n"
}

export function parseProjectors(text: string): SavedProjector[] {
    const data: unknown = JSON.parse(text)
    if (!data || typeof data !== "object") throw new Error("Invalid projector configuration")
    const record = data as { version?: unknown; projectors?: unknown }
    if (record.version !== 1 || !Array.isArray(record.projectors) || record.projectors.length > 256) throw new Error("Unsupported projector configuration")
    const ids = new Set<string>()
    return record.projectors.map((item: unknown) => {
        if (!item || typeof item !== "object") throw new Error("Invalid projector entry")
        const p = item as Record<string, unknown>
        if (typeof p.id !== "string" || !p.id.trim() || typeof p.name !== "string" || !p.name.trim() || typeof p.host !== "string" || !p.host.trim()) throw new Error("Invalid projector identity")
        if (ids.has(p.id)) throw new Error("Duplicate projector id")
        ids.add(p.id)
        if (p.port !== undefined && (!Number.isInteger(p.port) || (p.port as number) < 1 || (p.port as number) > 65535)) throw new Error("Invalid projector port")
        if (p.timeoutMs !== undefined && (typeof p.timeoutMs !== "number" || !Number.isFinite(p.timeoutMs) || p.timeoutMs <= 0)) throw new Error("Invalid projector timeout")
        if (p.groups !== undefined && (!Array.isArray(p.groups) || !p.groups.every((g: unknown) => typeof g === "string"))) throw new Error("Invalid projector groups")
        return { id: p.id, name: p.name, host: p.host, ...(p.port === undefined ? {} : { port: p.port as number }), ...(p.timeoutMs === undefined ? {} : { timeoutMs: p.timeoutMs as number }), groups: (p.groups as string[] | undefined) ?? [] }
    })
}

export async function saveProjectors(file: string, fleet: ProjectorFleet): Promise<void> {
    await fs.mkdir(dirname(file), { recursive: true })
    const temp = file + ".tmp-" + process.pid + "-" + Date.now()
    try {
        await fs.writeFile(temp, serializeProjectors(fleet.list()), { encoding: "utf8", mode: 0o600 })
        await fs.rename(temp, file)
    } finally {
        await fs.rm(temp, { force: true }).catch(() => {})
    }
}

export async function loadProjectors(file: string, fleet: ProjectorFleet): Promise<number> {
    let text: string
    try { text = await fs.readFile(file, "utf8") }
    catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0
        throw err
    }
    const entries = parseProjectors(text)
    for (const entry of entries) fleet.upsert(entry)
    return entries.length
}

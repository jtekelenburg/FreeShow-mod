import { createHash } from "crypto"

export type ProjectorPower = "off" | "on" | "cooling" | "warming"
export type PJLinkCommand = "POWR" | "INPT" | "AVMT" | "ERST" | "LAMP" | "NAME" | "INF1" | "INF2" | "INFO" | "CLSS"

const allowedCommands = new Set<PJLinkCommand>(["POWR", "INPT", "AVMT", "ERST", "LAMP", "NAME", "INF1", "INF2", "INFO", "CLSS"])

export function pjlinkCommand(command: PJLinkCommand, parameter = "?"): string {
    if (!allowedCommands.has(command)) throw new Error("Unsupported PJLink command")
    if (!/^[\x21-\x7e]{1,32}$/.test(parameter)) throw new Error("Invalid PJLink parameter")
    return `%1${command} ${parameter}\r`
}

export function pjlinkAuthentication(greeting: string, password?: string): string {
    const match = /^PJLINK ([01])(?: ([0-9a-fA-F]{8}))?\r?$/.exec(greeting)
    if (!match) throw new Error("Invalid PJLink greeting")
    if (match[1] === "0") return ""
    if (!match[2] || !password) throw new Error("PJLink password required")
    return createHash("md5").update(match[2] + password, "utf8").digest("hex")
}

export function pjlinkResponse(command: PJLinkCommand, line: string): string {
    const match = /^%1([A-Z0-9]{4})=(.*)\r?$/.exec(line)
    if (!match || match[1] !== command) throw new Error("Unexpected PJLink response")
    if (/^ERR[1-4]$/.test(match[2])) throw new Error(`PJLink device error: ${match[2]}`)
    return match[2]
}

export function projectorPower(value: string): ProjectorPower {
    switch (value) {
        case "0": return "off"
        case "1": return "on"
        case "2": return "cooling"
        case "3": return "warming"
        default: throw new Error("Unknown projector power state")
    }
}

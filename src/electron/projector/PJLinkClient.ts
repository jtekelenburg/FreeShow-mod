import { Socket } from "net"
import { PJLinkCommand, pjlinkAuthentication, pjlinkCommand, pjlinkResponse, projectorPower } from "./PJLinkProtocol"

export interface ProjectorConnection {
    host: string
    port?: number
    password?: string
    timeoutMs?: number
}

export async function sendPJLink(config: ProjectorConnection, command: PJLinkCommand, parameter = "?"): Promise<string> {
    const port = config.port ?? 4352
    const timeout = config.timeoutMs ?? 3000
    if (!config.host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid projector address")
    if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("Invalid projector timeout")
    const request = pjlinkCommand(command, parameter)
    return new Promise<string>((resolve, reject) => {
        const socket = new Socket()
        let settled = false
        let buffer = ""
        let greeted = false
        const finish = (err?: Error, response?: string) => {
            if (settled) return
            settled = true
            socket.destroy()
            if (err) reject(err)
            else resolve(response ?? "")
        }
        socket.setTimeout(timeout)
        socket.once("timeout", () => finish(new Error("PJLink timeout")))
        socket.once("error", (err) => finish(err))
        socket.on("data", (chunk: Buffer) => {
            buffer += chunk.toString("utf8")
            if (buffer.length > 4096) return finish(new Error("PJLink response too long"))
            let end: number
            while ((end = buffer.indexOf("\r")) !== -1) {
                const line = buffer.slice(0, end)
                buffer = buffer.slice(end + 1)
                if (!greeted) {
                    greeted = true
                    try { socket.write(pjlinkAuthentication(line, config.password) + request) }
                    catch (err) { finish(err instanceof Error ? err : new Error(String(err))) }
                } else {
                    try { finish(undefined, pjlinkResponse(command, line)) }
                    catch (err) { finish(err instanceof Error ? err : new Error(String(err))) }
                }
                if (settled) return
            }
        })
        socket.once("close", () => { if (!settled) finish(new Error("PJLink connection closed before response")) })
        socket.connect(port, config.host)
    })
}

export const ProjectorControl = {
    powerOn: (config: ProjectorConnection) => sendPJLink(config, "POWR", "1"),
    powerOff: (config: ProjectorConnection) => sendPJLink(config, "POWR", "0"),
    powerState: async (config: ProjectorConnection) => projectorPower(await sendPJLink(config, "POWR")),
    input: (config: ProjectorConnection, code: string) => sendPJLink(config, "INPT", code),
    inputState: (config: ProjectorConnection) => sendPJLink(config, "INPT"),
    muteVideo: (config: ProjectorConnection, muted: boolean) => sendPJLink(config, "AVMT", muted ? "11" : "10"),
    muteAudio: (config: ProjectorConnection, muted: boolean) => sendPJLink(config, "AVMT", muted ? "21" : "20"),
    name: (config: ProjectorConnection) => sendPJLink(config, "NAME")
}

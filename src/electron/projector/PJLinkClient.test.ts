import { createServer, type Server, type Socket } from "net"
import { afterEach, describe, expect, it } from "vitest"
import { sendPJLink } from "./PJLinkClient"
import { createHash } from "crypto"

const servers: Server[] = []
async function mockProjector(greeting: string, reply: (command: string) => string) {
    const server = createServer((socket: Socket) => {
        socket.write(greeting + "\r")
        let buffer = ""
        socket.on("data", (chunk) => {
            buffer += chunk.toString("utf8")
            if (!buffer.includes("\r")) return
            const command = buffer.slice(0, buffer.indexOf("\r") + 1)
            socket.write(reply(command) + "\r")
        })
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No test port")
    return address.port
}

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

describe("PJLink TCP integration", () => {
    it("sends a class 1 command after an unauthenticated greeting", async () => {
        const port = await mockProjector("PJLINK 0", (command) => {
            expect(command).toBe("%1POWR ?\r")
            return "%1POWR=1"
        })
        await expect(sendPJLink({ host: "127.0.0.1", port }, "POWR")).resolves.toBe("1")
    })

    it("prepends the MD5 authentication digest to a command", async () => {
        const port = await mockProjector("PJLINK 1 12345678", (command) => {
            const digest = createHash("md5").update("12345678secret").digest("hex")
            expect(command).toBe(digest + "%1NAME ?\r")
            return "%1NAME=Test Projector"
        })
        await expect(sendPJLink({ host: "127.0.0.1", port, password: "secret" }, "NAME")).resolves.toBe("Test Projector")
    })

    it("rejects device errors and missing credentials", async () => {
        const port = await mockProjector("PJLINK 0", () => "%1POWR=ERR3")
        await expect(sendPJLink({ host: "127.0.0.1", port }, "POWR")).rejects.toThrow("ERR3")
        const securedPort = await mockProjector("PJLINK 1 12345678", () => "%1POWR=1")
        await expect(sendPJLink({ host: "127.0.0.1", port: securedPort }, "POWR")).rejects.toThrow("password required")
    })

    it("rejects invalid addresses and ports before opening a socket", async () => {
        await expect(sendPJLink({ host: "", port: 4352 }, "POWR")).rejects.toThrow("Invalid projector address")
        await expect(sendPJLink({ host: "localhost", port: 0 }, "POWR")).rejects.toThrow("Invalid projector address")
    })
})

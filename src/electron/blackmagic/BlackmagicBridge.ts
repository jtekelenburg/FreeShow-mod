import type { Size } from "electron"
import { cardFormat } from "./cardFormat"
import { assertAudioBuffer, assertFrameBuffer } from "../capture/FrameValidation"
import { CaptureHelper } from "../capture/CaptureHelper"
import { SenderCapture } from "../capture/SenderCapture"
import { OutputHelper } from "../output/OutputHelper"
import { NdiSender } from "../ndi/NdiSender"
import { SenderThread } from "../capture/SenderThread"
import { BlackmagicManager } from "./BlackmagicManager"
import { resolveRecoveryDeviceIndex } from "./DeviceRecovery"
import { recoveryDelay, shouldRecover } from "../capture/RecoveryPolicy"

// Main-side proxy for Blackmagic output, which runs in the capture worker; device state is mirrored from it.
export type BmdState = {
    ready: boolean
    displayMode: string
    pixelFormat: string
    enableKeying: boolean
    colorSpace: string
    targetSize: Size
    stable: boolean
    framerate: number
}

export class BlackmagicBridge {
    private static states = new Map<string, BmdState>()
    private static initWaiters = new Map<string, ((ok: boolean) => void)[]>()
    private static initTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private static readonly INIT_TIMEOUT_MS = 15000
    private static hooked = false
    private static audioQueued = 0
    private static pendingInitConfigs = new Map<string, string>()
    private static initGeneration = new Map<string, number>()
    private static desiredOutputs = new Map<string, { deviceIndex: number; displayMode: string; pixelFormat: string; enableKeying: boolean; audioChannels: number; colorSpace: string }>()
    private static recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private static recoveryAttempts = new Map<string, number>()
    private static deviceHandles = new Map<string, string>()
    private static cancelRecovery(id: string) {
        const timer = this.recoveryTimers.get(id)
        if (timer) clearTimeout(timer)
        this.recoveryTimers.delete(id)
        this.recoveryAttempts.delete(id)
    }
    private static scheduleRecovery(id: string) {
        if (!shouldRecover(this.desiredOutputs.has(id), this.states.has(id), this.initWaiters.has(id)) || this.recoveryTimers.has(id)) return
        const attempt = this.recoveryAttempts.get(id) || 0
        this.recoveryAttempts.set(id, attempt + 1)
        const delay = recoveryDelay(attempt)
        this.recoveryTimers.set(id, setTimeout(() => {
            this.recoveryTimers.delete(id)
            const config = this.desiredOutputs.get(id)
            if (!config || this.states.has(id)) return
            const handle = this.deviceHandles.get(id)
            const index = resolveRecoveryDeviceIndex(handle, config.deviceIndex, BlackmagicManager.getDevices())
            if (index < 0) {
                console.warn(`[BMD] Waiting for configured device ${handle ?? config.deviceIndex} to reconnect for ${id}`)
                this.scheduleRecovery(id)
                return
            }
            config.deviceIndex = index
            void this.initializeAttempt(id, config).then((ok) => {
                if (!ok) this.scheduleRecovery(id)
            })
        }, delay))
    }

    private static worker() {
        this.hook()
        return NdiSender.getSharedWorker()
    }

    private static hook() {
        if (this.hooked) return
        this.hooked = true
        SenderCapture.bmdMessageHandler = (msg) => this.onWorkerMessage(msg)
        SenderThread.subscribe(() => {}, () => {
            this.settleAllInit()
            this.states.clear()
            this.audioQueued = 0
            for (const id of this.desiredOutputs.keys()) this.scheduleRecovery(id)
        })
        BlackmagicManager.senderControl = { isDeviceStable: (id) => this.isDeviceStable(id), resetProblematicDevice: (id) => this.resetProblematicDevice(id) }
    }

    private static settleInit(outputId: string, ok: boolean) {
        const timer = this.initTimers.get(outputId)
        if (timer) clearTimeout(timer)
        this.initTimers.delete(outputId)
        this.pendingInitConfigs.delete(outputId)
        const waiters = this.initWaiters.get(outputId) || []
        this.initWaiters.delete(outputId)
        for (const resolve of waiters) resolve(ok)
    }

    private static settleAllInit() {
        for (const id of [...this.initWaiters.keys()]) this.settleInit(id, false)
    }

    private static onWorkerMessage(msg: any) {
        switch (msg?.type) {
            case "bmdState": {
                const st: BmdState = { ready: !!msg.ready, displayMode: msg.displayMode || "", pixelFormat: msg.pixelFormat || "", enableKeying: !!msg.enableKeying, colorSpace: msg.colorSpace || "", targetSize: msg.targetSize || { width: 0, height: 0 }, stable: msg.stable !== false, framerate: Number(msg.framerate) || 0 }
                const was = this.states.get(msg.outputId)
                // Ignore unsolicited readiness from an output that was stopped or timed out.
                if (st.ready && !this.initWaiters.has(msg.outputId) && !was?.ready) break
                if (st.ready) {
                    this.states.set(msg.outputId, st)
                    this.cancelRecovery(msg.outputId)
                } else {
                    this.states.delete(msg.outputId)
                    if (this.desiredOutputs.has(msg.outputId) && !this.initWaiters.has(msg.outputId)) this.scheduleRecovery(msg.outputId)
                }
                if (!!was?.ready !== st.ready) console.info(st.ready ? `[BMD] ${msg.outputId} playing out: ${st.displayMode} ${st.pixelFormat} ${st.targetSize.width}x${st.targetSize.height} at ${st.framerate}fps` : `[BMD] ${msg.outputId} has no device playing out (frames for it are dropped)`)
                if (st.ready) {
                    this.applyFramerate(msg.outputId, st.framerate)
                    // the card plays out from the first frame it is given, and a still page sends none
                    if (!was?.ready) OutputHelper.Lifecycle.requestRepaint(msg.outputId)
                }
                this.settleInit(msg.outputId, st.ready)
                break
            }
            case "bmdAudioQueued":
                this.audioQueued = Number(msg.length) || 0
                break
        }
    }

    // the card plays out at its mode's rate, so capture must run at that rate
    private static applyFramerate(outputId: string, framerate: number) {
        if (!(framerate > 0)) return
        const output = OutputHelper.getOutput(outputId)
        if (!output?.captureOptions || output.captureOptions.framerates.blackmagic === framerate) return
        output.captureOptions.framerates.blackmagic = framerate
        OutputHelper.setOutput(outputId, output)
        CaptureHelper.updateFramerate(outputId)
    }

    static hasOutputs(): boolean {
        return this.states.size > 0
    }
    static isReady(outputId: string): boolean {
        return !!this.states.get(outputId)?.ready
    }
    static state(outputId: string): BmdState | undefined {
        return this.states.get(outputId)
    }
    static get audioQueueLength(): number {
        return this.audioQueued
    }

    static getTargetDimensions(outputId: string): Size {
        const st = this.states.get(outputId)
        return st?.targetSize?.width ? st.targetSize : { width: 1920, height: 1080 }
    }
    static canAcceptRawUyvy(outputId: string, size: Size): boolean {
        const st = this.states.get(outputId)
        if (!st?.ready || st.enableKeying) return false
        const fmt = st.pixelFormat || ""
        const is8bit422 = fmt.includes("YUV") && fmt.includes("422") && !fmt.includes("10") && !fmt.includes("12")
        if (!is8bit422) return false
        const cs = (st.colorSpace || "").toLowerCase()
        if (!(cs.includes("601") || cs.includes("170"))) return false
        return st.targetSize.width === size.width && st.targetSize.height === size.height
    }
    /** GPU card format (cardFormat.ts), or 0 for BGRA */
    static cardFormat(outputId: string): number {
        const st = this.states.get(outputId)
        if (!st?.ready) return 0
        return cardFormat(st.pixelFormat || "", st.colorSpace || "", !!st.enableKeying)
    }
    static isDeviceStable(outputId: string): boolean {
        return this.states.get(outputId)?.stable !== false
    }
    // the per-frame gate is in the worker
    static canAcceptFrame(outputId: string): boolean {
        return this.isReady(outputId)
    }

    static initialize(outputId: string, deviceIndex: number, displayMode: string, pixelFormat: string, enableKeying: boolean, audioChannels = 2, colorSpace = "rec709"): Promise<boolean> {
        const config = { deviceIndex, displayMode, pixelFormat, enableKeying, audioChannels, colorSpace }
        const deviceHandle = BlackmagicManager.getDevices()[deviceIndex]?.deviceHandle
        if (deviceHandle) this.deviceHandles.set(outputId, deviceHandle)
        else this.deviceHandles.delete(outputId)
        this.desiredOutputs.set(outputId, config)
        this.cancelRecovery(outputId)
        return this.initializeAttempt(outputId, config).then((ok) => {
            if (!ok) this.scheduleRecovery(outputId)
            return ok
        })
    }

    private static initializeAttempt(outputId: string, { deviceIndex, displayMode, pixelFormat, enableKeying, audioChannels, colorSpace }: { deviceIndex: number; displayMode: string; pixelFormat: string; enableKeying: boolean; audioChannels: number; colorSpace: string }): Promise<boolean> {
        const worker = this.worker()
        if (!worker) return Promise.resolve(false)
        const config = JSON.stringify([deviceIndex, displayMode, pixelFormat, enableKeying, audioChannels, colorSpace])
        if (this.initWaiters.has(outputId)) {
            // Do not allow competing initialization requests to resolve against the wrong mode.
            if (this.pendingInitConfigs.get(outputId) !== config) return Promise.resolve(false)
            return new Promise((resolve) => this.initWaiters.get(outputId)!.push(resolve))
        }
        const generation = (this.initGeneration.get(outputId) || 0) + 1
        this.initGeneration.set(outputId, generation)
        this.pendingInitConfigs.set(outputId, config)
        return new Promise((resolve) => {
            this.initWaiters.set(outputId, [resolve])
            this.initTimers.set(outputId, setTimeout(() => {
                if (this.initGeneration.get(outputId) !== generation) return
                console.warn(`[BMD] Timed out initializing output ${outputId}`)
                this.settleInit(outputId, false)
            }, this.INIT_TIMEOUT_MS))
            try {
                worker.postMessage({ type: "bmdInit", outputId, deviceIndex, displayMode, pixelFormat, enableKeying, audioChannels, colorSpace })
            } catch (err) {
                console.error(`[BMD] Could not initialize ${outputId}:`, err)
                this.settleInit(outputId, false)
            }
        })
    }

    static stop(outputId: string) {
        this.desiredOutputs.delete(outputId)
        this.deviceHandles.delete(outputId)
        this.cancelRecovery(outputId)
        this.settleInit(outputId, false)
        this.states.delete(outputId)
        this.initGeneration.set(outputId, (this.initGeneration.get(outputId) || 0) + 1)
        this.worker()?.postMessage({ type: "bmdStop", outputId })
    }
    static stopAll() {
        this.deviceHandles.clear()
        for (const id of this.desiredOutputs.keys()) this.cancelRecovery(id)
        this.desiredOutputs.clear()
        this.settleAllInit()
        this.states.clear()
        this.worker()?.postMessage({ type: "bmdStopAll" })
    }
    static shutdown() {
        this.deviceHandles.clear()
        for (const id of this.desiredOutputs.keys()) this.cancelRecovery(id)
        this.desiredOutputs.clear()
        this.settleAllInit()
        this.states.clear()
        this.worker()?.postMessage({ type: "bmdShutdown" })
    }
    static resetProblematicDevice(outputId: string): boolean {
        this.worker()?.postMessage({ type: "bmdReset", outputId })
        const st = this.states.get(outputId)
        const wasUnstable = st?.stable === false
        if (st) st.stable = true
        return wasUnstable
    }

    /** interleaved int16 PCM; copied because the caller may reuse its buffer */
    static sendAudioBuffer(buffer: Buffer, opts: { sampleRate: number; channelCount: number }) {
        if (!this.states.size || !buffer.length) return
        assertAudioBuffer(buffer, opts.sampleRate, opts.channelCount, 2)
        const copy = new Uint8Array(buffer.byteLength)
        copy.set(buffer)
        this.worker()?.postMessage({ type: "bmdAudio", buffer: copy.buffer, byteOffset: 0, byteLength: copy.byteLength, opts }, [copy.buffer])
    }

    /** CPU capture path only */
    static scheduleFrame(outputId: string, videoFrame: Buffer, size: Size, framerate: number, preConverted: boolean) {
        if (!this.states.has(outputId)) return
        if (!preConverted) assertFrameBuffer(videoFrame, size, "BGRA")
        const copy = new Uint8Array(videoFrame.byteLength)
        copy.set(videoFrame)
        this.worker()?.postMessage({ type: "bmdFrame", outputId, buffer: copy.buffer, byteOffset: 0, byteLength: copy.byteLength, size, framerate, preConverted }, [copy.buffer])
    }
}

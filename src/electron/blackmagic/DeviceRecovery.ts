/** Never silently switch a configured output to a different physical DeckLink device. */
export function resolveRecoveryDeviceIndex(
    deviceHandle: string | undefined,
    originalIndex: number,
    devices: readonly { deviceHandle: string }[]
): number {
    if (deviceHandle) return devices.findIndex((device) => device.deviceHandle === deviceHandle)
    // Without a persistent handle, only a currently enumerated index can be used.
    return Number.isSafeInteger(originalIndex) && originalIndex >= 0 && originalIndex < devices.length ? originalIndex : -1
}

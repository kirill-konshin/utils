const g = globalThis;

// @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
const transferrable = [
    g.ArrayBuffer,
    g.MessagePort,
    g.ReadableStream,
    g.WritableStream,
    g.TransformStream,
    // WebTransportReceiveStream, // ReferenceError: WebTransportReceiveStream is not defined
    // WebTransportSendStream, // ReferenceError: WebTransportReceiveStream is not defined
    // AudioData, // TS2304: Cannot find name AudioData
    g.ImageBitmap,
    g.VideoFrame,
    g.OffscreenCanvas,
    g.RTCDataChannel,
    g.MediaSourceHandle,
    // MIDIAccess, // ReferenceError: MIDIAccess is not defined
].filter(Boolean);

export function isTransferable(obj: any): boolean {
    return transferrable.some((t) => obj instanceof t) ? obj : null;
}

export function getTransferrable(data: any = {}): Transferable[] {
    if (!data) return [];
    return Object.values<any>(data)
        .reduce((r, v) => {
            return Array.isArray(v) ? [...r, ...v.map(isTransferable)] : [...r, isTransferable(v)];
        }, [])
        .filter(Boolean);
}

const HEADER_SIZE = 6;
const ENTRY_SIZE = 16;

/** ICO container of PNG entries, which browsers and Windows Vista+ read; sharp can't write ICO itself. */
export function toIco(images: readonly { size: number; png: Buffer }[]): Buffer {
    const header = Buffer.alloc(HEADER_SIZE);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(images.length, 4);

    const entries = Buffer.alloc(ENTRY_SIZE * images.length);
    let offset = HEADER_SIZE + entries.length;

    images.forEach(({ size, png }, i) => {
        const entry = i * ENTRY_SIZE;
        entries.writeUInt8(size >= 256 ? 0 : size, entry); // width, 0 means 256
        entries.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height
        entries.writeUInt8(0, entry + 2); // palette colors
        entries.writeUInt8(0, entry + 3); // reserved
        entries.writeUInt16LE(1, entry + 4); // color planes
        entries.writeUInt16LE(32, entry + 6); // bits per pixel
        entries.writeUInt32LE(png.length, entry + 8);
        entries.writeUInt32LE(offset, entry + 12);
        offset += png.length;
    });

    return Buffer.concat([header, entries, ...images.map(({ png }) => png)]);
}

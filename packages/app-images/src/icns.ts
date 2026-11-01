const HEADER_SIZE = 8;

/** ICNS entry types holding PNG data, by pixel size; `@2x` types reuse the pixels of the next size up. */
export const ICNS_TYPES: readonly { type: string; size: number }[] = [
    { type: 'icp4', size: 16 },
    { type: 'icp5', size: 32 },
    { type: 'ic11', size: 32 }, // 16@2x
    { type: 'ic12', size: 64 }, // 32@2x
    { type: 'ic07', size: 128 },
    { type: 'ic13', size: 256 }, // 128@2x
    { type: 'ic08', size: 256 },
    { type: 'ic14', size: 512 }, // 256@2x
    { type: 'ic09', size: 512 },
    { type: 'ic10', size: 1024 }, // 512@2x
];

/** ICNS container of PNG entries, as `iconutil` writes it, but on any platform; sharp can't write ICNS itself. */
export function toIcns(images: readonly { type: string; png: Buffer }[]): Buffer {
    const entries = images.map(({ type, png }) => {
        const header = Buffer.alloc(HEADER_SIZE);
        header.write(type, 0, 'latin1');
        header.writeUInt32BE(HEADER_SIZE + png.length, 4);
        return Buffer.concat([header, png]);
    });
    const header = Buffer.alloc(HEADER_SIZE);
    header.write('icns', 0, 'latin1');
    header.writeUInt32BE(HEADER_SIZE + entries.reduce((total, entry) => total + entry.length, 0), 4);
    return Buffer.concat([header, ...entries]);
}

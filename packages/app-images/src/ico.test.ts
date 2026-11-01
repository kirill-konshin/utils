import { expect, test } from 'vite-plus/test';

import { toIco } from './ico';

test('toIco writes a header, one entry per image and the PNGs', () => {
    const ico = toIco([
        { size: 16, png: Buffer.from('a') },
        { size: 256, png: Buffer.from('bc') },
    ]);

    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt8(6 + 16)).toBe(0); // 256
    expect(ico.readUInt32LE(6 + 12)).toBe(6 + 32);
    expect(ico.readUInt32LE(6 + 16 + 12)).toBe(6 + 32 + 1);
    expect(ico.subarray(6 + 32).toString()).toBe('abc');
});

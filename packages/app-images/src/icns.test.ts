import { expect, test } from 'vite-plus/test';

import { toIcns } from './icns';

test('toIcns writes a header with the total length, then type, length and data per entry', () => {
    const icns = toIcns([
        { type: 'ic07', png: Buffer.from('a') },
        { type: 'ic10', png: Buffer.from('bc') },
    ]);

    expect(icns.toString('latin1', 0, 4)).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
    expect(icns.toString('latin1', 8, 12)).toBe('ic07');
    expect(icns.readUInt32BE(12)).toBe(9);
    expect(icns.toString('latin1', 16, 17)).toBe('a');
    expect(icns.toString('latin1', 17, 21)).toBe('ic10');
    expect(icns.readUInt32BE(21)).toBe(10);
    expect(icns.toString('latin1', 25)).toBe('bc');
});

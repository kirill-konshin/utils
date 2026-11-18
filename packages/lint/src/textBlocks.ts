/**
 * The line range of a marked block in `lines`: the first line that is exactly `start`, through the first line after it
 * that is exactly `end`. Undefined when either is missing.
 */
export function findBlock(lines: string[], start: string, end: string): [from: number, to: number] | undefined {
    const from = lines.indexOf(start);
    const to = from === -1 ? -1 : lines.indexOf(end, from + 1);

    return to === -1 ? undefined : [from, to];
}

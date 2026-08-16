/**
 * Traccar's WKT subset (CIRCLE / POLYGON / LINESTRING) turned into Leaflet geometry.
 *
 * Shared by the geofence editor and the map overlay so a zone drawn in one is drawn identically in
 * the other. Traccar writes coordinates lat-first, which is the order Leaflet wants, so the pairs
 * pass through unswapped.
 *
 * Anything outside that subset returns null rather than throwing — a zone that cannot be parsed is
 * skipped, not allowed to take the whole map down with it.
 */
export function areaToShape(area) {
    if (!area) return null;

    let m = area.match(/^CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/i);
    if (m) return { type: 'circle', center: [Number(m[1]), Number(m[2])], radius: Number(m[3]) };

    m = area.match(/^POLYGON\s*\(\(([^)]+)\)\)$/i);
    if (m) return { type: 'polygon', points: m[1].split(',').map(p => p.trim().split(/\s+/).map(Number)) };

    m = area.match(/^LINESTRING\s*\(([^)]+)\)$/i);
    if (m) return { type: 'polyline', points: m[1].split(',').map(p => p.trim().split(/\s+/).map(Number)) };

    return null;
}

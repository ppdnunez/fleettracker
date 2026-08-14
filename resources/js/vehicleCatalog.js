// Shared vehicle-type and fuel-type catalogues. Values must stay in sync with
// VehicleSettingController's `vehicle_type` / `fuel_type` validation lists.

export const VEHICLE_TYPES = [
    { value: 'car',        label: 'Car',        emoji: '🚗' },
    { value: 'suv',        label: 'SUV',        emoji: '🚙' },
    { value: 'truck',      label: 'Truck',      emoji: '🚚' },
    { value: 'van',        label: 'Van',        emoji: '🚐' },
    { value: 'bus',        label: 'Bus',        emoji: '🚌' },
    { value: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' },
];

export function vehicleTypeEmoji(vehicleType) {
    return VEHICLE_TYPES.find(t => t.value === vehicleType)?.emoji ?? null;
}

/**
 * Inner glyph for a map pin, as SVG markup. Renders the literal emoji through an SVG <text>
 * node so the pin matches the dropdown exactly rather than approximating each vehicle with a
 * hand-drawn silhouette (too small to read at pin size). Returns null for an unset or
 * unrecognised type so the caller can fall back to its own default marker.
 */
export function vehicleGlyphSvg(vehicleType) {
    const emoji = vehicleTypeEmoji(vehicleType);
    if (!emoji) return null;

    return `<text x="12" y="13" font-size="13" text-anchor="middle" dominant-baseline="central">${emoji}</text>`;
}

export const FUEL_TYPES = [
    { value: 'petrol',   label: 'Petrol' },
    { value: 'diesel',   label: 'Diesel' },
    { value: 'electric', label: 'Electric' },
    { value: 'hybrid',   label: 'Hybrid' },
    { value: 'lpg',      label: 'LPG' },
];

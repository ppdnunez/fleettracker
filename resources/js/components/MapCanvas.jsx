import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { vehicleGlyphSvg } from '../vehicleCatalog.js';

// Fix default marker icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Port Moresby — where the fleet actually operates. Used until a device position or a selected
// device pulls the view somewhere specific.
const CENTER = [-9.4438, 147.1803];

// Marker colours, exported so the map legend can name the exact same states it draws.
export const MARKER_COLORS = {
    online:   { fill: '#22c55e', stroke: '#15803d' },
    offline:  { fill: '#94a3b8', stroke: '#64748b' },
    selected: { fill: '#3b82f6', stroke: '#1d4ed8' },
};

function makeIcon(selected, online, vehicleType) {
    const { fill: bg, stroke: border } =
        selected ? MARKER_COLORS.selected : online ? MARKER_COLORS.online : MARKER_COLORS.offline;
    // A vehicle with a type configured shows its glyph; everything else keeps the plain dot.
    const glyph = vehicleGlyphSvg(vehicleType);
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22s12-13 12-22C24 5.37 18.63 0 12 0z"
                  fill="${bg}" stroke="${border}" stroke-width="1.5"/>
            ${glyph ?? '<circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>'}
        </svg>`;
    return L.divIcon({
        html: svg,
        className: '',
        iconSize:   [24, 34],
        iconAnchor: [12, 34],
        popupAnchor:[0, -36],
    });
}

function FlyToSelected({ device }) {
    const map = useMap();
    useEffect(() => {
        if (device?.lat != null && device?.lng != null) {
            map.flyTo([device.lat, device.lng], map.getZoom(), { duration: 1 });
        }
    }, [device, map]);
    return null;
}

export default function MapCanvas({ devices, selected, onSelect, selectedDevice, liveConnected, nextRefreshIn }) {
    // Only shown where the caller tracks a live feed (Vehicle Track). Undefined elsewhere, so
    // the Device Map and cockpit dashboard render exactly as before.
    const showStatus = liveConnected !== undefined;

    return (
        <div style={{ flex: 1, position: 'relative' }}>
            {showStatus && (
                <div style={{
                    position: 'absolute', top: 10, left: 10, zIndex: 500,
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.94)',
                    border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    fontSize: 11.5, fontWeight: 600, color: '#475569',
                }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: liveConnected ? '#22c55e' : '#94a3b8' }} />
                        {liveConnected ? 'Live' : 'Reconnecting…'}
                    </span>
                    {nextRefreshIn !== undefined && (
                        <span style={{ color: '#94a3b8', fontWeight: 500 }}>refresh in {nextRefreshIn}s</span>
                    )}
                </div>
            )}
            <MapContainer
                center={CENTER}
                zoom={13}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom
                zoomControl={false}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ZoomControl position="topright" />

                <FlyToSelected device={selectedDevice} />

                {devices.map(d => (
                    d.lat != null && d.lng != null && (
                        <Marker
                            key={d.id}
                            position={[d.lat, d.lng]}
                            icon={makeIcon(selected === d.id, d.status === 'ONLINE', d.vehicleType)}
                            eventHandlers={{ click: () => onSelect(d.id) }}
                        >
                            <Popup>
                                <strong>{d.name}</strong><br />
                                {d.tracker}<br />
                                Lat: {d.lat.toFixed(4)} | Lng: {d.lng.toFixed(4)}<br />
                                Signal: {d.signal ?? 0}%<br />
                                <span style={{ color: d.status === 'ONLINE' ? '#16a34a' : '#94a3b8' }}>
                                    ● {d.status}
                                </span>
                            </Popup>
                        </Marker>
                    )
                ))}
            </MapContainer>
        </div>
    );
}
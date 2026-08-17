import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, Polyline, Tooltip, ScaleControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { vehicleGlyphSvg } from '../vehicleCatalog.js';
import { areaToShape } from '../geofenceArea.js';
import { api } from '../api.js';
import MapLocationSearch from './MapLocationSearch.jsx';
import DeviceStatusIcons, { alarmLabel } from './DeviceStatusIcons.jsx';

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
    online:   { fill: '#22c55e', stroke: '#4ade80' },
    offline:  { fill: '#94a3b8', stroke: '#64748b' },
    selected: { fill: '#3b82f6', stroke: '#7fc4ff' },
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

/* ── map controls ───────────────────────────────────────────────
   Leaflet's own controls are white boxes, which now clash with everything around them, so the
   zoom, geofence toggle and layer picker are drawn here in the app's own palette instead. */

const CTRL_BG     = '#0c1322';
const CTRL_BORDER = '#1e2c46';
const CTRL_FG     = '#9daec9';
const CTRL_ON     = '#3b82f6';

const ctrlButton = (active) => ({
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? CTRL_ON : CTRL_BG, color: active ? '#fff' : CTRL_FG,
    border: `1px solid ${CTRL_BORDER}`, borderRadius: 5, padding: 0,
    cursor: 'pointer', boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
});

function GeofenceIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
            <path d="M7.5 1 13.5 4.5 13.5 11 7.5 14 1.5 11 1.5 4.5Z" />
        </svg>
    );
}

function LabelIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
            <path d="M1.8 6.4V2.6a.8.8 0 0 1 .8-.8h3.8l7 7a.9.9 0 0 1 0 1.3l-3.7 3.7a.9.9 0 0 1-1.3 0l-7-7Z" />
            <circle cx="4.6" cy="4.6" r="1" fill="currentColor" stroke="none" />
        </svg>
    );
}

function LayersIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
        </svg>
    );
}

/* A readable label offset clear of the button. The native `title` tooltip on a 30px icon-only
   control tends to pop up underneath the cursor and cover the thing it is describing. */
function HoverTip({ label, children }) {
    const [hover, setHover] = useState(false);
    return (
        <div style={{ position: 'relative' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            {children}
            {hover && (
                <div style={{
                    position: 'absolute', top: '50%', right: '100%', marginRight: 8, transform: 'translateY(-50%)',
                    background: '#080d18', color: '#eaeff9', fontSize: 11.5, fontWeight: 600,
                    padding: '4px 9px', borderRadius: 5, whiteSpace: 'nowrap', border: `1px solid ${CTRL_BORDER}`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.45)', pointerEvents: 'none', zIndex: 1001,
                }}>
                    {label}
                </div>
            )}
        </div>
    );
}

function ZoomButtons() {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());

    useEffect(() => {
        const onZoom = () => setZoom(map.getZoom());
        map.on('zoomend', onZoom);
        return () => map.off('zoomend', onZoom);
    }, [map]);

    const atMax = zoom >= map.getMaxZoom();
    const atMin = zoom <= map.getMinZoom();

    return (
        <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 1000,
            display: 'flex', flexDirection: 'column', borderRadius: 5, overflow: 'hidden',
            boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
        }}>
            <HoverTip label="Zoom in">
                <button onClick={() => map.zoomIn()} disabled={atMax} aria-label="Zoom in"
                    style={{ ...ctrlButton(false), borderRadius: '5px 5px 0 0', borderBottom: 'none', fontSize: 16, fontWeight: 700, lineHeight: 1, opacity: atMax ? 0.4 : 1, cursor: atMax ? 'default' : 'pointer' }}>+</button>
            </HoverTip>
            <HoverTip label="Zoom out">
                <button onClick={() => map.zoomOut()} disabled={atMin} aria-label="Zoom out"
                    style={{ ...ctrlButton(false), borderRadius: '0 0 5px 5px', fontSize: 20, fontWeight: 700, lineHeight: 1, opacity: atMin ? 0.4 : 1, cursor: atMin ? 'default' : 'pointer' }}>−</button>
            </HoverTip>
        </div>
    );
}

/* Google's XYZ tile mirrors (mt0-mt3), used without an API key the same way most Leaflet projects
   pull Google tiles outside the JS Maps SDK. lyrs codes: m=roadmap, p=terrain, s=satellite,
   y=hybrid (satellite plus labels); "m,traffic" bakes live traffic into the roadmap tile. */
const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3'];
function googleLayer(lyrs) {
    return {
        url: `https://{s}.google.com/vt/lyrs=${lyrs}&x={x}&y={y}&z={z}`,
        subdomains: GOOGLE_SUBDOMAINS,
        attribution: '&copy; Google',
    };
}

const MAP_LAYERS = {
    osm: {
        label: 'OpenStreetMap',
        tiles: [{
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            subdomains: 'abc',
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }],
    },
    googleStreet:    { label: 'Google Map (Street)',    tiles: [googleLayer('m')] },
    googleTerrain:   { label: 'Google Map (Terrain)',   tiles: [googleLayer('p')] },
    googleSatellite: { label: 'Google Map (Satellite)', tiles: [googleLayer('s')] },
    googleMixing:    { label: 'Google Map (Mixing)',    tiles: [googleLayer('y')] },
    googleTraffic:   { label: 'Google Map (Traffic)',   tiles: [googleLayer('m,traffic')] },
};

function MapLayerPicker({ layerKey, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <HoverTip label="Change map layer">
                <button onClick={() => setOpen(v => !v)} aria-label="Change map layer" style={ctrlButton(open)}>
                    <LayersIcon />
                </button>
            </HoverTip>

            {open && (
                <div style={{
                    position: 'absolute', top: 0, right: 38, width: 195,
                    background: CTRL_BG, border: `1px solid ${CTRL_BORDER}`, borderRadius: 8,
                    boxShadow: '0 6px 20px rgba(0,0,0,0.45)', padding: '6px 0',
                }}>
                    {Object.entries(MAP_LAYERS).map(([key, def]) => (
                        <label key={key} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
                            fontSize: 13, color: layerKey === key ? '#eaeff9' : CTRL_FG, cursor: 'pointer',
                        }}>
                            <input type="radio" name="mapLayer" checked={layerKey === key}
                                onChange={() => { onChange(key); setOpen(false); }}
                                style={{ accentColor: CTRL_ON, width: 15, height: 15, margin: 0 }} />
                            {def.label}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function MapCanvas({ devices, selected, onSelect, selectedDevice, liveConnected, nextRefreshIn }) {
    // Only shown where the caller tracks a live feed (Vehicle Track). Undefined elsewhere, so
    // the Device Map and cockpit dashboard render exactly as before.
    const showStatus = liveConnected !== undefined;

    const [geofences, setGeofences]         = useState([]);
    const [showGeofences, setShowGeofences] = useState(false);
    const [showLabels, setShowLabels]       = useState(true);
    const [layerKey, setLayerKey]           = useState('osm');

    // Loaded the first time the overlay is switched on rather than on mount: this component is
    // mounted by the dashboard, Device Map and Vehicle Track alike, and most of those sessions
    // never ask to see the zones.
    useEffect(() => {
        if (!showGeofences || geofences.length) return;
        api.getGeofences().then(res => setGeofences(res.data ?? [])).catch(() => setGeofences([]));
    }, [showGeofences]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        // The dimming class lives on this wrapper rather than on the MapContainer so it can follow
        // the chosen layer: React owns this element outright, while Leaflet owns its own.
        <div className={layerKey === 'osm' ? 'map-dim' : undefined} style={{ flex: 1, position: 'relative' }}>
            {/* Below the search box, which takes the top-left corner. */}
            {showStatus && (
                <div style={{
                    position: 'absolute', top: 58, left: 12, zIndex: 500,
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 11px', borderRadius: 999, background: 'rgba(12,19,34,0.92)',
                    border: '1px solid #1e2c46', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                    fontSize: 11.5, fontWeight: 600, color: '#9daec9',
                }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: liveConnected ? '#22c55e' : '#94a3b8' }} />
                        {liveConnected ? 'Live' : 'Reconnecting…'}
                    </span>
                    {nextRefreshIn !== undefined && (
                        <span style={{ color: '#5e7094', fontWeight: 500 }}>refresh in {nextRefreshIn}s</span>
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
                {/* Keyed on the layer so switching base maps replaces the tiles rather than
                    stacking a second set on top of the first. */}
                {MAP_LAYERS[layerKey].tiles.map((t, i) => (
                    <TileLayer key={`${layerKey}-${i}`} url={t.url} subdomains={t.subdomains || 'abc'} attribution={t.attribution} />
                ))}

                <MapLocationSearch />
                <ZoomButtons />
                {/* Distance bar, metric only — the fleet is measured in metres and kilometres. */}
                <ScaleControl position="bottomleft" imperial={false} />
                <FlyToSelected device={selectedDevice} />

                {showGeofences && geofences.map(g => {
                    const shape = areaToShape(g.area);
                    if (!shape) return null;

                    const pathOptions = { color: '#3b82f6', weight: 2, fillOpacity: 0.12 };
                    // Named on the map itself: a zone the driver is being alerted about is only
                    // useful if you can tell which one it is without opening the editor.
                    const label = g.name
                        ? <Tooltip permanent direction="center" className="geofence-label">{g.name}</Tooltip>
                        : null;

                    if (shape.type === 'circle') {
                        return <Circle key={g.id} center={shape.center} radius={shape.radius} pathOptions={pathOptions}>{label}</Circle>;
                    }
                    if (shape.type === 'polygon') {
                        return <Polygon key={g.id} positions={shape.points} pathOptions={pathOptions}>{label}</Polygon>;
                    }
                    return <Polyline key={g.id} positions={shape.points} pathOptions={pathOptions}>{label}</Polyline>;
                })}

                {devices.map(d => (
                    d.lat != null && d.lng != null && (
                        <Marker
                            key={d.id}
                            position={[d.lat, d.lng]}
                            icon={makeIcon(selected === d.id, d.status === 'ONLINE', d.vehicleType)}
                            eventHandlers={{ click: () => onSelect(d.id) }}
                        >
                            {/* Label above the pin: which vehicle this is, and whether it is
                                alarmed / running, without clicking each marker in turn. Toggled
                                off from the control on the right when the map gets crowded. */}
                            {showLabels && (
                                <Tooltip permanent direction="top" offset={[0, -34]} opacity={1} className="device-label">
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <span>{d.name}</span>
                                        <DeviceStatusIcons device={d} size={13} gap={4} />
                                    </span>
                                </Tooltip>
                            )}

                            <Popup>
                                <strong>{d.name}</strong><br />
                                {d.tracker}<br />
                                Lat: {d.lat.toFixed(4)} | Lng: {d.lng.toFixed(4)}<br />
                                {d.battery != null && <>Battery: {Math.round(d.battery)}%{d.charging ? ' (charging)' : ''}<br /></>}
                                {d.ignition != null && <>Ignition: {d.ignition ? 'ON' : 'OFF'}<br /></>}
                                {alarmLabel(d.alarm) && (
                                    <span style={{ color: '#f87171', fontWeight: 700 }}>⚠ {alarmLabel(d.alarm)}<br /></span>
                                )}
                                <span style={{ color: d.status === 'ONLINE' ? '#4ade80' : '#5e7094' }}>
                                    ● {d.status}
                                </span>
                            </Popup>
                        </Marker>
                    )
                ))}
            </MapContainer>

            {/* Show geofences + change base map, centred on the map's right edge so they sit clear
                of the zoom control above and the attribution below. */}
            <div style={{
                position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
                zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
                <HoverTip label={showLabels ? 'Hide device names' : 'Show device names'}>
                    <button onClick={() => setShowLabels(v => !v)}
                        aria-label={showLabels ? 'Hide device names' : 'Show device names'}
                        style={ctrlButton(showLabels)}>
                        <LabelIcon />
                    </button>
                </HoverTip>

                <HoverTip label={showGeofences ? 'Hide geofences' : 'Show geofences'}>
                    <button onClick={() => setShowGeofences(v => !v)}
                        aria-label={showGeofences ? 'Hide geofences' : 'Show geofences'}
                        style={ctrlButton(showGeofences)}>
                        <GeofenceIcon />
                    </button>
                </HoverTip>

                <MapLayerPicker layerKey={layerKey} onChange={setLayerKey} />
            </div>
        </div>
    );
}
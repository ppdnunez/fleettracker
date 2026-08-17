import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, ZoomControl, ScaleControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { api } from '../api.js';
import { areaToShape } from '../geofenceArea.js';
import MapLocationSearch from './MapLocationSearch.jsx';

const CENTER = [-9.4438, 147.1803]; // Port Moresby
const ALERT_DIRECTIONS = [
    { value: 'enter', label: 'Enter only' },
    { value: 'exit',  label: 'Exit only' },
    { value: 'both',  label: 'Both' },
];
const SHAPE_STYLE = { color: '#3b82f6', weight: 2, fillOpacity: 0.15 };
const SHAPE_STYLE_SELECTED = { color: '#f59e0b', weight: 3, fillOpacity: 0.25 };

/* ── Traccar's WKT subset (CIRCLE / POLYGON / LINESTRING) <-> Leaflet geometry ──
   Parsing lives in geofenceArea.js, shared with the map overlay so both draw the same zone the
   same way. Only the reverse direction (Leaflet layer -> WKT) is specific to this editor. */
function shapeToLayer(shape, style) {
    if (shape.type === 'circle')   return L.circle(shape.center, { radius: shape.radius, ...style });
    if (shape.type === 'polygon')  return L.polygon(shape.points, style);
    if (shape.type === 'polyline') return L.polyline(shape.points, style);
    return null;
}

function layerToArea(layer) {
    if (layer instanceof L.Circle) {
        const c = layer.getLatLng();
        return `CIRCLE (${c.lat} ${c.lng}, ${Math.round(layer.getRadius())})`;
    }
    if (layer instanceof L.Polygon) {
        const ring = layer.getLatLngs()[0];
        const closed = [...ring, ring[0]];
        return `POLYGON ((${closed.map(p => `${p.lat} ${p.lng}`).join(', ')}))`;
    }
    if (layer instanceof L.Polyline) {
        return `LINESTRING (${layer.getLatLngs().map(p => `${p.lat} ${p.lng}`).join(', ')})`;
    }
    return null;
}

const TOOLS = [
    { key: 'polygon',  label: 'Polygon', icon: '▱' },
    { key: 'circle',   label: 'Circle',  icon: '◯' },
    { key: 'delete',   label: 'Delete',  icon: '🗑' },
];

/* ── Lives inside the MapContainer: draw toolbar + rendering existing geofences ── */
function DrawLayer({ geofences, selectedId, editingId, onCreate, onEditSave, onEditCancel, onDeleteShape }) {
    const map = useMap();
    const [ready, setReady] = useState(false);
    const [activeTool, setActiveTool] = useState(null);
    const [pending, setPending] = useState(null); // { layer, area }
    const [pendingName, setPendingName] = useState('');

    const groupRef     = useRef(null);
    const layersById    = useRef({});
    const deleteModeRef = useRef(false);
    const handlerRef    = useRef(null);

    // leaflet-draw expects a global `window.L` at the moment it's evaluated. A dynamic
    // import (unlike a static one) runs exactly where it's written, so this guarantees
    // window.L is set first regardless of how the bundler orders static imports.
    useEffect(() => {
        window.L = L;
        import('leaflet-draw').then(() => setReady(true));
    }, []);

    useEffect(() => {
        if (!ready) return;
        const group = L.featureGroup().addTo(map);
        groupRef.current = group;

        const onCreated = (e) => {
            setActiveTool(null);
            const area = layerToArea(e.layer);
            e.layer.addTo(map);
            setPending({ layer: e.layer, area });
            setPendingName('New geofence');
        };
        map.on(L.Draw.Event.CREATED, onCreated);
        return () => {
            map.off(L.Draw.Event.CREATED, onCreated);
            map.removeLayer(group);
        };
    }, [ready, map]);

    useEffect(() => { deleteModeRef.current = activeTool === 'delete'; }, [activeTool]);

    // Keep rendered shapes in sync with the geofence list
    useEffect(() => {
        if (!ready || !groupRef.current) return;
        groupRef.current.clearLayers();
        layersById.current = {};
        geofences.forEach(g => {
            const shape = areaToShape(g.area);
            if (!shape) return;
            const style = g.id === selectedId ? SHAPE_STYLE_SELECTED : SHAPE_STYLE;
            const layer = shapeToLayer(shape, style);
            if (!layer) return;
            // Permanent, centred label so every zone is identifiable without hovering.
            layer.bindTooltip(g.name, { permanent: true, direction: 'center', className: 'geofence-label' });
            layer.on('click', () => { if (deleteModeRef.current) onDeleteShape(g.id); });
            layer.addTo(groupRef.current);
            layersById.current[g.id] = layer;
        });
    }, [ready, geofences, selectedId]);

    // Fly to the selected geofence
    useEffect(() => {
        if (!selectedId) return;
        const layer = layersById.current[selectedId];
        if (!layer) return;
        if (layer.getBounds) map.fitBounds(layer.getBounds(), { maxZoom: 17 });
        else if (layer.getLatLng) map.setView(layer.getLatLng(), Math.max(map.getZoom(), 15));
    }, [selectedId]);

    // Live vertex/radius editing for the geofence being edited
    useEffect(() => {
        if (!ready || !editingId) return;
        const layer = layersById.current[editingId];
        if (!layer?.editing) return;
        layer.editing.enable();
        return () => layer.editing?.disable();
    }, [ready, editingId]);

    const startTool = (tool) => {
        if (!ready) return;
        handlerRef.current?.disable?.();
        if (activeTool === tool) { setActiveTool(null); return; }
        setActiveTool(tool);
        if (tool === 'delete') return;
        const Handler = { circle: L.Draw.Circle, polygon: L.Draw.Polygon, polyline: L.Draw.Polyline }[tool];
        handlerRef.current = new Handler(map, { shapeOptions: SHAPE_STYLE });
        handlerRef.current.enable();
    };

    const confirmPending = async () => {
        if (!pending) return;
        map.removeLayer(pending.layer);
        await onCreate(pendingName.trim() || 'New geofence', pending.area);
        setPending(null);
    };
    const cancelPending = () => {
        if (pending) map.removeLayer(pending.layer);
        setPending(null);
    };

    const saveEdit = () => {
        const layer = layersById.current[editingId];
        if (layer) onEditSave(editingId, layerToArea(layer));
    };

    return (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: '#111c33', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {TOOLS.map(t => (
                    <button key={t.key} title={t.label} disabled={!ready} onClick={() => startTool(t.key)}
                        style={{
                            width: 32, height: 32, fontSize: 15, lineHeight: 1,
                            border: activeTool === t.key ? '1.5px solid #3b82f6' : '1px solid #1e2c46',
                            borderRadius: 6, background: activeTool === t.key ? '#152a4a' : '#111c33',
                            cursor: ready ? 'pointer' : 'not-allowed', color: t.key === 'delete' ? '#ef4444' : '#cfdcf0',
                        }}>
                        {t.icon}
                    </button>
                ))}
            </div>

            {pending && (
                <div style={{ background: '#111c33', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: 10, width: 200 }}>
                    <label style={{ display: 'block', fontSize: 11.5, color: '#9daec9', fontWeight: 600, marginBottom: 4 }}>Geofence name</label>
                    <input autoFocus value={pendingName} onChange={e => setPendingName(e.target.value)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #24344f', borderRadius: 5, fontSize: 13, outline: 'none', marginBottom: 8 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={confirmPending} style={{ flex: 1, padding: '6px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                        <button onClick={cancelPending} style={{ flex: 1, padding: '6px 0', background: '#111c33', color: '#cfdcf0', border: '1px solid #24344f', borderRadius: 5, fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            {editingId && (
                <div style={{ background: '#111c33', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: 10, width: 200, fontSize: 12 }}>
                    <p style={{ margin: '0 0 8px', color: '#cfdcf0' }}>Drag the shape to edit it, then save.</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={saveEdit} style={{ flex: 1, padding: '6px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                        <button onClick={onEditCancel} style={{ flex: 1, padding: '6px 0', background: '#111c33', color: '#cfdcf0', border: '1px solid #24344f', borderRadius: 5, fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            {activeTool === 'delete' && (
                <div style={{ background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 10px', width: 200, fontSize: 12, color: '#fca5a5' }}>
                    Click a shape on the map to delete it.
                </div>
            )}
        </div>
    );
}

/**
 * Whether Traccar is actually watching this zone.
 *
 * A zone is drawn here but evaluated there, and two things have to line up: the zone must have
 * been mirrored into Traccar, and it must have at least one device Traccar can see linked to it.
 * Miss either and the zone sits on the map raising nothing — which used to be invisible until
 * someone opened the Geo Fence report and found it empty.
 *
 * "Linked to a device this account cannot see" is called out separately because it looks identical
 * to a working zone from here: the link exists locally, but the IMEI belongs to another company,
 * so Traccar has nothing to attach the zone to.
 */
function WatchState({ zone, devices }) {
    const visible = new Set(devices.map(d => d.uniqueId));
    const linked  = (zone.imeis ?? []).length;
    const usable  = (zone.imeis ?? []).filter(i => visible.has(i)).length;

    let tone = '#4ade80';
    let text = `Watched · ${usable} device${usable === 1 ? '' : 's'}`;

    if (!zone.traccar_geofence_id) {
        tone = '#fcd34d';
        text = 'Not sent to Traccar — no alerts yet';
    } else if (linked === 0) {
        tone = '#fcd34d';
        text = 'No device linked — raises nothing';
    } else if (usable === 0) {
        tone = '#fca5a5';
        text = `${linked} linked device${linked === 1 ? '' : 's'} not on this account`;
    }

    return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: tone === '#4ade80' ? '#5e7094' : tone }}>{text}</span>
        </span>
    );
}

/* Which devices this zone applies to, and on which crossing direction each should alert. */
function LinkedDevices({ zone, devices, onChanged }) {
    const [busy, setBusy] = useState('');

    if (!zone) {
        return (
            <div style={{ padding: '12px 16px', borderTop: '1px solid #1e2c46', fontSize: 12, color: '#5e7094' }}>
                Select a geofence to manage its linked devices.
            </div>
        );
    }

    const directionByImei = {};
    (zone.links ?? []).forEach(l => { directionByImei[l.imei] = l.alert_direction; });

    const toggle = async (imei, linked) => {
        setBusy(imei);
        try {
            if (linked) await api.unlinkWorkZoneDevice(zone.id, imei);
            else        await api.linkWorkZoneDevice(zone.id, imei, 'both');
            await onChanged();
        } finally {
            setBusy('');
        }
    };

    const setDirection = async (imei, direction) => {
        setBusy(imei);
        try {
            await api.setWorkZoneDeviceDirection(zone.id, imei, direction);
            await onChanged();
        } finally {
            setBusy('');
        }
    };

    return (
        <div style={{ borderTop: '1px solid #1e2c46', padding: '10px 14px', maxHeight: 200, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9daec9', marginBottom: 8, letterSpacing: 0.3 }}>
                Linked Devices — {zone.name}
            </div>
            {devices.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: '#5e7094' }}>No devices available.</p>
            ) : devices.map(d => {
                const linked = directionByImei[d.uniqueId] !== undefined;
                return (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, opacity: busy === d.uniqueId ? 0.5 : 1 }}>
                        <input
                            type="checkbox"
                            checked={linked}
                            disabled={!!busy}
                            onChange={() => toggle(d.uniqueId, linked)}
                            style={{ accentColor: '#3b82f6', width: 15, height: 15, flexShrink: 0 }}
                        />
                        <span style={{ flex: 1, fontSize: 12.5, color: '#cfdcf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                        <select
                            value={directionByImei[d.uniqueId] ?? 'both'}
                            disabled={!linked || !!busy}
                            onChange={e => setDirection(d.uniqueId, e.target.value)}
                            style={{ padding: '3px 6px', border: '1px solid #24344f', borderRadius: 5, fontSize: 12, background: linked ? '#111c33' : '#16233c', cursor: linked ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                        >
                            {ALERT_DIRECTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                );
            })}
        </div>
    );
}

/* ── Root export ───────────────────────────────────────────────── */
export default function GeofencePage({ onBack }) {
    const [geofences, setGeofences] = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [editingId,  setEditingId]  = useState(null);
    const [error,      setError]      = useState('');
    const [devices,    setDevices]    = useState([]);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchGeofences = async () => {
        try {
            const res = await api.getWorkZones();
            setGeofences(res.data);
        } catch (e) {
            setError('Failed to load geofences.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGeofences();
        // Device list for the link panel; the zones still render if Traccar is unreachable.
        api.getTraccarDevices().then(r => setDevices(r.data || [])).catch(() => {});
    }, []);

    /* The zone saves here even when Traccar refuses the mirror, so a failure is reported rather
       than thrown away — the zone would otherwise look saved and silently never raise an event. */
    const reportMirror = (res) => {
        const traccar = res?.data?.traccar;
        setError(traccar && traccar.ok === false
            ? `Saved here, but Traccar did not accept it, so it will not raise alerts yet: ${traccar.message}`
            : '');
    };

    const handleCreate = async (name, area) => {
        try {
            reportMirror(await api.createWorkZone({ name, area }));
            await fetchGeofences();
        } catch (e) {
            setError('Failed to create geofence.');
        }
    };

    const handleEditSave = async (id, area) => {
        const g = geofences.find(g => g.id === id);
        if (!g) return;
        try {
            reportMirror(await api.updateWorkZone(id, { name: g.name, area }));
            setEditingId(null);
            await fetchGeofences();
        } catch (e) {
            setError('Failed to update geofence.');
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.deleteWorkZone(id);
            if (selectedId === id) setSelectedId(null);
            if (editingId === id) setEditingId(null);
            await fetchGeofences();
        } catch (e) {
            setError('Failed to delete geofence.');
        }
    };

    const requestDelete = (id) => setPendingDeleteId(id);
    const confirmDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        if (id != null) await handleDelete(id);
    };

    return (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left panel */}
            <div style={{ width: 280, minWidth: 280, display: 'flex', flexDirection: 'column', background: '#111c33', borderRight: '1px solid #1e2c46' }}>
                <div style={{ height: 58, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid #1e2c46', flexShrink: 0 }}>
                    <button onClick={onBack} title="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cfdcf0', fontSize: 18, display: 'flex' }}>←</button>
                </div>

                {error && (
                    <div style={{ margin: 12, padding: '8px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>
                        {error}
                    </div>
                )}

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <p style={{ textAlign: 'center', color: '#5e7094', fontSize: 13, padding: 24 }}>Loading…</p>
                    ) : geofences.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#5e7094', fontSize: 13, padding: 24 }}>No geofences yet. Draw one on the map to get started.</p>
                    ) : geofences.map(g => (
                        <div key={g.id} onClick={() => setSelectedId(g.id)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #1e2c46', background: selectedId === g.id ? '#152a4a' : 'transparent' }}>
                            <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: '#eaeff9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                                <WatchState zone={g} devices={devices} />
                            </span>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                <button onClick={e => { e.stopPropagation(); setSelectedId(g.id); setEditingId(g.id); }} title="Edit"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9daec9', padding: 4 }}>✏</button>
                                <button onClick={e => { e.stopPropagation(); requestDelete(g.id); }} title="Delete"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>🗑</button>
                            </div>
                        </div>
                    ))}
                </div>

                <LinkedDevices
                    zone={geofences.find(g => g.id === selectedId) || null}
                    devices={devices}
                    onChanged={fetchGeofences}
                />
            </div>

            {/* Map */}
            <div style={{ flex: 1, position: 'relative' }}>
                <MapContainer className="map-dim" center={CENTER} zoom={13} style={{ width: '100%', height: '100%' }} scrollWheelZoom zoomControl={false}>
                    <MapLocationSearch anchor="top-center" />
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <ZoomControl position="topright" />
                    <ScaleControl position="bottomleft" imperial={false} />
                    <DrawLayer
                        geofences={geofences}
                        selectedId={selectedId}
                        editingId={editingId}
                        onCreate={handleCreate}
                        onEditSave={handleEditSave}
                        onEditCancel={() => setEditingId(null)}
                        onDeleteShape={requestDelete}
                    />
                </MapContainer>

                {pendingDeleteId && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                        <div style={{ background: '#111c33', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>Delete geofence?</h3>
                            <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#9daec9' }}>
                                "{geofences.find(g => g.id === pendingDeleteId)?.name}" will be permanently removed.
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={confirmDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

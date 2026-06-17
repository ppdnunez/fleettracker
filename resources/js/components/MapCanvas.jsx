import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon paths broken by bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CENTER = [14.5995, 120.9842];

function makeIcon(selected, online) {
    const bg      = selected ? '#1e293b' : online ? '#3b82f6' : '#94a3b8';
    const border  = selected ? '#0f172a' : online ? '#1d4ed8' : '#64748b';
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22s12-13 12-22C24 5.37 18.63 0 12 0z"
                  fill="${bg}" stroke="${border}" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
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

export default function MapCanvas({ devices, selected, onSelect, selectedDevice }) {
    return (
        <div style={{ flex: 1, position: 'relative' }}>
            <MapContainer
                center={CENTER}
                zoom={13}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <FlyToSelected device={selectedDevice} />

                {devices.map(d => (
                    d.lat != null && d.lng != null && (
                        <Marker
                            key={d.id}
                            position={[d.lat, d.lng]}
                            icon={makeIcon(selected === d.id, d.status === 'ONLINE')}
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
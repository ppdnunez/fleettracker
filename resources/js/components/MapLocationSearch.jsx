import { useState } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Free-text place lookup that flies the map to the result.
 *
 * Uses OpenStreetMap's Nominatim — the same project behind the default tiles — so it needs no API
 * key and no server-side proxy. Called straight from the browser, which also keeps the app's own
 * backend out of a lookup that has nothing to do with the fleet.
 *
 * Must be rendered inside a <MapContainer>: it drives the map through useMap().
 *
 * `anchor` places it over the map — 'top-left' beside the live-status pill, or 'top-center' where
 * a page has the width to spare.
 */
export default function MapLocationSearch({ anchor = 'top-left', offsetTop = 12 }) {
    const map = useMap();
    const [query, setQuery]     = useState('');
    const [results, setResults] = useState([]);
    const [busy, setBusy]       = useState(false);
    const [message, setMessage] = useState('');

    const search = async (e) => {
        e?.preventDefault();
        const q = query.trim();
        if (!q) return;

        setBusy(true);
        setMessage('');
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0&q=${encodeURIComponent(q)}`
            );
            const found = await res.json();
            setResults(found);
            if (found.length === 0) setMessage('No match for that place.');
        } catch {
            setMessage('Location search is unavailable right now.');
        } finally {
            setBusy(false);
        }
    };

    const goTo = (r) => {
        map.flyTo([Number(r.lat), Number(r.lon)], 16, { duration: 1 });
        setResults([]);
        setQuery(r.display_name.split(',')[0]);
    };

    const place = anchor === 'top-center'
        ? { left: '50%', transform: 'translateX(-50%)' }
        : { left: 12 };

    return (
        <div style={{ position: 'absolute', top: offsetTop, ...place, zIndex: 900, width: 300, maxWidth: '70%' }}>
            <form onSubmit={search} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#0c1322', border: '1px solid #1e2c46', borderRadius: 8,
                padding: '6px 10px', boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
            }}>
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search location…"
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#eaeff9', background: 'transparent', minWidth: 0 }}
                />
                <button type="submit" disabled={busy} style={{ background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', fontSize: 14, padding: 0 }}>🔍</button>
            </form>

            {(results.length > 0 || message) && (
                <div style={{
                    marginTop: 4, background: '#0c1322', border: '1px solid #1e2c46', borderRadius: 8,
                    boxShadow: '0 8px 20px rgba(0,0,0,0.45)', overflow: 'hidden',
                }}>
                    {message && <p style={{ margin: 0, padding: '9px 12px', fontSize: 12, color: '#5e7094' }}>{message}</p>}
                    {results.map(r => (
                        <button key={r.place_id} onClick={() => goTo(r)} style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                            border: 'none', borderBottom: '1px solid #1e2c46', background: '#0c1322',
                            cursor: 'pointer', fontSize: 12.5, color: '#cfdcf0',
                        }}>
                            {r.display_name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

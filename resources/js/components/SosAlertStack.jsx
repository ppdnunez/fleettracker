import { useState } from 'react';
import { Z } from '../zLayers.js';

/**
 * Live SOS alerts, stacked in the top-right corner of the dashboard.
 *
 * These arrive on the Traccar websocket the map is already using — an SOS is an `alarm` event with
 * attributes.alarm === 'sos', pushed the moment the device sends it. No polling, and no dependency
 * on the emailed alerts, which are only swept every fifteen minutes.
 *
 * Deliberately sticky: no auto-dismiss timer, no click-outside-to-close, and no Escape handler.
 * A panic button that scrolled away unnoticed would be worse than useless, so each one stays until
 * somebody explicitly acknowledges it. That is also why this is not the app's ordinary toast
 * treatment — it is the one alert that must not be missable.
 *
 * Every card carries the position the alarm was raised at, three ways over: the address if Traccar
 * geocoded one, the raw coordinates (copyable, because dispatchers read them out over radio), and
 * two ways to open them on a map. Whoever sees this needs to know *where* before anything else.
 */
export default function SosAlertStack({ alerts, onDismiss, onLocate }) {
    const [copiedKey, setCopiedKey] = useState(null);

    if (alerts.length === 0) return null;

    const copyCoords = async (alert) => {
        const text = `${alert.lat}, ${alert.lng}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(alert.key);
            setTimeout(() => setCopiedKey(k => (k === alert.key ? null : k)), 1600);
        } catch {
            /* clipboard blocked (insecure origin / permission) — the coordinates are on screen anyway */
        }
    };

    return (
        <div style={{
            // Above dialogs, not merely above the page: an SOS that arrives while a confirmation
            // is open must still be seen. At an equal z-index the dialog would cover it.
            position: 'fixed', top: 70, right: 18, zIndex: Z.alert,
            display: 'flex', flexDirection: 'column', gap: 10, width: 340, maxWidth: 'calc(100vw - 36px)',
            maxHeight: 'calc(100vh - 90px)', overflowY: 'auto',
        }}>
            {alerts.map(alert => {
                const hasCoords = alert.lat != null && alert.lng != null;
                const coords    = hasCoords ? `${alert.lat.toFixed(5)}, ${alert.lng.toFixed(5)}` : null;

                return (
                    <div key={alert.key} style={{
                        background: '#fff', borderRadius: 12, overflow: 'hidden',
                        border: '1px solid #fecaca', borderLeft: '5px solid #dc2626',
                        boxShadow: '0 12px 32px rgba(220,38,38,0.28)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px 10px' }}>
                            <span style={{
                                flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: '#dc2626', color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800,
                            }}>!</span>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#991b1b', letterSpacing: 0.2 }}>
                                    SOS — {alert.deviceName}
                                </div>
                                <div style={{ fontSize: 12, color: '#5a4e42', marginTop: 2 }}>{alert.time}</div>
                                {alert.imei && (
                                    <div style={{ fontSize: 11.5, color: '#9a8a75', fontFamily: 'monospace', marginTop: 1 }}>{alert.imei}</div>
                                )}
                            </div>

                            {/* No × in the corner: dismissing is an acknowledgement, so it takes the
                                deliberate button below rather than a stray click near the edge. */}
                        </div>

                        {/* Location block — the part of this card that actually matters. */}
                        <div style={{
                            margin: '0 14px 10px', padding: '8px 10px', borderRadius: 8,
                            background: '#fef2f2', border: '1px solid #fee2e2',
                        }}>
                            {alert.address && (
                                <div style={{ fontSize: 12, color: '#7f1d1d', fontWeight: 600, marginBottom: 4, lineHeight: 1.35 }}>
                                    {alert.address}
                                </div>
                            )}

                            {hasCoords ? (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#1a1a1a', fontWeight: 600 }}>
                                            {coords}
                                        </span>
                                        <button onClick={() => copyCoords(alert)} title="Copy coordinates" style={{
                                            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                                            color: copiedKey === alert.key ? '#15803d' : '#5a4e42',
                                            fontSize: 11.5, fontWeight: 600, padding: 0,
                                        }}>
                                            {copiedKey === alert.key ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                        {/* Opens outside the app, for anyone who needs to hand the
                                            location to a responder who has no login here. */}
                                        <a href={`https://www.google.com/maps/search/?api=1&query=${alert.lat},${alert.lng}`}
                                            target="_blank" rel="noopener noreferrer"
                                            style={{ fontSize: 12, fontWeight: 600, color: '#b45309', textDecoration: 'none' }}>
                                            Open in Google Maps ↗
                                        </a>
                                        {alert.speed != null && (
                                            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#5a4e42' }}>
                                                {Math.round(alert.speed)} km/h
                                            </span>
                                        )}
                                    </div>

                                    {/* Says plainly which fix this is. A stale position on a panic
                                        button is worth knowing about before someone drives to it. */}
                                    {!alert.exact && (
                                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 5 }}>
                                            Last known position — locating the alarm…
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ fontSize: 12, color: '#b45309' }}>
                                    No position reported with this alarm.
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px' }}>
                            {alert.deviceId != null && (
                                <button onClick={() => onLocate(alert)} style={{
                                    flex: 1, padding: '7px 10px', border: '1px solid #d5c9b8', borderRadius: 7,
                                    background: '#fff', color: '#3a3a3a', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                                }}>Show on map</button>
                            )}
                            <button onClick={() => onDismiss(alert.key)} style={{
                                flex: 1, padding: '7px 10px', border: 'none', borderRadius: 7,
                                background: '#dc2626', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                            }}>Acknowledge</button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

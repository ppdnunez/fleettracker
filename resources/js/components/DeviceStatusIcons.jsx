/**
 * The at-a-glance state of a device: alarm, ignition, battery.
 *
 * Traccar reports all three as attributes on the device's latest position, so they are only as
 * fresh as the last fix — an alarm stays raised until a position arrives without it, which is the
 * same behaviour Traccar's own map has.
 *
 * Shared by the device list and the map label so a vehicle cannot appear alarmed in one and calm
 * in the other.
 */

/** Human wording for Traccar's alarm codes; anything unrecognised is shown as-is. */
const ALARM_LABELS = {
    sos:              'SOS — panic button',
    overspeed:        'Overspeed',
    hardAcceleration: 'Harsh acceleration',
    hardBraking:      'Harsh braking',
    hardCornering:    'Harsh cornering',
    accident:         'Collision',
    collision:        'Collision',
    fallDown:         'Rollover',
    rollover:         'Rollover',
    fatigueDriving:   'Fatigue driving',
    overtime:         'Fatigue driving',
    tired:            'Fatigue driving',
    powerCut:         'Power cut',
    lowBattery:       'Low battery',
    tampering:        'Tampering',
    geofenceExit:     'Left geofence',
    geofenceEnter:    'Entered geofence',
    movement:         'Unauthorised movement',
    tow:              'Towing',
    powerOff:         'Power off',
    powerOn:          'Power on',
    idle:             'Idling',
    vibration:        'Vibration',
    jamming:          'GPS jamming',
};

export function alarmLabel(alarm) {
    if (!alarm) return null;
    return ALARM_LABELS[alarm] ?? alarm.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

function AlarmIcon({ size }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="8" fill="#dc2626" />
            <rect x="7.1" y="3.6" width="1.8" height="5.2" rx="0.9" fill="#fff" />
            <circle cx="8" cy="11.6" r="1.05" fill="#fff" />
        </svg>
    );
}

function EngineIcon({ size, on }) {
    // Ignition off is drawn muted rather than hidden: "engine off" and "no data" are different
    // things, and an operator needs to be able to tell them apart.
    const color = on ? '#22c55e' : '#5a4e42';
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 6.6h1.6V5.2h3.1v1.4h2.1l1.9 1.9h1.6V7.1h1.7v4.1h-1.7V9.9h-1.6l-1.9 1.9H4.6L2 9.6Z" />
            <line x1="4.4" y1="3.4" x2="6.8" y2="3.4" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}

function BatteryIcon({ size, level, charging }) {
    const pct   = Math.max(0, Math.min(100, Number(level)));
    const color = pct <= 15 ? '#ef4444' : pct <= 35 ? '#f59e0b' : '#22c55e';
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.4" y="4.2" width="11.4" height="7.6" rx="1.6" fill="none" stroke={color} strokeWidth="1.3" />
            <rect x="13.4" y="6.4" width="1.5" height="3.2" rx="0.6" fill={color} />
            <rect x="2.9" y="5.7" width={8.4 * (pct / 100)} height="4.6" rx="0.7" fill={color} />
            {charging && <path d="M8.4 4.9 6.2 8.4h1.7l-.5 2.8 2.4-3.7H8.1Z" fill="#141414" stroke={color} strokeWidth="0.7" strokeLinejoin="round" />}
        </svg>
    );
}

/**
 * @param device  a normalised live device (see normalizeLiveDevice in Dashboard.jsx)
 * @param size    icon edge in px
 */
export default function DeviceStatusIcons({ device, size = 15, gap = 5 }) {
    const label = alarmLabel(device.alarm);

    // Nothing known about any of the three: draw nothing rather than a row of grey placeholders
    // implying the device reported "all clear".
    if (!label && device.ignition == null && device.battery == null) return null;

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
            {label && (
                <span title={label} style={{ display: 'inline-flex' }}>
                    <AlarmIcon size={size} />
                </span>
            )}
            {device.ignition != null && (
                <span title={`Ignition ${device.ignition ? 'on' : 'off'}`} style={{ display: 'inline-flex' }}>
                    <EngineIcon size={size} on={device.ignition} />
                </span>
            )}
            {device.battery != null && (
                <span title={`Battery ${Math.round(device.battery)}%${device.charging ? ' (charging)' : ''}`} style={{ display: 'inline-flex' }}>
                    <BatteryIcon size={size} level={device.battery} charging={device.charging} />
                </span>
            )}
        </span>
    );
}

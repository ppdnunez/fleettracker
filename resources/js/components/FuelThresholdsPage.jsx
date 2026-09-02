import { useState, useEffect } from 'react';
import { api } from '../api.js';

/**
 * The thresholds behind Traccar's own fuel drop / increase events.
 *
 * These are attributes, not config-file settings, and Traccar resolves them device → group → server
 * with the first hit winning. That makes "what is this device set to" and "what actually governs
 * this device" two different questions, so the table answers both: a device's own value, and the
 * effective value with the level it came from.
 *
 * Writes go through the backend, which reads the whole object back from Traccar, merges these three
 * keys into its attributes and PUTs it entire — Traccar takes no patches, and sending only the
 * changed keys would wipe everything else on the device.
 */

const TH = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: '#d5c9b8', borderBottom: '2px solid #2c2c2c', whiteSpace: 'nowrap', background: '#222222' };
const TD = { padding: '9px 12px', fontSize: 12.5, borderBottom: '1px solid #2c2c2c', color: '#d5c9b8' };
const num = { padding: '6px 8px', border: '1px solid #383838', borderRadius: 6, fontSize: 12.5, color: '#f5f0e8', background: '#222222', outline: 'none', width: 84 };

/* Starting points by vehicle size — roughly 10% of tank capacity for a drop, a little less for a
   refuel, which is large and unambiguous. Fuel slosh on a hill easily swings a half-full tank by
   several percent, so drops need the extra headroom. */
const GUIDE = [
    ['Car / pickup',      '60–80 L',   '8 L',  '10 L'],
    ['Light truck',       '150–200 L', '20 L', '20 L'],
    ['Heavy truck / bus', '400–600 L', '40 L', '30 L'],
];

function ThresholdRow({ label, sublabel, values, effective, onSave, saving, canWrite = true }) {
    const [form, setForm] = useState(values);
    const [dirty, setDirty] = useState(false);

    useEffect(() => { setForm(values); setDirty(false); }, [values]);

    const set = (key) => (e) => {
        setForm(f => ({ ...f, [key]: e.target.value }));
        setDirty(true);
    };

    const cell = (key) => (
        <td style={TD}>
            <input type="number" min="0" step="1" value={form[key] ?? ''} onChange={set(key)} disabled={!canWrite}
                placeholder={effective?.[key]?.value != null ? String(effective[key].value) : '—'}
                style={{ ...num, opacity: canWrite ? 1 : 0.5, cursor: canWrite ? 'text' : 'not-allowed' }} />
            {/* Where the value comes from when this level sets none — otherwise an empty box reads
                as "no threshold" when a group or the server is quietly providing one. */}
            {effective && (form[key] === '' || form[key] == null) && effective[key]?.source && (
                <div style={{ fontSize: 10.5, color: '#5a4e42', marginTop: 2 }}>from {effective[key].source}</div>
            )}
        </td>
    );

    const enabled = canWrite && dirty && !saving;

    return (
        <tr>
            {/* Fixed width and no wrapping: this column holds an explanatory sublabel, and left to
                itself it collapses to one word per line as soon as the table is in a narrow panel. */}
            <td style={{ ...TD, minWidth: 230, maxWidth: 300 }}>
                <div style={{ fontWeight: 700, color: '#f5f0e8' }}>{label}</div>
                {sublabel && <div style={{ fontSize: 11, color: '#5a4e42', lineHeight: 1.45 }}>{sublabel}</div>}
            </td>
            {cell('fuelDropThreshold')}
            {cell('fuelIncreaseThreshold')}
            {cell('fuelCapacity')}
            <td style={{ ...TD, textAlign: 'right' }}>
                <button onClick={() => onSave(form)} disabled={!enabled}
                    title={canWrite ? undefined : 'Only a platform administrator can set this level'}
                    style={{
                        padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
                        background: enabled ? '#d97706' : '#222222',
                        color: enabled ? '#fff' : '#5a4e42',
                        cursor: enabled ? 'pointer' : 'not-allowed',
                    }}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </td>
        </tr>
    );
}

export default function FuelThresholdsPage() {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [notice, setNotice]   = useState('');
    const [saving, setSaving]   = useState('');

    const load = async () => {
        try {
            setData((await api.getFuelSettings()).data);
            setError('');
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load fuel settings.');
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const save = async (scope, id, form, label) => {
        setSaving(`${scope}:${id ?? 0}`);
        setNotice(''); setError('');
        const value = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
        try {
            await api.updateFuelSettings({
                scope, id,
                fuelDropThreshold:     value(form.fuelDropThreshold),
                fuelIncreaseThreshold: value(form.fuelIncreaseThreshold),
                fuelCapacity:          value(form.fuelCapacity),
            });
            setNotice(`Saved ${label}.`);
            await load();
        } catch (e) {
            setError(e.response?.data?.message || 'Traccar rejected the change.');
        } finally { setSaving(''); }
    };

    if (loading) return <p style={{ padding: 40, textAlign: 'center', color: '#5a4e42', fontSize: 13 }}>Loading fuel settings…</p>;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a1a' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #2c2c2c', flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: '#9a8a75', lineHeight: 1.6, maxWidth: 900 }}>
                    Thresholds are in <b>litres</b>, and Traccar compares two consecutive positions —
                    a drop fires when the change between them reaches the threshold. It resolves
                    device → group → server, first value found wins, so leaving a level blank inherits from the one above.
                </p>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {error &&  <div style={{ marginBottom: 12, padding: '9px 13px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 7, fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}
                {notice && <div style={{ marginBottom: 12, padding: '9px 13px', background: '#0f2b24', border: '1px solid #1f6b52', borderRadius: 7, fontSize: 12.5, color: '#4ade80' }}>{notice}</div>}

                {/* The catch that costs people a day: percentage probes never trigger a drop event. */}
                <div style={{ marginBottom: 16, padding: '11px 14px', background: '#33260c', border: '1px solid #7c5e10', borderRadius: 8, fontSize: 12.5, color: '#fcd34d', lineHeight: 1.6 }}>
                    <b>If your probe reports percentage, no threshold will ever fire.</b> Traccar's detector reads
                    <code style={{ fontFamily: 'monospace' }}> fuel</code> in litres; a BLE or computed probe produces
                    <code style={{ fontFamily: 'monospace' }}> fuelLevel</code> in percent instead. Setting
                    <b> Tank capacity</b> below makes the consumption reports work, but not the events — for those, add a
                    computed attribute (Settings → Computed Attributes) named <code style={{ fontFamily: 'monospace' }}>fuel</code>,
                    type number, expression <code style={{ fontFamily: 'monospace' }}>fuelLevel * (capacity / 100)</code>.
                    Computed attributes run before the fuel handler, so the derived litres feed it correctly.
                </div>

                {/* The table has five columns and lives inside a panel that is not always wide;
                    it scrolls rather than compressing the first column into a word ladder. */}
                <div style={{ overflowX: 'auto', marginBottom: 22 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                        <thead>
                            <tr>
                                <th style={TH}>Applies to</th>
                                <th style={TH}>Drop threshold (L)</th>
                                <th style={TH}>Increase threshold (L)</th>
                                <th style={TH}>Tank capacity (L)</th>
                                <th style={{ ...TH, textAlign: 'right' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            <ThresholdRow
                                label="All devices" sublabel="Server default — used where nothing more specific is set"
                                values={data.server} effective={null} canWrite={data.can?.server !== false}
                                saving={saving === 'server:0'}
                                onSave={(form) => save('server', undefined, form, 'the server default')} />

                            {data.groups.map(g => (
                                <ThresholdRow key={`g${g.id}`}
                                    label={g.name} sublabel="Company group — the right level for most fleets"
                                    values={g.attributes} effective={null} canWrite={data.can?.group !== false}
                                    saving={saving === `group:${g.id}`}
                                    onSave={(form) => save('group', g.id, form, g.name)} />
                            ))}

                            {data.devices.map(d => (
                                <ThresholdRow key={`d${d.id}`}
                                    label={d.name} sublabel={`Device · ${d.groupName ?? 'no group'}`}
                                    values={d.own} effective={d.effective} canWrite={data.can?.device !== false}
                                    saving={saving === `device:${d.id}`}
                                    onSave={(form) => save('device', d.id, form, d.name)} />
                            ))}
                        </tbody>
                    </table>
                </div>

                <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#f5f0e8' }}>Suggested starting points</h3>
                <table style={{ borderCollapse: 'collapse', marginBottom: 10 }}>
                    <thead><tr>{['Vehicle', 'Tank', 'Drop', 'Increase'].map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {GUIDE.map(row => (
                            <tr key={row[0]}>{row.map((cell, i) => <td key={i} style={{ ...TD, fontWeight: i === 0 ? 700 : 400 }}>{cell}</td>)}</tr>
                        ))}
                    </tbody>
                </table>
                <p style={{ margin: 0, fontSize: 12, color: '#5a4e42', maxWidth: 820, lineHeight: 1.6 }}>
                    About 10% of capacity for a drop, a little less for an increase. Set these at group level and override
                    a device only where its sensor is noisy. Note that these catch fast, obvious siphoning only — a slow
                    draw never differs enough between two consecutive positions to trip any threshold, which is what
                    Report → Fuel Statistics → Theft Watch is for.
                </p>
            </div>
        </div>
    );
}

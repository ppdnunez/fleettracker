import { useState } from 'react';
import { api } from '../api.js';

/**
 * Shared shell and field primitives for the raw device-command panels (iButton Configuration,
 * Driving Behaviour Alerts).
 *
 * Both panels are the same thing at heart: a set of query/apply pairs that push a device text
 * command and show what came back. Everything they share lives here so the two stay consistent
 * and neither has to restate the transport.
 *
 * Commands go out over SMS (POST /api/traccar/devices/sms-command → Traccar textChannel), not
 * GPRS: these settings are applied to a parked vehicle, which usually has no live session. Two
 * things must be in place or Traccar refuses — a phone number on the device, and an SMS gateway
 * configured on the Traccar server. Its reason is surfaced verbatim in the log below rather than
 * being flattened into "failed".
 *
 * Nothing here is persisted. The device is the authority on its own settings, so the values shown
 * are what you are about to send; Query is how you read back what it actually holds.
 */

export const REPORT_METHOD_OPTIONS = [
    { value: '0', label: '0 — GPRS only' },
    { value: '1', label: '1 — GPRS + SMS' },
];

export const sectionStyle = { border: '1px solid #1e2c46', borderRadius: 8, padding: 14, marginBottom: 14 };
export const sectionTitle = { margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: '#cfdcf0', textTransform: 'uppercase', letterSpacing: 0.4 };
export const rowStyle     = { display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' };
export const labelStyle   = { display: 'block', fontSize: 11.5, color: '#9daec9', fontWeight: 600, marginBottom: 5 };
export const inputStyle   = { padding: '7px 10px', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, outline: 'none', background: '#111c33', color: '#eaeff9' };
export const selectStyle  = { ...inputStyle, cursor: 'pointer' };
export const hintStyle    = { margin: '10px 0 0', fontSize: 11.5, color: '#5e7094', lineHeight: 1.4 };

export const btnStyle = (disabled) => ({
    padding: '7px 14px', borderRadius: 6, border: '1px solid #3b82f6', background: '#111c33', color: '#3b82f6',
    fontSize: 12.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
});
export const btnPrimary = (disabled) => ({ ...btnStyle(disabled), background: '#3b82f6', color: '#fff' });

/** Function switch + reporting method, the pair every alert type in these panels starts with. */
export function SwitchAndMethod({ enabled, setEnabled, method, setMethod }) {
    return (
        <>
            <div>
                <label style={labelStyle}>Function switch</label>
                <select value={enabled} onChange={e => setEnabled(e.target.value)} style={selectStyle}>
                    <option value="ON">ON</option>
                    <option value="OFF">OFF</option>
                </select>
            </div>
            <div>
                <label style={labelStyle}>Reporting method</label>
                <select value={method} onChange={e => setMethod(e.target.value)} disabled={enabled === 'OFF'} style={{ ...selectStyle, width: 180 }}>
                    {REPORT_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
        </>
    );
}

export function NumField({ label, value, onChange, min, max, width }) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            <input type="number" min={min} max={max} value={value} onChange={e => onChange(e.target.value)}
                style={{ ...inputStyle, width: width ?? 90 }} />
        </div>
    );
}

/**
 * Owns the transport and the log both panels render.
 *
 * The channel lives here rather than in each panel so every button in a panel goes out the same
 * way, and the log can record which way that was.
 *
 * @returns {{ sending: boolean, log: Array, channel: string, setChannel: Function, send: Function }}
 */
export function useDeviceCommands(imei) {
    const [sending, setSending] = useState(false);
    const [log, setLog]         = useState([]); // [{ command, reply, ok, channel, attempts, time }]
    const [channel, setChannel] = useState('auto');

    const send = async (command) => {
        setSending(true);
        try {
            const { data } = await api.sendDeviceCommand(imei, command, channel);
            setLog(l => [{
                command,
                reply:    data.message || (data.ok ? 'Sent.' : 'Failed.'),
                ok:       !!data.ok,
                // The channel the command actually left by, which in auto mode is only known
                // after the fact — it may be SMS after the data connection was refused.
                channel:  data.channel || channel,
                attempts: data.attempts || null,
                time:     new Date().toLocaleTimeString(),
            }, ...l]);
        } catch (e) {
            const body = e.response?.data;
            const firstFieldError = body?.errors && Object.values(body.errors)[0]?.[0];
            setLog(l => [{
                command,
                reply:   firstFieldError || body?.message || 'Request failed.',
                ok:      false,
                channel,
                time:    new Date().toLocaleTimeString(),
            }, ...l]);
        } finally {
            setSending(false);
        }
    };

    return { sending, log, channel, setChannel, send };
}

export function CommandLog({ log }) {
    if (log.length === 0) return null;

    return (
        <div style={{ marginTop: 14 }}>
            <p style={sectionTitle}>Command Log</p>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #1e2c46', borderRadius: 8 }}>
                {log.map((entry, i) => (
                    <div key={i} style={{ padding: '8px 12px', borderBottom: i < log.length - 1 ? '1px solid #1e2c46' : 'none', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: '#cfdcf0' }}>
                            <span style={{ fontFamily: 'monospace' }}>{entry.command}</span>
                            <span style={{ color: '#5e7094', flexShrink: 0 }}>
                                {entry.channel === 'sms' ? 'SMS' : 'Data'} · {entry.time}
                            </span>
                        </div>
                        <div style={{ color: entry.ok ? '#16a34a' : '#dc2626', marginTop: 2 }}>{entry.reply}</div>

                        {/* Only when a fallback actually happened: one line per channel tried, so a
                            failure on the first is visible rather than hidden behind the retry. */}
                        {entry.attempts?.length > 1 && (
                            <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: '2px solid #1e2c46' }}>
                                {entry.attempts.map((a, k) => (
                                    <div key={k} style={{ fontSize: 11, color: a.ok ? '#16a34a' : '#fca5a5' }}>
                                        {a.channel === 'sms' ? 'SMS' : 'Data'}: {a.message}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Modal chrome: header naming the device, delivery banner, scrollable body, Close footer.
 *
 * The banner is the honest part. SMS delivery needs a phone number on the device, and without one
 * every button here fails at Traccar with no hint of why — so a missing number is called out up
 * front and pointed at Edit, which is where every other Traccar device field is set.
 */
export function CommandModalShell({ title, device, imei, deviceName, width, onClose, channel, setChannel, children }) {
    const phone   = device?.phone ?? '';
    const viaSms  = channel === 'sms';
    // Auto only warns about a missing number because SMS is the fallback leg, not the first one —
    // the command may well succeed over data and never need it.
    const noPhone = !phone && (viaSms || channel === 'auto');

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
            <div style={{ background: '#111c33', borderRadius: 12, width, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2c46', flexShrink: 0 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>{title}</h2>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9daec9' }}>{deviceName || imei} · {imei}</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    <div style={{
                        marginBottom: 14, padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                        background: noPhone ? '#33260c' : '#152a4a',
                        border: `1px solid ${noPhone ? '#7c5e10' : '#24507f'}`,
                        color: noPhone ? '#fcd34d' : '#7fc4ff',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700 }}>Send via</span>
                            <select value={channel} onChange={e => setChannel(e.target.value)} style={{ ...selectStyle, padding: '4px 8px', fontSize: 12 }}>
                                <option value="auto">Auto — data, SMS if it fails</option>
                                <option value="gprs">Data connection only</option>
                                <option value="sms">SMS only</option>
                            </select>
                        </div>

                        {/* Each channel fails for its own reason, so say which one applies rather
                            than listing every requirement every time. */}
                        {channel === 'auto' && (
                            <>Sent over the device's data connection through Traccar. If Traccar refuses it outright, the same
                            command is retried as an SMS and the log shows both attempts. A device that is merely offline is
                            <strong> not</strong> a failure — Traccar queues the command and delivers it on reconnect, so no SMS
                            is sent and the setting is not applied twice.</>
                        )}
                        {channel === 'gprs' && (
                            <>Traccar delivers the command over the device's data connection, and queues it if the device is
                            offline — it goes out as soon as the device next connects. Nothing else to configure.</>
                        )}
                        {viaSms && phone && (
                            <>Delivered as an SMS to <strong>{phone}</strong>. Use this when a device has stopped connecting
                            altogether, or when a parked device must be configured now. Requires an SMS gateway on the Traccar server.</>
                        )}
                        {noPhone && (
                            <div style={{ marginTop: channel === 'auto' ? 6 : 0 }}>
                                <strong>This device has no phone number,</strong> so
                                {channel === 'auto' ? ' the SMS fallback cannot run' : ' SMS cannot reach it'}. Add one under
                                Device&nbsp;Management → <strong>Edit</strong> → Phone.
                            </div>
                        )}
                    </div>
                    {children}
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #1e2c46', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #1e2c46', background: '#111c33', color: '#9daec9', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
                </div>
            </div>
        </div>
    );
}

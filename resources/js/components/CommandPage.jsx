import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import {
    COMMAND_PARAMS, SILENT_COMMANDS, TEXT_PRESETS, VL863P_ENCODING, commandKeyword, typeLabel,
} from './commandTypes.js';

/**
 * Send a device a command and read what it says back.
 *
 * The two halves of that sentence happen minutes apart and over different transports, which is
 * the whole shape of this page. Sending is one HTTP call whose answer means only "Traccar took
 * it". The device's own reply — the 0x21 frame it sends when it has actually done the thing —
 * arrives later as a commandResult event, so every unsettled row is polled until it resolves or
 * its deadline passes.
 *
 * Polling rather than the live socket: the events are written to Traccar's database before they
 * are broadcast, so a poll cannot miss one, whereas a socket that drops mid-wait loses the push
 * silently and would report a failure on a command that succeeded. It also works today, on a
 * deployment whose websocket still needs a wss:// proxy.
 *
 * Statuses are not collapsed into ok/failed, because they genuinely differ:
 *   pending  sent to a live device, waiting on its reply
 *   queued   the device is offline; Traccar holds the command until it reconnects
 *   success  the device answered, and its words are in Response
 *   timeout  nothing came back in time — which is not the same as "it did not happen"
 *   failed   Traccar refused it, and its reason is shown verbatim
 */

/* ── palette, matching the rest of the dark operations pages ── */
const S = {
    panel:    '#1a1a1a',
    raised:   '#222222',
    border:   '#2c2c2c',
    field:    '#383838',
    text:     '#f5f0e8',
    label:    '#d5c9b8',
    muted:    '#9a8a75',
    faint:    '#5a4e42',
    accent:   '#d97706',
    ok:       '#16a34a',
    warn:     '#f59e0b',
    danger:   '#ef4444',
};

const inputStyle  = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${S.field}`, borderRadius: 7, fontSize: 13, outline: 'none', background: S.panel, color: S.text };
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const labelStyle  = { display: 'block', fontSize: 11.5, color: S.muted, fontWeight: 600, marginBottom: 6 };
const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: S.label, borderBottom: `2px solid ${S.border}`, whiteSpace: 'nowrap', background: S.raised };
const TD = { padding: '10px 14px', verticalAlign: 'middle', fontSize: 12.5, color: S.label, borderBottom: `1px solid ${S.border}` };

const ghostBtn = (disabled) => ({
    padding: '8px 14px', borderRadius: 7, border: `1.5px solid ${S.border}`, background: S.panel,
    color: S.muted, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
});
const primaryBtn = (disabled) => ({
    ...ghostBtn(disabled), border: 'none', background: S.accent, color: '#fff', fontWeight: 700,
});

/** Colour and wording per lifecycle state. See the docblock for why they are kept distinct. */
const STATUS = {
    pending: { label: 'PENDING', colour: '#f59e0b', bg: '#372817', border: '#78440a' },
    queued:  { label: 'QUEUED',  colour: '#fcd34d', bg: '#33260c', border: '#7c5e10' },
    success: { label: 'SUCCESS', colour: '#4ade80', bg: '#0d2a18', border: '#166534' },
    timeout: { label: 'TIMEOUT', colour: '#fcd34d', bg: '#33260c', border: '#7c5e10' },
    failed:  { label: 'FAILED',  colour: '#fca5a5', bg: '#3b1418', border: '#7f1d1d' },
};

function Badge({ tone, children }) {
    const t = STATUS[tone] || { colour: S.muted, bg: S.raised, border: S.border };
    return (
        <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10.5,
            fontWeight: 700, letterSpacing: 0.4, color: t.colour, background: t.bg,
            border: `1px solid ${t.border}`, whiteSpace: 'nowrap',
        }}>
            {children}
        </span>
    );
}

function Chip({ children, ...rest }) {
    return (
        <span {...rest} style={{
            display: 'inline-block', padding: '2px 7px', borderRadius: 5, fontSize: 10.5,
            fontWeight: 700, letterSpacing: 0.3, color: S.muted, background: S.raised,
            border: `1px solid ${S.border}`, whiteSpace: 'nowrap',
        }}>
            {children}
        </span>
    );
}

const shortTime = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

/* ── device picker ───────────────────────────────────────────────────────────────────────── */

/**
 * Searchable device select.
 *
 * Online state is shown next to each name because it decides what sending will even do: an
 * offline device queues the command instead of answering it, and knowing that before pressing
 * Send is the difference between waiting thirty seconds and not bothering.
 */
function DeviceSelect({ devices, value, onChange, loading }) {
    const [open, setOpen]     = useState(false);
    const [search, setSearch] = useState('');
    const boxRef = useRef(null);

    useEffect(() => {
        const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', away);
        return () => document.removeEventListener('mousedown', away);
    }, []);

    const selected = devices.find(d => d.uniqueId === value);
    const needle   = search.trim().toLowerCase();
    const matches  = needle
        ? devices.filter(d => `${d.name} ${d.uniqueId}`.toLowerCase().includes(needle))
        : devices;

    return (
        <div ref={boxRef} style={{ position: 'relative' }}>
            <button type="button" onClick={() => setOpen(o => !o)} style={{ ...selectStyle, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? S.text : S.faint }}>
                    {loading ? 'Loading devices…' : selected ? `${selected.name} · ${selected.uniqueId}` : 'Search and select a device…'}
                </span>
                <span style={{ color: S.faint, fontSize: 10 }}>▼</span>
            </button>

            {open && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 40, background: S.panel, border: `1px solid ${S.border}`, borderRadius: 8, boxShadow: '0 16px 40px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
                    <div style={{ padding: 8, borderBottom: `1px solid ${S.border}` }}>
                        <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or IMEI" style={{ ...inputStyle, padding: '6px 9px', fontSize: 12.5 }} />
                    </div>
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                        {matches.length === 0 ? (
                            <div style={{ padding: '14px 12px', fontSize: 12.5, color: S.faint }}>No matching device.</div>
                        ) : matches.map(d => (
                            <button key={d.id} type="button"
                                onClick={() => { onChange(d.uniqueId); setOpen(false); setSearch(''); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                                    padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: 12.5,
                                    background: d.uniqueId === value ? S.raised : 'transparent', color: S.label,
                                }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: d.status === 'online' ? S.ok : S.faint }} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                                <span style={{ color: S.faint, fontSize: 11.5, flexShrink: 0 }}>{d.uniqueId}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── response viewer ─────────────────────────────────────────────────────────────────────── */

/**
 * What came back, in full.
 *
 * The device's reply is a single line of its own ASCII — "Battery:4.16V,NORMAL; GPRS:Link Up; …"
 * — and is shown monospaced and unedited, because interpreting it is the operator's job and any
 * summarising here would be this page inventing meaning it does not have.
 */
function ResponseModal({ command, onClose }) {
    const state = STATUS[command.status] || {};

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ background: S.panel, borderRadius: 12, width: 620, maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${S.border}` }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: S.text }}>Command Response</h2>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: S.muted }}>
                            {command.device_name || command.imei} · {command.imei}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.faint, fontSize: 16 }}>✕</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 12.5, marginBottom: 16 }}>
                        <span style={{ color: S.faint }}>Sent</span>
                        <span style={{ color: S.label }}>{shortTime(command.sent_at)}</span>
                        <span style={{ color: S.faint }}>Answered</span>
                        <span style={{ color: S.label }}>{shortTime(command.responded_at)}</span>
                        <span style={{ color: S.faint }}>Command</span>
                        <span style={{ color: S.label, fontFamily: 'monospace' }}>
                            {command.content || typeLabel(command.type)}
                        </span>
                        <span style={{ color: S.faint }}>Status</span>
                        <span><Badge tone={command.status}>{state.label || command.status}</Badge></span>
                        <span style={{ color: S.faint }}>Traccar</span>
                        <span style={{ color: S.label }}>
                            HTTP {command.http_status ?? '—'}
                            {command.http_status === 202 && ' — queued for an offline device'}
                            {command.http_status === 200 && ' — written to the device connection'}
                        </span>
                    </div>

                    {command.response ? (
                        <>
                            <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 700, color: S.label, textTransform: 'uppercase', letterSpacing: 0.4 }}>Device reply</p>
                            <pre style={{ margin: 0, padding: 12, background: '#0d2a18', border: '1px solid #166534', borderRadius: 8, fontSize: 12.5, color: '#bbf7d0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {command.response}
                            </pre>
                        </>
                    ) : (
                        <p style={{ margin: 0, fontSize: 12.5, color: S.faint }}>
                            The device has not sent a reply for this command.
                        </p>
                    )}

                    {command.error && (
                        <>
                            <p style={{ margin: '16px 0 6px', fontSize: 11.5, fontWeight: 700, color: S.label, textTransform: 'uppercase', letterSpacing: 0.4 }}>What went wrong</p>
                            <pre style={{ margin: 0, padding: 12, background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12.5, color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {command.error}
                            </pre>
                        </>
                    )}
                </div>

                <div style={{ padding: '12px 20px', borderTop: `1px solid ${S.border}`, display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={ghostBtn(false)}>Close</button>
                </div>
            </div>
        </div>
    );
}

/* ── history table ───────────────────────────────────────────────────────────────────────── */

function HistoryTable({ rows, loading, emptyText, onView, onDelete, onReuse }) {
    return (
        <div style={{ overflowX: 'auto', border: `1px solid ${S.border}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                    <tr>
                        <th style={TH}>Time</th>
                        <th style={TH}>IMEI</th>
                        <th style={TH}>Content</th>
                        <th style={TH}>Message Format</th>
                        <th style={{ ...TH, textAlign: 'center' }}>Is Manual</th>
                        <th style={{ ...TH, textAlign: 'center' }}>Mode</th>
                        <th style={{ ...TH, textAlign: 'center' }}>Status</th>
                        <th style={{ ...TH, textAlign: 'center' }}>Response</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: 40, color: S.faint }}>Loading…</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: 40, color: S.faint }}>{emptyText}</td></tr>
                    ) : rows.map(row => (
                        <tr key={row.id}>
                            <td style={{ ...TD, whiteSpace: 'nowrap' }}>{shortTime(row.sent_at || row.created_at)}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row.imei}</td>
                            <td style={{ ...TD, fontFamily: 'monospace' }}>
                                {row.content || typeLabel(row.type)}
                                {row.channel === 'sms' && <span style={{ marginLeft: 6 }}><Chip>SMS</Chip></span>}
                            </td>
                            <td style={TD}>
                                <Chip>{row.type === 'custom' ? 'TEXT' : 'TYPED'}</Chip>
                            </td>
                            <td style={{ ...TD, textAlign: 'center' }}>{row.is_manual ? 'Yes' : 'No'}</td>
                            <td style={{ ...TD, textAlign: 'center' }}>
                                {row.mode ? <Chip>{row.mode.toUpperCase()}</Chip> : '—'}
                            </td>
                            <td style={{ ...TD, textAlign: 'center' }}>
                                <Badge tone={row.status}>{(STATUS[row.status] || {}).label || row.status}</Badge>
                            </td>
                            <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <button onClick={() => onView(row)} title="View response"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.accent, padding: 4, fontSize: 14 }}>
                                    👁
                                </button>
                                {onReuse && row.type === 'custom' && (
                                    <button onClick={() => onReuse(row)} title="Load into the form"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.muted, padding: 4, fontSize: 13 }}>
                                        ↺
                                    </button>
                                )}
                                <button onClick={() => onDelete(row)} title="Remove from history"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.danger, padding: 4, fontSize: 13 }}>
                                    🗑
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ── page ────────────────────────────────────────────────────────────────────────────────── */

export default function CommandPage() {
    const [tab, setTab] = useState('send'); // send | offline

    const [devices, setDevices]           = useState([]);
    const [devicesLoading, setDevLoading] = useState(true);
    const [imei, setImei]                 = useState('');

    const [types, setTypes]           = useState([]);
    const [type, setType]             = useState('custom');
    const [content, setContent]       = useState('');
    const [parameters, setParameters] = useState({});

    const [advanced, setAdvanced] = useState(false);
    const [channel, setChannel]   = useState('gprs');
    const [timeout_, setTimeout_] = useState('');
    const [noQueue, setNoQueue]   = useState(false);

    const [rows, setRows]         = useState([]);
    const [rowsLoading, setRowsL] = useState(true);
    const [showAll, setShowAll]   = useState(false);
    const [sending, setSending]   = useState(false);
    const [error, setError]       = useState('');
    const [notice, setNotice]     = useState('');
    const [viewing, setViewing]   = useState(null);
    const [pickerOpen, setPicker] = useState(false);

    const device = devices.find(d => d.uniqueId === imei);

    useEffect(() => {
        api.getTraccarDevices()
            .then(res => setDevices(res.data || []))
            .catch(() => setError('Could not load the device list from Traccar.'))
            .finally(() => setDevLoading(false));
    }, []);

    /* Which typed commands this device's protocol implements. Traccar resolves the protocol from
       the device's latest position, so one that has never reported answers `custom` only — not an
       error, just the honest answer for a device nothing is known about yet. */
    useEffect(() => {
        if (!device) { setTypes([]); return; }
        api.getCommandTypes({ deviceId: device.id })
            .then(res => setTypes(res.data || []))
            .catch(() => setTypes([]));
    }, [device?.id]);

    const loadHistory = async (opts = {}) => {
        try {
            const { data } = await api.getDeviceCommands({
                mine: showAll ? undefined : 1,
                limit: 100,
                ...opts,
            });
            setRows(data || []);
        } catch {
            setError('Could not load the command history.');
        } finally {
            setRowsL(false);
        }
    };

    useEffect(() => { setRowsL(true); loadHistory(); }, [showAll]);

    /* Poll every unsettled row until it resolves, at a rate that matches what is being waited on.
       A pending command is expected to answer within seconds, so it is checked often. A queued one
       is waiting for a vehicle to be switched on — possibly on Monday — and asking every three
       seconds would be thousands of requests to learn nothing. */
    const pending = useMemo(() => rows.filter(r => r.status === 'pending'), [rows]);
    const queued  = useMemo(() => rows.filter(r => r.status === 'queued'),  [rows]);

    const pollIds = async (ids) => {
        const settled = await Promise.all(ids.map(id =>
            api.getDeviceCommandResult(id).then(res => res.data).catch(() => null)
        ));

        setRows(prev => prev.map(row => settled.find(s => s && s.id === row.id) || row));
    };

    const pendingIds = pending.map(r => r.id).join(',');
    const queuedIds  = queued.map(r => r.id).join(',');

    useEffect(() => {
        if (!pendingIds) return undefined;
        const tick = setInterval(() => pollIds(pendingIds.split(',')), 3000);
        return () => clearInterval(tick);
    }, [pendingIds]);

    useEffect(() => {
        if (!queuedIds) return undefined;
        const tick = setInterval(() => pollIds(queuedIds.split(',')), 30000);
        return () => clearInterval(tick);
    }, [queuedIds]);

    const paramFields   = COMMAND_PARAMS[type] || [];
    const encoding      = VL863P_ENCODING[type];
    const isSilent      = type === 'custom'
        ? SILENT_COMMANDS.includes(commandKeyword(content))
        : ['rebootDevice', 'factoryReset'].includes(type);
    /* The type list is what Traccar says this protocol supports. Offering something outside it
       would only produce "Command … is not supported" from the far side. */
    const unsupported   = type !== 'custom' && types.length > 0 && !types.some(t => t.type === type);

    const setParam = (key, value) => setParameters(p => ({ ...p, [key]: value }));

    const resetForm = () => {
        setContent('');
        setParameters({});
        setError('');
        setNotice('');
    };

    const handleSend = async () => {
        setError('');
        setNotice('');

        if (!imei)                              { setError('Select a device first.'); return; }
        if (type === 'custom' && !content.trim()) { setError('Enter a command to send.'); return; }

        // Traccar's encoder reads these off the command's attributes; a missing one becomes a 0 or
        // a null in the string that reaches the vehicle, which is worse than not sending at all.
        const missing = paramFields.find(f => f.type !== 'boolean'
            && (parameters[f.key] === undefined || String(parameters[f.key]).trim() === ''));
        if (missing) { setError(`${missing.label} is required for this command.`); return; }

        setSending(true);
        try {
            const payload = {
                imei,
                type,
                channel,
                is_manual: true,
                no_queue: noQueue,
            };
            if (type === 'custom') payload.content = content.trim();
            if (paramFields.length) {
                payload.parameters = Object.fromEntries(paramFields.map(f => [
                    f.key,
                    f.type === 'number'  ? Number(parameters[f.key] ?? f.def ?? 0)
                    : f.type === 'boolean' ? Boolean(parameters[f.key] ?? f.def ?? false)
                    : String(parameters[f.key] ?? ''),
                ]));
            }
            if (timeout_ !== '') payload.timeout = Number(timeout_);

            const { data } = await api.sendDeviceCommandV2(payload);

            setRows(prev => [data, ...prev]);
            setNotice(
                data.status === 'queued'
                    ? 'Device is offline — Traccar has queued the command and will deliver it on reconnect.'
                    // A command that settles on the spot is one that never replies (RESET#), not
                    // one that answered instantly; saying "waiting" about it would be wrong.
                    : data.status === 'success' ? data.response
                    : 'Sent. Waiting for the device to answer…'
            );
        } catch (e) {
            const body = e.response?.data;
            const fieldError = body?.errors && Object.values(body.errors)[0]?.[0];
            setError(fieldError || body?.message || 'The command could not be sent.');
            // A rejection is still a row worth having — the log is where an operator looks to see
            // that a command was refused, and by what.
            loadHistory();
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (row) => {
        setRows(prev => prev.filter(r => r.id !== row.id));
        try {
            await api.deleteDeviceCommand(row.id);
        } catch {
            loadHistory();
        }
    };

    const reuse = (row) => {
        setTab('send');
        setType('custom');
        setContent(row.content || '');
        setImei(row.imei);
        setPicker(false);
    };

    /* Distinct recent text commands, for the History popover next to the input. */
    const recentCommands = useMemo(() => {
        const seen = [];
        for (const row of rows) {
            if (row.type === 'custom' && row.content && !seen.includes(row.content)) seen.push(row.content);
            if (seen.length >= 12) break;
        }
        return seen;
    }, [rows]);

    const offlineRows = rows.filter(r => r.status === 'queued');

    const tabStyle = (active) => ({
        padding: '11px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
        background: active ? S.accent : 'transparent', color: active ? '#fff' : S.muted,
        borderRadius: active ? '8px 8px 0 0' : 0,
    });

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: S.panel }}>
            <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${S.border}`, padding: '0 16px', flexShrink: 0 }}>
                <button style={tabStyle(tab === 'send')}    onClick={() => setTab('send')}>Send Command</button>
                <button style={tabStyle(tab === 'offline')} onClick={() => setTab('offline')}>
                    Offline Commands{offlineRows.length > 0 ? ` (${offlineRows.length})` : ''}
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
                {tab === 'send' ? (
                    <>
                        {/* ── compose ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(240px, 1fr) auto', gap: 12, alignItems: 'end', marginBottom: 14 }}>
                            <div>
                                <label style={labelStyle}>Device Selection</label>
                                <DeviceSelect devices={devices} value={imei} onChange={setImei} loading={devicesLoading} />
                            </div>

                            <div>
                                <label style={labelStyle}>Message Format</label>
                                <select value={type} onChange={e => { setType(e.target.value); setParameters({}); }} style={selectStyle}>
                                    <option value="custom">Text Command</option>
                                    {types.filter(t => t.type !== 'custom').map(t => (
                                        <option key={t.type} value={t.type}>{typeLabel(t.type)}</option>
                                    ))}
                                </select>
                            </div>

                            <button onClick={() => setAdvanced(a => !a)} style={ghostBtn(false)}>
                                ⚙ Advanced
                            </button>
                        </div>

                        {device && (
                            <p style={{ margin: '0 0 14px', fontSize: 11.5, color: S.faint }}>
                                {device.status === 'online'
                                    ? 'Device is online — the command goes straight down its data connection and a reply is expected within seconds.'
                                    : 'Device is offline. Traccar will queue the command and deliver it when the device next connects; no reply will arrive until then.'}
                            </p>
                        )}

                        {advanced && (
                            <div style={{ border: `1px solid ${S.border}`, borderRadius: 8, padding: 14, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, alignItems: 'start' }}>
                                <div>
                                    <label style={labelStyle}>Send via</label>
                                    <select value={channel} onChange={e => setChannel(e.target.value)} style={selectStyle}>
                                        <option value="gprs">Data connection</option>
                                        <option value="auto">Data, SMS if refused</option>
                                        <option value="sms">SMS only</option>
                                    </select>
                                    <p style={{ margin: '6px 0 0', fontSize: 11, color: S.faint, lineHeight: 1.5 }}>
                                        SMS needs a phone number on the device and an SMS gateway on the Traccar
                                        server, and the VL863P protocol registers no text commands — so on this
                                        server the data connection is the working route.
                                    </p>
                                </div>

                                <div>
                                    <label style={labelStyle}>Reply timeout (seconds)</label>
                                    <input type="number" min={0} max={600} value={timeout_} placeholder="auto"
                                        onChange={e => setTimeout_(e.target.value)} style={inputStyle} />
                                    <p style={{ margin: '6px 0 0', fontSize: 11, color: S.faint, lineHeight: 1.5 }}>
                                        Left blank, this follows the command: 30s for a query, 120s for WHERE#
                                        (which may be waiting on a GPS fix), and no wait at all for RESET#.
                                    </p>
                                </div>

                                <div>
                                    <label style={labelStyle}>Queueing</label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: S.label, cursor: 'pointer', padding: '8px 0' }}>
                                        <input type="checkbox" checked={noQueue} onChange={e => setNoQueue(e.target.checked)} />
                                        Fail instead of queueing
                                    </label>
                                    <p style={{ margin: '6px 0 0', fontSize: 11, color: S.faint, lineHeight: 1.5 }}>
                                        For anything time-sensitive. Without it, a command to an offline device waits
                                        in Traccar and is delivered whenever the vehicle next powers up.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ── the command itself ── */}
                        <div style={{ position: 'relative', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={{ ...labelStyle, marginBottom: 0 }}>
                                {type === 'custom' ? 'Command Content' : 'Command Parameters'}
                            </label>
                            {type === 'custom' && recentCommands.length > 0 && (
                                <div style={{ position: 'relative' }}>
                                    <button onClick={() => setPicker(o => !o)} style={{ ...ghostBtn(false), padding: '5px 10px', fontSize: 11.5 }}>
                                        🕘 History
                                    </button>
                                    {pickerOpen && (
                                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 40, minWidth: 240, maxHeight: 260, overflowY: 'auto', background: S.panel, border: `1px solid ${S.border}`, borderRadius: 8, boxShadow: '0 16px 40px rgba(0,0,0,0.45)' }}>
                                            {recentCommands.map(c => (
                                                <button key={c} onClick={() => { setContent(c); setPicker(false); }}
                                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', color: S.label, fontFamily: 'monospace', fontSize: 12.5, cursor: 'pointer' }}>
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {type === 'custom' ? (
                            <>
                                <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
                                    placeholder="Enter your command here…"
                                    style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                    {TEXT_PRESETS.map(p => (
                                        <button key={p.command} onClick={() => setContent(p.command)} title={p.label}
                                            style={{ ...ghostBtn(false), padding: '4px 10px', fontSize: 11.5, fontFamily: 'monospace' }}>
                                            {p.command}
                                        </button>
                                    ))}
                                </div>
                                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: S.faint }}>
                                    Plain ASCII from the VL863P command manual, comma separated. The trailing
                                    <code style={{ color: S.muted }}> # </code> is added if you leave it off.
                                </p>
                            </>
                        ) : (
                            <div style={{ border: `1px solid ${S.border}`, borderRadius: 8, padding: 14 }}>
                                {paramFields.length === 0 ? (
                                    <p style={{ margin: 0, fontSize: 12.5, color: S.faint }}>
                                        This command takes no parameters.
                                    </p>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                                        {paramFields.map(f => (
                                            <div key={f.key}>
                                                <label style={labelStyle}>{f.label}</label>
                                                {f.type === 'boolean' ? (
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: S.label, cursor: 'pointer', padding: '8px 0' }}>
                                                        <input type="checkbox"
                                                            checked={parameters[f.key] ?? f.def ?? false}
                                                            onChange={e => setParam(f.key, e.target.checked)} />
                                                        Enabled
                                                    </label>
                                                ) : (
                                                    <input type={f.type} min={f.min}
                                                        value={parameters[f.key] ?? f.def ?? ''}
                                                        onChange={e => setParam(f.key, e.target.value)}
                                                        style={inputStyle} />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {encoding && (
                                    <p style={{ margin: '12px 0 0', fontSize: 11.5, color: S.faint }}>
                                        Reaches the device as{' '}
                                        <code style={{ color: S.muted, fontFamily: 'monospace' }}>{encoding}</code>.
                                    </p>
                                )}
                                {unsupported && (
                                    <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#fcd34d' }}>
                                        This device's protocol does not list this command as supported — Traccar
                                        will most likely refuse it.
                                    </p>
                                )}
                            </div>
                        )}

                        {isSilent && (
                            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#33260c', border: '1px solid #7c5e10', fontSize: 12, color: '#fcd34d', lineHeight: 1.5 }}>
                                This command restarts the device, so it will never send a reply — the connection
                                drops as it runs. It is recorded as sent rather than waited on.
                            </div>
                        )}

                        {error && (
                            <div style={{ marginTop: 12, padding: '9px 12px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 7, fontSize: 12.5, color: '#fca5a5' }}>
                                {error}
                            </div>
                        )}
                        {notice && !error && (
                            <div style={{ marginTop: 12, padding: '9px 12px', background: '#372817', border: '1px solid #78440a', borderRadius: 7, fontSize: 12.5, color: '#f59e0b' }}>
                                {notice}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingBottom: 16, borderBottom: `1px dashed ${S.border}` }}>
                            <button onClick={resetForm} style={ghostBtn(false)}>Clear</button>
                            <button onClick={handleSend} disabled={sending || !imei} style={primaryBtn(sending || !imei)}>
                                {sending ? 'Sending…' : '➤ Send Command'}
                            </button>
                        </div>

                        {/* ── history ── */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 10px', gap: 12, flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: S.text }}>Command History</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: S.muted, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                                    Show ALL Commands
                                </label>
                                <button onClick={() => { setRowsL(true); loadHistory(); }} title="Refresh"
                                    style={{ ...ghostBtn(false), padding: '6px 12px', color: S.accent, borderColor: S.accent }}>
                                    ⟳
                                </button>
                            </div>
                        </div>

                        <HistoryTable rows={rows} loading={rowsLoading} onView={setViewing}
                            onDelete={handleDelete} onReuse={reuse}
                            emptyText={showAll ? 'No commands have been sent yet.' : 'You have not sent any commands yet.'} />
                    </>
                ) : (
                    <>
                        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: S.muted, lineHeight: 1.6, maxWidth: 760 }}>
                            Commands Traccar accepted for a device that was offline. They are held on the Traccar
                            server and sent the moment the device reconnects, so there is no deadline on them —
                            a vehicle parked over the weekend will receive its command on Monday. Each one moves
                            to <strong>Success</strong> here once the device answers.
                        </p>

                        <HistoryTable rows={offlineRows} loading={rowsLoading} onView={setViewing}
                            onDelete={handleDelete} onReuse={reuse}
                            emptyText="Nothing is waiting on an offline device." />
                    </>
                )}
            </div>

            {viewing && <ResponseModal command={rows.find(r => r.id === viewing.id) || viewing} onClose={() => setViewing(null)} />}
        </div>
    );
}

import { useState, useEffect } from 'react';
import { api } from '../api.js';

/**
 * What the devices have actually sent us, across the three device-facing endpoints.
 *
 * Upload Log      — /img/uploads/face/uploadPic: photos and clips pushed back by the device.
 * Face Import Log — /img/uploads/face/upload and /face/dowloadCallback: the face-library info file
 *                   and the import result the device reports after a FACE,DOWN batch.
 * Raw Log         — the request lines those endpoints wrote before any validation ran.
 *
 * The raw view is not a nicety. A device can fail before it ever reaches the application — the 421
 * in the troubleshooting report never reached PHP — and in that case every table here stays empty.
 * Being able to see that nothing arrived, rather than inferring it, is the difference between
 * debugging the app and debugging the web server.
 */

const TH = { padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: '#cfdcf0', borderBottom: '2px solid #1e2c46', whiteSpace: 'nowrap', background: '#16233c' };
const TD = { padding: '9px 12px', fontSize: 12.5, borderBottom: '1px solid #1e2c46', color: '#cfdcf0', verticalAlign: 'top' };
const input  = { padding: '7px 10px', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, color: '#cfdcf0', background: '#111c33', outline: 'none' };
const button = { padding: '7px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };

const TABS = ['Upload Log', 'Face Import Log', 'Raw Log'];

function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString();
}

function fmtBytes(n) {
    if (n == null) return '—';
    return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

/** 200 green, 4xx amber, 5xx red — the device reads this code, so it is the headline of every row. */
function CodePill({ code }) {
    const tone = code === 200 ? ['#0f2b24', '#4ade80'] : code >= 500 ? ['#3b1418', '#fca5a5'] : ['#33260c', '#fcd34d'];
    return (
        <span style={{ padding: '2px 8px', borderRadius: 11, fontSize: 11, fontWeight: 700, background: tone[0], color: tone[1] }}>
            {code}
        </span>
    );
}

function UploadLog() {
    const [rows, setRows]     = useState([]);
    const [imei, setImei]     = useState('');
    const [loading, setLoad]  = useState(false);
    const [error, setError]   = useState('');

    const load = async () => {
        setLoad(true); setError('');
        try {
            setRows((await api.getFaceUploadLogs(imei ? { imei } : {})).data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to load the upload log.');
        } finally { setLoad(false); }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input value={imei} onChange={e => setImei(e.target.value)} placeholder="Filter by IMEI"
                    onKeyDown={e => e.key === 'Enter' && load()} style={{ ...input, width: 200 }} />
                <button onClick={load} style={button}>{loading ? 'Loading…' : 'Refresh'}</button>
            </div>

            {error && <div style={{ marginBottom: 12, padding: '9px 13px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 7, fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                    <thead><tr>{['Received', 'Device', 'Driver', 'File', 'Size', 'Signature', 'Response', 'From'].map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: 34, color: '#5e7094' }}>
                                Nothing received yet. Devices post here after <code style={{ fontFamily: 'monospace' }}>UPLOADFACE,URL</code> is set and a photo is captured.
                            </td></tr>
                        ) : rows.map(r => (
                            <tr key={r.id}>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtTime(r.receivedAt)}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11.5 }}>{r.imei ?? '—'}</td>
                                <td style={TD}>{r.driverName ? `${r.driverName}${r.badgeNo ? ` (${r.badgeNo})` : ''}` : '—'}</td>
                                <td style={TD}>
                                    {r.fileUrl
                                        ? <a href={r.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#7fc4ff', fontFamily: 'monospace', fontSize: 11.5 }}>{r.fileName}</a>
                                        : <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{r.fileName ?? '—'}</span>}
                                </td>
                                <td style={TD}>{fmtBytes(r.fileSize)}</td>
                                <td style={{ ...TD, color: r.signatureValid === false ? '#fca5a5' : r.signatureValid ? '#4ade80' : '#5e7094' }}>
                                    {r.signatureValid === null ? '—' : r.signatureValid ? 'valid' : 'invalid'}
                                </td>
                                <td style={TD}><CodePill code={r.responseCode} /> <span style={{ marginLeft: 6 }}>{r.responseMessage}</span></td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11.5, color: '#5e7094' }}>{r.ip ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ImportLog() {
    const [rows, setRows]    = useState([]);
    const [loading, setLoad] = useState(false);
    const [open, setOpen]    = useState(null);

    const load = async () => {
        setLoad(true);
        try { setRows((await api.getFaceImportLogs({})).data); } catch { /* shown as empty */ }
        finally { setLoad(false); }
    };

    useEffect(() => { load(); }, []);

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={load} style={button}>{loading ? 'Loading…' : 'Refresh'}</button>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                    <thead><tr>{['Received', 'Endpoint', 'Device', 'Instruction', 'File', 'Signature', 'Response', ''].map((c, i) => <th key={i} style={TH}>{c}</th>)}</tr></thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: 34, color: '#5e7094' }}>
                                No face-library callbacks received yet. These arrive after a FACE,DOWN batch is imported by the device.
                            </td></tr>
                        ) : rows.map(r => (
                            <tr key={r.id}>
                                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtTime(r.created_at ?? r.receivedAt)}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11.5 }}>{r.endpoint}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11.5 }}>{r.imei ?? '—'}</td>
                                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11.5 }}>{r.instruction_id ?? '—'}</td>
                                <td style={TD}>{r.original_file_name ?? '—'}</td>
                                <td style={{ ...TD, color: r.signature_valid === false ? '#fca5a5' : r.signature_valid ? '#4ade80' : '#5e7094' }}>
                                    {r.signature_valid === null ? '—' : r.signature_valid ? 'valid' : 'invalid'}
                                </td>
                                <td style={TD}><CodePill code={r.response_code} /> <span style={{ marginLeft: 6 }}>{r.response_message}</span></td>
                                <td style={{ ...TD, textAlign: 'right' }}>
                                    {r.file_content && (
                                        <button onClick={() => setOpen(open === r.id ? null : r.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7fc4ff', fontSize: 12, fontWeight: 600, padding: 0 }}>
                                            {open === r.id ? 'Hide' : 'Contents'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        )).flatMap(row => row)}
                    </tbody>
                </table>
            </div>

            {/* The import result file is the only place the device says which faces actually
                landed, line by line — "Transfer file(1211-nhu.jpg) succeed" or "DMS offline,
                import aborted". Worth reading verbatim rather than summarising. */}
            {open && (
                <pre style={{
                    marginTop: 12, padding: 14, background: '#0c1322', border: '1px solid #1e2c46', borderRadius: 8,
                    fontSize: 12, color: '#cfdcf0', whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto',
                }}>
                    {rows.find(r => r.id === open)?.file_content}
                </pre>
            )}
        </div>
    );
}

function RawLog() {
    const [data, setData]    = useState(null);
    const [loading, setLoad] = useState(false);

    const load = async () => {
        setLoad(true);
        try { setData((await api.getFaceRawLog({})).data); } catch { setData({ lines: [] }); }
        finally { setLoad(false); }
    };

    useEffect(() => { load(); }, []);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <button onClick={load} style={button}>{loading ? 'Reading…' : 'Refresh'}</button>
                <span style={{ fontSize: 12, color: '#5e7094' }}>
                    Tail of <code style={{ fontFamily: 'monospace' }}>{data?.file ?? 'storage/logs/laravel.log'}</code>, newest first —
                    every request these endpoints received, logged before any validation ran.
                </span>
            </div>

            {data && data.lines.length === 0 && (
                <div style={{ padding: '11px 14px', background: '#33260c', border: '1px solid #7c5e10', borderRadius: 8, fontSize: 12.5, color: '#fcd34d', lineHeight: 1.6 }}>
                    No device requests have reached the application. If a device is configured and uploading, the request is being
                    stopped before PHP — a proxy, a firewall, or the web server itself. A <b>421 Misdirected Request</b> looks exactly
                    like this: the device reports a failure and nothing appears here, because the request never arrived.
                </div>
            )}

            {data && data.lines.length > 0 && (
                <pre style={{
                    padding: 14, background: '#0c1322', border: '1px solid #1e2c46', borderRadius: 8,
                    fontSize: 11.5, color: '#cfdcf0', whiteSpace: 'pre-wrap', maxHeight: 560, overflowY: 'auto', lineHeight: 1.6,
                }}>
                    {data.lines.join('\n')}
                </pre>
            )}
        </div>
    );
}

export default function FaceLogsPage() {
    const [tab, setTab] = useState(TABS[0]);

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#111c33' }}>
            <div style={{ padding: '4px 20px 0', flexShrink: 0 }}>
                <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #1e2c46', overflowX: 'auto' }}>
                    {TABS.map(t => {
                        const active = t === tab;
                        return (
                            <button key={t} role="tab" aria-selected={active} onClick={() => setTab(t)} style={{
                                padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer',
                                whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: active ? 700 : 500,
                                color: active ? '#4da8ff' : '#9daec9',
                                borderBottom: `2px solid ${active ? '#4da8ff' : 'transparent'}`, marginBottom: -1,
                            }}>{t}</button>
                        );
                    })}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
                {tab === 'Upload Log'      && <UploadLog />}
                {tab === 'Face Import Log' && <ImportLog />}
                {tab === 'Raw Log'         && <RawLog />}
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { api } from '../api.js';

/**
 * Everything in public/img/uploads: face templates, and the stills and clips devices push back
 * through /img/uploads/face/uploadPic.
 *
 * Videos are played in place rather than only linked, because the question being asked of a clip
 * is almost always "what happened", and downloading each candidate to find out is the slow way to
 * answer it. They are loaded with preload="none" so opening the gallery does not pull megabytes of
 * video nobody asked to watch.
 */

const input  = { padding: '7px 10px', border: '1px solid #383838', borderRadius: 6, fontSize: 13, color: '#d5c9b8', background: '#1a1a1a', outline: 'none' };
const KINDS  = [['', 'All'], ['image', 'Images'], ['video', 'Videos'], ['other', 'Other']];

function fmtBytes(n) {
    if (!n) return '0 B';
    return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString();
}

/** Full-size view. Escape closes, as does the backdrop — nothing here is destructive. */
function Lightbox({ file, onClose }) {
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.92)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28,
        }}>
            <div onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {file.kind === 'video' ? (
                    <video src={file.url} controls autoPlay style={{ maxWidth: '92vw', maxHeight: '80vh', borderRadius: 10, background: '#000' }} />
                ) : (
                    <img src={file.url} alt={file.name} style={{ maxWidth: '92vw', maxHeight: '80vh', borderRadius: 10, objectFit: 'contain' }} />
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#d5c9b8', fontSize: 12.5 }}>
                    <span style={{ fontFamily: 'monospace' }}>{file.name}</span>
                    <span style={{ color: '#5a4e42' }}>{fmtBytes(file.size)} · {fmtTime(file.modifiedAt)}</span>
                    <a href={file.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#f59e0b', fontWeight: 600 }}>Open original ↗</a>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a8a75', fontSize: 16 }}>✕</button>
                </div>
            </div>
        </div>
    );
}

/**
 * One file.
 *
 * Removing is confirmed on the tile rather than through a dialog: the thumbnail is the only
 * thing that identifies these files at a glance — the names are device timestamps and IMEIs —
 * so a modal that covered it would ask "delete this?" about something no longer on screen.
 */
function Tile({ file, onOpen, onRemove, removing, canRemove }) {
    const [confirming, setConfirming] = useState(false);
    const isImage = file.kind === 'image';
    const isVideo = file.kind === 'video';

    return (
        <div style={{ border: '1px solid #2c2c2c', borderRadius: 10, overflow: 'hidden', background: '#222222', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 150, background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: isImage || isVideo ? 'pointer' : 'default' }}
                onClick={() => (isImage || isVideo) && onOpen(file)}>
                {isImage ? (
                    <img src={file.url} alt={file.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : isVideo ? (
                    // preload="none" — a gallery of clips would otherwise fetch every one on open.
                    <video src={file.url} preload="none" controls style={{ width: '100%', height: '100%', background: '#000' }} />
                ) : (
                    <span style={{ fontSize: 30, color: '#5a4e42' }}>🗂</span>
                )}
            </div>

            <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#f5f0e8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                    {file.name}
                </div>
                <div style={{ fontSize: 11, color: '#9a8a75' }}>
                    {file.driverName ? `${file.driverName}${file.badgeNo ? ` · ${file.badgeNo}` : ''}` : file.imei || file.source}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#5a4e42' }}>
                    <span>{fmtBytes(file.size)}</span>
                    <span>·</span>
                    <span>{fmtTime(file.modifiedAt)}</span>
                    <a href={file.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#f59e0b', fontWeight: 600 }}>Open</a>
                </div>

                {canRemove && (confirming ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 10.5, color: '#fca5a5', flex: 1 }}>Delete permanently?</span>
                        <button disabled={removing} onClick={() => onRemove(file)} style={{
                            padding: '4px 9px', borderRadius: 5, border: '1px solid #7f1d1d', background: '#3b1418',
                            color: '#fca5a5', fontSize: 10.5, fontWeight: 700, cursor: removing ? 'default' : 'pointer',
                        }}>{removing ? 'Removing…' : 'Delete'}</button>
                        <button disabled={removing} onClick={() => setConfirming(false)} style={{
                            padding: '4px 9px', borderRadius: 5, border: '1px solid #2c2c2c', background: 'transparent',
                            color: '#9a8a75', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                        }}>Cancel</button>
                    </div>
                ) : (
                    <button onClick={() => setConfirming(true)} style={{
                        marginTop: 2, padding: '4px 0', borderRadius: 5, border: '1px solid #2c2c2c',
                        background: 'transparent', color: '#9a8a75', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                    }}>Remove</button>
                ))}
            </div>
        </div>
    );
}

export default function MediaGalleryPage({ user }) {
    const [data, setData]       = useState(null);
    const [kind, setKind]       = useState('');
    const [search, setSearch]   = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const [open, setOpen]       = useState(null);
    const [removing, setRemoving] = useState(null);

    // A read-only role reaches this page to look at what devices have sent back; the API refuses
    // the delete regardless, so this only keeps a button off screen that could not have worked.
    const canRemove = user?.can_write !== false;

    const load = async (overrides = {}) => {
        setLoading(true); setError('');
        try {
            const params = {};
            const k = overrides.kind ?? kind;
            const s = overrides.search ?? search;
            if (k) params.kind = k;
            if (s) params.search = s;
            setData((await api.getMediaFiles(params)).data);
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to read the media directory.');
        } finally { setLoading(false); }
    };

    /**
     * Removes a file, then reloads rather than splicing it out of local state.
     * The header counts and total size are computed server-side, and a list that disagreed with
     * the figure above it would be worse than the extra request.
     */
    const remove = async (file) => {
        setRemoving(file.name); setError('');
        try {
            await api.deleteMediaFile(file.name);
            if (open?.name === file.name) setOpen(null);
            await load();
        } catch (e) {
            setError(e.response?.data?.message || `Could not remove ${file.name}.`);
        } finally { setRemoving(null); }
    };

    useEffect(() => { load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

    const files   = data?.files ?? [];
    const summary = data?.summary ?? { all: 0, image: 0, video: 0, other: 0, bytes: 0 };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a1a' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #2c2c2c', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {KINDS.map(([value, label]) => {
                    const active = kind === value;
                    const count  = value ? summary[value] : summary.all;
                    return (
                        <button key={value} onClick={() => setKind(value)} style={{
                            padding: '6px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                            border: `1px solid ${active ? '#78440a' : '#2c2c2c'}`,
                            background: active ? '#372817' : 'transparent',
                            color: active ? '#f59e0b' : '#9a8a75',
                        }}>
                            {label} <span style={{ fontWeight: 500, color: '#5a4e42' }}>{count}</span>
                        </button>
                    );
                })}

                <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
                    placeholder="Search file name or driver" style={{ ...input, width: 240, marginLeft: 8 }} />
                <button onClick={() => load()} style={{ padding: '7px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {loading ? 'Loading…' : 'Refresh'}
                </button>

                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5a4e42' }}>
                    <code style={{ fontFamily: 'monospace' }}>{data?.directory ?? 'img/uploads'}</code> · {fmtBytes(summary.bytes)}
                </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {error && <div style={{ marginBottom: 12, padding: '9px 13px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 7, fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}

                {!loading && files.length === 0 ? (
                    <div style={{ border: '1px dashed #383838', borderRadius: 10, padding: 40, textAlign: 'center', color: '#9a8a75', fontSize: 13 }}>
                        Nothing here yet.
                        <div style={{ marginTop: 6, fontSize: 12, color: '#5a4e42', lineHeight: 1.6 }}>
                            Face templates land here when captured from a camera, and devices add stills and clips once
                            <code style={{ fontFamily: 'monospace' }}> UPLOADFACE,URL</code> points at this host.
                            Settings → Face Logs shows whether anything is arriving.
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
                        {files.map(f => (
                            <Tile key={f.name} file={f} onOpen={setOpen} onRemove={remove}
                                removing={removing === f.name} canRemove={canRemove} />
                        ))}
                    </div>
                )}

                {data && data.total > files.length && (
                    <p style={{ marginTop: 14, fontSize: 12, color: '#5a4e42' }}>
                        Showing {files.length} of {data.total}. Narrow with the search box to see the rest.
                    </p>
                )}
            </div>

            {open && <Lightbox file={open} onClose={() => setOpen(null)} />}
        </div>
    );
}

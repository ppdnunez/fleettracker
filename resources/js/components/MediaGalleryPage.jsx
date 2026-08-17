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

const input  = { padding: '7px 10px', border: '1px solid #24344f', borderRadius: 6, fontSize: 13, color: '#cfdcf0', background: '#111c33', outline: 'none' };
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
            position: 'fixed', inset: 0, background: 'rgba(3,6,14,0.9)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28,
        }}>
            <div onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {file.kind === 'video' ? (
                    <video src={file.url} controls autoPlay style={{ maxWidth: '92vw', maxHeight: '80vh', borderRadius: 10, background: '#000' }} />
                ) : (
                    <img src={file.url} alt={file.name} style={{ maxWidth: '92vw', maxHeight: '80vh', borderRadius: 10, objectFit: 'contain' }} />
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#cfdcf0', fontSize: 12.5 }}>
                    <span style={{ fontFamily: 'monospace' }}>{file.name}</span>
                    <span style={{ color: '#5e7094' }}>{fmtBytes(file.size)} · {fmtTime(file.modifiedAt)}</span>
                    <a href={file.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#7fc4ff', fontWeight: 600 }}>Open original ↗</a>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9daec9', fontSize: 16 }}>✕</button>
                </div>
            </div>
        </div>
    );
}

function Tile({ file, onOpen }) {
    const isImage = file.kind === 'image';
    const isVideo = file.kind === 'video';

    return (
        <div style={{ border: '1px solid #1e2c46', borderRadius: 10, overflow: 'hidden', background: '#16233c', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: 150, background: '#0c1322', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: isImage || isVideo ? 'pointer' : 'default' }}
                onClick={() => (isImage || isVideo) && onOpen(file)}>
                {isImage ? (
                    <img src={file.url} alt={file.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : isVideo ? (
                    // preload="none" — a gallery of clips would otherwise fetch every one on open.
                    <video src={file.url} preload="none" controls style={{ width: '100%', height: '100%', background: '#000' }} />
                ) : (
                    <span style={{ fontSize: 30, color: '#5e7094' }}>🗂</span>
                )}
            </div>

            <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#eaeff9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                    {file.name}
                </div>
                <div style={{ fontSize: 11, color: '#9daec9' }}>
                    {file.driverName ? `${file.driverName}${file.badgeNo ? ` · ${file.badgeNo}` : ''}` : file.imei || file.source}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#5e7094' }}>
                    <span>{fmtBytes(file.size)}</span>
                    <span>·</span>
                    <span>{fmtTime(file.modifiedAt)}</span>
                    <a href={file.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: '#7fc4ff', fontWeight: 600 }}>Open</a>
                </div>
            </div>
        </div>
    );
}

export default function MediaGalleryPage() {
    const [data, setData]       = useState(null);
    const [kind, setKind]       = useState('');
    const [search, setSearch]   = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const [open, setOpen]       = useState(null);

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

    useEffect(() => { load(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

    const files   = data?.files ?? [];
    const summary = data?.summary ?? { all: 0, image: 0, video: 0, other: 0, bytes: 0 };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#111c33' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e2c46', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {KINDS.map(([value, label]) => {
                    const active = kind === value;
                    const count  = value ? summary[value] : summary.all;
                    return (
                        <button key={value} onClick={() => setKind(value)} style={{
                            padding: '6px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                            border: `1px solid ${active ? '#24507f' : '#1e2c46'}`,
                            background: active ? '#152a4a' : 'transparent',
                            color: active ? '#7fc4ff' : '#9daec9',
                        }}>
                            {label} <span style={{ fontWeight: 500, color: '#5e7094' }}>{count}</span>
                        </button>
                    );
                })}

                <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
                    placeholder="Search file name or driver" style={{ ...input, width: 240, marginLeft: 8 }} />
                <button onClick={() => load()} style={{ padding: '7px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {loading ? 'Loading…' : 'Refresh'}
                </button>

                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#5e7094' }}>
                    <code style={{ fontFamily: 'monospace' }}>{data?.directory ?? 'img/uploads'}</code> · {fmtBytes(summary.bytes)}
                </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {error && <div style={{ marginBottom: 12, padding: '9px 13px', background: '#3b1418', border: '1px solid #7f1d1d', borderRadius: 7, fontSize: 12.5, color: '#fca5a5' }}>{error}</div>}

                {!loading && files.length === 0 ? (
                    <div style={{ border: '1px dashed #24344f', borderRadius: 10, padding: 40, textAlign: 'center', color: '#9daec9', fontSize: 13 }}>
                        Nothing here yet.
                        <div style={{ marginTop: 6, fontSize: 12, color: '#5e7094', lineHeight: 1.6 }}>
                            Face templates land here when captured from a camera, and devices add stills and clips once
                            <code style={{ fontFamily: 'monospace' }}> UPLOADFACE,URL</code> points at this host.
                            Settings → Face Logs shows whether anything is arriving.
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
                        {files.map(f => <Tile key={f.name} file={f} onOpen={setOpen} />)}
                    </div>
                )}

                {data && data.total > files.length && (
                    <p style={{ marginTop: 14, fontSize: 12, color: '#5e7094' }}>
                        Showing {files.length} of {data.total}. Narrow with the search box to see the rest.
                    </p>
                )}
            </div>

            {open && <Lightbox file={open} onClose={() => setOpen(null)} />}
        </div>
    );
}

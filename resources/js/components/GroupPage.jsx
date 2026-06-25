import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ConnectionsModal from './ConnectionsModal.jsx';
import AttributesEditor from './AttributesEditor.jsx';

const fieldLabelStyle = { display: 'block', fontSize: 11.5, color: '#6b7280', fontWeight: 600, marginBottom: 6 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' };

function GroupModal({ group, allGroups, onClose, onSaved }) {
    const isNew = !group;
    const [name, setName]       = useState(group?.name || '');
    const [parentId, setParentId] = useState(group?.groupId || 0);
    const [attrRows, setAttrRows] = useState(Object.entries(group?.attributes || {}).map(([key, value]) => ({ key, value: String(value) })));
    const [extraOpen, setExtraOpen] = useState(false);
    const [attributesOpen, setAttributesOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const parentOptions = allGroups.filter(g => g.id !== group?.id);

    const handleSave = async () => {
        if (!name.trim()) { setError('Name is required.'); return; }
        setSaving(true);
        setError('');
        const attributes = Object.fromEntries(attrRows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.value]));
        const payload = { name: name.trim(), groupId: Number(parentId) || 0, attributes };
        try {
            if (isNew) {
                await api.createGroup(payload);
            } else {
                await api.updateGroup(group.id, payload);
            }
            onSaved();
        } catch (e) {
            setError('Failed to save group.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#fff', borderRadius: 12, width: 420, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{isNew ? 'New Group' : 'Edit Group'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 20 }}>
                    {error && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>Required</p>
                        <label style={fieldLabelStyle}>Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inputStyle} />
                    </div>

                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                        <button onClick={() => setExtraOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Extra
                            <span style={{ transform: extraOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                        </button>
                        {extraOpen && (
                            <div style={{ padding: 14, borderTop: '1px solid #f1f5f9' }}>
                                <label style={fieldLabelStyle}>Group</label>
                                <select value={parentId} onChange={e => setParentId(e.target.value)} style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}>
                                    <option value={0}>None</option>
                                    {parentOptions.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => setAttributesOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Attributes
                            <span style={{ transform: attributesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▾</span>
                        </button>
                        {attributesOpen && (
                            <div style={{ padding: 14, borderTop: '1px solid #f1f5f9' }}>
                                <AttributesEditor rows={attrRows} onChange={setAttrRows} />
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb' };
const TD = { padding: '11px 14px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #f1f5f9' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 5, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

export default function GroupPage() {
    const [groups, setGroups]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [search, setSearch]   = useState('');
    const [editing, setEditing] = useState(null);   // group object, or 'new'
    const [connGroup, setConnGroup] = useState(null);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);

    const fetchGroups = async () => {
        try {
            const res = await api.getTraccarGroups();
            setGroups(res.data);
        } catch (e) {
            setError('Failed to load groups.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchGroups(); }, []);

    const filtered = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));

    const handleDelete = async () => {
        const id = pendingDeleteId;
        setPendingDeleteId(null);
        try {
            await api.deleteGroup(id);
            await fetchGroups();
        } catch (e) {
            setError('Failed to delete group.');
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', position: 'relative' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Groups</h2>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
                    style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
            </div>

            {error && (
                <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                    {error}
                </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={TH}>Name</th>
                            <th style={{ ...TH, textAlign: 'center', width: 130 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={2} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading…</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={2} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data found</td></tr>
                        ) : filtered.map(g => (
                            <tr key={g.id}>
                                <td style={{ ...TD, fontWeight: 500 }}>{g.name}</td>
                                <td style={{ ...TD, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button style={iconBtn} title="Connections" onClick={() => setConnGroup(g)}>🔗</button>
                                    <button style={iconBtn} title="Edit" onClick={() => setEditing(g)}>✏</button>
                                    <button style={{ ...iconBtn, color: '#ef4444' }} title="Delete" onClick={() => setPendingDeleteId(g.id)}>🗑</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={() => setEditing('new')} title="Add group"
                style={{ position: 'absolute', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: '#3b82f6', color: '#fff', border: 'none', fontSize: 26, fontWeight: 400, lineHeight: 1, cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                +
            </button>

            {editing && (
                <GroupModal
                    group={editing === 'new' ? null : editing}
                    allGroups={groups}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchGroups(); }}
                />
            )}

            {connGroup && <ConnectionsModal owner={connGroup} ownerType="group" onClose={() => setConnGroup(null)} />}

            {pendingDeleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Delete group?</h3>
                        <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b' }}>This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: 9, borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} style={{ flex: 1, padding: 9, borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' };

export default function AttributesEditor({ rows, onChange }) {
    const updateRow = (idx, field, value) => {
        const next = rows.map((r, i) => i === idx ? { ...r, [field]: value } : r);
        onChange(next);
    };
    const removeRow = (idx) => onChange(rows.filter((_, i) => i !== idx));
    const addRow = () => onChange([...rows, { key: '', value: '' }]);

    return (
        <div>
            {rows.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input value={row.key} onChange={e => updateRow(idx, 'key', e.target.value)} placeholder="Key"
                        style={{ ...inputStyle, flex: 1 }} />
                    <input value={row.value} onChange={e => updateRow(idx, 'value', e.target.value)} placeholder="Value"
                        style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => removeRow(idx)} title="Remove"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 6px' }}>✕</button>
                </div>
            ))}
            <button onClick={addRow} style={{ width: '100%', padding: 9, borderRadius: 7, border: '1.5px solid #3b82f6', background: '#fff', color: '#3b82f6', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                + Add
            </button>
        </div>
    );
}

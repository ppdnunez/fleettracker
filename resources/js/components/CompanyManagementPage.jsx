import { useEffect, useState } from 'react';
import { api } from '../api.js';

/**
 * Companies & Users.
 *
 * Two audiences share this page, because they are doing the same job at different scopes:
 * a platform administrator manages every company and its logins, while a company's own
 * client_admin manages only its own logins and never sees the company list at all. The backend
 * enforces both (CompanyUserController::authorizeCompany) — this only decides what to render.
 *
 * The "Devices" panel exists to make isolation checkable: it asks the backend to call Traccar as
 * that company, so what it lists is exactly what that company's users see on their dashboard.
 */

/* Tenant roles, kept in sync with App\Models\User::TENANT_ROLES. Platform roles (admin,
   super_admin) are absent on purpose — they belong to logins with no company. */
const ROLES = [
    ['client_admin', 'Company Admin', 'Manages this company’s logins. Same device access as everyone else here.'],
    ['operator',     'Operator',      'Full day-to-day use of this company’s fleet.'],
    ['viewer',       'Viewer',        'Read-only.'],
];
const ROLE_LABELS = Object.fromEntries(ROLES.map(([k, l]) => [k, l]));

const label     = { display: 'block', fontSize: 11.5, color: '#9daec9', fontWeight: 600, marginBottom: 6 };
const input     = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #24344f', borderRadius: 7, fontSize: 13, outline: 'none' };
const th        = { textAlign: 'left', padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#9daec9', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #1e2c46', whiteSpace: 'nowrap' };
const td        = { padding: '11px 14px', fontSize: 13, color: '#eaeff9', borderBottom: '1px solid #1e2c46', verticalAlign: 'middle' };
const btn       = (bg, fg) => ({ padding: '7px 13px', border: 'none', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: bg, color: fg });
const linkBtn   = { background: 'none', border: 'none', padding: 0, marginRight: 12, fontSize: 12.5, fontWeight: 600, color: '#4da8ff', cursor: 'pointer' };
const pill      = (ok) => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: ok ? '#0f2b24' : '#3b1418', color: ok ? '#4ade80' : '#fca5a5' });
const rolePill  = { display: 'inline-block', padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: '#152a4a', color: '#7fc4ff' };

const errorText = (e, fallback) => {
    const data = e.response?.data;
    const firstFieldError = data?.errors && Object.values(data.errors)[0]?.[0];
    return firstFieldError || data?.message || fallback;
};

function Banner({ kind, children }) {
    const tone = {
        info:  ['#152a4a', '#24507f', '#7fc4ff'],
        warn:  ['#33260c', '#7c5e10', '#fcd34d'],
        error: ['#3b1418', '#7f1d1d', '#fca5a5'],
        ok:    ['#0f2b24', '#1f6b52', '#4ade80'],
    }[kind] || ['#1e2c46', '#1e2c46', '#334155'];

    return (
        <div style={{ padding: '10px 14px', background: tone[0], border: `1px solid ${tone[1]}`, borderRadius: 8, fontSize: 12.5, color: tone[2], lineHeight: 1.6 }}>
            {children}
        </div>
    );
}

function Modal({ title, onClose, children, footer, width = 460 }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ background: '#111c33', borderRadius: 12, width, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1e2c46' }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#eaeff9' }}>{title}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 16 }}>✕</button>
                </div>
                <div style={{ padding: 20 }}>{children}</div>
                {footer && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid #1e2c46' }}>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── company create / edit ───────────────────────────────────── */
/**
 * Creating a company also creates its Traccar group and user, so the Traccar fields are only
 * offered on the new-company form. On edit the email is fixed (it is the identity this app
 * authenticates with) and the password field rotates it on both sides at once.
 */
function CompanyModal({ company, onClose, onSaved }) {
    const isNew = !company;
    const [name, setName]         = useState(company?.name || '');
    const [status, setStatus]     = useState(company?.status || 'active');
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [withAdmin, setWithAdmin]     = useState(true);
    const [adminName, setAdminName]     = useState('');
    const [adminEmail, setAdminEmail]   = useState('');
    const [adminPass, setAdminPass]     = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const save = async () => {
        if (!name.trim()) { setError('Company name is required.'); return; }
        if (isNew && !email.trim())    { setError('A Traccar email is required.'); return; }
        if (isNew && password.length < 6) { setError('The Traccar password must be at least 6 characters.'); return; }
        if (isNew && withAdmin && (!adminName.trim() || !adminEmail.trim() || adminPass.length < 8)) {
            setError('Fill in the first login, or untick it. Its password must be at least 8 characters.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            if (isNew) {
                await api.createCompany({
                    name: name.trim(),
                    traccar_email: email.trim(),
                    traccar_password: password,
                    status,
                    ...(withAdmin ? { admin_name: adminName.trim(), admin_email: adminEmail.trim(), admin_password: adminPass } : {}),
                });
            } else {
                await api.updateCompany(company.id, {
                    name: name.trim(),
                    status,
                    ...(password ? { traccar_password: password } : {}),
                });
            }
            onSaved();
        } catch (e) {
            setError(errorText(e, 'Failed to save the company.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title={isNew ? 'New Company' : `Edit ${company.name}`} onClose={onClose} width={520}
            footer={<>
                <button onClick={onClose} style={btn('#1e2c46', '#334155')}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ ...btn('#4da8ff', '#fff'), opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : isNew ? 'Create Company' : 'Save Changes'}
                </button>
            </>}>

            {error && <div style={{ marginBottom: 14 }}><Banner kind="error">{error}</Banner></div>}

            {isNew && (
                <div style={{ marginBottom: 16 }}>
                    <Banner kind="info">
                        This creates a Traccar <strong>group</strong> and <strong>user</strong> for the company and links them,
                        then stores the credentials here. Put the company’s devices into that group in Traccar and every
                        login below sees them — and nothing else.
                    </Banner>
                </div>
            )}

            <div style={{ marginBottom: 14 }}>
                <label style={label}>Company name</label>
                <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="Airniugini" />
            </div>

            {isNew && (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <label style={label}>Traccar login email (created in Traccar)</label>
                        <input style={input} value={email} onChange={e => setEmail(e.target.value)} placeholder="ops@airniugini.com" />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <label style={label}>Traccar password</label>
                        <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" />
                    </div>
                </>
            )}

            {!isNew && (
                <div style={{ marginBottom: 14 }}>
                    <label style={label}>Rotate Traccar password (optional)</label>
                    <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep the current one" />
                    <div style={{ fontSize: 11.5, color: '#9daec9', marginTop: 5 }}>
                        Changes it in Traccar and here at the same time. Traccar user: <code style={{ fontFamily: 'monospace' }}>{company.traccar_email}</code>
                    </div>
                </div>
            )}

            <div style={{ marginBottom: isNew ? 16 : 0 }}>
                <label style={label}>Status</label>
                <select style={input} value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended — its logins are refused at sign-in</option>
                </select>
            </div>

            {isNew && (
                <div style={{ borderTop: '1px solid #1e2c46', paddingTop: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#eaeff9', marginBottom: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={withAdmin} onChange={e => setWithAdmin(e.target.checked)} />
                        Create the company’s first login (a Company Admin)
                    </label>

                    {withAdmin && (
                        <div style={{ display: 'grid', gap: 12 }}>
                            <div>
                                <label style={label}>Full name</label>
                                <input style={input} value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Jane Doe" />
                            </div>
                            <div>
                                <label style={label}>Sign-in email (Turprotrack)</label>
                                <input style={input} value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="jane@airniugini.com" />
                            </div>
                            <div>
                                <label style={label}>Sign-in password</label>
                                <input style={input} type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="At least 8 characters" />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}

/* ── login create / edit ─────────────────────────────────────── */
function UserModal({ companyId, user, onClose, onSaved }) {
    const isNew = !user;
    const [name, setName]         = useState(user?.name || '');
    const [email, setEmail]       = useState(user?.email || '');
    const [role, setRole]         = useState(user?.role || 'operator');
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const save = async () => {
        if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return; }
        if (isNew && password.length < 8)  { setError('The password must be at least 8 characters.'); return; }
        if (!isNew && password && password.length < 8) { setError('The new password must be at least 8 characters.'); return; }

        setSaving(true);
        setError('');
        const payload = { name: name.trim(), email: email.trim(), role, ...(password ? { password } : {}) };
        try {
            if (isNew) await api.createCompanyUser(companyId, payload);
            else       await api.updateCompanyUser(companyId, user.id, payload);
            onSaved();
        } catch (e) {
            setError(errorText(e, 'Failed to save the login.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title={isNew ? 'New Login' : `Edit ${user.name}`} onClose={onClose}
            footer={<>
                <button onClick={onClose} style={btn('#1e2c46', '#334155')}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ ...btn('#4da8ff', '#fff'), opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : isNew ? 'Create Login' : 'Save Changes'}
                </button>
            </>}>

            {error && <div style={{ marginBottom: 14 }}><Banner kind="error">{error}</Banner></div>}

            <div style={{ marginBottom: 14 }}>
                <label style={label}>Full name</label>
                <input style={input} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
                <label style={label}>Sign-in email</label>
                <input style={input} value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
                <label style={label}>{isNew ? 'Password' : 'New password (optional)'}</label>
                <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={isNew ? 'At least 8 characters' : 'Leave blank to keep the current one'} />
            </div>
            <div>
                <label style={label}>Role</label>
                <div style={{ border: '1px solid #24344f', borderRadius: 8, overflow: 'hidden' }}>
                    {ROLES.map(([key, title, desc]) => (
                        <label key={key} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', cursor: 'pointer',
                            background: role === key ? '#152a4a' : '#111c33', borderBottom: '1px solid #1e2c46',
                        }}>
                            <input type="radio" name="role" checked={role === key} onChange={() => setRole(key)} style={{ marginTop: 2 }} />
                            <span>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#eaeff9' }}>{title}</span>
                                <span style={{ display: 'block', fontSize: 11.5, color: '#9daec9', marginTop: 1 }}>{desc}</span>
                            </span>
                        </label>
                    ))}
                </div>
            </div>
        </Modal>
    );
}

/* ── the logins of one company ───────────────────────────────── */
function UsersPanel({ company, currentUser }) {
    const [users, setUsers]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [editing, setEditing] = useState(undefined); // undefined = closed, null = new

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.getCompanyUsers(company.id);
            setUsers(data);
            setError('');
        } catch (e) {
            setError(errorText(e, 'Could not load the logins for this company.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [company.id]);

    const remove = async (user) => {
        if (!window.confirm(`Delete the login ${user.email}? They will be signed out immediately.`)) return;
        try {
            await api.deleteCompanyUser(company.id, user.id);
            load();
        } catch (e) {
            setError(errorText(e, 'Could not delete that login.'));
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: '#9daec9' }}>
                    {loading ? 'Loading…' : `${users.length} login${users.length === 1 ? '' : 's'} — all sharing this company’s device access.`}
                </div>
                <button onClick={() => setEditing(null)} style={btn('#4da8ff', '#fff')}>+ New Login</button>
            </div>

            {error && <div style={{ marginBottom: 12 }}><Banner kind="error">{error}</Banner></div>}

            <div style={{ border: '1px solid #1e2c46', borderRadius: 10, overflow: 'hidden', background: '#111c33' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#16233c' }}>
                        <tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th><th style={{ ...th, textAlign: 'right' }}>Actions</th></tr>
                    </thead>
                    <tbody>
                        {!loading && users.length === 0 && (
                            <tr><td style={{ ...td, textAlign: 'center', color: '#9daec9' }} colSpan={4}>No logins yet.</td></tr>
                        )}
                        {users.map(u => (
                            <tr key={u.id}>
                                <td style={td}>
                                    {u.name}
                                    {u.id === currentUser.id && <span style={{ marginLeft: 7, fontSize: 11, color: '#9daec9' }}>(you)</span>}
                                </td>
                                <td style={td}>{u.email}</td>
                                <td style={td}><span style={rolePill}>{ROLE_LABELS[u.role] || u.role}</span></td>
                                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <button style={linkBtn} onClick={() => setEditing(u)}>Edit</button>
                                    <button style={{ ...linkBtn, color: u.id === currentUser.id ? '#24344f' : '#dc2626', marginRight: 0, cursor: u.id === currentUser.id ? 'not-allowed' : 'pointer' }}
                                        disabled={u.id === currentUser.id} onClick={() => remove(u)}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editing !== undefined && (
                <UserModal companyId={company.id} user={editing} onClose={() => setEditing(undefined)}
                    onSaved={() => { setEditing(undefined); load(); }} />
            )}
        </div>
    );
}

/* ── what this company can actually see in Traccar ───────────── */
function DevicesPanel({ company, onRepaired }) {
    const [state, setState]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [repairPass, setRepairPass] = useState('');
    const [repairing, setRepairing]   = useState(false);
    const [repairError, setRepairError] = useState('');

    const check = () => {
        setLoading(true);
        api.getCompanyDevices(company.id)
            .then(({ data }) => setState(data))
            .catch(e => setState({ ok: false, devices: [], error: errorText(e, 'Request failed.') }))
            .finally(() => setLoading(false));
    };

    useEffect(() => { check(); }, [company.id]);

    const repair = async () => {
        if (repairPass.length < 6) { setRepairError('The password must be at least 6 characters.'); return; }
        setRepairing(true);
        setRepairError('');
        try {
            await api.repairCompany(company.id, repairPass);
            setRepairPass('');
            onRepaired?.();
            check();
        } catch (e) {
            setRepairError(errorText(e, 'Could not re-create the Traccar user.'));
        } finally {
            setRepairing(false);
        }
    };

    if (loading) return <div style={{ fontSize: 13, color: '#9daec9' }}>Asking Traccar as {company.name}…</div>;

    if (!state?.ok) {
        return (
            <div>
                <Banner kind="error">{state?.error || 'Could not check this company’s access.'}</Banner>

                {/* Only offered when the account is genuinely gone. For a merely wrong password the
                    fix is Edit > rotate, which keeps Traccar's existing user and its permissions. */}
                {state?.missing_user && (
                    <div style={{ marginTop: 14, padding: 14, border: '1px solid #1e2c46', borderRadius: 10, background: '#111c33' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#eaeff9', marginBottom: 4 }}>Re-create this company’s Traccar user</div>
                        <div style={{ fontSize: 12.5, color: '#9daec9', marginBottom: 12, lineHeight: 1.6 }}>
                            Creates <code style={{ fontFamily: 'monospace' }}>{company.traccar_email}</code> in Traccar again and re-links it to
                            group {company.traccar_group_id ?? '—'}. If that group still exists its devices are kept, so the company gets its fleet back.
                            Its Turprotrack logins are untouched.
                        </div>
                        {repairError && <div style={{ marginBottom: 10 }}><Banner kind="error">{repairError}</Banner></div>}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <input style={{ ...input, flex: 1 }} type="password" value={repairPass}
                                onChange={e => setRepairPass(e.target.value)} placeholder="New Traccar password (min 6 characters)" />
                            <button onClick={repair} disabled={repairing} style={{ ...btn('#4da8ff', '#fff'), opacity: repairing ? 0.6 : 1, flexShrink: 0 }}>
                                {repairing ? 'Working…' : 'Re-create'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <Banner kind={state.devices.length ? 'ok' : 'warn'}>
                    {state.devices.length
                        ? <>Signed in to Traccar as <code style={{ fontFamily: 'monospace' }}>{company.traccar_email}</code> and got <strong>{state.devices.length}</strong> device(s). This is exactly what this company’s users see.</>
                        : <>These credentials work, but Traccar grants them <strong>no devices</strong>. Add devices to this company’s group in Traccar — its users currently see an empty dashboard.</>}
                </Banner>
            </div>

            {state.devices.length > 0 && (
                <div style={{ border: '1px solid #1e2c46', borderRadius: 10, overflow: 'hidden', background: '#111c33' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#16233c' }}>
                            <tr><th style={th}>Device</th><th style={th}>IMEI</th><th style={th}>Group</th><th style={th}>Status</th></tr>
                        </thead>
                        <tbody>
                            {state.devices.map(d => (
                                <tr key={d.id}>
                                    <td style={td}>{d.name}</td>
                                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{d.uniqueId}</td>
                                    <td style={td}>{d.groupId || <span style={{ color: '#5e7094' }}>none</span>}</td>
                                    <td style={td}><span style={pill(d.status === 'online')}>{(d.status || 'unknown').toUpperCase()}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* ── page ────────────────────────────────────────────────────── */
export default function CompanyManagementPage({ user }) {
    const isPlatformAdmin = !!user?.is_admin;

    const [companies, setCompanies] = useState([]);
    const [loading, setLoading]     = useState(isPlatformAdmin);
    const [error, setError]         = useState('');
    const [editing, setEditing]     = useState(undefined);
    const [openCompany, setOpenCompany] = useState(null);
    const [tab, setTab] = useState('users');

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.getCompanies();
            setCompanies(data);
            setError('');
        } catch (e) {
            setError(errorText(e, 'Could not load companies.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (isPlatformAdmin) load(); }, [isPlatformAdmin]);

    const remove = async (company) => {
        if (!window.confirm(
            `Remove ${company.name} from Turprotrack?\n\n` +
            `Its ${company.users_count} login(s) will be deleted. Its Traccar group, user and devices are left untouched.`
        )) return;
        try {
            await api.deleteCompany(company.id);
            if (openCompany?.id === company.id) setOpenCompany(null);
            load();
        } catch (e) {
            setError(errorText(e, 'Could not remove that company.'));
        }
    };

    /* A company administrator gets only its own logins — no company list, nothing about anyone
       else's tenancy. The backend would refuse those calls anyway; this keeps the UI honest. */
    if (!isPlatformAdmin) {
        if (!user?.is_company_admin || !user?.client) {
            return (
                <div style={{ padding: 20 }}>
                    <Banner kind="warn">Only a company administrator can manage logins. Ask your administrator for access.</Banner>
                </div>
            );
        }

        return (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#16233c' }}>
                <h1 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#eaeff9' }}>Users — {user.client.name}</h1>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9daec9' }}>
                    Everyone here signs in to Turprotrack separately but shares your company’s device access.
                </p>
                <UsersPanel company={{ id: user.client.id, name: user.client.name }} currentUser={user} />
            </div>
        );
    }

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#16233c' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
                <div>
                    <h1 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#eaeff9' }}>Companies & Users</h1>
                    <p style={{ margin: 0, fontSize: 13, color: '#9daec9', maxWidth: 640 }}>
                        Each company is one Traccar group and one Traccar user. Its logins all authenticate as that user,
                        so Traccar itself keeps one company out of another’s devices.
                    </p>
                </div>
                <button onClick={() => setEditing(null)} style={{ ...btn('#4da8ff', '#fff'), flexShrink: 0 }}>+ New Company</button>
            </div>

            {error && <div style={{ marginBottom: 14 }}><Banner kind="error">{error}</Banner></div>}

            <div style={{ border: '1px solid #1e2c46', borderRadius: 10, overflow: 'hidden', background: '#111c33', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#16233c' }}>
                        <tr>
                            <th style={th}>Company</th>
                            <th style={th}>Traccar user</th>
                            <th style={th}>Group</th>
                            <th style={th}>Logins</th>
                            <th style={th}>Status</th>
                            <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td style={{ ...td, textAlign: 'center', color: '#9daec9' }} colSpan={6}>Loading…</td></tr>}
                        {!loading && companies.length === 0 && (
                            <tr><td style={{ ...td, textAlign: 'center', color: '#9daec9' }} colSpan={6}>No companies yet. Create one to get started.</td></tr>
                        )}
                        {companies.map(c => (
                            <tr key={c.id} style={{ background: openCompany?.id === c.id ? '#16233c' : '#111c33' }}>
                                <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{c.traccar_email || <span style={{ color: '#dc2626', fontFamily: 'inherit' }}>none</span>}</td>
                                <td style={td}>{c.traccar_group_id ?? <span style={{ color: '#5e7094' }}>—</span>}</td>
                                <td style={td}>{c.users_count}</td>
                                <td style={td}><span style={pill(c.status === 'active')}>{c.status}</span></td>
                                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <button style={linkBtn} onClick={() => { setOpenCompany(c); setTab('users'); }}>Manage</button>
                                    <button style={linkBtn} onClick={() => setEditing(c)}>Edit</button>
                                    <button style={{ ...linkBtn, color: '#dc2626', marginRight: 0 }} onClick={() => remove(c)}>Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {openCompany && (
                <div style={{ border: '1px solid #1e2c46', borderRadius: 10, background: '#111c33', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderBottom: '1px solid #1e2c46' }}>
                        <strong style={{ fontSize: 14, color: '#eaeff9', marginRight: 10 }}>{openCompany.name}</strong>
                        {[['users', 'Logins'], ['devices', 'Devices it can see']].map(([key, text]) => (
                            <button key={key} onClick={() => setTab(key)} style={{
                                padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                                background: tab === key ? '#152a4a' : 'transparent', color: tab === key ? '#7fc4ff' : '#9daec9',
                            }}>{text}</button>
                        ))}
                        <button onClick={() => setOpenCompany(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#5e7094', fontSize: 15 }}>✕</button>
                    </div>
                    <div style={{ padding: 16 }}>
                        {tab === 'users'
                            ? <UsersPanel company={openCompany} currentUser={user} />
                            : <DevicesPanel company={openCompany} onRepaired={load} />}
                    </div>
                </div>
            )}

            {editing !== undefined && (
                <CompanyModal company={editing} onClose={() => setEditing(undefined)}
                    onSaved={() => { setEditing(undefined); load(); }} />
            )}
        </div>
    );
}

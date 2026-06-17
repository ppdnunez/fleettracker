import { useState } from 'react';

/* ── icons ───────────────────────────────────────────────────── */
const SearchSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/>
    </svg>
);
const DownloadSVG = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M6.5 1v7M4 6l2.5 2.5L9 6"/>
        <path d="M1 10v1.5A1.5 1.5 0 0 0 2.5 13h8A1.5 1.5 0 0 0 12 11.5V10"/>
    </svg>
);
const ColPickSVG = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="4" height="4" rx="1"/><rect x="6" y="1" width="4" height="4" rx="1"/><rect x="11" y="1" width="2" height="4" rx="0.5"/>
        <rect x="1" y="7" width="4" height="4" rx="1"/><rect x="6" y="7" width="4" height="4" rx="1"/><rect x="11" y="7" width="2" height="4" rx="0.5"/>
    </svg>
);
const PersonSVG = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="#5b21b6" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="7.5" cy="5" r="3.2"/>
        <path d="M1 14.5 Q1.5 10 7.5 10 Q13.5 10 14 14.5"/>
    </svg>
);
const CollapseArrow = ({ open }) => (
    <svg width="7" height="11" viewBox="0 0 7 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {open ? <polyline points="5.5,1 1.5,5.5 5.5,10"/> : <polyline points="1.5,1 5.5,5.5 1.5,10"/>}
    </svg>
);

/* ── shared style primitives (match ReportPage) ─────────────── */
const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb' };
const TD = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#374151' };

/* ── shared sub-components (match ReportPage style) ─────────── */
function FilterBar({ children }) {
    return (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            {children}
        </div>
    );
}
function FInput({ label, placeholder, type = 'text', style }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {label && <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</label>}
            <input type={type} placeholder={placeholder} style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', ...style }} />
        </div>
    );
}
function FSel({ label, placeholder, options = [] }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {label && <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</label>}
            <select style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                <option value="">{placeholder || 'Please select'}</option>
                {options.map(o => <option key={o}>{o}</option>)}
            </select>
        </div>
    );
}
function SearchBtn() {
    return (
        <button style={{ padding: '7px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SearchSVG />Search
        </button>
    );
}
function ResetBtn() {
    return <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>;
}
function Btn({ children, primary, red, onClick }) {
    return (
        <button onClick={onClick} style={{ padding: '7px 16px', borderRadius: 6, border: primary ? 'none' : red ? '1px solid #ef4444' : '1px solid #d1d5db', background: primary ? '#3b82f6' : '#fff', color: primary ? '#fff' : red ? '#ef4444' : '#374151', fontSize: 13, cursor: 'pointer', fontWeight: primary ? 600 : 400, whiteSpace: 'nowrap' }}>
            {children}
        </button>
    );
}
function DropBtn({ children }) {
    return <button style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{children} <span style={{ fontSize: 9 }}>▼</span></button>;
}
function ActionRow({ left, right }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>{left}</div>
            <div style={{ display: 'flex', gap: 6 }}>
                {right}
                <button style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Export</button>
                <button style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}><ColPickSVG />▾</button>
            </div>
        </div>
    );
}
function TabBar({ tabs, active, onChange }) {
    return (
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
            {tabs.map(t => (
                <button key={t} onClick={() => onChange(t)} style={{ padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active === t ? 700 : 500, color: active === t ? '#3b82f6' : '#6b7280', borderBottom: active === t ? '2.5px solid #3b82f6' : '2.5px solid transparent', marginBottom: -2 }}>
                    {t}
                </button>
            ))}
        </div>
    );
}
function EmptyTable({ cols }) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead><tr>{cols.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                <tbody>
                    <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                </tbody>
            </table>
        </div>
    );
}
function PageShell({ title, children }) {
    return (
        <div style={{ flex: 1, overflowY: 'auto', background: '#fff', padding: '16px 24px' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#111827' }}>{title}</h2>
            {children}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  Fleet Dashboard helpers                                        */
/* ══════════════════════════════════════════════════════════════ */

function StatCard({ label }) {
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, color: '#6b7280' }}>{label}</span>
                <button style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 11, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>This week ▾</button>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>0</div>
        </div>
    );
}
function ChartCard({ tabs }) {
    const [active, setActive] = useState(tabs[0]);
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                    {tabs.map(t => (
                        <button key={t} onClick={() => setActive(t)} style={{ background: 'none', border: 'none', padding: '0 0 3px', fontSize: 12.5, cursor: 'pointer', color: active === t ? '#3b82f6' : '#9ca3af', borderBottom: active === t ? '2px solid #3b82f6' : '2px solid transparent', fontWeight: active === t ? 600 : 400 }}>{t}</button>
                    ))}
                </div>
                <button style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 11, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>Last 7 days ▾</button>
            </div>
            <div style={{ height: 120, background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '12px 12px 0', gap: 4 }}>
                {[0.3,0.5,0.1,0.7,0.4,0.6,0.2].map((h, i) => (
                    <div key={i} style={{ flex: 1, background: '#dbeafe', borderRadius: '3px 3px 0 0', height: `${h * 60}%`, minHeight: 2 }} />
                ))}
            </div>
        </div>
    );
}
function ReminderCard() {
    const [tab, setTab] = useState('Driving license reminder');
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Reminder</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                {['Driving license reminder','Insurance reminder'].map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', padding: '0 0 3px', fontSize: 12.5, cursor: 'pointer', color: tab === t ? '#3b82f6' : '#9ca3af', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent' }}>{t}</button>
                ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
                <svg width="110" height="110" viewBox="0 0 110 110">
                    <circle cx="55" cy="55" r="44" fill="#3b82f6" opacity="0.1"/>
                    <circle cx="55" cy="55" r="44" fill="none" stroke="#3b82f6" strokeWidth="24" strokeDasharray="200 76" strokeDashoffset="25" transform="rotate(-90 55 55)"/>
                    <circle cx="55" cy="55" r="22" fill="#fff"/>
                </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: '#6b7280', marginTop: 6 }}>
                {[['#3b82f6','Normal'],['#ef4444','Expired'],['#f59e0b','Expiring soon']].map(([c,l]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c }}/>
                        {l}
                    </span>
                ))}
            </div>
        </div>
    );
}
function AlarmRankingCard() {
    const [tab, setTab] = useState('Vehicle');
    return (
        <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Alarm statistics ranking</span>
                <button style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 11, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>Last 7 days ▾</button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                {['Vehicle','Alarm'].map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', padding: '0 0 3px', fontSize: 12.5, cursor: 'pointer', color: tab === t ? '#3b82f6' : '#9ca3af', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent', fontWeight: tab === t ? 600 : 400 }}>{t}</button>
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', fontSize: 12, fontWeight: 600, color: '#6b7280', paddingBottom: 6, borderBottom: '1px solid #f1f5f9' }}>
                <span>Ranking</span><span>Number plate</span><span style={{ textAlign: 'right' }}>Alert Times</span>
            </div>
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 13 }}>—</div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  Fleet sub-pages                                               */
/* ══════════════════════════════════════════════════════════════ */

function FleetDashboard() {
    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f8fafc' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Dashboard</h2>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ accentColor: '#3b82f6' }} /> Include sub-account
                </label>
            </div>

            {/* Hero + stat cards */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 2, background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', borderRadius: 10, padding: '20px 24px', color: '#fff', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginBottom: 10 }}>
                        <div><div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Total Drivers</div><div style={{ fontSize: 36, fontWeight: 800 }}>0</div></div>
                        <div><div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Total Vehicles</div><div style={{ fontSize: 36, fontWeight: 800 }}>0</div></div>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>Updated to {new Date().toISOString().slice(0,10)}</div>
                </div>
                <StatCard label="driven distance(km)" />
                <StatCard label="Total driving time(H)" />
                <StatCard label="Total Fuel Consumption (L)" />
            </div>

            {/* Reminder + Motion */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <ReminderCard />
                <ChartCard tabs={['exercise duration','Idling duration','Parked duration']} />
            </div>

            {/* Alarm type + Alarm ranking */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Alarm type ratio</span>
                        <button style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: 12, fontSize: 11, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>Last 7 days ▾</button>
                    </div>
                    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 13 }}>No data</div>
                </div>
                <AlarmRankingCard />
            </div>

            {/* Fuel + Mileage */}
            <div style={{ display: 'flex', gap: 12 }}>
                <ChartCard tabs={['Total Fuel','Fuel /100km']} />
                <ChartCard tabs={['Total mileage','Average daily mileage']} />
            </div>
        </div>
    );
}

/* Driver */
function DriverPage() {
    return (
        <PageShell title="Driver">
            <TabBar tabs={['Driver information']} active="Driver information" onChange={() => {}} />
            <FilterBar>
                <FInput placeholder="Driver No./Driver Name" style={{ width: 200 }} />
                <FInput placeholder="Register Place" style={{ width: 160 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer', paddingBottom: 1 }}>
                    <input type="checkbox" style={{ accentColor: '#3b82f6' }} />License Expired
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer', paddingBottom: 1 }}>
                    <input type="checkbox" style={{ accentColor: '#3b82f6' }} />Include sub-account
                </label>
                <SearchBtn /><ResetBtn />
            </FilterBar>
            <ActionRow
                left={[<Btn primary>Add</Btn>, <DropBtn>Batch operations</DropBtn>, <Btn>Fleet Management</Btn>, <Btn>Associated Fleet</Btn>]}
            />
            <EmptyTable cols={['No.','Driver No.','Driver Name','License No.','RFID Card No.','KC208','Register Place','Register Date','Expired Date','License Status','Driving license reminder','Status','Action']} />
        </PageShell>
    );
}

/* Vehicle */
function VehiclePage() {
    return (
        <PageShell title="Vehicle">
            <FilterBar>
                <FInput placeholder="IMEI" style={{ width: 150 }} />
                <FInput placeholder="Vehicle No." style={{ width: 150 }} />
                <FSel label="Status" placeholder="All Status" options={['Online','Offline','Moving','Parked']} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer', paddingBottom: 1 }}>
                    <input type="checkbox" style={{ accentColor: '#3b82f6' }} />Include sub-account
                </label>
                <SearchBtn /><ResetBtn />
            </FilterBar>
            <ActionRow left={[<Btn primary>Add</Btn>, <DropBtn>Batch operations</DropBtn>]} />
            <EmptyTable cols={['No.','Vehicle No.','Vehicle Type','Max Speed','Device Name','Device IMEI','Status','Insurance status','Insurance reminder','Action']} />
        </PageShell>
    );
}

/* Check in Record */
function CheckInPage() {
    const [tab, setTab] = useState('RFID');
    const today = new Date().toISOString().slice(0,10);
    const month = new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10);
    return (
        <PageShell title="Check in Record">
            <TabBar tabs={['RFID','IBUTTON','KC208','DLT','Dashcam']} active={tab} onChange={setTab} />
            <FilterBar>
                <FInput placeholder="Card ID" style={{ width: 120 }} />
                <FInput placeholder="Device name or IMEI" style={{ width: 220 }} />
                <FInput placeholder="Driver No." style={{ width: 110 }} />
                <FInput placeholder="Driver name" style={{ width: 120 }} />
                <FInput placeholder="Number plate" style={{ width: 120 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#374151', background: '#fff' }}>
                    <span>{month}</span><span style={{ color: '#9ca3af' }}>-</span><span>{today}</span>
                </div>
                <SearchBtn />
            </FilterBar>
            <ActionRow left={[]} />
            <EmptyTable cols={['No.','Card ID','IMEI','Device name','Driver Name','Number plate','Driver No.','Photo','Operation Time']} />
        </PageShell>
    );
}

/* Route Planning */
function RoutePlanningPage() {
    return (
        <PageShell title="Route Planning">
            <FilterBar>
                <FInput placeholder="Please enter the route name" style={{ width: 200 }} />
                <FInput placeholder="Vehicle No." style={{ width: 150 }} />
                <FInput placeholder="IMEI" style={{ width: 150 }} />
                <SearchBtn />
            </FilterBar>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Btn primary>Add</Btn>
                <Btn red>Delete</Btn>
            </div>
            <EmptyTable cols={['No.','Route name','Start location','End location','Total Mileage(km)','Stop','Action']} />
        </PageShell>
    );
}

/* Fleet Report */
function FleetReportPage() {
    const [tab, setTab] = useState('Attendance Daily');
    const today = new Date().toISOString().slice(0,10);
    return (
        <PageShell title="Fleet Report">
            <TabBar tabs={['Attendance Daily','Vehicle Trip']} active={tab} onChange={setTab} />
            <FilterBar>
                <FInput placeholder="Driver No." style={{ width: 130 }} />
                <FInput placeholder="Driver name" style={{ width: 130 }} />
                <FInput placeholder="Number plate" style={{ width: 140 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 10px', fontSize: 13, color: '#374151', background: '#fff' }}>
                    <span>{today}</span><span style={{ color: '#9ca3af' }}>-</span><span>{today}</span>
                </div>
                <SearchBtn />
            </FilterBar>
            <ActionRow left={[]} />
            {tab === 'Attendance Daily'
                ? <EmptyTable cols={['Driver Name','Driver No.','Clock In Time','Clock Out Time','Work Duration','Driving Duration','Associated Vehicle']} />
                : <EmptyTable cols={['No.','Driver Name','Driver No.','Vehicle No.','Start Time','End Time','Mileage (km)','Duration','Associated Fleet']} />
            }
        </PageShell>
    );
}

/* ── page map ────────────────────────────────────────────────── */
const PAGE_MAP = {
    Dashboard:     FleetDashboard,
    Driver:        DriverPage,
    Vehicle:       VehiclePage,
    CheckIn:       CheckInPage,
    RoutePlanning: RoutePlanningPage,
    FleetReport:   FleetReportPage,
};

/* ══════════════════════════════════════════════════════════════ */
/*  Main export                                                   */
/* ══════════════════════════════════════════════════════════════ */
export default function FleetPage({ fleetPage = 'Dashboard', setFleetPage }) {
    const [accountOpen, setAccountOpen] = useState(true);
    const Content = PAGE_MAP[fleetPage] || FleetDashboard;

    return (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
            {/* Account list panel */}
            <div style={{ width: accountOpen ? 200 : 0, minWidth: accountOpen ? 200 : 0, overflow: 'hidden', background: '#fff', borderRight: '1px solid #e5e7eb', transition: 'width 0.22s ease, min-width 0.22s ease', flexShrink: 0 }}>
                <div style={{ width: 200, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Header */}
                    <div style={{ padding: '12px 14px 10px', fontWeight: 700, fontSize: 13, color: '#111827', borderBottom: '1px solid #f1f5f9', letterSpacing: 0.2 }}>Account List</div>
                    {/* Search row */}
                    <div style={{ padding: '8px 10px', display: 'flex', gap: 6, borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden', background: '#f9fafb' }}>
                            <input placeholder="Please enter the..." style={{ flex: 1, padding: '5px 8px', border: 'none', fontSize: 12, outline: 'none', minWidth: 0, background: 'transparent', color: '#374151' }} />
                            <span style={{ padding: '0 7px', color: '#9ca3af', display: 'flex', alignItems: 'center' }}><SearchSVG /></span>
                        </div>
                        <button style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><DownloadSVG /></button>
                    </div>
                    {/* Account items */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, background: '#eff6ff', cursor: 'pointer' }}>
                            <PersonSVG />
                            <span style={{ color: '#374151', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>NextGen PNG(Stock8/Total8)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Collapse strip */}
            <button onClick={() => setAccountOpen(o => !o)} style={{ width: 13, background: '#e5e7eb', border: 'none', borderRight: '1px solid #d1d5db', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', flexShrink: 0, transition: 'background 0.15s' }}>
                <CollapseArrow open={accountOpen} />
            </button>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
                <Content />
            </div>
        </div>
    );
}

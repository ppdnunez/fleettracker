/* ── ReportPage.jsx ─────────────────────────────────────────── */
import { useState } from 'react';

/* ── shared sub-components ──────────────────────────────────── */
const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', background: '#f9fafb' };
const TD = { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #f1f5f9', color: '#374151' };

function Notice({ color = '#fef3c7', icon = '⚠', text }) {
    return (
        <div style={{ background: color, border: `1px solid ${color === '#fef3c7' ? '#f59e0b' : '#3b82f6'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
            <span>{icon}</span><span>{text}</span>
        </div>
    );
}

function EmptyTable({ cols }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
                <tr>{cols.map(c => <th key={c} style={TH}>{c}</th>)}</tr>
            </thead>
            <tbody>
                <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
            </tbody>
        </table>
    );
}

function SelInput({ label, type = 'select', options = [], placeholder }) {
    const [v, setV] = useState('');
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</label>
            {type === 'select' ? (
                <select value={v} onChange={e => setV(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', minWidth: 150 }}>
                    <option value="">{placeholder || 'Please select'}</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : (
                <input type={type} value={v} onChange={e => setV(e.target.value)} placeholder={placeholder}
                    style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }} />
            )}
        </div>
    );
}

function FilterBar({ children, onSearch }) {
    return (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            {children}
            <button onClick={onSearch} style={{ padding: '7px 22px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Search</button>
            <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Export</button>
        </div>
    );
}

function ChartPlaceholder({ label }) {
    return (
        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14, marginBottom: 18 }}>
            📈 {label} chart — no data
        </div>
    );
}

/* ── date range preset ────────────────────────────────────────── */
function DateDeviceFilter({ showModel, showSub }) {
    return (
        <>
            <SelInput label="Device" type="select" placeholder="Select device" />
            <SelInput label="Start date" type="date" />
            <SelInput label="End date" type="date" />
            {showModel && <SelInput label="Device Model" type="select" placeholder="All models" />}
            {showSub   && <SelInput label="Sub-account" type="select" placeholder="All accounts" />}
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  DEVICE STATISTICS PAGES                                       */
/* ══════════════════════════════════════════════════════════════ */

function InternalBattery() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Battery status" type="select" options={['Normal','Low','Critical']} />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Battery Level (%)','Status','Time','Duration']} />
        </>
    );
}

function ExternalBattery() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Voltage (V)','Status','Record Time']} />
        </>
    );
}

function FuelConsumption() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <Notice text="This report displays fuel consumption calculated from OBD data or fuel sensor." />
            <EmptyTable cols={['No.','Device name','IMEI','Start Time','End Time','Distance (km)','Fuel Used (L)','Avg Consumption (L/100km)']} />
        </>
    );
}

function CurrentFuelValue() {
    return (
        <>
            <FilterBar>
                <SelInput label="Device" type="select" placeholder="Select device" />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Current Fuel Level (L)','Fuel (%)','Last Updated']} />
        </>
    );
}

function TemperatureHumidity() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <ChartPlaceholder label="Temperature & Humidity (dual axis)" />
            <EmptyTable cols={['No.','Device name','IMEI','Temperature (°C)','Humidity (%)','Record Time']} />
        </>
    );
}

function DriverBehavior() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Event type" type="select" options={['Harsh Acceleration','Harsh Braking','Sharp Turn','Overspeed','Fatigue Driving']} />
            </FilterBar>
            <Notice text="Driver behavior events are detected based on accelerometer data." />
            <EmptyTable cols={['No.','Device name','Driver','Event Type','Value','Location','Time']} />
        </>
    );
}

function PositioningBattery() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <ChartPlaceholder label="Positioning accuracy & battery trend" />
            <EmptyTable cols={['No.','Device name','IMEI','Signal Strength','GPS Accuracy (m)','Battery (%)','Time']} />
        </>
    );
}

function Logistics() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter showModel showSub />
                <SelInput label="Status" type="select" options={['In Transit','Delivered','Idle']} />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Origin','Destination','Distance (km)','Start Time','End Time','Status']} />
        </>
    );
}

function TravelStatisticsOBD() {
    return (
        <>
            <Notice color="#dbeafe" icon="ℹ" text="This report is only available for devices with OBD support." />
            <FilterBar><DateDeviceFilter /></FilterBar>
            <ChartPlaceholder label="Travel statistics (OBD)" />
            <EmptyTable cols={['No.','Device name','IMEI','Total Distance (km)','Total Duration','Avg Speed (km/h)','Max Speed (km/h)','Trips','Date']} />
        </>
    );
}

function VehicleFaultOBD() {
    return (
        <>
            <Notice color="#dbeafe" icon="ℹ" text="This report is only available for OBD-enabled devices." />
            <FilterBar><DateDeviceFilter /></FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Fault Code','Description','Severity','Detected Time','Cleared Time']} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  MOTION STATISTICS PAGES                                       */
/* ══════════════════════════════════════════════════════════════ */

function TrackDetails() {
    return (
        <>
            <FilterBar>
                <SelInput label="Device" type="select" placeholder="Select device" />
                <SelInput label="Date" type="date" />
            </FilterBar>
            <Notice color="#dbeafe" icon="ℹ" text="Track precision depends on GPS signal quality and reporting interval settings." />
            <EmptyTable cols={['No.','Device name','IMEI','Start Time','End Time','Distance (km)','Avg Speed','Max Speed','Points']} />
        </>
    );
}

function Mileage() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Date','Daily Mileage (km)','Total Mileage (km)']} />
        </>
    );
}

function Trips() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <Notice color="#dbeafe" icon="ℹ" text="A trip is defined as movement between two ignition-off or stop events lasting more than 5 minutes." />
            <EmptyTable cols={['No.','Device name','IMEI','Trip #','Start Time','End Time','Start Location','End Location','Distance (km)','Duration']} />
        </>
    );
}

function Overspeed() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Speed limit (km/h)" type="number" placeholder="e.g. 120" />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Speed (km/h)','Limit (km/h)','Duration','Location','Time']} />
        </>
    );
}

function Parking() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Min. duration (min)" type="number" placeholder="e.g. 10" />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Start Time','End Time','Duration','Location','Latitude','Longitude']} />
        </>
    );
}

function Idling() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Min. idle (min)" type="number" placeholder="e.g. 5" />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Start Time','End Time','Idle Duration','Location','Fuel Wasted (L)']} />
        </>
    );
}

function Ignition() {
    return (
        <>
            <FilterBar><DateDeviceFilter /></FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Event','Time','Location','Odometer (km)']} />
        </>
    );
}

function GeoFence() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter />
                <SelInput label="Geo-fence" type="select" placeholder="Select fence" />
                <SelInput label="Event" type="select" options={['Enter','Exit','Both']} />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','Fence Name','Event','Time','Location']} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  STATE STATISTICS                                              */
/* ══════════════════════════════════════════════════════════════ */
function StateStatistics() {
    return (
        <>
            <FilterBar>
                <DateDeviceFilter showModel showSub />
                <SelInput label="State" type="select" options={['Online','Offline','Moving','Parked','No GPS']} />
            </FilterBar>
            <EmptyTable cols={['No.','Device name','IMEI','State','Duration','Start Time','End Time','Location']} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  STATE STATISTICS — Offline / Online                           */
/* ══════════════════════════════════════════════════════════════ */
function AccountFilterBar() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <select style={{ padding: '7px 32px 7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', minWidth: 200, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23999\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                <option>NextGen PNG(Stock8/Total8)</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" style={{ accentColor: '#3b82f6' }} /> Sub-account devices
            </label>
            <button style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/></svg>Search
            </button>
            <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Export</button>
                <button style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Print</button>
                <button style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="4" height="4" rx="1"/><rect x="6" y="1" width="4" height="4" rx="1"/><rect x="11" y="1" width="2" height="4" rx="0.5"/><rect x="1" y="7" width="4" height="4" rx="1"/><rect x="6" y="7" width="4" height="4" rx="1"/><rect x="11" y="7" width="2" height="4" rx="0.5"/></svg>▾
                </button>
            </div>
        </div>
    );
}

function OfflinePage() {
    return (
        <>
            <AccountFilterBar />
            <EmptyTable cols={['No.','Device Name','IMEI','Model','Account','SIM','Phone','Offline reason','Offline Duration','Offline duration (original data)','Offline Time','Coordinates','Alert address']} />
        </>
    );
}

function OnlinePage() {
    return (
        <>
            <AccountFilterBar />
            <EmptyTable cols={['No.','Device Name','IMEI','Model','Account','SIM','Phone','Coordinates','Alert address']} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  ALERT STATISTICS                                              */
/* ══════════════════════════════════════════════════════════════ */
function AlertDetails() {
    const today = new Date().toISOString().slice(0,10);
    return (
        <div>
            {/* Filter row 1 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>Alert Time :</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: '#374151' }}>
                    <span>{today} 00:00:00</span><span style={{ color: '#9ca3af' }}>-</span><span>{today} {new Date().toTimeString().slice(0,8)}</span>
                    <span style={{ color: '#9ca3af', fontSize: 14 }}>📅</span>
                </div>
                <span style={{ fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>Position Time :</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: '#9ca3af' }}>
                    <span>Start Date</span><span>-</span><span>End Date</span>
                    <span style={{ fontSize: 14 }}>📅</span>
                </div>
                <select style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 180 }}>
                    <option>NextGen PNG(Stock8/Total8)</option>
                </select>
                <select style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', minWidth: 150 }}>
                    <option value="">Select device</option>
                </select>
            </div>
            {/* Filter row 2 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option>All Models</option>
                </select>
                <select style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option>All Status</option>
                </select>
                <select style={{ padding: '7px 28px 7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
                    <option>All alert types</option>
                    <option>Overspeed</option><option>Geo-fence</option><option>SOS</option>
                    <option>Low Battery</option><option>Harsh Driving</option><option>Power Cut</option>
                </select>
                <button style={{ padding: '7px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="5.5" cy="5.5" r="4"/><line x1="9" y1="9" x2="12" y2="12"/></svg>Search
                </button>
                <button style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Reset</button>
            </div>
            {/* Action row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <button style={{ padding: '6px 16px', border: '1px solid #3b82f6', borderRadius: 6, background: '#fff', color: '#3b82f6', fontSize: 13, cursor: 'pointer' }}>Processing</button>
                <button style={{ padding: '6px 14px', border: '1px solid #3b82f6', borderRadius: 6, background: '#fff', color: '#3b82f6', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="5.5"/><line x1="1.5" y1="6.5" x2="11.5" y2="6.5"/><path d="M4 3 Q6.5 1 9 3"/><path d="M4 10 Q6.5 12 9 10"/></svg>
                    Parse Address
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Export</button>
                    <button style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Mark all read</button>
                    <button style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Print</button>
                    <button style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="4" height="4" rx="1"/><rect x="6" y="1" width="4" height="4" rx="1"/><rect x="11" y="1" width="2" height="4" rx="0.5"/><rect x="1" y="7" width="4" height="4" rx="1"/><rect x="6" y="7" width="4" height="4" rx="1"/><rect x="11" y="7" width="2" height="4" rx="0.5"/></svg>▾
                    </button>
                </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
                    <thead>
                        <tr>
                            <th style={{ ...TH, width: 36 }}><input type="checkbox" /></th>
                            {['No.','Device Name','IMEI','Model','Account','Alert Type','Alert Time','Position Time','Speed (km/h)','Coordinates','Alert address','Positioning Status','Processing Status','Processing Time','Read Status'].map(c => (
                                <th key={c} style={TH}>{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colSpan={16} style={{ ...TD, textAlign: 'center', padding: 48, color: '#94a3b8' }}>No data</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════ */
/*  PAGE MAP                                                      */
/* ══════════════════════════════════════════════════════════════ */
const PAGES = {
    'Internal Battery':              InternalBattery,
    'External Battery':              ExternalBattery,
    'Fuel Consumption':              FuelConsumption,
    'Current fuel Value':            CurrentFuelValue,
    'Temperature & Humidity':        TemperatureHumidity,
    'Driver Behavior':               DriverBehavior,
    'Positioning & Battery':         PositioningBattery,
    'Logistics':                     Logistics,
    'Travel statistics (OBD)':       TravelStatisticsOBD,
    'Vehicle fault statistics (OBD)':VehicleFaultOBD,
    'Track Details':                 TrackDetails,
    'Mileage':                       Mileage,
    'Trips':                         Trips,
    'Overspeed':                     Overspeed,
    'Parking':                       Parking,
    'Idling':                        Idling,
    'Ignition':                      Ignition,
    'Geo Fence':                     GeoFence,
    'State Statistics':              StateStatistics,
    'Offline':                       OfflinePage,
    'Online':                        OnlinePage,
    'Alert Details':                 AlertDetails,
};

/* ══════════════════════════════════════════════════════════════ */
/*  ROOT EXPORT                                                   */
/* ══════════════════════════════════════════════════════════════ */
export default function ReportPage({ reportSection }) {
    const Content = PAGES[reportSection] || (() => (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>Select a report from the sidebar.</div>
    ));

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{reportSection || 'Report'}</h2>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <Content />
            </div>
        </div>
    );
}

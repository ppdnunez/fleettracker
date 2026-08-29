import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { api } from '../api.js';
import { traccarSocketUrl, InsecureSocketError } from '../traccarSocketUrl.js';

// Eager: the shell, and the live map that the dashboard opens on. Everything
// here is on screen within the first paint, so deferring it would only add a
// round trip.
import Sidebar          from '../components/Sidebar.jsx';
import DeviceList       from '../components/DeviceList.jsx';
import MapCanvas        from '../components/MapCanvas.jsx';
import TopBar           from '../components/TopBar.jsx';
import AppHeader        from '../components/AppHeader.jsx';
import LogoutModal      from '../components/LogoutModal.jsx';
import SosAlertStack    from '../components/SosAlertStack.jsx';
import { DEFAULT_REPORT_SECTION } from '../components/reportSections.js';
import { FLEET_PAGE_TITLES } from '../components/fleetPages.js';

// Lazy: one chunk per page, fetched the first time the operator opens it.
// Statically importing these put all of them - Reports and Fleet alone are
// close to 5,500 lines - into the bundle the browser has to parse before the
// map can render, which is most of what made the first load slow.
const VideoMode              = lazy(() => import('../components/VideoMode.jsx'));
const DeviceManagement       = lazy(() => import('../components/DeviceManagement.jsx'));
const ReportPage             = lazy(() => import('../components/ReportPage.jsx'));
const FleetPage              = lazy(() => import('../components/FleetPage.jsx'));
const GeofencePage           = lazy(() => import('../components/GeofencePage.jsx'));
const SimDataManagementPage  = lazy(() => import('../components/SimDataManagementPage.jsx'));
const AlertRecipientsPage    = lazy(() => import('../components/AlertRecipientsPage.jsx'));
const FuelThresholdsPage     = lazy(() => import('../components/FuelThresholdsPage.jsx'));
const FaceLogsPage           = lazy(() => import('../components/FaceLogsPage.jsx'));
const MediaGalleryPage       = lazy(() => import('../components/MediaGalleryPage.jsx'));
const CompanyManagementPage  = lazy(() => import('../components/CompanyManagementPage.jsx'));
const NotificationPage       = lazy(() => import('../components/NotificationPage.jsx'));
const CalendarPage           = lazy(() => import('../components/CalendarPage.jsx'));
const ComputedAttributePage  = lazy(() => import('../components/ComputedAttributePage.jsx'));
const MaintenancePage        = lazy(() => import('../components/MaintenancePage.jsx'));
const SavedCommandPage       = lazy(() => import('../components/SavedCommandPage.jsx'));
const CommandPage            = lazy(() => import('../components/CommandPage.jsx'));
const GroupPage              = lazy(() => import('../components/GroupPage.jsx'));
const DriverPage             = lazy(() => import('../components/DriverPage.jsx'));

/** Shown while a page chunk is on its way. */
function PageLoading() {
    return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#64748b', fontSize: 14 }}>
            Loading…
        </div>
    );
}

/* Traccar's device/position shape -> the shape DeviceList/MapCanvas/TopBar already expect,
   plus the raw Traccar fields (groupId, phone, model, ...) EditDeviceModal needs to edit a device. */
function normalizeLiveDevice(device, positionsByDeviceId) {
    const pos = positionsByDeviceId[device.id];
    return {
        id:      device.id,
        name:    device.name,
        tracker: device.model || device.uniqueId,
        imei:    device.uniqueId,
        status:  device.status === 'online' ? 'ONLINE' : 'OFFLINE',
        lat:     pos ? pos.latitude  : null,
        lng:     pos ? pos.longitude : null,
        // State the map label and the device list show as icons. Undefined rather than a default,
        // so "not reported by this protocol" stays distinguishable from "off" / "no alarm".
        ignition: pos?.attributes?.ignition ?? null,
        alarm:    pos?.attributes?.alarm ?? null,
        battery:  pos?.attributes?.batteryLevel ?? null,
        charging: pos?.attributes?.charge ?? null,
        groupId:        device.groupId,
        calendarId:     device.calendarId,
        phone:          device.phone,
        model:          device.model,
        contact:        device.contact,
        category:       device.category,
        disabled:       device.disabled,
        expirationTime: device.expirationTime,
        attributes:     device.attributes,
    };
}

// Merge a Traccar websocket {"positions": [...]} push into existing device list
function applyLivePositions(devices, positions) {
    const byDeviceId = {};
    for (const p of positions) byDeviceId[p.deviceId] = p;
    return devices.map(d => {
        const p = byDeviceId[d.id];
        if (!p) return d;
        return {
            ...d,
            lat:    p.latitude,
            lng:    p.longitude,
            // Read straight off the new fix, including clearing an alarm the previous one carried:
            // an alarm that never went away would be worse than not showing one at all.
            ignition: p.attributes?.ignition ?? null,
            alarm:    p.attributes?.alarm ?? null,
            battery:  p.attributes?.batteryLevel ?? null,
            charging: p.attributes?.charge ?? null,
        };
    });
}

// Merge a Traccar websocket {"devices": [...]} push (device attribute changes) into existing device list
function applyLiveDevices(devices, updates) {
    const byId = {};
    for (const u of updates) byId[u.id] = u;
    return devices.map(d => {
        const u = byId[d.id];
        if (!u) return d;
        return {
            ...d,
            name:    u.name,
            tracker: u.model || u.uniqueId,
            imei:    u.uniqueId,
            status:  u.status === 'online' ? 'ONLINE' : 'OFFLINE',
            groupId:        u.groupId,
            calendarId:     u.calendarId,
            phone:          u.phone,
            model:          u.model,
            contact:        u.contact,
            category:       u.category,
            disabled:       u.disabled,
            expirationTime: u.expirationTime,
            attributes:     u.attributes,
        };
    });
}

export default function Dashboard({ user, onLogout }) {
    const [search,         setSearch]         = useState('');
    // Lands on the Fleet cockpit. 'Dashboard' is the Device Map & Video page, which is currently
    // kept out of the nav — still routable (the SOS card's "Show on map" goes there), just not
    // where a session starts.
    const [page,           setPage]           = useState('Fleet');
    const [showLogout,     setShowLogout]      = useState(false);
    const [mapMode,        setMapMode]        = useState('Map');
    const [panelOpen,      setPanelOpen]      = useState(true);
    const [sidebarOpen,    setSidebarOpen]    = useState(true);
    const [reportSection,  setReportSection]  = useState(DEFAULT_REPORT_SECTION);
    const [fleetPage,      setFleetPage]      = useState('Dashboard');

    // Live Traccar data (Device Management + Device Map & Video) — initial load via REST,
    // then kept live via Traccar's own websocket (see effect below).
    const [liveDevices, setLiveDevices] = useState([]);
    const [liveSelected, setLiveSelected] = useState(null);
    const [liveLoading, setLiveLoading] = useState(true);
    // Live SOS alerts and the ids already acknowledged, so a socket reconnect cannot resurrect one.
    const [sosAlerts, setSosAlerts] = useState([]);
    const acknowledgedSosRef = useRef(new Set());
    const wsRef = useRef(null);
    const wsReconnectRef = useRef(null);

    const fetchLiveDevices = async () => {
        try {
            const [devicesRes, positionsRes] = await Promise.all([
                api.getTraccarDevices(),
                api.getLatestPositions(),
            ]);
            const positionsByDeviceId = {};
            for (const p of positionsRes.data) positionsByDeviceId[p.deviceId] = p;
            const normalized = devicesRes.data.map(d => normalizeLiveDevice(d, positionsByDeviceId));
            setLiveDevices(normalized);
            setLiveSelected(curr => curr ?? normalized[0]?.id ?? null);
        } catch (e) {
            console.error('Failed to load Traccar devices:', e);
        } finally {
            setLiveLoading(false);
        }
    };

    useEffect(() => {
        fetchLiveDevices();
    }, []);

    /**
     * Turns Traccar's live event push into SOS alerts.
     *
     * Kept in a ref so the websocket effect can call it without re-subscribing whenever the device
     * list changes — reconnecting the socket on every position update would be a lot of churn for
     * a lookup that only needs the current names.
     *
     * De-duplicated on the Traccar event id: the socket can redeliver on reconnect, and an
     * acknowledged panic button must not reappear because of it.
     */
    const liveDevicesRef = useRef([]);
    liveDevicesRef.current = liveDevices;

    // Mirrors the alert list so the de-duplication can happen outside the state updater — an
    // updater that fired network requests would fire them twice under React's dev double-invoke.
    const sosAlertsRef = useRef([]);
    sosAlertsRef.current = sosAlerts;

    /**
     * Replaces the device's last known fix with the one the SOS was actually raised at.
     *
     * The websocket event carries a positionId and no coordinates, so the exact spot has to be read
     * back over REST. Until it arrives the card shows the device's most recent position, which is
     * usually the same place and is better than showing nothing while the request is in flight; a
     * failure just leaves that fallback in place.
     */
    const resolveSosPosition = async (key, positionId) => {
        try {
            const { data } = await api.getPositionById(positionId);
            if (data?.latitude == null) return;

            setSosAlerts(list => list.map(a => a.key === key ? {
                ...a,
                lat:     data.latitude,
                lng:     data.longitude,
                address: data.address || a.address,
                speed:   data.speed != null ? data.speed * 1.852 : a.speed, // knots -> km/h
                exact:   true,
            } : a));
        } catch {
            /* keep the last known fix */
        }
    };

    const handleLiveEvents = (events) => {
        const sos = events.filter(e => e.type === 'alarm' && e.attributes?.alarm === 'sos');
        if (sos.length === 0) return;

        // Already on screen, or already acknowledged — a socket reconnect redelivers events, and a
        // panic button somebody has dealt with must not come back.
        const seen = new Set([
            ...sosAlertsRef.current.map(a => a.key),
            ...acknowledgedSosRef.current,
        ]);

        const added = [];
        for (const e of sos) {
            const key = String(e.id);
            if (seen.has(key)) continue;
            seen.add(key);

            const device = liveDevicesRef.current.find(d => d.id === e.deviceId);
            added.push({
                key,
                deviceId:   e.deviceId,
                deviceName: device?.name || `Device #${e.deviceId}`,
                imei:       device?.imei || null,
                lat:        device?.lat ?? null,
                lng:        device?.lng ?? null,
                address:    null,
                speed:      null,
                // False until the event's own fix has been read back, so the card can say whether
                // the coordinates are where the button was pressed or merely where the vehicle
                // last reported from.
                exact:      false,
                positionId: e.positionId ?? null,
                time:       new Date(e.eventTime || Date.now()).toLocaleString(),
            });
        }

        if (added.length === 0) return;

        setSosAlerts(current => [...added, ...current]);
        added.forEach(a => a.positionId && resolveSosPosition(a.key, a.positionId));
    };

    const dismissSos = (key) => {
        // Remembered rather than just removed, so a websocket redelivery cannot resurrect an alert
        // somebody has already dealt with.
        acknowledgedSosRef.current.add(key);
        setSosAlerts(list => list.filter(a => a.key !== key));
    };

    const locateSos = (alert) => {
        setPage('Dashboard');
        setLiveSelected(alert.deviceId);
    };

    // Open Traccar's websocket directly from the browser for live position/device updates.
    // Auth mirrors the REST API: a short-lived Traccar bearer token is minted server-side
    // (GET /api/traccar/ws-token, behind auth:sanctum) and handed to the browser, which passes
    // it as ?token=... on the websocket URL — the Traccar admin password never reaches the browser.
    useEffect(() => {
        let cancelled = false;

        const connect = async () => {
            try {
                const { data } = await api.getWsToken();
                if (cancelled) return;

                const ws = new WebSocket(traccarSocketUrl(data));
                wsRef.current = ws;

                ws.onmessage = (evt) => {
                    let msg;
                    try { msg = JSON.parse(evt.data); } catch { return; }
                    if (msg.positions) setLiveDevices(ds => applyLivePositions(ds, msg.positions));
                    if (msg.devices)   setLiveDevices(ds => applyLiveDevices(ds, msg.devices));
                    if (msg.events)    handleLiveEvents(msg.events);
                };

                ws.onclose = () => {
                    if (!cancelled) wsReconnectRef.current = setTimeout(connect, 3000);
                };
                ws.onerror = () => ws.close();
            } catch (e) {
                console.error('Failed to open Traccar websocket:', e);
                // Mixed content is permanent for this page load - retrying only re-mints tokens.
                if (cancelled || e instanceof InsecureSocketError) return;
                wsReconnectRef.current = setTimeout(connect, 3000);
            }
        };

        connect();

        return () => {
            cancelled = true;
            clearTimeout(wsReconnectRef.current);
            wsRef.current?.close();
        };
    }, []);

    const filtered       = liveDevices.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.tracker || '').toLowerCase().includes(search.toLowerCase())
    );
    const onlineCount    = liveDevices.filter(d => d.status === 'ONLINE').length;
    const selectedDevice = liveDevices.find(d => d.id === liveSelected);

    // What the header calls the current page. Reports and Fleet both route through a single `page`
    // value, so each names its own sub-page rather than showing the group.
    const headerTitle = page === 'Report' ? (reportSection || 'Report')
        : page === 'Fleet' ? (FLEET_PAGE_TITLES[fleetPage] || 'Fleet')
        : page;

    return (
        // Shell background: darker than the panels it holds, so a page reads as sitting on top of
        // the shell rather than merging into it.
        <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter,system-ui,sans-serif', background: '#080d18', overflow: 'hidden' }}>
            <Sidebar
                page={page}
                setPage={setPage}
                onLogoutClick={() => setShowLogout(true)}
                open={sidebarOpen}
                onToggle={() => setSidebarOpen(o => !o)}
                reportSection={reportSection}
                setReportSection={setReportSection}
                fleetPage={fleetPage}
                setFleetPage={setFleetPage}
                user={user}
            />

            {/* Above every page, not just the map: an SOS has to be seen whatever the operator is
                looking at. */}
            <SosAlertStack alerts={sosAlerts} onDismiss={dismissSos} onLocate={locateSos} />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <AppHeader user={user} title={headerTitle} />
                <Suspense fallback={<PageLoading />}>
                {page === 'Device Management' ? (
                    <DeviceManagement devices={liveDevices} loading={liveLoading} onRefresh={fetchLiveDevices} />
                ) : page === 'Sim Data Management' ? (
                    <SimDataManagementPage />
                ) : page === 'Alert Recipients' ? (
                    <AlertRecipientsPage />
                ) : page === 'Fuel Thresholds' ? (
                    <FuelThresholdsPage />
                ) : page === 'Face Logs' ? (
                    <FaceLogsPage />
                ) : page === 'Media Gallery' ? (
                    <MediaGalleryPage />
                ) : page === 'Companies' ? (
                    <CompanyManagementPage user={user} />
                ) : page === 'Geofence' ? (
                    <GeofencePage onBack={() => setPage('Dashboard')} />
                ) : page === 'Notification' ? (
                    <NotificationPage />
                ) : page === 'Calendars' ? (
                    <CalendarPage />
                ) : page === 'Computed Attributes' ? (
                    <ComputedAttributePage />
                ) : page === 'Maintenance' ? (
                    <MaintenancePage />
                ) : page === 'Command' ? (
                    <CommandPage />
                ) : page === 'Saved Commands' ? (
                    <SavedCommandPage />
                ) : page === 'Groups' ? (
                    <GroupPage />
                ) : page === 'Drivers' ? (
                    <DriverPage />
                ) : page === 'Report' ? (
                    <ReportPage reportSection={reportSection} setReportSection={setReportSection} />
                ) : page === 'Fleet' ? (
                    <FleetPage fleetPage={fleetPage} setFleetPage={setFleetPage} />
                ) : (
                    <>
                        <TopBar
                            onlineCount={onlineCount}
                            total={liveDevices.length}
                            mapMode={mapMode}
                            setMapMode={setMapMode}
                            selectedDevice={selectedDevice}
                        />
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            <DeviceList
                                devices={filtered}
                                selected={liveSelected}
                                onSelect={setLiveSelected}
                                search={search}
                                setSearch={setSearch}
                                loading={liveLoading}
                                open={panelOpen}
                                onToggle={() => setPanelOpen(o => !o)}
                            />

                            {mapMode === 'Video' ? (
                                <VideoMode selectedDevice={selectedDevice} />
                            ) : (
                                <MapCanvas
                                    devices={liveDevices}
                                    selected={liveSelected}
                                    onSelect={setLiveSelected}
                                    selectedDevice={selectedDevice}
                                    mapMode={mapMode}
                                />
                            )}
                        </div>
                    </>
                )}
                </Suspense>
            </div>

            {showLogout && <LogoutModal onCancel={() => setShowLogout(false)} onConfirm={onLogout} />}
        </div>
    );
}

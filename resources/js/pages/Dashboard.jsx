import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import Sidebar          from '../components/Sidebar.jsx';
import DeviceList       from '../components/DeviceList.jsx';
import MapCanvas        from '../components/MapCanvas.jsx';
import VideoMode        from '../components/VideoMode.jsx';
import TopBar           from '../components/TopBar.jsx';
import LogoutModal      from '../components/LogoutModal.jsx';
import DeviceManagement from '../components/DeviceManagement.jsx';
import ReportPage       from '../components/ReportPage.jsx';
import FleetPage        from '../components/FleetPage.jsx';

export default function Dashboard({ user, onLogout }) {
    const [devices,        setDevices]        = useState([]);
    const [selected,       setSelected]       = useState(null);
    const [search,         setSearch]         = useState('');
    const [page,           setPage]           = useState('Dashboard');
    const [showLogout,     setShowLogout]      = useState(false);
    const [mapMode,        setMapMode]        = useState('Map');
    const [loading,        setLoading]        = useState(true);
    const [panelOpen,      setPanelOpen]      = useState(true);
    const [sidebarOpen,    setSidebarOpen]    = useState(true);
    const [reportSection,  setReportSection]  = useState('Internal Battery');
    const [fleetPage,      setFleetPage]      = useState('Dashboard');
    const pollRef = useRef(null);

    const fetchDevices = async () => {
        try {
            const res = await api.getDevices();
            setDevices(res.data);
            if (!selected && res.data.length > 0) setSelected(res.data[0].id);
        } catch (e) {
            console.error('Failed to load devices:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
        pollRef.current = setInterval(fetchDevices, 5000);
        return () => clearInterval(pollRef.current);
    }, []);

    const filtered       = devices.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.tracker || '').toLowerCase().includes(search.toLowerCase())
    );
    const onlineCount    = devices.filter(d => d.status === 'ONLINE').length;
    const selectedDevice = devices.find(d => d.id === selected);

    return (
        <div style={{ display: 'flex', height: '100vh', fontFamily: 'Inter,system-ui,sans-serif', background: '#f1f5f9', overflow: 'hidden' }}>
            <Sidebar
                user={user}
                page={page}
                setPage={setPage}
                onLogoutClick={() => setShowLogout(true)}
                open={sidebarOpen}
                onToggle={() => setSidebarOpen(o => !o)}
                reportSection={reportSection}
                setReportSection={setReportSection}
                fleetPage={fleetPage}
                setFleetPage={setFleetPage}
            />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {page === 'Device Management' ? (
                    <DeviceManagement devices={devices} loading={loading} onRefresh={fetchDevices} />
                ) : page === 'Report' ? (
                    <ReportPage reportSection={reportSection} setReportSection={setReportSection} />
                ) : page === 'Fleet' ? (
                    <FleetPage fleetPage={fleetPage} setFleetPage={setFleetPage} />
                ) : (
                    <>
                        <TopBar
                            onlineCount={onlineCount}
                            total={devices.length}
                            mapMode={mapMode}
                            setMapMode={setMapMode}
                            selectedDevice={selectedDevice}
                        />
                        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            <DeviceList
                                devices={filtered}
                                selected={selected}
                                onSelect={setSelected}
                                search={search}
                                setSearch={setSearch}
                                loading={loading}
                                open={panelOpen}
                                onToggle={() => setPanelOpen(o => !o)}
                            />

                            {mapMode === 'Video' ? (
                                <VideoMode selectedDevice={selectedDevice} />
                            ) : (
                                <MapCanvas
                                    devices={devices}
                                    selected={selected}
                                    onSelect={setSelected}
                                    selectedDevice={selectedDevice}
                                    mapMode={mapMode}
                                />
                            )}
                        </div>
                    </>
                )}
            </div>

            {showLogout && <LogoutModal onCancel={() => setShowLogout(false)} onConfirm={onLogout} />}
        </div>
    );
}

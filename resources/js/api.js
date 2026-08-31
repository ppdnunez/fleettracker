import axios from 'axios';

/**
 * The Traccar device list, fetched once and shared.
 *
 * Close to forty places call getTraccarDevices() on mount — every report section, every device
 * picker, the dashboard — and each one was its own request. Measured on 2026-08-31, a call costs
 * two network round trips to the Traccar box (344ms each way, 688ms end to end) to return about
 * two kilobytes that barely changes. Opening three report tabs paid that three times over.
 *
 * Two things are shared here. The in-flight promise, so callers that mount together make one
 * request between them rather than one each; and the resolved answer for DEVICE_CACHE_MS
 * afterwards, so moving between pages is instant.
 *
 * Each caller gets its own copy of the array. Components put this straight into state and some
 * sort it, which sorts in place — handing every caller the same array would let one page reorder
 * another's list. Copying a handful of devices costs nothing next to the request it replaces.
 */
const DEVICE_CACHE_MS = 30000;

let devicesInFlight = null;
let devicesCache    = null; // { at: epoch ms, response }

/**
 * Drops the cached list. Called whenever the answer could have changed: a device registered or
 * edited, and on any change of token — a different sign-in may be a different tenant, and one
 * tenant must never be handed the list another one fetched.
 */
export function invalidateDevices() {
    devicesInFlight = null;
    devicesCache    = null;
}

function copyOf(res) {
    return { ...res, data: Array.isArray(res.data) ? [...res.data] : res.data };
}

function fetchTraccarDevices() {
    if (devicesCache && Date.now() - devicesCache.at < DEVICE_CACHE_MS) {
        return Promise.resolve(copyOf(devicesCache.response));
    }

    if (!devicesInFlight) {
        devicesInFlight = axios.get('/api/traccar/devices')
            .then(res => {
                devicesCache = { at: Date.now(), response: res };
                return res;
            })
            .finally(() => { devicesInFlight = null; });
    }

    return devicesInFlight.then(copyOf);
}

export function setAuthToken(token) {
    // A token change may be a different person, and on a shared machine a different tenant.
    invalidateDevices();

    if (token) {
        localStorage.setItem('fleet_token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        localStorage.removeItem('fleet_token');
        delete axios.defaults.headers.common['Authorization'];
    }
}

export const api = {
    login:   (email, password) => axios.post('/api/login', { email, password }),
    logout:  ()                => axios.post('/api/logout'),
    me:      ()                => axios.get('/api/user'),

    // Companies (tenants) and the logins inside them. Company endpoints are platform-admin only;
    // the user endpoints also accept a company's own client_admin, scoped to that company.
    getCompanies:       ()             => axios.get('/api/companies'),
    createCompany:      (data)         => axios.post('/api/companies', data),
    updateCompany:      (id, data)     => axios.put(`/api/companies/${id}`, data),
    deleteCompany:      (id)           => axios.delete(`/api/companies/${id}`),
    getCompanyDevices:  (id)           => axios.get(`/api/companies/${id}/devices`),
    repairCompany:      (id, password) => axios.post(`/api/companies/${id}/repair`, { traccar_password: password }),
    getCompanyUsers:    (id)           => axios.get(`/api/companies/${id}/users`),
    createCompanyUser:  (id, data)     => axios.post(`/api/companies/${id}/users`, data),
    updateCompanyUser:  (id, uid, data)=> axios.put(`/api/companies/${id}/users/${uid}`, data),
    deleteCompanyUser:  (id, uid)      => axios.delete(`/api/companies/${id}/users/${uid}`),

    getDevices:   ()          => axios.get('/api/devices'),
    createDevice: (data)      => axios.post('/api/devices', data),
    updateDevice: (id, data)  => axios.put(`/api/devices/${id}`, data),
    deleteDevice: (id)        => axios.delete(`/api/devices/${id}`),

    getFleetDrivers:    ()         => axios.get('/api/drivers'),
    createFleetDriver:  (data)     => axios.post('/api/drivers', data),
    updateFleetDriver:  (id, data) => axios.put(`/api/drivers/${id}`, data),
    deleteFleetDriver:  (id)       => axios.delete(`/api/drivers/${id}`),

    // Work-zone rules — the local geofence module (Vehicle Track > Work-zone Rules).
    // Distinct from getGeofences() below, which reads Traccar's own geofences: those are what the
    // Geo Fence report and the device Connections modal key off. Work-zones are local because each
    // device link carries an alert direction Traccar cannot store.
    getWorkZones:              ()              => axios.get('/api/geofences'),
    createWorkZone:            (data)          => axios.post('/api/geofences', data),
    updateWorkZone:            (id, data)      => axios.put(`/api/geofences/${id}`, data),
    deleteWorkZone:            (id)            => axios.delete(`/api/geofences/${id}`),
    linkWorkZoneDevice:        (id, imei, dir) => axios.post(`/api/geofences/${id}/devices`, { imei, alert_direction: dir || 'both' }),
    unlinkWorkZoneDevice:      (id, imei)      => axios.delete(`/api/geofences/${id}/devices/${imei}`),
    setWorkZoneDeviceDirection:(id, imei, dir) => axios.put(`/api/geofences/${id}/devices/${imei}`, { alert_direction: dir }),

    // Vehicle registry, its per-IMEI settings, and driver assignment.
    getVehicles:        ()          => axios.get('/api/vehicles'),
    createVehicle:      (data)      => axios.post('/api/vehicles', data),
    updateVehicle:      (id, data)  => axios.put(`/api/vehicles/${id}`, data),
    deleteVehicle:      (id)        => axios.delete(`/api/vehicles/${id}`),
    getVehicleSettings: ()          => axios.get('/api/vehicle-settings'),
    getVehicleSetting:  (imei)      => axios.get(`/api/vehicle-settings/${imei}`),
    setVehicleSetting:  (imei, data)=> axios.put(`/api/vehicle-settings/${imei}`, data),
    getVehicleDrivers:  (imei)      => axios.get(`/api/vehicle-drivers/${imei}`),
    setVehicleDrivers:  (imei, ids) => axios.put(`/api/vehicle-drivers/${imei}`, { driverIds: ids }),

    // Face enrolment. Every mutating call relays an EVENTSET command to the device via Traccar;
    // results come back later on the device webhooks, so an OK here means "accepted", not "done".
    getDriverFaces:      (params)        => axios.get('/api/face', { params }),
    enrollFace:          (driverId, imei)=> axios.post('/api/face/enroll', { driver_id: driverId, imei }),
    captureFace:         (formData)      => axios.post('/api/face/capture', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    downloadFaceBatch:   (imei, ids)     => axios.post('/api/face/download', { imei, driver_ids: ids }),
    fetchFacePhoto:      (driverId, imei)=> axios.post('/api/face/fetch-photo', { driver_id: driverId, imei }),
    testFaceRecognition: (imei)          => axios.post('/api/face/test', { imei }),
    checkFaceRoster:     (imei)          => axios.post('/api/face/roster', { imei }),
    setFaceUploadUrl:    (imei, url)     => axios.post('/api/face/upload-url', { imei, url }),
    deleteFace:          (driverId, imei)=> axios.delete('/api/face', { data: { driver_id: driverId, imei } }),
    getFaceImportLogs:   (params)        => axios.get('/api/face/import-logs', { params }),
    getFaceUploadLogs:   (params)        => axios.get('/api/face/upload-logs', { params }),
    getFaceRawLog:       (params)        => axios.get('/api/face/raw-log',     { params }),
    // Everything in public/img/uploads — face templates plus device stills and clips.
    getMediaFiles:       (params)        => axios.get('/api/media', { params }),

    // Who receives each alert email. getAlertChannels() reports whether the pipeline can actually
    // deliver — this app's mailer, and Traccar (which raises the geofence/fuel/alarm events).
    getAlertRecipients:   ()         => axios.get('/api/alert-recipients'),
    createAlertRecipient: (data)     => axios.post('/api/alert-recipients', data),
    updateAlertRecipient: (id, data) => axios.put(`/api/alert-recipients/${id}`, data),
    deleteAlertRecipient: (id)       => axios.delete(`/api/alert-recipients/${id}`),
    getAlertChannels:     ()         => axios.get('/api/alert-recipients/channels'),

    getVehicleMaintenances:   ()         => axios.get('/api/vehicle-maintenances'),
    // imei => { km, source, fixTime } for every visible device, so the maintenance form can anchor
    // a due odometer to the reading it will actually be compared against.
    getMaintenanceOdometers:  ()         => axios.get('/api/vehicle-maintenances/odometers'),
    createVehicleMaintenance: (data)     => axios.post('/api/vehicle-maintenances', data),
    updateVehicleMaintenance: (id, data) => axios.put(`/api/vehicle-maintenances/${id}`, data),
    deleteVehicleMaintenance: (id)       => axios.delete(`/api/vehicle-maintenances/${id}`),

    getTraccarDevices:    ()             => fetchTraccarDevices(),
    createTraccarDevice:  (data)         => axios.post('/api/traccar/devices', data).then(res => { invalidateDevices(); return res; }),
    updateTraccarDevice:  (id, data)     => axios.put(`/api/traccar/devices/${id}`, data).then(res => { invalidateDevices(); return res; }),
    getTraccarGroups:     ()             => axios.get('/api/traccar/groups'),
    getTraccarCalendars:  ()             => axios.get('/api/traccar/calendars'),
    getLatestPositions:   ()             => axios.get('/api/traccar/positions'),
    // The fix a specific event was raised at, by position id (websocket events carry the id only).
    getPositionById:      (id)           => axios.get(`/api/traccar/positions/${id}`),
    getWsToken:           ()             => axios.get('/api/traccar/ws-token'),
    // Raw device text command (iButton + driving-behaviour panels). `channel` is 'auto' (data
    // connection, retried over SMS only if Traccar rejects it), 'gprs', or 'sms'.
    sendDeviceCommand: (imei, command, channel = 'auto') =>
        axios.post('/api/traccar/devices/sms-command', { imei, command, channel }),
    // The Command module. Sending only tells you Traccar accepted the command; the device's own
    // reply lands later, so getDeviceCommandResult() is polled until the row settles.
    getDeviceCommands:      (params) => axios.get('/api/device-commands', { params }),
    sendDeviceCommandV2:    (data)   => axios.post('/api/device-commands', data),
    getDeviceCommandResult: (id)     => axios.get(`/api/device-commands/${id}`),
    deleteDeviceCommand:    (id)     => axios.delete(`/api/device-commands/${id}`),
    getAlertEvents:       (params)       => axios.get('/api/traccar/reports/events', { params }),
    // Temperature / humidity and tyre (TPMS). Readings are position attributes that arrive on their
    // own packets, so /current walks history back for the newest real value and returns its age.
    // Engine data off the OBD-II / CAN bus. Same shape as the sensor calls, and for the same
    // reason: these are position attributes that arrive on their own frames.
    getObdCurrent:        (params)       => axios.get('/api/obd/current', { params }),
    getObdHistory:        (params)       => axios.get('/api/obd/history', { params }),
    getObdFaults:         (params)       => axios.get('/api/obd/faults',  { params }),

    getSensorReadings:    (params)       => axios.get('/api/sensors/current', { params }),
    getSensorHistory:     (params)       => axios.get('/api/sensors/history', { params }),
    getSensorAlarms:      (params)       => axios.get('/api/sensors/alarms',  { params }),
    // Fuel. Thresholds are Traccar attributes resolved device -> group -> server; updateFuelSettings
    // is a read-merge-write of the whole object server-side, since Traccar takes no patches.
    getFuelReadings:      (params)       => axios.get('/api/fuel/current',    { params }),
    getFuelHistory:       (params)       => axios.get('/api/fuel/history',    { params }),
    getFuelEvents:        (params)       => axios.get('/api/fuel/events',     { params }),
    getFuelTheftScan:     (params)       => axios.get('/api/fuel/theft-scan', { params }),
    getFuelSettings:      ()             => axios.get('/api/fuel/settings'),
    updateFuelSettings:   (data)         => axios.put('/api/fuel/settings', data),
    // Dashcam media recorded against alarms — file names only; retrieval is a later module.
    getVideoEvidenceReport: (params)     => axios.get('/api/traccar/reports/video-evidence', { params }),
    getBatteryReport:         (params)   => axios.get('/api/traccar/reports/battery', { params }),
    getExternalBatteryReport: (params)   => axios.get('/api/traccar/reports/external-battery', { params }),
    getFuelConsumptionReport: (params)   => axios.get('/api/traccar/reports/fuel', { params }),
    getCurrentFuel:           (params)   => axios.get('/api/traccar/reports/current-fuel', { params }),
    getFuelCurveReport:       (params)   => axios.get('/api/traccar/reports/fuel-curve', { params }),
    getRefuellingReport:      (params)   => axios.get('/api/traccar/reports/fuel-refuelling', { params }),
    getAbnormalFuelLossReport:(params)   => axios.get('/api/traccar/reports/fuel-abnormal-loss', { params }),
    getIdleFuelReport:        (params)   => axios.get('/api/traccar/reports/fuel-idle', { params }),
    getFuelRankingReport:     (params)   => axios.get('/api/traccar/reports/fuel-ranking', { params }),
    getPositioningBatteryReport: (params) => axios.get('/api/traccar/reports/positioning', { params }),
    getTravelStatisticsReport: (params) => axios.get('/api/traccar/reports/travel', { params }),
    getMileageReport: (params) => axios.get('/api/traccar/reports/mileage', { params }),
    getTripsDetailReport: (params) => axios.get('/api/traccar/reports/trips-detail', { params }),
    getOverspeedReport: (params) => axios.get('/api/traccar/reports/overspeed', { params }),
    getParkingReport: (params) => axios.get('/api/traccar/reports/parking', { params }),
    getIdlingReport: (params) => axios.get('/api/traccar/reports/idling', { params }),
    getIgnitionReport: (params) => axios.get('/api/traccar/reports/ignition', { params }),
    getGeofenceReport: (params) => axios.get('/api/traccar/reports/geofence', { params }),
    getOnlineDevicesReport: () => axios.get('/api/traccar/reports/online'),
    getOfflineDevicesReport: () => axios.get('/api/traccar/reports/offline'),
    getDevicePosition:    (id)           => axios.get(`/api/traccar/devices/${id}/position`),
    getRouteHistory:      (id, from, to) => axios.get(`/api/traccar/devices/${id}/route`, { params: { from, to } }),
    getTripsReport:       (id, from, to) => axios.get(`/api/traccar/devices/${id}/trips`, { params: { from, to } }),
    exportTripsReport:    (id, from, to) => axios.get(`/api/traccar/devices/${id}/trips/export`, { params: { from, to }, responseType: 'blob' }),

    getGeofences:   ()         => axios.get('/api/traccar/geofences'),
    createGeofence: (data)     => axios.post('/api/traccar/geofences', data),
    updateGeofence: (id, data) => axios.put(`/api/traccar/geofences/${id}`, data),
    deleteGeofence: (id)       => axios.delete(`/api/traccar/geofences/${id}`),

    getTraccarNotifications: ()       => axios.get('/api/traccar/notifications'),
    getTraccarDrivers:       ()       => axios.get('/api/traccar/drivers'),
    getDeviceConnections:    (id)     => axios.get(`/api/traccar/devices/${id}/connections`),
    linkDeviceConnection:    (id, type, connId)   => axios.post(`/api/traccar/devices/${id}/connections`, { type, id: connId }),
    unlinkDeviceConnection:  (id, type, connId)   => axios.delete(`/api/traccar/devices/${id}/connections`, { data: { type, id: connId } }),

    getNotificationTypes:   ()         => axios.get('/api/traccar/notifications/types'),
    getNotificators:        ()         => axios.get('/api/traccar/notifications/notificators'),
    testNotificationChannels: (channels) => axios.post('/api/traccar/notifications/test', { channels }),
    getCommands:            ()         => axios.get('/api/traccar/commands'),
    getNotification:        (id)       => axios.get(`/api/traccar/notifications/${id}`),
    createNotification:     (data)     => axios.post('/api/traccar/notifications', data),
    updateNotification:     (id, data) => axios.put(`/api/traccar/notifications/${id}`, data),
    deleteNotification:     (id)       => axios.delete(`/api/traccar/notifications/${id}`),
    getNotificationDevices: (id)       => axios.get(`/api/traccar/notifications/${id}/devices`),

    createCalendar: (data)     => axios.post('/api/traccar/calendars', data),
    updateCalendar: (id, data) => axios.put(`/api/traccar/calendars/${id}`, data),
    deleteCalendar: (id)       => axios.delete(`/api/traccar/calendars/${id}`),

    getComputedAttributes:    ()         => axios.get('/api/traccar/attributes/computed'),
    createComputedAttribute:  (data)     => axios.post('/api/traccar/attributes/computed', data),
    updateComputedAttribute:  (id, data) => axios.put(`/api/traccar/attributes/computed/${id}`, data),
    deleteComputedAttribute:  (id)       => axios.delete(`/api/traccar/attributes/computed/${id}`),
    testComputedAttribute:    (data)     => axios.post('/api/traccar/attributes/computed/test', data),

    getMaintenances:   ()         => axios.get('/api/traccar/maintenance'),
    createMaintenance: (data)     => axios.post('/api/traccar/maintenance', data),
    updateMaintenance: (id, data) => axios.put(`/api/traccar/maintenance/${id}`, data),
    deleteMaintenance: (id)       => axios.delete(`/api/traccar/maintenance/${id}`),

    // Without a deviceId this is every type Traccar knows (what Saved Commands wants). With one,
    // Traccar narrows it to what that device's protocol actually implements.
    getCommandTypes:    (params)   => axios.get('/api/traccar/commands/types', { params }),
    createSavedCommand: (data)     => axios.post('/api/traccar/commands', data),
    updateSavedCommand: (id, data) => axios.put(`/api/traccar/commands/${id}`, data),
    deleteSavedCommand: (id)       => axios.delete(`/api/traccar/commands/${id}`),

    createGroup: (data)     => axios.post('/api/traccar/groups', data),
    updateGroup: (id, data) => axios.put(`/api/traccar/groups/${id}`, data),
    deleteGroup: (id)       => axios.delete(`/api/traccar/groups/${id}`),
    getGroupConnections:   (id)               => axios.get(`/api/traccar/groups/${id}/connections`),
    linkGroupConnection:   (id, type, connId) => axios.post(`/api/traccar/groups/${id}/connections`, { type, id: connId }),
    unlinkGroupConnection: (id, type, connId) => axios.delete(`/api/traccar/groups/${id}/connections`, { data: { type, id: connId } }),

    createDriver: (data)     => axios.post('/api/traccar/drivers', data),
    updateDriver: (id, data) => axios.put(`/api/traccar/drivers/${id}`, data),
    deleteDriver: (id)       => axios.delete(`/api/traccar/drivers/${id}`),
};

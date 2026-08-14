<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\DriverController;
use App\Http\Controllers\TraccarController;
use App\Http\Controllers\VehicleMaintenanceController;
use App\Http\Controllers\DriverFaceController;
use App\Http\Controllers\FaceImportController;
use App\Http\Controllers\GeofenceController;
use App\Http\Controllers\VehicleController;
use App\Http\Controllers\VehicleDriverController;
use App\Http\Controllers\VehicleSettingController;

// Public
Route::post('/login',  [AuthController::class, 'login']);

// Protected
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user',    [AuthController::class, 'me']);

    Route::apiResource('devices', DeviceController::class);
    Route::apiResource('drivers', DriverController::class)->except(['show']);
    Route::apiResource('vehicle-maintenances', VehicleMaintenanceController::class)->except(['show']);
    Route::apiResource('vehicles', VehicleController::class)->except(['show']);

    // Work-zone rules. Local rather than Traccar-side because each device link carries an
    // alert direction that Traccar's geofence permissions cannot express.
    Route::apiResource('geofences', GeofenceController::class)->except(['show']);
    Route::post('/geofences/{geofence}/devices',          [GeofenceController::class, 'linkDevice']);
    Route::put('/geofences/{geofence}/devices/{imei}',    [GeofenceController::class, 'updateDeviceDirection']);
    Route::delete('/geofences/{geofence}/devices/{imei}', [GeofenceController::class, 'unlinkDevice']);

    // Per-vehicle configuration and driver assignment, both keyed by the vehicle's IMEI.
    Route::get('/vehicle-settings',          [VehicleSettingController::class, 'index']);
    Route::get('/vehicle-settings/{imei}',   [VehicleSettingController::class, 'show']);
    Route::put('/vehicle-settings/{imei}',   [VehicleSettingController::class, 'update']);
    Route::get('/vehicle-drivers/{imei}',    [VehicleDriverController::class, 'index']);
    Route::put('/vehicle-drivers/{imei}',    [VehicleDriverController::class, 'sync']);

    // Face enrolment. Every action here is an EVENTSET command relayed to the device through
    // Traccar; the device reports results back on the public webhooks in routes/web.php.
    Route::prefix('face')->group(function () {
        Route::get('/',              [DriverFaceController::class, 'index']);
        Route::post('/enroll',       [DriverFaceController::class, 'enroll']);
        Route::post('/capture',      [DriverFaceController::class, 'capture']);
        Route::post('/download',     [DriverFaceController::class, 'downloadBatch']);
        Route::post('/fetch-photo',  [DriverFaceController::class, 'fetchPhoto']);
        Route::post('/test',         [DriverFaceController::class, 'test']);
        Route::post('/roster',       [DriverFaceController::class, 'roster']);
        Route::post('/upload-url',   [DriverFaceController::class, 'setUploadUrl']);
        Route::delete('/',           [DriverFaceController::class, 'destroy']);
        Route::get('/import-logs',   [FaceImportController::class, 'index']);
    });

    Route::prefix('traccar')->group(function () {
        Route::get('/devices',   [TraccarController::class, 'devices']);
        Route::post('/devices',  [TraccarController::class, 'storeDevice']);
        Route::put('/devices/{id}', [TraccarController::class, 'updateDevice']);
        Route::get('/groups',    [TraccarController::class, 'groups']);
        Route::post('/groups',   [TraccarController::class, 'storeGroup']);
        Route::put('/groups/{id}',    [TraccarController::class, 'updateGroup']);
        Route::delete('/groups/{id}', [TraccarController::class, 'destroyGroup']);
        Route::get('/groups/{id}/connections',    [TraccarController::class, 'groupConnections']);
        Route::post('/groups/{id}/connections',   [TraccarController::class, 'linkGroupConnection']);
        Route::delete('/groups/{id}/connections', [TraccarController::class, 'unlinkGroupConnection']);
        Route::get('/calendars',         [TraccarController::class, 'calendars']);
        Route::post('/calendars',        [TraccarController::class, 'storeCalendar']);
        Route::put('/calendars/{id}',    [TraccarController::class, 'updateCalendar']);
        Route::delete('/calendars/{id}', [TraccarController::class, 'destroyCalendar']);
        Route::get('/positions', [TraccarController::class, 'latestPositions']);
        Route::get('/ws-token',  [TraccarController::class, 'wsToken']);
        Route::get('/reports/events',  [TraccarController::class, 'alertEvents']);
        Route::get('/reports/battery',          [TraccarController::class, 'internalBatteryReport']);
        Route::get('/reports/external-battery', [TraccarController::class, 'externalBatteryReport']);
        Route::get('/reports/fuel', [TraccarController::class, 'fuelConsumptionReport']);
        Route::get('/reports/current-fuel', [TraccarController::class, 'currentFuel']);
        Route::get('/reports/fuel-curve', [TraccarController::class, 'fuelCurveReport']);
        Route::get('/reports/fuel-refuelling', [TraccarController::class, 'refuellingReport']);
        Route::get('/reports/fuel-abnormal-loss', [TraccarController::class, 'abnormalFuelLossReport']);
        Route::get('/reports/fuel-idle', [TraccarController::class, 'idleFuelReport']);
        Route::get('/reports/fuel-ranking', [TraccarController::class, 'fuelRankingReport']);
        Route::get('/reports/temperature', [TraccarController::class, 'temperatureHumidityReport']);
        Route::get('/reports/positioning', [TraccarController::class, 'positioningBatteryReport']);
        Route::get('/reports/travel', [TraccarController::class, 'travelStatisticsReport']);
        Route::get('/reports/mileage', [TraccarController::class, 'mileageReport']);
        Route::get('/reports/trips-detail', [TraccarController::class, 'tripsReport']);
        Route::get('/reports/overspeed', [TraccarController::class, 'overspeedReport']);
        Route::get('/reports/parking', [TraccarController::class, 'parkingReport']);
        Route::get('/reports/idling', [TraccarController::class, 'idlingReport']);
        Route::get('/reports/ignition', [TraccarController::class, 'ignitionReport']);
        Route::get('/reports/geofence', [TraccarController::class, 'geofenceReport']);
        Route::get('/reports/online', [TraccarController::class, 'onlineDevicesReport']);
        Route::get('/reports/offline', [TraccarController::class, 'offlineDevicesReport']);
        Route::get('/devices/{id}/position', [TraccarController::class, 'position']);
        Route::get('/devices/{id}/route',    [TraccarController::class, 'routeHistory']);
        Route::get('/devices/{id}/trips',        [TraccarController::class, 'trips']);
        Route::get('/devices/{id}/trips/export', [TraccarController::class, 'exportTrips']);
        Route::get('/devices/{id}/connections',    [TraccarController::class, 'deviceConnections']);
        Route::post('/devices/{id}/connections',   [TraccarController::class, 'linkDeviceConnection']);
        Route::delete('/devices/{id}/connections', [TraccarController::class, 'unlinkDeviceConnection']);

        Route::get('/notifications',              [TraccarController::class, 'notifications']);
        Route::get('/notifications/types',        [TraccarController::class, 'notificationTypes']);
        Route::get('/notifications/notificators', [TraccarController::class, 'notificators']);
        Route::post('/notifications/test',        [TraccarController::class, 'testNotificationChannels']);
        Route::post('/notifications',             [TraccarController::class, 'storeNotification']);
        Route::get('/notifications/{id}',         [TraccarController::class, 'notification']);
        Route::put('/notifications/{id}',         [TraccarController::class, 'updateNotification']);
        Route::delete('/notifications/{id}',      [TraccarController::class, 'destroyNotification']);
        Route::get('/notifications/{id}/devices', [TraccarController::class, 'notificationDevices']);

        Route::get('/commands',         [TraccarController::class, 'commands']);
        Route::get('/commands/types',   [TraccarController::class, 'commandTypes']);
        Route::post('/commands',        [TraccarController::class, 'storeSavedCommand']);
        Route::put('/commands/{id}',    [TraccarController::class, 'updateSavedCommand']);
        Route::delete('/commands/{id}', [TraccarController::class, 'destroySavedCommand']);
        Route::get('/drivers',         [TraccarController::class, 'drivers']);
        Route::post('/drivers',        [TraccarController::class, 'storeDriver']);
        Route::put('/drivers/{id}',    [TraccarController::class, 'updateDriver']);
        Route::delete('/drivers/{id}', [TraccarController::class, 'destroyDriver']);

        Route::get('/attributes/computed',            [TraccarController::class, 'computedAttributes']);
        Route::post('/attributes/computed',           [TraccarController::class, 'storeComputedAttribute']);
        Route::post('/attributes/computed/test',      [TraccarController::class, 'testComputedAttribute']);
        Route::put('/attributes/computed/{id}',       [TraccarController::class, 'updateComputedAttribute']);
        Route::delete('/attributes/computed/{id}',    [TraccarController::class, 'destroyComputedAttribute']);

        Route::get('/maintenance',         [TraccarController::class, 'maintenances']);
        Route::post('/maintenance',        [TraccarController::class, 'storeMaintenance']);
        Route::put('/maintenance/{id}',    [TraccarController::class, 'updateMaintenance']);
        Route::delete('/maintenance/{id}', [TraccarController::class, 'destroyMaintenance']);

        Route::get('/geofences',         [TraccarController::class, 'geofences']);
        Route::post('/geofences',        [TraccarController::class, 'storeGeofence']);
        Route::put('/geofences/{id}',    [TraccarController::class, 'updateGeofence']);
        Route::delete('/geofences/{id}', [TraccarController::class, 'destroyGeofence']);
    });
});

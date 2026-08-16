<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use App\Models\Vehicle;
use App\Models\VehicleMaintenance;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

// Fleet -> Vehicle Maintenance. Traccar's own /api/maintenance only models a repeating
// threshold (name, type, start, period), so it has nowhere to put vendor, cost, completion
// odometer or notes; those live in the local `vehicle_maintenances` table. Traccar still
// supplies the vehicle list and the live odometer that escalates a record to "Due Soon" or
// "Overdue", matched to a record by IMEI == Traccar device uniqueId.
class VehicleMaintenanceController extends Controller
{
    use UsesTraccarApi;

    private function traccarGet(string $path): ?array
    {
        try {
            $response = Http::withBasicAuth(...$this->traccarAuth())->timeout(8)->get("{$this->traccarBaseUrl()}{$path}");
            return $response->successful() ? ($response->json() ?? []) : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * imei => odometer in km, from each device's latest Traccar position.
     *
     * Traccar reports distance in metres and not every protocol sends the same field, so we
     * prefer the device's own odometer and fall back to Traccar's computed totalDistance.
     * Returns an empty map when Traccar is unreachable — records must still list.
     */
    private function odometersByImei(array $devices): array
    {
        $positions = $this->traccarGet('/positions');
        if ($positions === null) {
            return [];
        }

        $imeiByDeviceId = [];
        foreach ($devices as $device) {
            $imeiByDeviceId[$device['id']] = $device['uniqueId'] ?? null;
        }

        $odometers = [];
        foreach ($positions as $position) {
            $imei = $imeiByDeviceId[$position['deviceId']] ?? null;
            if ($imei === null) {
                continue;
            }
            $attributes = $position['attributes'] ?? [];
            $metres     = $attributes['odometer'] ?? $attributes['totalDistance'] ?? null;
            if ($metres !== null) {
                $odometers[$imei] = $metres / 1000;
            }
        }
        return $odometers;
    }

    public function index()
    {
        $devices   = $this->traccarGet('/devices') ?? [];
        $odometers = $this->odometersByImei($devices);

        // Device name from Traccar, plate from the local vehicles registry; either may be
        // missing, so the IMEI is always kept as the fallback label.
        $deviceNameByImei = [];
        foreach ($devices as $device) {
            if (!empty($device['uniqueId'])) {
                $deviceNameByImei[$device['uniqueId']] = $device['name'] ?? null;
            }
        }
        // Vehicle, not DB::table('vehicles') — the query builder skips Eloquent, and with it the
        // BelongsToClient scope that keeps one company's plates out of another's table.
        $plateByImei = Vehicle::pluck('plate_number', 'imei')->toArray();

        $records = VehicleMaintenance::orderByRaw('due_date IS NULL')
            ->orderBy('due_date')
            ->get()
            ->map(function (VehicleMaintenance $record) use ($deviceNameByImei, $plateByImei, $odometers) {
                $currentOdometer = $odometers[$record->imei] ?? null;
                return array_merge($record->toArray(), [
                    'vehicle_no'       => $plateByImei[$record->imei] ?? $deviceNameByImei[$record->imei] ?? $record->imei,
                    'current_odometer' => $currentOdometer,
                    'effective_status' => $record->effectiveStatus($currentOdometer),
                ]);
            });

        return response()->json($records);
    }

    private function validationRules(): array
    {
        return [
            'imei'                  => 'required|string|max:100',
            'maintenance_type'      => 'required|string|max:255',
            'description'           => 'nullable|string|max:2000',
            'status'                => 'nullable|in:Scheduled,Completed,Cancelled',
            'due_date'              => 'nullable|date',
            'due_odometer_km'       => 'nullable|numeric|min:0',
            'notify_days_before'    => 'nullable|integer|min:1|max:365',
            'notify_km_before'      => 'nullable|integer|min:1|max:100000',
            'completed_date'        => 'nullable|date',
            'completed_odometer_km' => 'nullable|numeric|min:0',
            'cost'                  => 'nullable|numeric|min:0',
            'vendor'                => 'nullable|string|max:255',
            'notes'                 => 'nullable|string|max:2000',
        ];
    }

    public function store(Request $request)
    {
        $record = VehicleMaintenance::create($request->validate($this->validationRules()));
        return response()->json($record, 201);
    }

    public function update(Request $request, VehicleMaintenance $vehicleMaintenance)
    {
        $vehicleMaintenance->update($request->validate($this->validationRules()));
        return response()->json($vehicleMaintenance);
    }

    public function destroy(VehicleMaintenance $vehicleMaintenance)
    {
        $vehicleMaintenance->delete();
        return response()->json(['message' => 'Maintenance record deleted.']);
    }
}

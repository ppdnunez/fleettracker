<?php

namespace App\Http\Controllers;

use App\Models\Driver;
use App\Models\DriverDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Which drivers are assigned to a vehicle, keyed by the vehicle's IMEI. A vehicle can hold
// several drivers at once (shift-based driving).
class VehicleDriverController extends Controller
{
    public function index(string $imei): JsonResponse
    {
        return response()->json($this->assigned($imei));
    }

    /** Replaces the whole assignment set for this vehicle in one call. */
    public function sync(Request $request, string $imei): JsonResponse
    {
        $data = $request->validate([
            'driverIds'   => 'array',
            'driverIds.*' => 'integer|exists:drivers,id',
        ]);

        DriverDevice::where('imei', $imei)->delete();

        foreach (array_unique($data['driverIds'] ?? []) as $driverId) {
            DriverDevice::create(['driver_id' => $driverId, 'imei' => $imei]);
        }

        return response()->json($this->assigned($imei));
    }

    private function assigned(string $imei)
    {
        return Driver::whereHas('links', fn ($q) => $q->where('imei', $imei))
            ->orderBy('name')
            ->get();
    }
}

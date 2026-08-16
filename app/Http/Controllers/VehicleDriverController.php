<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ChecksVehicleOwnership;
use App\Models\Driver;
use App\Models\DriverDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// Which drivers are assigned to a vehicle, keyed by the vehicle's IMEI. A vehicle can hold
// several drivers at once (shift-based driving).
//
// Tenancy here needs both halves: the IMEI must belong to the caller's company (ChecksVehicleOwnership),
// and so must every driver id in the payload. The DriverDevice scope covers reads and the delete
// below, but nothing stops a create — an id is just a number — so the ids are validated against
// the caller's own drivers rather than against the whole table.
class VehicleDriverController extends Controller
{
    use ChecksVehicleOwnership;

    public function index(string $imei): JsonResponse
    {
        $this->assertImeiOwned($imei);

        return response()->json($this->assigned($imei));
    }

    /** Replaces the whole assignment set for this vehicle in one call. */
    public function sync(Request $request, string $imei): JsonResponse
    {
        $this->assertImeiOwned($imei);

        $data = $request->validate([
            'driverIds'   => 'array',
            // Rule::in over the caller's own drivers, not exists:drivers,id: the latter accepts
            // any id in the table, which would let one company attach another's driver to its
            // vehicle. Driver::pluck is scoped, so this list is exactly what the caller may use.
            'driverIds.*' => ['integer', Rule::in(Driver::pluck('id')->all())],
        ]);

        // Scoped by DriverDevice's global scope, so this clears only the caller's own assignments
        // for the IMEI and leaves any other company's rows for the same device alone.
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

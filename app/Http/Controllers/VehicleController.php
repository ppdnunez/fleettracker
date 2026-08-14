<?php

namespace App\Http\Controllers;

use App\Models\Vehicle;
use Illuminate\Http\Request;

// FleetTrack's own vehicle registry (Fleet -> Vehicle). A row binds a vehicle profile to a
// Traccar device by IMEI; configuration lives on VehicleSetting under the same key.
class VehicleController extends Controller
{
    public function index()
    {
        return response()->json(Vehicle::orderBy('name')->get());
    }

    private function validationRules(): array
    {
        return [
            'imei'         => 'required|string|max:50',
            'name'         => 'required|string|max:100',
            'plate_number' => 'nullable|string|max:30',
            'manufacturer' => 'nullable|string|max:100',
            'model'        => 'nullable|string|max:100',
            'year'         => 'nullable|integer|min:1900|max:2100',
            'color'        => 'nullable|string|max:30',
            'status'       => 'nullable|in:Active,Inactive',
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate(array_merge($this->validationRules(), [
            'imei' => 'required|string|max:50|unique:vehicles,imei',
        ]));

        return response()->json(Vehicle::create($data), 201);
    }

    public function update(Request $request, Vehicle $vehicle)
    {
        $data = $request->validate($this->validationRules());

        // The IMEI is the join key for settings, driver assignments and maintenance records —
        // repointing it would silently orphan all three, so it is fixed once created.
        if (trim($data['imei']) !== $vehicle->imei) {
            return response()->json(['message' => 'IMEI cannot be changed once the vehicle is created.'], 422);
        }

        $vehicle->update($data);

        return response()->json($vehicle);
    }

    public function destroy(Vehicle $vehicle)
    {
        $vehicle->delete();

        return response()->json(['message' => 'Vehicle deleted.']);
    }
}

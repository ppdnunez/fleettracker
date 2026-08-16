<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\ChecksVehicleOwnership;
use App\Models\Vehicle;
use App\Models\VehicleSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

// Per-vehicle configuration, keyed by IMEI: relay-disconnect opt-ins, the fuel figures the Fuel
// Management consumption methods need, the map/sidebar icon type, and safety-sticker/insurance
// expiry. show() returns defaults for a vehicle with no row yet so the UI never has to special-
// case "not configured".
//
// This table has no client_id of its own — its key is an IMEI, and the vehicle registry already
// records which company owns that IMEI. Ownership is therefore derived from Vehicle rather than
// duplicated here, which also means it cannot drift out of step with the vehicle.
class VehicleSettingController extends Controller
{
    use ChecksVehicleOwnership;

    /**
     * Bulk list for the vehicle table and any dashboard reminder: only rows that actually carry
     * something worth reading, so an untouched fleet returns nothing rather than a row per device.
     */
    public function index(): JsonResponse
    {
        $query = VehicleSetting::where(fn ($q) => $q->whereNotNull('vehicle_type')
            ->orWhereNotNull('safety_sticker_expiry')
            ->orWhereNotNull('insurance_expiry')
            ->orWhereNotNull('sim_data_expiry'));

        // Vehicle::pluck is itself scoped, so a tenant gets settings for its own IMEIs only.
        if (!Auth::user()?->isPlatformAdmin()) {
            $query->whereIn('imei', Vehicle::pluck('imei'));
        }

        return response()->json(
            $query->get([
                'imei', 'vehicle_type', 'fuel_type',
                'safety_sticker_expiry', 'sticker_notify_days_before',
                'insurance_expiry', 'insurance_notify_days_before',
                'sim_number', 'sim_data_expiry', 'sim_notify_days_before',
            ])
        );
    }

    public function show(string $imei): JsonResponse
    {
        $this->assertImeiOwned($imei);

        $setting = VehicleSetting::where('imei', $imei)->first();

        // Nullsafe on the model itself, not just on the date: a vehicle that has never been
        // configured has no row at all, and every field below has to fall back cleanly.
        return response()->json([
            'imei'                          => $imei,
            'relay_disconnect_enabled'      => $setting?->relay_disconnect_enabled ?? false,
            'relay_disconnect_on_face_fail' => $setting?->relay_disconnect_on_face_fail ?? false,
            'relay_channel'                 => $setting?->relay_channel ?? VehicleSetting::DEFAULT_RELAY_CHANNEL,
            'fuel_rate_l_per_100km'         => $setting?->fuel_rate_l_per_100km,
            'fuel_tank_capacity_liters'     => $setting?->fuel_tank_capacity_liters,
            'vehicle_type'                  => $setting?->vehicle_type,
            'fuel_type'                     => $setting?->fuel_type,
            'safety_sticker_expiry'         => $setting?->safety_sticker_expiry?->format('Y-m-d'),
            'sticker_notify_days_before'    => $setting?->sticker_notify_days_before,
            'insurance_expiry'              => $setting?->insurance_expiry?->format('Y-m-d'),
            'insurance_notify_days_before'  => $setting?->insurance_notify_days_before,
            'sim_number'                    => $setting?->sim_number,
            'sim_data_expiry'               => $setting?->sim_data_expiry?->format('Y-m-d'),
            'sim_notify_days_before'        => $setting?->sim_notify_days_before,
        ]);
    }

    public function update(Request $request, string $imei): JsonResponse
    {
        $this->assertImeiOwned($imei);

        $data = $request->validate([
            'relay_disconnect_enabled'      => 'required|boolean',
            'relay_disconnect_on_face_fail' => 'required|boolean',
            'relay_channel'                 => 'nullable|integer|min:1|max:255',
            'fuel_rate_l_per_100km'         => 'nullable|numeric|min:0|max:9999.99',
            'fuel_tank_capacity_liters'     => 'nullable|numeric|min:0|max:99999.99',
            'vehicle_type'                  => 'nullable|string|in:car,suv,truck,van,bus,motorcycle',
            'fuel_type'                     => 'nullable|string|in:petrol,diesel,electric,hybrid,lpg',
            'safety_sticker_expiry'         => 'nullable|date',
            'sticker_notify_days_before'    => 'nullable|integer|min:1|max:365',
            'insurance_expiry'              => 'nullable|date',
            'insurance_notify_days_before'  => 'nullable|integer|min:1|max:365',
            'sim_number'                    => 'nullable|string|max:32',
            'sim_data_expiry'               => 'nullable|date',
            'sim_notify_days_before'        => 'nullable|integer|min:1|max:365',
        ]);

        $setting = VehicleSetting::updateOrCreate(['imei' => $imei], $data);

        return response()->json($setting);
    }
}

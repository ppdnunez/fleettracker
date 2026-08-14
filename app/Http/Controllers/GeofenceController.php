<?php

namespace App\Http\Controllers;

use App\Models\Geofence;
use App\Models\GeofenceDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Work-zone rules (Fleet -> Vehicle Track -> Work-zone Rules, and Device -> Geofence).
 *
 * Zones live locally rather than in Traccar because each device link carries an alert direction
 * (enter / exit / both), which Traccar's own geofence permissions have no field for.
 */
class GeofenceController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Geofence::with('links')->orderBy('name')->get()->map(fn (Geofence $g) => array_merge($g->toArray(), [
                'imeis' => $g->links->pluck('imei')->values(),
                'links' => $g->links->map(fn (GeofenceDevice $l) => [
                    'imei'            => $l->imei,
                    'alert_direction' => $l->alert_direction,
                    'is_inside'       => (bool) $l->is_inside,
                ])->values(),
            ]))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'  => 'required|string|max:100',
            'area'  => 'required|string',
            'color' => 'nullable|string|max:20',
        ]);

        return response()->json(Geofence::create($data), 201);
    }

    public function update(Request $request, Geofence $geofence): JsonResponse
    {
        $data = $request->validate([
            'name'  => 'sometimes|string|max:100',
            'area'  => 'sometimes|string',
            'color' => 'sometimes|nullable|string|max:20',
        ]);

        $geofence->update($data);

        return response()->json($geofence);
    }

    public function destroy(Geofence $geofence): JsonResponse
    {
        $geofence->delete();

        return response()->json(['message' => 'Geofence deleted.']);
    }

    // ── Device links ─────────────────────────────────────────────────────────

    public function linkDevice(Request $request, Geofence $geofence): JsonResponse
    {
        $data = $request->validate([
            'imei'            => 'required|string',
            'alert_direction' => 'nullable|in:enter,exit,both',
        ]);

        GeofenceDevice::firstOrCreate(
            ['geofence_id' => $geofence->id, 'imei' => $data['imei']],
            ['alert_direction' => $data['alert_direction'] ?? 'both'],
        );

        return response()->json($geofence->links()->pluck('imei')->values());
    }

    public function unlinkDevice(Geofence $geofence, string $imei): JsonResponse
    {
        $geofence->links()->where('imei', $imei)->delete();

        return response()->json($geofence->links()->pluck('imei')->values());
    }

    /** Changes an already-linked device's alert direction without unlinking and relinking it. */
    public function updateDeviceDirection(Request $request, Geofence $geofence, string $imei): JsonResponse
    {
        $data = $request->validate(['alert_direction' => 'required|in:enter,exit,both']);

        $link = $geofence->links()->where('imei', $imei)->firstOrFail();
        $link->update(['alert_direction' => $data['alert_direction']]);

        return response()->json([
            'imei'            => $link->imei,
            'alert_direction' => $link->alert_direction,
        ]);
    }
}

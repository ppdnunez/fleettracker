<?php

namespace App\Http\Controllers;

use App\Models\Geofence;
use App\Models\GeofenceDevice;
use App\Services\TraccarGeofenceSync;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Work-zone rules (Fleet -> Vehicle Track -> Work-zone Rules, and Device -> Geofence).
 *
 * Zones are authored here rather than in Traccar because each device link carries an alert
 * direction (enter / exit / both), which Traccar's own geofence permissions have no field for.
 *
 * But authoring is all this app does. Containment is decided by Traccar, which sees every position
 * and raises geofenceEnter / geofenceExit — the events the Geo Fence report, the alert dispatcher
 * and the map overlay all read. So every change to a zone or its device list is mirrored across by
 * TraccarGeofenceSync; without that a zone looks saved and quietly never fires.
 *
 * The mirror is best-effort by design: Traccar being briefly unreachable must not stop an operator
 * drawing a zone, so the local write stands and the response says whether the mirror succeeded.
 * `php artisan geofences:sync` reconciles anything that was missed.
 */
class GeofenceController extends Controller
{
    public function __construct(private readonly TraccarGeofenceSync $sync)
    {
    }

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
                // Whether Traccar is actually watching this zone. A zone with no mirror, or with a
                // mirror but no linked device, raises nothing — and that is worth showing rather
                // than leaving an operator to wonder why a report is empty.
                'traccar_geofence_id' => $g->traccar_geofence_id,
                'is_watched'          => $g->traccar_geofence_id !== null && $g->links->isNotEmpty(),
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

        $geofence = Geofence::create($data);

        return response()->json([
            ...$geofence->fresh()->toArray(),
            'traccar' => $this->sync->sync($geofence->load('links')),
        ], 201);
    }

    public function update(Request $request, Geofence $geofence): JsonResponse
    {
        $data = $request->validate([
            'name'  => 'sometimes|string|max:100',
            'area'  => 'sometimes|string',
            'color' => 'sometimes|nullable|string|max:20',
        ]);

        $geofence->update($data);

        return response()->json([
            ...$geofence->fresh()->toArray(),
            'traccar' => $this->sync->sync($geofence->load('links')),
        ]);
    }

    public function destroy(Geofence $geofence): JsonResponse
    {
        // Traccar first, while the record still holds the mirror's id.
        $this->sync->forget($geofence);
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

        // The link is the half that decides whether anything happens: Traccar evaluates a geofence
        // only against devices linked to it, so this is the call that turns a drawn shape into
        // enter/exit events for this device.
        $traccar = $this->sync->sync($geofence->load('links'));

        return response()->json([
            'imeis'   => $geofence->links()->pluck('imei')->values(),
            'traccar' => $traccar,
        ]);
    }

    public function unlinkDevice(Geofence $geofence, string $imei): JsonResponse
    {
        $geofence->links()->where('imei', $imei)->delete();

        $traccar = $this->sync->sync($geofence->load('links'));

        return response()->json([
            'imeis'   => $geofence->links()->pluck('imei')->values(),
            'traccar' => $traccar,
        ]);
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

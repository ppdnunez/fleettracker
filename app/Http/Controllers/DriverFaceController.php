<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use App\Models\Driver;
use App\Models\DriverFace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Face enrolment for the JC171 dashcam.
 *
 * The face database lives on the device — there is no server-side biometric store. Every action
 * here is a raw EVENTSET command sent through Traccar (see UsesTraccarApi::sendTraccarCommand),
 * plus local bookkeeping of what we asked for. Because commands go out as the caller's own
 * Traccar identity, a tenant can only enrol against devices Traccar already grants them.
 *
 * Two enrolment paths:
 *   - Device camera  — EVENTSET,FACE,SHOT,<badge>,<name>#  captures on the vehicle's own camera.
 *   - Laptop camera  — photo captured in-browser, stored here, then pushed to the device as a
 *                      zipped batch via EVENTSET,FACE,DOWN,<url>#.
 */
class DriverFaceController extends Controller
{
    use UsesTraccarApi;

    /** Max photos the device accepts in one FACE,DOWN batch. */
    private const MAX_BATCH = 5;

    public function index(Request $request): JsonResponse
    {
        $query = DriverFace::with('driver:id,name,badge_no')->orderByDesc('updated_at');

        if ($imei = $request->query('imei')) {
            $query->where('imei', $imei);
        }
        if ($driverId = $request->query('driver_id')) {
            $query->where('driver_id', $driverId);
        }

        $faces = $query->get()->map(fn (DriverFace $f) => array_merge($f->toArray(), [
            'photo_url' => $f->photoUrl(),
        ]));

        return response()->json($faces);
    }

    /**
     * Device-camera enrolment: EVENTSET,FACE,SHOT,<badge_no>,<name>#
     *
     * Traccar accepting the command says nothing about whether the device captured a usable
     * face — the row stays 'pending' until the device reports back on the face webhooks.
     */
    public function enroll(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:drivers,id',
            'imei'      => 'required|string',
        ]);

        $driver = Driver::findOrFail($data['driver_id']);
        $result = $this->sendTraccarCommand(
            $data['imei'],
            "EVENTSET,FACE,SHOT,{$driver->badge_no},{$this->faceToken($driver->name)}#"
        );

        $face = DriverFace::updateOrCreate(
            ['driver_id' => $driver->id, 'imei' => $data['imei']],
            [
                'status'       => $result['ok'] ? 'pending' : 'failed',
                'requested_at' => now(),
                'error'        => $result['ok'] ? null : $result['message'],
            ]
        );

        return response()->json([
            'command' => $result,
            'face'    => array_merge($face->fresh('driver')->toArray(), ['photo_url' => $face->photoUrl()]),
        ]);
    }

    /**
     * Stores a browser-captured (laptop webcam) photo. No device command here — this only feeds
     * the Face Photos tab, from which downloadBatch() pushes photos to a device.
     *
     * Written straight into public/img/uploads rather than the 'public' storage disk: the device
     * fetches these back over plain HTTP and that path needs no storage symlink to resolve.
     */
    public function capture(Request $request): JsonResponse
    {
        $data = $request->validate([
            'driver_id' => 'required|exists:drivers,id',
            'imei'      => 'nullable|string',
            'photo'     => 'required|image|max:10240',
        ]);

        $driver = Driver::findOrFail($data['driver_id']);
        $photo  = $request->file('photo');

        // "<badge_no>-<name>.<ext>" — the naming convention the device itself uses for FACE,SHOT
        // and FACE,GET, and the one FACE,DOWN expects inside the zip. Deterministic, so a
        // re-capture overwrites rather than accumulating stale copies.
        $extension = strtolower($photo->getClientOriginalExtension() ?: 'jpg');
        $fileName  = "{$driver->badge_no}-{$this->faceToken($driver->name)}.{$extension}";

        $uploadDir = public_path('img/uploads');
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
            return response()->json(['message' => 'Could not create the upload directory.'], 500);
        }
        $photo->move($uploadDir, $fileName);

        $face = DriverFace::updateOrCreate(
            ['driver_id' => $driver->id, 'imei' => $data['imei'] ?: ''],
            [
                'photo_path'   => "img/uploads/{$fileName}",
                'status'       => 'pending',
                'error'        => null,
                'requested_at' => now(),
            ]
        );

        return response()->json([
            'face' => array_merge($face->fresh('driver')->toArray(), ['photo_url' => $face->photoUrl()]),
        ]);
    }

    /**
     * "Zip & Push to Device" — bundles up to five stored photos, each renamed to the
     * "<badge_no>-<name>.<ext>" convention the device expects inside the archive, and sends
     * EVENTSET,FACE,DOWN,<zip url>#.
     *
     * The device validates the URL's format up front and rejects anything that is not a zip, so
     * a single bare image URL will not work here. The per-driver outcome arrives later on
     * /img/uploads/face/dowloadCallback; rows are left 'pending' rather than optimistically
     * marked enrolled.
     */
    public function downloadBatch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'imei'         => 'required|string',
            'driver_ids'   => 'required|array|min:1|max:' . self::MAX_BATCH,
            'driver_ids.*' => 'integer|exists:drivers,id',
        ]);

        if (!class_exists(\ZipArchive::class)) {
            return response()->json(['message' => 'The PHP zip extension is not available on this server.'], 500);
        }

        $entries = [];
        foreach ($data['driver_ids'] as $driverId) {
            $driver = Driver::find($driverId);
            $face   = DriverFace::where('driver_id', $driverId)
                ->whereNotNull('photo_path')
                ->orderByDesc('updated_at')
                ->first();

            if (!$driver || !$face) {
                continue;
            }

            $diskPath = public_path($face->photo_path);
            if (is_file($diskPath)) {
                $entries[] = ['driver' => $driver, 'disk_path' => $diskPath];
            }
        }

        if (empty($entries)) {
            return response()->json(['message' => 'None of the selected drivers have a usable photo on file.'], 422);
        }

        $uploadDir = public_path('img/uploads');
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
            return response()->json(['message' => 'Could not create the upload directory.'], 500);
        }

        $zipName = 'face-batch-' . now()->format('YmdHis') . '-' . substr(uniqid(), -6) . '.zip';
        $zipPath = $uploadDir . DIRECTORY_SEPARATOR . $zipName;

        $zip = new \ZipArchive();
        if ($zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            return response()->json(['message' => 'Failed to create the zip archive.'], 500);
        }

        $names = [];
        foreach ($entries as $entry) {
            $extension = pathinfo($entry['disk_path'], PATHINFO_EXTENSION) ?: 'jpg';
            $zip->addFile(
                $entry['disk_path'],
                "{$entry['driver']->badge_no}-{$this->faceToken($entry['driver']->name)}.{$extension}"
            );
            $names[] = $entry['driver']->name;
        }
        $zip->close();

        $url    = $this->publicHost($request) . '/img/uploads/' . $zipName;
        $result = $this->sendTraccarCommand($data['imei'], "EVENTSET,FACE,DOWN,{$url}#");

        // Mark the pushed drivers pending against this device so the download callback can
        // settle them when the device reports the batch result.
        foreach ($entries as $entry) {
            DriverFace::updateOrCreate(
                ['driver_id' => $entry['driver']->id, 'imei' => $data['imei']],
                [
                    'status'       => $result['ok'] ? 'pending' : 'failed',
                    'requested_at' => now(),
                    'error'        => $result['ok'] ? null : $result['message'],
                ]
            );
        }

        return response()->json([
            'command' => $result,
            'zip_url' => $url,
            'drivers' => $names,
        ]);
    }

    /** EVENTSET,FACE,GET — asks the device to re-upload a driver's already-enrolled photo. */
    public function fetchPhoto(Request $request): JsonResponse
    {
        $data   = $request->validate(['driver_id' => 'required|exists:drivers,id', 'imei' => 'required|string']);
        $driver = Driver::findOrFail($data['driver_id']);

        return response()->json($this->sendTraccarCommand(
            $data['imei'],
            "EVENTSET,FACE,GET,{$driver->badge_no}-{$this->faceToken($driver->name)}#"
        ));
    }

    /** EVENTSET,FACE,TEST — forces an immediate on-device recognition check. */
    public function test(Request $request): JsonResponse
    {
        $data = $request->validate(['imei' => 'required|string']);

        return response()->json($this->sendTraccarCommand($data['imei'], 'EVENTSET,FACE,TEST#'));
    }

    /** EVENTSET,FACE,CHECK — asks the device for a roster dump of everyone enrolled on it. */
    public function roster(Request $request): JsonResponse
    {
        $data = $request->validate(['imei' => 'required|string']);

        return response()->json($this->sendTraccarCommand($data['imei'], 'EVENTSET,FACE,CHECK#'));
    }

    /** EVENTSET,FACE,DEL — removes a driver's face from the device. */
    public function destroy(Request $request): JsonResponse
    {
        $data   = $request->validate(['driver_id' => 'required|exists:drivers,id', 'imei' => 'required|string']);
        $driver = Driver::findOrFail($data['driver_id']);

        $result = $this->sendTraccarCommand(
            $data['imei'],
            "EVENTSET,FACE,DEL,{$driver->badge_no}-{$this->faceToken($driver->name)}#"
        );

        if ($result['ok']) {
            DriverFace::where(['driver_id' => $driver->id, 'imei' => $data['imei']])
                ->update(['status' => 'deleted']);
        }

        return response()->json($result);
    }

    /**
     * UPLOADFACE — points the device's captured photos at this server. Run once per device;
     * without it the device uploads to the vendor's default host and our webhooks stay silent.
     *
     * The grammar is UPLOADFACE,URL,<addr># — `URL` is a fixed keyword, not the address itself
     * (Face Photo Upload & Download Integration Guide §1.2, and the device's own decode log reads
     * `online cmd[2]:UPLOADFACE,URL`). It was previously sent without that keyword, which put the
     * address in the parameter slot the device reads as the sub-command, so the whole command was
     * discarded — silently, since a malformed command is simply ignored rather than answered.
     *
     * The device must also have had HTTP_PROTOCOL,1# applied at least once, or it will not use
     * HTTP for the upload at all. That is a separate one-off, sent from the Command module.
     */
    public function setUploadUrl(Request $request): JsonResponse
    {
        $data = $request->validate(['imei' => 'required|string', 'url' => 'nullable|url']);
        $url  = $data['url'] ?: $this->publicHost($request) . '/img/uploads';

        return response()->json($this->sendTraccarCommand($data['imei'], "UPLOADFACE,URL,{$url}#"));
    }

    /**
     * Base URL the device will fetch from. Must be reachable by the device, so a configured
     * host wins over the request's own host — which is localhost during local development and
     * would leave the device fetching itself.
     */
    private function publicHost(Request $request): string
    {
        return rtrim(config('services.face.public_host') ?: $request->getSchemeAndHttpHost(), '/');
    }

    /** Device-safe token: the name with spaces and punctuation stripped. */
    private function faceToken(string $value): string
    {
        $clean = preg_replace('/[^A-Za-z0-9_]+/', '', str_replace(' ', '_', trim($value)));

        return $clean !== '' ? $clean : 'driver';
    }
}

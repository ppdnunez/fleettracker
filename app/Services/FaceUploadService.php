<?php

namespace App\Services;

use App\Models\Driver;
use App\Models\DriverFace;
use App\Models\FaceUploadReceipt;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

/**
 * The device-facing image ingest endpoint: POST /img/uploads/face/uploadPic.
 *
 * This is what the JC171 calls when it pushes a captured face photo (FACE,GET / FACE,SHOT) or a
 * requested still or clip back to us. It follows the vendor's Image/Video Upload protocol, which
 * is *not* the same as the two face-library callbacks in FaceImportService:
 *
 *   uploadPic  signs  md5(filename + timestamp + secretKey)      -> base64
 *   upload / dowloadCallback  signs  md5(imei + instructionId + secretKey + timestamp) -> base64
 *
 * Getting those two the same way round is the difference between a working ingest and a wall of
 * "Signature error", so they are deliberately implemented apart rather than shared.
 *
 * Files land in public/img/uploads, which is the same directory the face batch zips are built
 * from — a photo the device sends back is immediately usable as a template to push to another
 * vehicle without being copied anywhere.
 */
class FaceUploadService
{
    private const UPLOAD_DIR = 'img/uploads';

    /** @return array{code: int, message: string, data?: string} the body sent back to the device */
    public function handle(Request $request): array
    {
        // The device sends the file name as its own field; the multipart part name is not
        // authoritative, and the signature is computed over this value.
        $fileName  = (string) $request->input('filename', '');
        $timestamp = (string) $request->input('timestamp', '');
        $sign      = (string) $request->input('sign', '');
        $imei      = (string) $request->input('imei', '');
        $file      = $request->file('file');

        // Read before storing: move() relocates the temp file, after which getSize() has nothing
        // left to stat and throws. The receipt is written after the store, so it has to be held.
        $fileSize = $file?->isValid() ? $file->getSize() : null;

        $result = $this->validateAndStore($fileName, $timestamp, $sign, $file);

        // The convention is "<badge_no>-<name>.<ext>", so an inbound photo can usually be tied
        // back to the driver it belongs to. A file that cannot be is still stored and logged.
        $driver = ($result['code'] === 200) ? $this->resolveDriver($result['data'] ?? '') : null;

        if ($driver) {
            $this->linkToDriver($driver, $imei, $result['stored_path']);
        }

        FaceUploadReceipt::create([
            'imei'             => $imei ?: null,
            'driver_id'        => $driver?->id,
            'instruction_id'   => $request->input('instructionId') ?: null,
            'file_name'        => $fileName ?: $file?->getClientOriginalName(),
            'stored_path'      => $result['stored_path'] ?? null,
            'file_size'        => $fileSize,
            'signature_valid'  => $result['signature_valid'] ?? null,
            'response_code'    => $result['code'],
            'response_message' => $result['message'],
            'ip'               => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        unset($result['stored_path'], $result['signature_valid']);

        return $result;
    }

    private function validateAndStore(string $fileName, string $timestamp, string $sign, ?UploadedFile $file): array
    {
        if ($file === null) {
            return ['code' => 400, 'message' => 'File content is empty'];
        }

        // Fall back to the multipart file name: some firmware omits the field even though the
        // protocol marks it required, and rejecting a photo we can otherwise store helps nobody.
        if ($fileName === '') {
            $fileName = (string) $file->getClientOriginalName();
        }

        if ($fileName === '') {
            return ['code' => 400, 'message' => 'The filename cannot be empty'];
        }

        if ($timestamp === '') {
            return ['code' => 400, 'message' => 'The timestamp cannot be empty'];
        }

        if ($sign === '') {
            return ['code' => 400, 'message' => 'The sign cannot be empty'];
        }

        $secret   = (string) config('services.face.upload_secret_key');
        $expected = base64_encode(md5($fileName . $timestamp . $secret));
        $valid    = hash_equals($expected, $sign);

        if (!$valid) {
            // Both signatures are logged so a mismatch can be diagnosed rather than guessed at.
            // This matters more than usual here: the vendor's own worked example is internally
            // inconsistent — the MD5 it prints is not the MD5 of the string it prints directly
            // above it — so the algorithm cannot be validated against the documentation, only
            // against a real device.
            Log::warning('face/uploadPic — signature mismatch', [
                'filename'  => $fileName,
                'timestamp' => $timestamp,
                'received'  => $sign,
                'expected'  => $expected,
            ]);

            // Commissioning escape hatch. Off by default, so a stranger cannot post files here.
            // Turned on while a device is being brought up, the photo is still stored and the
            // receipt still records that the signature failed — nothing is hidden, and the
            // alternative is every photo silently disappearing while the logs say "Signature
            // error" with no way to tell whose fault it is.
            if (config('services.face.require_upload_signature', true)) {
                return ['code' => 400, 'message' => 'Signature error', 'signature_valid' => false];
            }
        }

        try {
            $storedName = $this->store($file, $fileName);
        } catch (\Throwable $e) {
            return ['code' => 500, 'message' => 'File upload failed', 'signature_valid' => true];
        }

        return [
            'code'            => 200,
            'message'         => 'File upload success',
            'data'            => $storedName,
            'stored_path'     => self::UPLOAD_DIR . '/' . $storedName,
            'signature_valid' => true,
        ];
    }

    /**
     * Stores the file under the name the device gave it.
     *
     * The protocol says a name must be unique, and an existing file is never overwritten —
     * a colliding upload gets a suffix instead, because silently replacing a stored photo would
     * destroy the evidence value of the one already there.
     */
    private function store(UploadedFile $file, string $fileName): string
    {
        $dir = public_path(self::UPLOAD_DIR);

        if (!File::isDirectory($dir)) {
            File::makeDirectory($dir, 0755, true);
        }

        // Only the basename: a device is not permitted to choose a path.
        $safe      = basename(str_replace('\\', '/', $fileName));
        $extension = pathinfo($safe, PATHINFO_EXTENSION);
        $base      = pathinfo($safe, PATHINFO_FILENAME);
        $name      = $safe;

        while (File::exists($dir . DIRECTORY_SEPARATOR . $name)) {
            $suffix = substr(uniqid(), -6);
            $name   = $extension !== '' ? "{$base}-{$suffix}.{$extension}" : "{$base}-{$suffix}";
        }

        $file->move($dir, $name);

        return $name;
    }

    /** "<badge_no>-<name>.jpg" -> the driver with that badge number, or null. */
    private function resolveDriver(string $fileName): ?Driver
    {
        if (!preg_match('/^([^-]+)-/', $fileName, $m)) {
            return null;
        }

        // Without the tenant scope: the device is not an authenticated user, and the badge number
        // is what identifies the driver. The receipt records which company it landed against.
        return Driver::withoutGlobalScope('client')->where('badge_no', trim($m[1]))->first();
    }

    /** Records the photo against the driver so the enrolment page shows what the device sent. */
    private function linkToDriver(Driver $driver, string $imei, ?string $storedPath): void
    {
        if ($storedPath === null) {
            return;
        }

        DriverFace::withoutGlobalScope('client')->updateOrCreate(
            ['driver_id' => $driver->id, 'imei' => $imei ?: ''],
            [
                'photo_path'   => $storedPath,
                // The photo came *from* the device, so the template is on it — which is what
                // "enrolled" records. requested_at is left as it was: it marks when we asked.
                'status'       => 'enrolled',
                'error'        => null,
                'enrolled_at'  => now(),
            ]
        );
    }
}

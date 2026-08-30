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
 * requested still or clip back to us. Two signature schemes are in circulation for it:
 *
 *   Image/Video Upload protocol   md5(filename + timestamp + secretKey)              -> base64
 *   Face library callback         md5(imei + instructionId + secretKey + timestamp)  -> base64
 *
 * Both are accepted, because the documentation and the hardware disagree. The vendor's
 * Image/Video Upload PDF specifies the first for this endpoint, but firmware
 * V8463_VL863P_WDBH_EU_V2.3.0 sends the second — confirmed on 2026-08-29 by reproducing a real
 * device's `sign` from its own logged parameters. Trusting the PDF alone rejected every photo
 * that device sent, with "Signature error" and no clue as to why.
 *
 * Accepting either costs nothing. The secret is a fixed value published in the vendor's own
 * documentation, so this signature was never an authentication boundary — it is an integrity
 * check on a public endpoint, and the receipt records which scheme matched.
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

        $result = $this->validateAndStore(
            $fileName,
            $timestamp,
            $sign,
            $file,
            $imei,
            (string) $request->input('instructionId', ''),
        );

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

    private function validateAndStore(
        string $fileName,
        string $timestamp,
        string $sign,
        ?UploadedFile $file,
        string $imei = '',
        string $instructionId = '',
    ): array {
        if ($file === null) {
            // "Empty" is usually a lie here. When a POST exceeds post_max_size, PHP throws the
            // whole body away before any of this runs — no file, no fields — which is
            // indistinguishable from a device that sent nothing. It is also the likeliest first
            // failure for video: a face photo is a couple of hundred KB, a dashcam clip is
            // megabytes, and cPanel's defaults sit between the two. Say which it was.
            $sent  = (int) request()->server('CONTENT_LENGTH', 0);
            $limit = self::iniBytes('post_max_size');

            if ($limit > 0 && $sent > $limit) {
                $message = sprintf(
                    'Upload too large: %s sent, %s allowed. Raise post_max_size and upload_max_filesize.',
                    self::humanBytes($sent),
                    self::humanBytes($limit),
                );

                Log::warning('face/uploadPic — upload exceeded post_max_size', [
                    'content_length' => $sent,
                    'post_max_size'  => $limit,
                ]);

                return ['code' => 400, 'message' => $message];
            }

            return ['code' => 400, 'message' => 'File content is empty'];
        }

        // A file that breached upload_max_filesize alone still arrives as an UploadedFile, but an
        // invalid one — move() would throw further down with nothing explaining why.
        if (!$file->isValid()) {
            Log::warning('face/uploadPic — upload error', [
                'error'   => $file->getError(),
                'message' => $file->getErrorMessage(),
            ]);

            return ['code' => 400, 'message' => 'Upload failed: ' . $file->getErrorMessage()];
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

        $secret = (string) config('services.face.upload_secret_key');

        // Both schemes in circulation for this endpoint — see the class docblock for why neither
        // can be assumed. Keyed by name so the log says which one a device is speaking.
        $candidates = [
            'image-video'    => base64_encode(md5($fileName . $timestamp . $secret)),
            'face-callback'  => base64_encode(md5($imei . $instructionId . $secret . $timestamp)),
        ];

        $matched = null;

        foreach ($candidates as $scheme => $expected) {
            if (hash_equals($expected, $sign)) {
                $matched = $scheme;
                break;
            }
        }

        $valid = $matched !== null;

        if (!$valid) {
            // Every candidate is logged so a mismatch can be diagnosed rather than guessed at.
            // This matters more than usual here: the vendor's own worked example is internally
            // inconsistent — the MD5 it prints is not the MD5 of the string it prints directly
            // above it — so the algorithm cannot be validated against the documentation, only
            // against a real device.
            Log::warning('face/uploadPic — signature mismatch', [
                'filename'  => $fileName,
                'timestamp' => $timestamp,
                'imei'      => $imei,
                'received'  => $sign,
                'expected'  => $candidates,
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
    /** An ini size in bytes. PHP writes these as "64M", which is not a number to anything else. */
    private static function iniBytes(string $directive): int
    {
        $raw = trim((string) ini_get($directive));

        if ($raw === '') {
            return 0;
        }

        $value = (int) $raw;

        return match (strtolower(substr($raw, -1))) {
            'g'     => $value * 1024 * 1024 * 1024,
            'm'     => $value * 1024 * 1024,
            'k'     => $value * 1024,
            default => $value,
        };
    }

    private static function humanBytes(int $bytes): string
    {
        foreach (['B', 'KB', 'MB', 'GB'] as $unit) {
            if ($bytes < 1024 || $unit === 'GB') {
                return round($bytes, 1) . $unit;
            }
            $bytes /= 1024;
        }

        return $bytes . 'B';
    }

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

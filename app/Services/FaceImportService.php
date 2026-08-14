<?php

namespace App\Services;

use App\Models\DriverFace;
use App\Models\FaceImportLog;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * The device-facing half of face enrolment: two webhooks the JC171 calls on its own, sharing one
 * signature algorithm.
 *
 *   POST /img/uploads/face/upload          — device uploads a face-library info file
 *   POST /img/uploads/face/dowloadCallback — device reports the result of a FACE,DOWN batch
 *
 * The misspelled "dowloadCallback" is the device's literal suffix, not a typo here.
 *
 * These carry plain-text status files rather than photos, so the content is written to private
 * storage — nothing needs to fetch it back by URL. Every call is recorded in face_import_logs
 * including rejected ones, because a bad signature is exactly how a misconfigured device
 * announces itself.
 */
class FaceImportService
{
    /** storage/app/face-import-logs/<endpoint>/<imei>/<timestamp>/<filename> */
    private const LOG_DIR = 'face-import-logs';

    public function handleUpload(Request $request): array
    {
        return $this->process($request, 'upload', prefixFilename: true);
    }

    public function handleDownloadCallback(Request $request): array
    {
        return $this->process($request, 'downloadCallback', prefixFilename: false);
    }

    private function process(Request $request, string $endpoint, bool $prefixFilename): array
    {
        $imei          = (string) $request->input('imei', '');
        $instructionId = (string) $request->input('instructionId', '');
        $timestamp     = (string) $request->input('timestamp', '');
        $sign          = (string) $request->input('sign', '');
        $file          = $request->file('file');

        $result = $this->validateRequest($imei, $instructionId, $timestamp, $sign, $file);

        $storedName = null;
        $storedPath = null;
        $content    = null;

        if ($result['code'] === 200 && $file) {
            [$storedName, $storedPath, $content] = $this->store($endpoint, $imei, $timestamp, $file, $prefixFilename);
            $result['data'] = $storedName;

            if ($endpoint === 'downloadCallback') {
                $this->applyDownloadResult($imei, $content);
            }
        }

        FaceImportLog::create([
            'endpoint'           => $endpoint,
            'imei'               => $imei ?: null,
            'instruction_id'     => $instructionId ?: null,
            'timestamp'          => $timestamp ?: null,
            'signature_valid'    => $result['signature_valid'] ?? null,
            'original_file_name' => $file?->getClientOriginalName(),
            'stored_file_name'   => $storedName,
            'stored_path'        => $storedPath,
            'file_content'       => $content,
            'response_code'      => $result['code'],
            'response_message'   => $result['message'],
            'ip'                 => $request->ip(),
            'user_agent'         => $request->userAgent(),
        ]);

        unset($result['signature_valid']);

        return $result;
    }

    private function validateRequest(string $imei, string $instructionId, string $timestamp, string $sign, ?UploadedFile $file): array
    {
        if ($imei === '')          return ['code' => 400, 'message' => 'The imei cannot be empty'];
        if ($instructionId === '') return ['code' => 400, 'message' => 'The instructionId cannot be empty'];
        if ($timestamp === '')     return ['code' => 400, 'message' => 'The timestamp cannot be empty'];
        if ($sign === '')          return ['code' => 400, 'message' => 'Signature error'];
        if (!$file)                return ['code' => 400, 'message' => 'The file cannot be empty'];

        $secretKey = (string) config('services.face.upload_secret_key');
        $expected  = base64_encode(md5($imei . $instructionId . $secretKey . $timestamp));

        if (!hash_equals($expected, $sign)) {
            return ['code' => 400, 'message' => 'Signature error', 'signature_valid' => false];
        }

        return ['code' => 200, 'message' => 'File upload success', 'signature_valid' => true];
    }

    /**
     * Records what the device said about a FACE,DOWN batch, without inferring pass/fail from it.
     *
     * A batch callback is one result file for the whole batch, with no per-driver breakdown, and
     * its wording is not specified anywhere we can rely on — a success line like
     * "3 imported, 0 failed" contains the word "failed", so any keyword match is a coin flip.
     * The vendor's own verification step is EVENTSET,FACE,CHECK# (the "Test Recognition" action),
     * so rows are left pending and the device's verbatim message is attached for the operator to
     * read rather than being silently turned into a status.
     */
    private function applyDownloadResult(string $imei, ?string $content): void
    {
        $message = trim((string) $content);
        if ($message === '') {
            return;
        }

        DriverFace::where('imei', $imei)
            ->where('status', 'pending')
            ->update(['error' => mb_substr($message, 0, 1000)]);
    }

    /** @return array{0: string, 1: string, 2: string} [storedName, storedPath, textContent] */
    private function store(string $endpoint, string $imei, string $timestamp, UploadedFile $file, bool $prefixFilename): array
    {
        $original = $file->getClientOriginalName() ?: 'upload.txt';
        $name     = $prefixFilename ? "{$imei}_{$original}" : $original;

        // Kept per-timestamp rather than overwritten: the device re-sends the same filename on
        // every run and each run is worth keeping for diagnostics.
        $relativeDir = self::LOG_DIR . "/{$endpoint}/{$imei}/{$timestamp}";
        $content     = file_get_contents($file->getRealPath()) ?: '';

        Storage::disk('local')->put("{$relativeDir}/{$name}", $content);

        return [$name, "{$relativeDir}/{$name}", $content];
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\FaceImportLog;
use App\Services\FaceImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Device-facing webhooks. These are public routes — the device cannot hold a user session, so
 * they are guarded by the request's own signature (see FaceImportService) rather than by auth.
 */
class FaceImportController extends Controller
{
    public function __construct(protected FaceImportService $faceImport)
    {
    }

    /** POST /img/uploads/face/upload */
    public function upload(Request $request): JsonResponse
    {
        $this->logRaw($request, 'face/upload');
        $result = $this->faceImport->handleUpload($request);

        return response()->json($result, $result['code']);
    }

    /**
     * POST /img/uploads/face/dowloadCallback
     * Spelling matches the vendor's literal suffix — the device posts to "dowloadCallback".
     */
    public function downloadCallback(Request $request): JsonResponse
    {
        $this->logRaw($request, 'face/dowloadCallback');
        $result = $this->faceImport->handleDownloadCallback($request);

        return response()->json($result, $result['code']);
    }

    /** Raw dump of exactly what arrived, written before validation so rejects are diagnosable. */
    private function logRaw(Request $request, string $label): void
    {
        Log::info("{$label} — raw incoming request", [
            'ip'     => $request->ip(),
            'method' => $request->method(),
            'url'    => $request->fullUrl(),
            'params' => $request->except(['file']),
            'file'   => $request->hasFile('file') ? [
                'original_name' => $request->file('file')->getClientOriginalName(),
                'size_bytes'    => $request->file('file')->getSize(),
                'mime_type'     => $request->file('file')->getClientMimeType(),
            ] : null,
        ]);
    }

    /** Admin-facing history of what these two webhooks received and how we replied. */
    public function index(Request $request): JsonResponse
    {
        $query = FaceImportLog::orderByDesc('created_at');

        if ($imei = $request->query('imei')) {
            $query->where('imei', $imei);
        }
        if ($endpoint = $request->query('endpoint')) {
            $query->where('endpoint', $endpoint);
        }

        return response()->json($query->limit(200)->get());
    }
}

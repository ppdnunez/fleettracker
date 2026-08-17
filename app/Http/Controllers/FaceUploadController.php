<?php

namespace App\Http\Controllers;

use App\Models\FaceUploadReceipt;
use App\Services\FaceUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class FaceUploadController extends Controller
{
    public function __construct(protected FaceUploadService $faceUpload)
    {
    }

    /**
     * Device-facing webhook — POST /img/uploads/face/uploadPic.
     *
     * Public, because a tracker cannot hold a session; the request's own signature is the guard.
     * Always answers with the vendor's {code, message, data} envelope and HTTP 200, since the
     * device reads `code` and treats a non-200 HTTP status as a transport failure worth retrying.
     */
    public function uploadPic(Request $request): JsonResponse
    {
        // Logged before anything is validated, so a request that fails the signature — or arrives
        // malformed — still leaves a trace. This is the line the Raw Log view reads back, and it
        // is the only record of a device that is talking to us but getting nowhere.
        Log::info('face/uploadPic — raw incoming request', [
            'ip'           => $request->ip(),
            'userAgent'    => $request->userAgent(),
            'contentType'  => $request->header('Content-Type'),
            'params'       => $request->except(['file']),
            'files'        => collect($request->allFiles())->map(fn ($f) => [
                'name' => $f->getClientOriginalName(),
                'size' => $f->getSize(),
                'mime' => $f->getClientMimeType(),
            ])->all(),
        ]);

        return response()->json($this->faceUpload->handle($request));
    }

    /** The upload log: what devices have sent, and what we answered. */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'imei'  => 'nullable|string',
            'limit' => 'nullable|integer|min:1|max:500',
        ]);

        $query = FaceUploadReceipt::with('driver:id,name,badge_no')->latest();

        if ($request->filled('imei')) {
            $query->where('imei', $request->imei);
        }

        $rows = $query->limit((int) ($request->limit ?: 100))->get()->map(fn (FaceUploadReceipt $r) => [
            'id'              => $r->id,
            'imei'            => $r->imei,
            'driverName'      => $r->driver?->name,
            'badgeNo'         => $r->driver?->badge_no,
            'instructionId'   => $r->instruction_id,
            'fileName'        => $r->file_name,
            'fileUrl'         => $r->fileUrl(),
            'fileSize'        => $r->file_size,
            'signatureValid'  => $r->signature_valid,
            'responseCode'    => $r->response_code,
            'responseMessage' => $r->response_message,
            'ip'              => $r->ip,
            'receivedAt'      => $r->created_at,
        ]);

        return response()->json($rows);
    }

    /**
     * The raw log: this endpoint's own request lines, tailed out of the Laravel log.
     *
     * The web equivalent of `tail -f storage/logs/laravel.log | grep face/uploadPic`, which is
     * what you otherwise need a shell on the server to do. It exists because the failures that
     * matter most here never reach the database — a request rejected by the web server (the 421
     * in the troubleshooting report) never reaches PHP at all, and the absence of lines here is
     * itself the diagnosis.
     */
    public function rawLog(Request $request): JsonResponse
    {
        $request->validate(['limit' => 'nullable|integer|min:1|max:500']);

        $limit = (int) ($request->limit ?: 100);
        $path  = storage_path('logs/laravel.log');

        if (!is_readable($path)) {
            return response()->json(['lines' => [], 'note' => 'No log file yet at storage/logs/laravel.log.']);
        }

        // Only the tail is read: this file grows without bound and the interesting lines are
        // always the recent ones.
        $bytes  = 512 * 1024;
        $size   = filesize($path);
        $handle = fopen($path, 'rb');
        fseek($handle, max(0, $size - $bytes));
        $chunk = fread($handle, $bytes) ?: '';
        fclose($handle);

        $lines = array_values(array_filter(
            explode("\n", $chunk),
            fn ($line) => str_contains($line, 'face/uploadPic')
                || str_contains($line, 'face/upload ')
                || str_contains($line, 'face/dowloadCallback')
        ));

        return response()->json([
            'lines'    => array_slice(array_reverse($lines), 0, $limit),
            'file'     => 'storage/logs/laravel.log',
            'truncated'=> $size > $bytes,
        ]);
    }
}

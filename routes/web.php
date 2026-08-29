<?php

use App\Http\Controllers\FaceImportController;
use App\Http\Controllers\FaceUploadController;
use Illuminate\Support\Facades\Route;

// Device-facing face-library webhooks. Public (the device cannot hold a session) and guarded by
// the request's own signature instead — see FaceImportService. The device's configured
// UPLOADFACE base is <host>/img/uploads and it appends these suffixes itself; "dowloadCallback"
// is the vendor's literal misspelling, not a typo here.
Route::post('/img/uploads/face/upload', [FaceImportController::class, 'upload']);
Route::post('/img/uploads/face/dowloadCallback', [FaceImportController::class, 'downloadCallback']);

// The image/video ingest, which is a different protocol from the two above: it signs
// filename + timestamp + secret rather than imei + instructionId + secret + timestamp.
// Some firmware posts to the configured base with no suffix at all, so that is accepted too and
// routed to the same handler — the alternative is a silent 404 on every photo the device sends.
Route::post('/img/uploads/face/uploadPic', [FaceUploadController::class, 'uploadPic']);
Route::post('/img/uploads', [FaceUploadController::class, 'uploadPic']);
Route::post('/img/uploads/', [FaceUploadController::class, 'uploadPic']);

// The image server proper. UPLOADFILE — the command that fetches a stored still or clip off the
// dashcam by name — does not use the face address at all; the device posts to its *image server*,
// and the vendor's Image/Video Upload Protocol fixes that path as <host>/upload. Without this
// route a POST there falls through to the SPA catch-all below, which is GET-only, so the device
// gets a 405 and nothing is logged: the photo vanishes with no trace at either end.
//
// Same handler as uploadPic. The protocols differ only in how they sign, and FaceUploadService
// already accepts both schemes.
Route::post('/upload', [FaceUploadController::class, 'uploadPic']);
Route::post('/img/uploads/upload', [FaceUploadController::class, 'uploadPic']);

Route::get('/{any?}', function () {
    return view('app');
})->where('any', '.*');

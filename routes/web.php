<?php

use App\Http\Controllers\FaceImportController;
use Illuminate\Support\Facades\Route;

// Device-facing face-library webhooks. Public (the device cannot hold a session) and guarded by
// the request's own signature instead — see FaceImportService. The device's configured
// UPLOADFACE base is <host>/img/uploads and it appends these suffixes itself; "dowloadCallback"
// is the vendor's literal misspelling, not a typo here.
Route::post('/img/uploads/face/upload', [FaceImportController::class, 'upload']);
Route::post('/img/uploads/face/dowloadCallback', [FaceImportController::class, 'downloadCallback']);

Route::get('/{any?}', function () {
    return view('app');
})->where('any', '.*');

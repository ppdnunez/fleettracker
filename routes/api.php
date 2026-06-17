<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DeviceController;
use App\Http\Controllers\TraccarController;

// Public
Route::post('/login',  [AuthController::class, 'login']);

// Protected
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user',    [AuthController::class, 'me']);

    Route::apiResource('devices', DeviceController::class);

    Route::prefix('traccar')->group(function () {
        Route::get('/devices',   [TraccarController::class, 'devices']);
        Route::get('/positions', [TraccarController::class, 'latestPositions']);
        Route::get('/devices/{id}/positions', [TraccarController::class, 'positions']);
    });
});

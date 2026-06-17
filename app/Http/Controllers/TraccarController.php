<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class TraccarController extends Controller
{
    private string $baseUrl;
    private array  $auth;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.traccar.url'), '/') . '/api';
        $this->auth    = [
            config('services.traccar.email'),
            config('services.traccar.password'),
        ];
    }

    public function devices()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/devices");
        return response()->json($response->json(), $response->status());
    }

    public function latestPositions()
    {
        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/positions");
        return response()->json($response->json(), $response->status());
    }

    public function positions(Request $request, int $id)
    {
        $request->validate([
            'from' => 'required|date',
            'to'   => 'required|date|after:from',
        ]);

        $response = Http::withBasicAuth(...$this->auth)
            ->get("{$this->baseUrl}/positions", [
                'deviceId' => $id,
                'from'     => $request->from,
                'to'       => $request->to,
            ]);
        return response()->json($response->json(), $response->status());
    }
}

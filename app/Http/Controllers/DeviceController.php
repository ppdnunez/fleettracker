<?php

namespace App\Http\Controllers;

use App\Models\Device;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    public function index()
    {
        return response()->json(Device::all());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'       => 'required|string|max:100',
            'identifier' => 'required|string|unique:devices,identifier',
            'tracker'    => 'nullable|string|max:50',
            'phone'      => 'nullable|string|max:30',
            'model'      => 'nullable|string|max:50',
            'status'     => 'nullable|in:ONLINE,OFFLINE',
        ]);

        return response()->json(Device::create($data), 201);
    }

    public function show(Device $device)
    {
        return response()->json($device);
    }

    public function update(Request $request, Device $device)
    {
        $data = $request->validate([
            'name'       => 'sometimes|string|max:100',
            'identifier' => 'sometimes|string|unique:devices,identifier,' . $device->id,
            'tracker'    => 'nullable|string|max:50',
            'phone'      => 'nullable|string|max:30',
            'model'      => 'nullable|string|max:50',
            'status'     => 'nullable|in:ONLINE,OFFLINE',
            'signal'     => 'nullable|integer|min:0|max:100',
            'lat'        => 'nullable|numeric',
            'lng'        => 'nullable|numeric',
        ]);

        $device->update($data);
        return response()->json($device);
    }

    public function destroy(Device $device)
    {
        $device->delete();
        return response()->json(['message' => 'Device deleted.']);
    }
}

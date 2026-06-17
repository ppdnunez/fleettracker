<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Device;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Admin user
        User::updateOrCreate(
            ['email' => 'admin@fleet.com'],
            [
                'name'     => 'Admin User',
                'password' => Hash::make('admin123'),
                'role'     => 'admin',
            ]
        );

        // Sample devices
        $devices = [
            ['name' => 'Device 001', 'identifier' => '123456789012001', 'tracker' => 'TRK-4821', 'status' => 'ONLINE',  'signal' => 82, 'lat' =>  14.5995, 'lng' => 120.9842],
            ['name' => 'Device 002', 'identifier' => '123456789012002', 'tracker' => 'TRK-3390', 'status' => 'ONLINE',  'signal' => 55, 'lat' =>  14.6100, 'lng' => 121.0100],
            ['name' => 'Device 003', 'identifier' => '123456789012003', 'tracker' => 'TRK-7714', 'status' => 'ONLINE',  'signal' => 91, 'lat' =>  14.5800, 'lng' => 120.9700],
            ['name' => 'Device 004', 'identifier' => '123456789012004', 'tracker' => 'TRK-2201', 'status' => 'OFFLINE', 'signal' => 12, 'lat' =>  14.6200, 'lng' => 121.0200],
            ['name' => 'Device 005', 'identifier' => '123456789012005', 'tracker' => 'TRK-9982', 'status' => 'ONLINE',  'signal' => 67, 'lat' =>  14.5700, 'lng' => 120.9900],
            ['name' => 'Device 006', 'identifier' => '123456789012006', 'tracker' => 'TRK-5547', 'status' => 'ONLINE',  'signal' => 38, 'lat' =>  14.5900, 'lng' => 121.0300],
            ['name' => 'Device 007', 'identifier' => '123456789012007', 'tracker' => 'TRK-1123', 'status' => 'ONLINE',  'signal' => 74, 'lat' =>  14.6050, 'lng' => 120.9600],
            ['name' => 'Device 008', 'identifier' => '123456789012008', 'tracker' => 'TRK-8834', 'status' => 'OFFLINE', 'signal' => 29, 'lat' =>  14.5650, 'lng' => 121.0050],
        ];

        foreach ($devices as $d) {
            Device::updateOrCreate(['identifier' => $d['identifier']], $d);
        }
    }
}

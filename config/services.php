<?php

return [
    'traccar' => [
        'url'      => env('TRACCAR_URL', 'http://localhost:8082'),
        'email'    => env('TRACCAR_EMAIL', 'admin@traccar.org'),
        'password' => env('TRACCAR_PASSWORD', 'admin'),
    ],

    'face' => [
        // Shared secret the device signs its /img/uploads/face/* posts with. The vendor default
        // is baked in so a device pointed at this host works before .env is touched; override it
        // in .env if the device is reconfigured.
        'upload_secret_key' => env('FACE_UPLOAD_SECRET_KEY', 'jimidvr@123!443'),

        // Public base the device fetches face batches from and posts captures back to. Must be
        // reachable BY THE DEVICE, so it cannot be localhost — set it to this server's LAN or
        // public host. Falls back to the request host when unset.
        'public_host' => env('FACE_PUBLIC_HOST'),
    ],
];

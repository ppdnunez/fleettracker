<?php

return [
    'traccar' => [
        'url'      => env('TRACCAR_URL', 'http://localhost:8082'),

        // Where the browser opens Traccar's websocket. Left unset it is derived from 'url', which
        // is right on a plain-http origin but forbidden once the app is served over HTTPS: a page
        // on https:// may not open a ws:// socket (mixed content), and Traccar itself sits on a
        // bare IP with no certificate of its own. Deployments therefore terminate TLS at the app's
        // own vhost and proxy the socket through it - set this to that path, absolute
        // (wss://app.example/traccar-ws) or origin-relative (/traccar-ws, resolved in the browser
        // against the page's own scheme and host).
        'ws_url'   => env('TRACCAR_WS_URL'),
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

        // Whether /img/uploads/face/uploadPic rejects a photo whose signature does not verify.
        // Leave true in production. Set false only while commissioning a device: the photo is
        // then stored anyway and the receipt still records the failure, which is how you find out
        // whether the device signs the way the (self-inconsistent) vendor documentation claims.
        'require_upload_signature' => env('FACE_REQUIRE_UPLOAD_SIGNATURE', true),
    ],
];

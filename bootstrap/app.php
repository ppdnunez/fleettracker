<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // The JC171 posts to these with a shared-secret signature, not a session — it has no
        // CSRF token to send. FaceImportService verifies the signature instead.
        $middleware->validateCsrfTokens(except: [
            'img/uploads/face/upload',
            'img/uploads/face/dowloadCallback',
            'img/uploads/face/uploadPic',
            // Some firmware posts the image to the configured base with no suffix at all — that
            // is what the troubleshooting log shows the JC171 doing.
            'img/uploads',
        ]);

        $middleware->alias([
            'platform.admin' => \App\Http\Middleware\EnsurePlatformAdmin::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();

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
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();

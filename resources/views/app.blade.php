<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="csrf-token" content="{{ csrf_token() }}" />
    <title>Turprotrack</title>

    {{-- Oswald carries the logo wordmark and its TT monogram; preconnecting saves a DNS and
         TLS round trip on a link where each one is worth about a third of a second. The mark
         falls back to a condensed sans if this never arrives, so it degrades rather than
         disappears. --}}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap">
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/AppRoot.jsx'])
</head>
<body>
    <div id="app"></div>
</body>
</html>

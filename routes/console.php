<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('drivers:notify-expirations')->daily();
Schedule::command('vehicles:notify-expirations')->daily();

// Traccar events are transient alerts rather than dated reminders, so they are polled through
// the day instead of once. --minutes matches the cadence; the command overlaps the window itself
// and de-duplicates on event id, so a missed run is picked up by the next one.
Schedule::command('alerts:dispatch-traccar-events --minutes=15')
    ->everyFifteenMinutes()
    ->withoutOverlapping();

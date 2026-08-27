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

// Zones are mirrored into Traccar as they are drawn, but that mirror is best-effort: Traccar can
// be slow or down at the moment someone saves, and a zone that failed to mirror is inert — it
// looks configured in the UI and raises no enter/exit events at all. This reconciles the two
// sides, and being idempotent it changes nothing on the runs where they already agree.
//
// Hourly rather than often: a zone is edited rarely, the save path already syncs, and each run
// costs a full listing from a Traccar that has been measured answering in tens of seconds.
// withoutOverlapping matters for the same reason — a slow run must not have the next one
// stacked behind it.
//
// Deliberately not scheduled: geofences:prune. It deletes, and a reconciliation that removes
// things is one to run deliberately and read the output of, not to leave running unattended.
Schedule::command('geofences:sync')
    ->hourly()
    ->withoutOverlapping();

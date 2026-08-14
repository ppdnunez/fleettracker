<?php

namespace App\Console\Commands;

use App\Mail\DriverExpiryNotice;
use App\Models\Driver;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

// Scheduled daily (see routes/console.php). For each driver, checks license_expiry against that
// driver's notify_days_before (or DEFAULT_NOTICE_DAYS), and emails every registered FleetTrack
// user once the expiry falls within that window. "Once" per expiry date is enforced via
// license_notified_at — a notified date rather than a boolean, so renewing the licence re-arms
// the reminder while a re-run on the same date does not resend.
//
// Safety-sticker expiry is NOT checked here: it belongs to the vehicle, not the driver, and
// lives on vehicle_settings.
class NotifyDriverExpirations extends Command
{
    protected $signature = 'drivers:notify-expirations';

    protected $description = 'Email registered users about drivers with an upcoming or past license expiry';

    private const DEFAULT_NOTICE_DAYS = 14;

    public function handle(): int
    {
        $recipients = User::pluck('email')->filter()->all();
        if (empty($recipients)) {
            $this->info('No registered users to notify.');
            return self::SUCCESS;
        }

        $today = Carbon::today();
        $checks = [
            ['field' => 'license_expiry', 'notifiedField' => 'license_notified_at', 'label' => 'License'],
        ];

        $sent = 0;
        foreach ($checks as $check) {
            $drivers = Driver::whereNotNull($check['field'])->get();

            foreach ($drivers as $driver) {
                $expiry    = $driver->{$check['field']};
                $threshold = $driver->notify_days_before ?? self::DEFAULT_NOTICE_DAYS;
                $daysUntil = (int) $today->diffInDays($expiry, false);

                $alreadyNotified = $driver->{$check['notifiedField']}?->isSameDay($expiry) ?? false;

                if ($daysUntil > $threshold || $alreadyNotified) {
                    continue;
                }

                foreach ($recipients as $email) {
                    Mail::to($email)->send(new DriverExpiryNotice($driver, $check['label'], $expiry, $daysUntil));
                }
                $driver->update([$check['notifiedField'] => $expiry]);

                $sent++;
                $this->info("Notified for {$check['label']} - {$driver->name} ({$driver->badge_no}), {$daysUntil} day(s).");
            }
        }

        $this->info("Done. Sent {$sent} notice(s).");
        return self::SUCCESS;
    }
}

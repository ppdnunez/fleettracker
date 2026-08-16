<?php

namespace App\Console\Commands;

use App\Mail\DriverExpiryNotice;
use App\Models\AlertRecipient;
use App\Models\Driver;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

// Scheduled daily (see routes/console.php). For each driver, checks license_expiry against that
// driver's notify_days_before (or DEFAULT_NOTICE_DAYS), and emails everyone subscribed to the
// 'driver_expiry' category under Settings > Alert Recipients once the expiry falls within that
// window — it used to blanket-email every registered User, which meant the only way to stop
// receiving them was to lose your login. "Once" per expiry date is enforced via
// license_notified_at — a notified date rather than a boolean, so renewing the licence re-arms
// the reminder while a re-run on the same date does not resend.
//
// Safety-sticker expiry is NOT checked here: it belongs to the vehicle, not the driver, and
// lives on vehicle_settings.
class NotifyDriverExpirations extends Command
{
    protected $signature = 'drivers:notify-expirations';

    protected $description = 'Email alert recipients about drivers with an upcoming or past license expiry';

    private const DEFAULT_NOTICE_DAYS = 14;

    public function handle(): int
    {
        // Recipients are resolved per driver, not once up front: a driver belongs to a company,
        // and only that company's subscribers (plus platform-level ones) should hear about its
        // licences. Cached by company so a fleet of one company still costs a single query.
        $recipientsByClient = [];
        $recipientsFor = function (?int $clientId) use (&$recipientsByClient): array {
            return $recipientsByClient[$clientId ?? 0] ??= AlertRecipient::emailsFor('driver_expiry', $clientId);
        };

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

                $recipients = $recipientsFor($driver->client_id);

                if (empty($recipients)) {
                    $this->line("No recipient for {$check['label']} - {$driver->name} ({$driver->badge_no}); its company has none subscribed.");
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

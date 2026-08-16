<?php

namespace App\Console\Commands;

use App\Mail\VehicleExpiryNotice;
use App\Models\AlertRecipient;
use App\Models\Vehicle;
use App\Models\VehicleSetting;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;

/**
 * Scheduled daily (routes/console.php). Walks vehicle_settings and emails the recipients
 * subscribed to each expiry category once the date falls inside that vehicle's notice window.
 *
 * All three dates on that table (SIM data/load, safety sticker, insurance) are checked in one
 * pass because they are the same shape — expiry / notify_days_before / notified_at — and share
 * a mailable. "Once" per expiry date is enforced by writing the expiry into *_notified_at:
 * a value rather than a boolean, so renewing re-arms the reminder while a same-day re-run does
 * not resend.
 *
 * Driver licence expiry is deliberately not here — it belongs to the driver, not the vehicle,
 * and stays in drivers:notify-expirations.
 */
class NotifyVehicleExpirations extends Command
{
    protected $signature = 'vehicles:notify-expirations {--kind= : Limit to one of sim, sticker, insurance}';

    protected $description = 'Email alert recipients about upcoming or past SIM, safety-sticker and insurance expiry';

    private const DEFAULT_NOTICE_DAYS = 14;

    /** kind => [date column, notify-days column, notified-at column, category, label] */
    private const CHECKS = [
        'sim' => [
            'expiry'   => 'sim_data_expiry',
            'days'     => 'sim_notify_days_before',
            'notified' => 'sim_notified_at',
            'category' => 'sim_expiry',
            'label'    => 'SIM Card Data/Load',
        ],
        'sticker' => [
            'expiry'   => 'safety_sticker_expiry',
            'days'     => 'sticker_notify_days_before',
            'notified' => 'sticker_notified_at',
            'category' => 'vehicle_expiry',
            'label'    => 'Vehicle Safety Sticker',
        ],
        'insurance' => [
            'expiry'   => 'insurance_expiry',
            'days'     => 'insurance_notify_days_before',
            'notified' => 'insurance_notified_at',
            'category' => 'vehicle_insurance_expiry',
            'label'    => 'Vehicle Insurance',
        ],
    ];

    public function handle(): int
    {
        $only = $this->option('kind');

        if ($only !== null && !isset(self::CHECKS[$only])) {
            $this->error('--kind must be one of: ' . implode(', ', array_keys(self::CHECKS)));
            return self::FAILURE;
        }

        $today = Carbon::today();
        // client_id comes along so each notice can go to the owning company's subscribers.
        // vehicle_settings has no owner column of its own — the vehicle registry is what records
        // which company an IMEI belongs to.
        $vehicles = Vehicle::get(['imei', 'name', 'plate_number', 'client_id'])->keyBy('imei');
        $sent     = 0;
        $orphaned = 0;

        foreach (self::CHECKS as $kind => $check) {
            if ($only !== null && $only !== $kind) {
                continue;
            }

            // Resolved per owning company rather than once for the category, and cached so a
            // whole fleet under one company still costs a single lookup.
            $recipientsByClient = [];

            foreach (VehicleSetting::whereNotNull($check['expiry'])->get() as $setting) {
                $expiry    = $setting->{$check['expiry']};
                $threshold = $setting->{$check['days']} ?? self::DEFAULT_NOTICE_DAYS;
                $daysUntil = (int) $today->diffInDays($expiry, false);

                $alreadyNotified = $setting->{$check['notified']}?->isSameDay($expiry) ?? false;

                if ($daysUntil > $threshold || $alreadyNotified) {
                    continue;
                }

                $vehicle  = $vehicles->get($setting->imei);
                $clientId = $vehicle?->client_id;

                $recipients = $recipientsByClient[$clientId ?? 0]
                    ??= AlertRecipient::emailsFor($check['category'], $clientId);

                if (empty($recipients)) {
                    $orphaned++;
                    $this->line("No recipient for {$check['label']} — {$setting->imei}; its company has none subscribed.");
                    continue;
                }

                foreach ($recipients as $email) {
                    Mail::to($email)->send(new VehicleExpiryNotice(
                        setting:     $setting,
                        kind:        $kind,
                        label:       $check['label'],
                        expiryDate:  $expiry,
                        daysUntil:   $daysUntil,
                        vehicleName: $vehicle?->name,
                        plateNumber: $vehicle?->plate_number,
                    ));
                }

                $setting->update([$check['notified'] => $expiry]);
                $sent++;

                $this->info("Notified {$check['label']} — {$setting->imei}, {$daysUntil} day(s).");
            }
        }

        $this->info("Done. Sent {$sent} notice(s)."
            . ($orphaned > 0 ? " {$orphaned} had no subscriber for their company." : ''));

        return self::SUCCESS;
    }
}

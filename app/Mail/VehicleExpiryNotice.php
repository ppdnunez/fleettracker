<?php

namespace App\Mail;

use App\Models\VehicleSetting;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

/**
 * One mailable for all three vehicle_settings expiry dates (SIM data/load, safety sticker,
 * insurance). They differ only in wording and in which extra detail rows are worth showing, so
 * NotifyVehicleExpirations passes the kind in rather than there being a class per date.
 */
class VehicleExpiryNotice extends Mailable
{
    use SerializesModels;

    public function __construct(
        public VehicleSetting $setting,
        public string $kind,          // 'sim' | 'sticker' | 'insurance'
        public string $label,         // human name, e.g. "SIM Card Data/Load"
        public Carbon $expiryDate,
        public int $daysUntil,
        public ?string $vehicleName = null,
        public ?string $plateNumber = null,
    ) {}

    public function envelope(): Envelope
    {
        $status  = $this->daysUntil < 0 ? 'has expired' : 'is expiring soon';
        $subject = $this->vehicleName ?: $this->setting->imei;

        return new Envelope(subject: "{$this->label} {$status}: {$subject}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.vehicle-expiry');
    }
}

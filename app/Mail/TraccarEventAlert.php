<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * One Traccar event, delivered to the recipients subscribed to the category it maps to
 * (AlertRecipient::TRACCAR_EVENT_CATEGORIES). Built from the raw event as Traccar returns it
 * from /api/reports/events, plus whatever names could be resolved for the device and geofence.
 */
class TraccarEventAlert extends Mailable
{
    use SerializesModels;

    public function __construct(
        public array $event,
        public string $title,
        public string $deviceName,
        public ?string $plateNumber = null,
        public ?string $geofenceName = null,
        public ?string $occurredAt = null,
        public ?array $position = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "{$this->title}: {$this->deviceName}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.traccar-event-alert');
    }
}

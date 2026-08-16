<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use App\Models\AlertRecipient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class AlertRecipientController extends Controller
{
    use UsesTraccarApi;

    public function index(): JsonResponse
    {
        return response()->json(AlertRecipient::orderBy('email')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, ['email' => 'required|email|max:255|unique:alert_recipients,email']);

        return response()->json(AlertRecipient::create($data), 201);
    }

    public function update(Request $request, AlertRecipient $alertRecipient): JsonResponse
    {
        $data = $this->validated($request, [
            'email' => "required|email|max:255|unique:alert_recipients,email,{$alertRecipient->id}",
        ]);

        $alertRecipient->update($data);

        return response()->json($alertRecipient);
    }

    public function destroy(AlertRecipient $alertRecipient): JsonResponse
    {
        $alertRecipient->delete();

        return response()->json(['message' => 'Alert recipient deleted.']);
    }

    /**
     * Live delivery status for the banner on the recipients page.
     *
     * Alert emails leave through Laravel's mailer, so `mailer` decides whether anything is
     * actually delivered — the `log` driver writes the message to storage/logs and sends nothing.
     * The Traccar half is reported too because Traccar is what raises the geofence, maintenance,
     * fuel and driver-change events in the first place: if this call fails, those categories
     * have no source, whatever the mailer is doing.
     */
    public function channels(): JsonResponse
    {
        $mailer = config('mail.default');

        $traccar = ['reachable' => false, 'email_enabled' => false, 'notificators' => [], 'error' => null];

        try {
            $server = Http::withBasicAuth(...$this->traccarAuth())
                ->timeout(10)
                ->get("{$this->traccarBaseUrl()}/server");

            if ($server->successful()) {
                $traccar['reachable']     = true;
                $traccar['email_enabled'] = (bool) ($server->json()['emailEnabled'] ?? false);

                $notificators = Http::withBasicAuth(...$this->traccarAuth())
                    ->timeout(10)
                    ->get("{$this->traccarBaseUrl()}/notifications/notificators");

                if ($notificators->successful()) {
                    $traccar['notificators'] = array_column($notificators->json() ?: [], 'type');
                }
            } else {
                $traccar['error'] = "Traccar returned HTTP {$server->status()}.";
            }
        } catch (\Throwable $e) {
            $traccar['error'] = 'Could not reach Traccar.';
        }

        return response()->json([
            'mailer'          => $mailer,
            'mail_delivers'   => $mailer !== 'log' && $mailer !== 'array',
            'from_address'    => config('mail.from.address'),
            'traccar'         => $traccar,
            'event_categories' => AlertRecipient::TRACCAR_EVENT_CATEGORIES,
        ]);
    }

    private function validated(Request $request, array $emailRule): array
    {
        return $request->validate([
            ...$emailRule,
            'name'         => 'nullable|string|max:100',
            'categories'   => 'required|array|min:1',
            'categories.*' => 'string|in:' . implode(',', array_keys(AlertRecipient::CATEGORIES)),
            'active'       => 'boolean',
        ]);
    }
}

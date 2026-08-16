<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #1f2937; background: #f3f4f6; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 28px; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 4px; font-size: 17px; color: #b45309;">{{ $title }}</h2>
        <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">Turprotrack alert</p>

        <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
                <td style="padding: 6px 0; color: #6b7280; width: 140px;">Vehicle</td>
                <td style="padding: 6px 0; font-weight: 600;">{{ $deviceName }}</td>
            </tr>
            @if($plateNumber)
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Plate number</td>
                <td style="padding: 6px 0;">{{ $plateNumber }}</td>
            </tr>
            @endif
            @if($geofenceName)
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Geofence</td>
                <td style="padding: 6px 0;">{{ $geofenceName }}</td>
            </tr>
            @endif
            @if(!empty($event['attributes']['alarm']))
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Alarm</td>
                <td style="padding: 6px 0;">{{ $event['attributes']['alarm'] }}</td>
            </tr>
            @endif
            @if($occurredAt)
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Time</td>
                <td style="padding: 6px 0;">{{ $occurredAt }}</td>
            </tr>
            @endif
            @if($position && isset($position['latitude'], $position['longitude']))
            <tr>
                <td style="padding: 6px 0; color: #6b7280;">Location</td>
                <td style="padding: 6px 0;">
                    <a href="https://www.google.com/maps?q={{ $position['latitude'] }},{{ $position['longitude'] }}" style="color: #2563eb;">
                        {{ number_format($position['latitude'], 5) }}, {{ number_format($position['longitude'], 5) }}
                    </a>
                    @if(isset($position['speed']))
                        &middot; {{ number_format($position['speed'] * 1.852, 1) }} km/h
                    @endif
                </td>
            </tr>
            @endif
        </table>

        <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af;">
            Raised by Traccar and forwarded by Turprotrack. Manage who receives this under
            Settings &rarr; Alert Recipients.
        </p>
    </div>
</body>
</html>

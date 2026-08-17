<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use App\Models\Driver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;

/**
 * Everything sitting in public/img/uploads — face templates, and the stills and clips devices
 * push back through /img/uploads/face/uploadPic.
 *
 * The directory is the single place all of it lands: a photo the device returns, a template
 * captured from a laptop webcam, and the batch zips built to push templates out. Reading it
 * directly rather than a database table is deliberate — the files are the artefact, and a listing
 * built from a table would quietly disagree with the disk the moment anything was added or
 * removed outside the app.
 *
 * Attribution is by filename, which is the only handle these files carry:
 *   0169_1260807152528_863800080017899.mp4  ->  device, by the 15-digit IMEI
 *   11111-Paul.jpg                          ->  driver, by the badge number prefix
 *
 * That matters for more than labelling: a tenant is shown only the files belonging to devices
 * Traccar grants them or drivers their company owns. Anything that cannot be attributed is
 * visible to platform administrators alone, since showing it to a tenant would be a guess about
 * whose file it is.
 */
class MediaLibraryController extends Controller
{
    use UsesTraccarApi;

    private const DIR = 'img/uploads';

    private const IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    private const VIDEO = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'ts', 'h264'];

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'kind'   => 'nullable|in:image,video,other',
            'search' => 'nullable|string|max:120',
            'imei'   => 'nullable|string|max:64',
            'limit'  => 'nullable|integer|min:1|max:500',
        ]);

        $dir = public_path(self::DIR);

        if (!is_dir($dir)) {
            return response()->json(['files' => [], 'summary' => $this->summary([]), 'directory' => self::DIR]);
        }

        $user       = Auth::user();
        $isPlatform = !$user || $user->isPlatformAdmin();

        // Resolved once, not per file: both are a round trip, and a directory listing can be long.
        $visibleImeis  = $isPlatform ? null : $this->visibleImeis();
        $driversByBadge = Driver::query()->get(['id', 'name', 'badge_no'])->keyBy('badge_no');

        $files = [];

        foreach (scandir($dir) ?: [] as $name) {
            if ($name === '.' || $name === '..' || str_starts_with($name, '.')) {
                continue;
            }

            $path = $dir . DIRECTORY_SEPARATOR . $name;

            if (!is_file($path)) {
                continue;
            }

            $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            $imei      = $this->imeiFrom($name);
            $driver     = $driversByBadge->get($this->badgeFrom($name));

            // Tenant view: a file is theirs only if it names one of their devices or one of their
            // drivers. Their driver list is already company-scoped by the global scope above.
            if (!$isPlatform) {
                $ownedByDevice = $imei !== null && in_array($imei, $visibleImeis, true);

                if (!$ownedByDevice && !$driver) {
                    continue;
                }
            }

            $files[] = [
                'name'        => $name,
                'url'         => asset(self::DIR . '/' . rawurlencode($name)),
                'kind'        => $this->kind($extension),
                'extension'   => $extension,
                'size'        => filesize($path) ?: 0,
                'modifiedAt'  => Carbon::createFromTimestamp(filemtime($path))->toIso8601String(),
                'imei'        => $imei,
                'driverId'    => $driver?->id,
                'driverName'  => $driver?->name,
                'badgeNo'     => $driver?->badge_no,
                // Named so the gallery can say what a file *is* rather than only what it holds.
                'source'      => $driver ? 'Face template' : ($imei ? 'From device' : 'Uploaded'),
            ];
        }

        $summary = $this->summary($files);

        if ($request->filled('kind')) {
            $files = array_values(array_filter($files, fn ($f) => $f['kind'] === $request->kind));
        }

        if ($request->filled('imei')) {
            $files = array_values(array_filter($files, fn ($f) => $f['imei'] === $request->imei));
        }

        if ($request->filled('search')) {
            $needle = mb_strtolower($request->search);
            $files  = array_values(array_filter(
                $files,
                fn ($f) => str_contains(mb_strtolower($f['name']), $needle)
                    || str_contains(mb_strtolower((string) $f['driverName']), $needle)
            ));
        }

        // Newest first: the reason to open a gallery is almost always the thing that just arrived.
        usort($files, fn ($a, $b) => strcmp($b['modifiedAt'], $a['modifiedAt']));

        $limit = (int) ($request->limit ?: 200);

        return response()->json([
            'files'     => array_slice($files, 0, $limit),
            'total'     => count($files),
            'summary'   => $summary,
            'directory' => self::DIR,
        ]);
    }

    /** Counts and total size across everything visible, before any filter narrows the view. */
    private function summary(array $files): array
    {
        return [
            'all'   => count($files),
            'image' => count(array_filter($files, fn ($f) => $f['kind'] === 'image')),
            'video' => count(array_filter($files, fn ($f) => $f['kind'] === 'video')),
            'other' => count(array_filter($files, fn ($f) => $f['kind'] === 'other')),
            'bytes' => array_sum(array_column($files, 'size')),
        ];
    }

    private function kind(string $extension): string
    {
        if (in_array($extension, self::IMAGE, true)) return 'image';
        if (in_array($extension, self::VIDEO, true)) return 'video';

        return 'other';
    }

    /**
     * The 15-digit IMEI embedded in a device filename, if there is one.
     *
     * Device names separate their parts with underscores — 0169_1260807152528_863800080017899.mp4
     * — and an underscore is a word character, so \b never fires between one and a digit. The
     * lookarounds match a run of exactly fifteen digits regardless of what surrounds it.
     */
    private function imeiFrom(string $name): ?string
    {
        return preg_match('/(?<!\d)(\d{15})(?!\d)/', $name, $m) ? $m[1] : null;
    }

    /** The badge number in "<badge>-<name>.<ext>", the face-template convention. */
    private function badgeFrom(string $name): ?string
    {
        return preg_match('/^([A-Za-z0-9]+)-/', $name, $m) ? $m[1] : null;
    }

    /** IMEIs of the devices Traccar grants this caller — the same boundary as everywhere else. */
    private function visibleImeis(): array
    {
        try {
            $devices = Http::withBasicAuth(...$this->traccarAuth())
                ->timeout(15)
                ->get("{$this->traccarBaseUrl()}/devices")
                ->json() ?? [];
        } catch (\Throwable) {
            // Traccar down: fall back to showing nothing device-attributed rather than everything.
            return [];
        }

        return array_values(array_filter(array_column($devices, 'uniqueId')));
    }
}

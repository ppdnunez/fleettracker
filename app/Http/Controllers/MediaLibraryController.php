<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UsesTraccarApi;
use App\Models\Driver;
use App\Models\DriverFace;
use App\Models\User;
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

    /**
     * Removes one file from the gallery.
     *
     * The name arrives in the body rather than the path: these filenames carry dots, and a route
     * parameter would have to fight Laravel's extension handling for no benefit.
     *
     * Three things have to hold before anything is unlinked, and they are checked in this order
     * because each one is cheaper than the next:
     *
     *   1. The name is a bare filename. A device chose it, and a device is never permitted to
     *      choose a path — basename() plus an explicit rejection of separators, because a delete
     *      that accepts "../../.env" is a very different endpoint from the one intended.
     *   2. The file is actually in the gallery directory, resolved through realpath so a symlink
     *      cannot point out of it.
     *   3. The caller can see it. Reusing the listing's own visibility rule means a tenant can
     *      delete exactly what it can view and nothing else — and an unattributable file, which
     *      only platform administrators are shown, can only be removed by one.
     *
     * The response reports what was removed rather than a bare 204, so the page can say so.
     */
    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        // chr(92) is a backslash: a Windows-style separator in a name a device chose must
        // not survive into the path, and writing it as a literal here is needless escaping.
        $name = basename(str_replace(chr(92), "/", $data["name"]));

        if ($name === '' || $name !== $data['name'] || str_starts_with($name, '.')) {
            return response()->json(['message' => 'That file name is not valid.'], 422);
        }

        $dir  = realpath(public_path(self::DIR));
        $path = $dir ? realpath($dir . DIRECTORY_SEPARATOR . $name) : false;

        // str_starts_with on the resolved paths: realpath has already followed any symlink, so a
        // file that resolves outside the gallery is not in the gallery whatever its name says.
        if (!$dir || !$path || !is_file($path) || !str_starts_with($path, $dir . DIRECTORY_SEPARATOR)) {
            return response()->json(['message' => 'File not found.'], 404);
        }

        $user = Auth::user();

        if (!$this->isVisibleTo($user, $name)) {
            // 404 rather than 403: whether another tenant holds a file of this name is not
            // something this endpoint should confirm.
            return response()->json(['message' => 'File not found.'], 404);
        }

        if (!@unlink($path)) {
            return response()->json(['message' => 'The file could not be removed.'], 500);
        }

        // A face template that no longer exists on disk should not leave a driver record pointing
        // at it — the enrolment page would render a broken image. The enrolment itself is left
        // alone on purpose: 'enrolled' records that the template reached the device, which is
        // still true once our copy of the photo is gone.
        DriverFace::withoutGlobalScope('client')
            ->where('photo_path', self::DIR . '/' . $name)
            ->update(['photo_path' => null]);

        return response()->json(['message' => 'File removed.', 'name' => $name]);
    }

    /**
     * The listing's visibility rule, on its own so index() and destroy() cannot drift apart.
     *
     * A tenant sees a file if it names one of their devices or one of their drivers. Anything
     * unattributable belongs to platform administrators alone, since showing — or deleting — it
     * for a tenant would be a guess about whose file it is.
     */
    private function isVisibleTo(?User $user, string $name): bool
    {
        if (!$user || $user->isPlatformAdmin()) {
            return true;
        }

        $imei = $this->imeiFrom($name);

        if ($imei !== null && in_array($imei, $this->visibleImeis(), true)) {
            return true;
        }

        $badge = $this->badgeFrom($name);

        return $badge !== null && Driver::query()->where('badge_no', $badge)->exists();
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

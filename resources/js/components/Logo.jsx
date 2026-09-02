/**
 * The TurproTrack mark — "Industrial", option B.
 *
 * A TT monogram with a route line running through it: two waypoints, a turn, and the leg between
 * them, which is the product in one glyph. Amber on charcoal, matching the rest of the interface.
 *
 * Drawn rather than imported so it can be recoloured, resized and split apart — the collapsed
 * sidebar shows the mark alone, the login page shows it large — without shipping several files
 * that then drift out of step with each other.
 *
 * The monogram is SVG <text> in Oswald, which is loaded in app.blade.php. If that request ever
 * fails the fallback is a condensed sans, so the mark degrades to slightly wider letters rather
 * than to nothing.
 */

const AMBER        = '#f59e0b';
const AMBER_DEEP   = '#d97706';
const TEXT_ON_DARK = '#f5f0e8';

/** The square mark on its own. `size` is the rendered edge in pixels. */
export function LogoMark({ size = 36 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 52 52" fill="none" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
            {/* A lifted panel rather than a solid fill, so the mark sits on any dark surface
                without carrying a rectangle of a slightly different charcoal with it. */}
            <rect x="2" y="2" width="48" height="48" rx="10" fill="rgba(255,255,255,0.07)" />
            <text x="8" y="38" fontFamily="Oswald, 'Barlow Condensed', system-ui, sans-serif"
                fontWeight="700" fontSize="34" fill={TEXT_ON_DARK}>TT</text>
            <path d="M6 42 L20 20 L32 32 L44 10" stroke={AMBER} strokeWidth="3"
                strokeLinecap="round" strokeLinejoin="round" fill="none" />
            {/* Start and end waypoints solid; the turn between them lighter, so the eye reads a
                direction of travel rather than three equal dots. */}
            <circle cx="6"  cy="42" r="3" fill={AMBER} />
            <circle cx="44" cy="10" r="3" fill={AMBER} />
            <circle cx="32" cy="32" r="2" fill={AMBER} opacity="0.7" />
        </svg>
    );
}

/**
 * Mark plus wordmark.
 *
 * @param size     'sm' for the sidebar, 'lg' for the login page
 * @param subtitle the line under the wordmark. Shortened to "Fleet · GPS · Ops" in the 220px
 *                 sidebar, where the full phrase does not fit beside the mark and the collapse
 *                 button; pass null to drop it where vertical space is tight.
 */
export default function Logo({ size = 'sm', subtitle = 'Fleet · GPS · Operations' }) {
    const s = size === 'lg'
        ? { mark: 56, name: '2rem',    sub: '0.68rem', gap: 14 }
        : { mark: 34, name: '1.15rem', sub: '0.52rem', gap: 10 };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: s.gap, minWidth: 0 }}>
            <LogoMark size={s.mark} />

            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{
                    fontFamily: "Oswald, 'Barlow Condensed', system-ui, sans-serif",
                    fontSize: s.name, fontWeight: 700, letterSpacing: '0.04em',
                    textTransform: 'uppercase', lineHeight: 1, color: TEXT_ON_DARK,
                    whiteSpace: 'nowrap',
                }}>
                    TURPRO<span style={{ color: AMBER_DEEP }}>TRACK</span>
                </div>

                {subtitle && (
                    <div style={{
                        fontFamily: "Oswald, 'Barlow Condensed', system-ui, sans-serif",
                        fontSize: s.sub, fontWeight: 500, letterSpacing: '0.22em',
                        textTransform: 'uppercase', color: '#a08060', marginTop: 3,
                        whiteSpace: 'nowrap',
                    }}>
                        {subtitle}
                    </div>
                )}
            </div>
        </div>
    );
}

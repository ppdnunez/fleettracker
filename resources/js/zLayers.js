/**
 * The app's stacking order, in one place.
 *
 * Leaflet numbers its own layers from 200 (map panes) up to 1000 (controls), and those numbers are
 * not ours to change. Anything drawn over a map therefore has to clear 1000 — which is easy to get
 * wrong, because a dialog at a perfectly sensible z-index looks fine on every page without a map
 * and disappears behind the one page that has one.
 *
 * Two rules keep it straight:
 *
 *   1. Map wrappers carry `isolation: 'isolate'`, so Leaflet's numbers are confined to their own
 *      stacking context and cannot compete with the page around them. MAP_CONTROL is the scale
 *      *inside* that context.
 *   2. Everything floating above the page uses a name from here, not a literal.
 */
export const Z = {
    /** Controls drawn over a map — inside the isolated wrapper, so it only outranks Leaflet's own. */
    mapControl: 1000,
    /** A control's hover tooltip, which must clear the control it belongs to. */
    mapControlTip: 1010,
    /** Dropdowns and popovers attached to page furniture. */
    popover: 1200,
    /** Dialogs that block the page: confirmations, editors, importers. */
    modal: 2000,
    /** Alerts that must be seen over a dialog — an SOS is not something to queue behind a form. */
    alert: 3000,
};

export default Z;

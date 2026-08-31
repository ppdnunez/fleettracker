import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Keeps Leaflet's idea of the container size in step with the real one.
 *
 * Leaflet measures its container once, when the map is created, and never again on its own. Any
 * later change to that size leaves it drawing for the old dimensions: it requests only the handful
 * of tiles that covered the original box and the rest of the panel stays empty, while the controls
 * — ordinary absolutely-positioned elements — keep looking perfectly fine. That combination is
 * what "the map is blank" turns out to be nearly every time.
 *
 * Plenty of things resize this container after mount: collapsing the sidebar, opening DevTools,
 * resizing the window, or switching to a Vehicle Track tab that was laid out at a different width
 * while it was hidden.
 *
 * A ResizeObserver is the trigger rather than a window resize listener, because the sidebar
 * changes the map's width without the window's changing at all.
 */
export default function KeepSized() {
    const map = useMap();

    useEffect(() => {
        // Deferred to the next frame each time: invalidateSize() has to measure after the browser
        // has finished laying the new size out, or it reads the size that is on its way out.
        const resize = () => requestAnimationFrame(() => map.invalidateSize({ animate: false }));

        const observer = new ResizeObserver(resize);
        observer.observe(map.getContainer());

        // Once on mount as well. The first paint often lands before the layout around the map has
        // settled, which breaks the map without anyone having touched the window.
        resize();

        return () => observer.disconnect();
    }, [map]);

    return null;
}

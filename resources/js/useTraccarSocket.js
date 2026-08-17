import { useEffect, useRef } from 'react';
import { api } from './api.js';

/**
 * Subscribes to Traccar's websocket and hands every frame to `onMessage`.
 *
 * Auth mirrors the REST API: a short-lived token is minted server-side as the signed-in identity
 * (GET /api/traccar/ws-token), so a tenant's socket carries only their own devices and the Traccar
 * password never reaches the browser. A fresh token is minted on every reconnect, which is why its
 * expiry never matters in practice.
 *
 * Frames arrive as { positions?, devices?, events? } — positions as vehicles report, devices on
 * status/name changes, events for alarms.
 *
 * Both callbacks are held in refs, so the subscription survives re-renders: a handler that closed
 * over the current device list would otherwise tear down and rebuild the socket on every position
 * update, which is a reconnect storm rather than a live feed.
 *
 * @param onMessage           (frame) => void
 * @param onConnectionChange  (connected: boolean) => void, optional
 */
export default function useTraccarSocket(onMessage, onConnectionChange) {
    const messageRef = useRef(onMessage);
    messageRef.current = onMessage;

    const statusRef = useRef(onConnectionChange);
    statusRef.current = onConnectionChange;

    useEffect(() => {
        let cancelled = false;
        let socket = null;
        let retry = null;

        const connect = async () => {
            try {
                const { data } = await api.getWsToken();
                if (cancelled) return;

                socket = new WebSocket(`${data.url}?token=${encodeURIComponent(data.token)}`);

                socket.onopen = () => { if (!cancelled) statusRef.current?.(true); };

                socket.onmessage = (evt) => {
                    let frame;
                    try { frame = JSON.parse(evt.data); } catch { return; }
                    messageRef.current?.(frame);
                };

                socket.onclose = () => {
                    if (cancelled) return;
                    statusRef.current?.(false);
                    retry = setTimeout(connect, 3000);
                };

                socket.onerror = () => socket.close();
            } catch {
                if (cancelled) return;
                statusRef.current?.(false);
                retry = setTimeout(connect, 3000);
            }
        };

        connect();

        return () => {
            cancelled = true;
            clearTimeout(retry);
            socket?.close();
        };
    }, []);
}

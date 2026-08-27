/**
 * Turns a /api/traccar/ws-token response into the URL to hand `new WebSocket()`.
 *
 * The server may name the socket absolutely (ws(s)://host/api/socket) or origin-relative
 * (/traccar-ws, for deployments that proxy Traccar's socket through the app's own TLS vhost);
 * a relative name is resolved against the page, so it inherits the page's scheme and host.
 *
 * A ws:// socket opened from an https:// page is blocked as mixed content and `new WebSocket()`
 * throws a SecurityError, which no amount of reconnecting can get past — so that case is refused
 * here as InsecureSocketError, letting callers stop retrying instead of re-minting a token every
 * few seconds forever. Point TRACCAR_WS_URL at a wss:// (or origin-relative) endpoint to fix it.
 */
export class InsecureSocketError extends Error {}

export function traccarSocketUrl({ url, token }) {
    const socketUrl = new URL(url, window.location.href);

    if (socketUrl.protocol === 'http:')  socketUrl.protocol = 'ws:';
    if (socketUrl.protocol === 'https:') socketUrl.protocol = 'wss:';

    if (socketUrl.protocol === 'ws:' && window.location.protocol === 'https:') {
        throw new InsecureSocketError(
            `This page is served over HTTPS and cannot open the insecure socket ${socketUrl.origin}. ` +
            'Set TRACCAR_WS_URL to a wss:// (or origin-relative) endpoint proxied through this host.'
        );
    }

    socketUrl.searchParams.set('token', token);
    return socketUrl.toString();
}

import { useState, useEffect, useMemo } from 'react';

/**
 * Paging for report tables.
 *
 * Client-side on purpose. These reports come back from Traccar as one array for the whole period —
 * there is no cursor to page against, and asking for a slice would mean re-querying Traccar for
 * every page click over a link where each call costs two round trips. The rows are already here;
 * what was missing was a way to look at them a hundred at a time instead of all at once.
 *
 * Which also means Export and "Copy all names" must keep working from the full set, never from
 * pageItems — a report that silently exported only the page on screen would be worse than one
 * with no paging at all.
 */

export const PAGE_SIZES = [25, 50, 100, 200, 500];

/** A hundred rows fills a screen a few times over without making the table unusable. */
export const DEFAULT_PAGE_SIZE = 100;

/**
 * @param items     the full result set
 * @param defaultSize rows per page to start on
 *
 * `items` must keep a stable identity between renders — memoise anything derived, or every render
 * resets the reader to page one.
 */
export function usePagination(items, defaultSize = DEFAULT_PAGE_SIZE) {
    const [size, setSize] = useState(defaultSize);
    const [page, setPage] = useState(1);

    const total     = items.length;
    const pageCount = Math.max(1, Math.ceil(total / size));

    // A fresh search, or a larger page size, can leave the reader on a page that no longer exists.
    // Going back to the first page is the honest answer: there is no way to know where in a new
    // result set they meant to be.
    useEffect(() => { setPage(1); }, [items, size]);

    // Clamped rather than trusted: the effect above lands a render later, and reading past the end
    // in between would blank the table for a frame.
    const current = Math.min(page, pageCount);
    const offset  = (current - 1) * size;

    const pageItems = useMemo(() => items.slice(offset, offset + size), [items, offset, size]);

    return { page: current, setPage, size, setSize, total, pageCount, offset, pageItems };
}

const btn = (enabled) => ({
    padding: '5px 11px',
    border: '1px solid #383838',
    borderRadius: 6,
    background: '#1a1a1a',
    color: enabled ? '#d5c9b8' : '#383838',
    fontSize: 12.5,
    cursor: enabled ? 'pointer' : 'not-allowed',
});

/**
 * The page numbers to offer.
 *
 * Always the first and last, always the current and its neighbours, with gaps marked rather than
 * rendered — a report over a long period can run to hundreds of pages, and a strip of every one of
 * them is not navigation.
 */
function pageNumbers(current, count) {
    if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);

    const around = [current - 1, current, current + 1].filter(p => p > 1 && p < count);
    const list   = [1, ...around, count];
    const out    = [];

    for (const p of list) {
        if (out.length && p - out[out.length - 1] > 1) out.push('…');
        out.push(p);
    }

    return out;
}

export default function Pagination({ pager, noun = 'rows' }) {
    const { page, setPage, size, setSize, total, pageCount, offset } = pager;

    if (total === 0) return null;

    const go = (p) => setPage(Math.min(Math.max(1, p), pageCount));

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            marginTop: 10, paddingTop: 10, borderTop: '1px solid #2c2c2c',
        }}>
            <span style={{ fontSize: 12.5, color: '#9a8a75' }}>
                Showing <strong style={{ color: '#d5c9b8' }}>{offset + 1}–{Math.min(offset + size, total)}</strong> of {total} {noun}
            </span>

            <select value={size} onChange={e => setSize(Number(e.target.value))}
                style={{ padding: '5px 24px 5px 8px', border: '1px solid #383838', borderRadius: 6, fontSize: 12.5, color: '#d5c9b8', background: '#1a1a1a', cursor: 'pointer' }}>
                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} per page</option>)}
            </select>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <button onClick={() => go(1)}        disabled={page === 1} style={btn(page !== 1)}>« First</button>
                <button onClick={() => go(page - 1)} disabled={page === 1} style={btn(page !== 1)}>‹ Prev</button>

                {pageNumbers(page, pageCount).map((p, i) => (
                    p === '…'
                        ? <span key={`gap-${i}`} style={{ color: '#5a4e42', fontSize: 12.5, padding: '0 2px' }}>…</span>
                        : (
                            <button key={p} onClick={() => go(p)} style={{
                                ...btn(true),
                                minWidth: 32,
                                fontWeight: p === page ? 700 : 500,
                                background: p === page ? '#372817' : '#1a1a1a',
                                borderColor: p === page ? '#78440a' : '#383838',
                                color: p === page ? '#f59e0b' : '#d5c9b8',
                            }}>{p}</button>
                        )
                ))}

                <button onClick={() => go(page + 1)}   disabled={page === pageCount} style={btn(page !== pageCount)}>Next ›</button>
                <button onClick={() => go(pageCount)}  disabled={page === pageCount} style={btn(page !== pageCount)}>Last »</button>
            </div>
        </div>
    );
}

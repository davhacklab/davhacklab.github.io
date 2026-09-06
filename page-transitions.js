/**
 * DAV HackLab — Instant Navigation & Pre-Fetch Engine
 * Automatically speculative-prefetches internal pages on hover/intent
 * and coordinates smooth cross-document view transitions.
 */

(function () {
    "use strict";

    // 1. Speculation Rules API for modern browsers (Chrome 109+, Edge 109+, Safari 18.2+)
    try {
        if (typeof HTMLScriptElement !== "undefined" && HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules")) {
            const specScript = document.createElement("script");
            specScript.type = "speculationrules";
            specScript.textContent = JSON.stringify({
                prefetch: [
                    {
                        where: {
                            and: [
                                { href_matches: "/*" },
                                { not: { href_matches: "/*#*" } },
                                { not: { href_matches: "/*logout*" } },
                                { not: { selector_matches: "[data-no-prefetch]" } }
                            ]
                        },
                        eagerness: "moderate"
                    }
                ]
            });
            document.head.appendChild(specScript);
        }
    } catch (_) {
        // Safe fallback if speculation rules throws
    }

    // 2. High-speed predictive preloader for all browsers
    const prefetchedUrls = new Set();

    function isInternalHtmlLink(anchor) {
        if (!anchor || !anchor.href) return false;
        if (anchor.target && anchor.target !== "_self") return false;
        if (anchor.hasAttribute("download")) return false;
        if (anchor.hasAttribute("data-no-prefetch")) return false;

        try {
            const targetUrl = new URL(anchor.href, window.location.href);
            if (targetUrl.origin !== window.location.origin) return false;
            if (targetUrl.pathname === window.location.pathname && !targetUrl.search) return false;
            if (targetUrl.pathname.includes("logout")) return false;

            const isHtmlOrRoot = targetUrl.pathname.endsWith(".html") || targetUrl.pathname.endsWith("/") || !targetUrl.pathname.includes(".");
            return isHtmlOrRoot;
        } catch (_) {
            return false;
        }
    }

    function prefetchUrl(url) {
        if (!url || prefetchedUrls.has(url)) return;
        prefetchedUrls.add(url);

        try {
            // Priority fetch for document caching
            if ("fetch" in window) {
                fetch(url, { priority: "low", cache: "force-cache" }).catch(() => {});
            } else {
                const link = document.createElement("link");
                link.rel = "prefetch";
                link.href = url;
                link.as = "document";
                document.head.appendChild(link);
            }
        } catch (_) {}
    }

    // Trigger prefetch on pointer hover or touch start
    document.addEventListener("pointerover", (event) => {
        const anchor = event.target?.closest?.("a");
        if (isInternalHtmlLink(anchor)) {
            prefetchUrl(anchor.href);
        }
    }, { passive: true });

    document.addEventListener("touchstart", (event) => {
        const anchor = event.target?.closest?.("a");
        if (isInternalHtmlLink(anchor)) {
            prefetchUrl(anchor.href);
        }
    }, { passive: true });

    // 3. Fallback smooth exit transition for older browsers without View Transitions
    const supportsViewTransitions = "startViewTransition" in document || "onpagereveal" in window;
    if (!supportsViewTransitions) {
        document.addEventListener("click", (event) => {
            const anchor = event.target?.closest?.("a");
            if (!isInternalHtmlLink(anchor)) return;
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const destination = anchor.href;
            event.preventDefault();
            document.body.classList.add("page-transitioning-out");

            setTimeout(() => {
                window.location.href = destination;
            }, 75);
        });
    }

    // 4. Reset transitions on page reveal (handles bfcache back/forward navigation)
    window.addEventListener("pageshow", () => {
        document.body.classList.remove("page-transitioning-out");
    });
})();

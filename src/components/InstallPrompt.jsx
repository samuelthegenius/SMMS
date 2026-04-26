import { useState, useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from './ui/Button';

const DISMISSED_KEY = 'smms-install-dismissed';
// Only suppress for 30 days — after that, offer again
const DISMISSED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isDismissed() {
    try {
        const raw = localStorage.getItem(DISMISSED_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        // Guard against old plain-string format: JSON.parse('true') === true (no throw)
        // and any other non-object value that lacks a .ts field.
        if (!data || typeof data !== 'object' || !data.ts) {
            // Treat legacy / malformed value as expired — clear it
            localStorage.removeItem(DISMISSED_KEY);
            window.__SMMS_INSTALL_DISMISSED__ = false;
            return false;
        }
        if (Date.now() - data.ts > DISMISSED_TTL_MS) {
            localStorage.removeItem(DISMISSED_KEY);
            window.__SMMS_INSTALL_DISMISSED__ = false;
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

function markDismissed() {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ts: Date.now() }));
    window.__SMMS_INSTALL_DISMISSED__ = true;
}

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    // Ref so the native listener can call the same setter without stale closure
    const promptRef = useRef(null);

    const showPrompt = (evt) => {
        if (isDismissed()) return;
        promptRef.current = evt;
        setDeferredPrompt(evt);
        setIsVisible(true);
    };

    useEffect(() => {
        // 1. Check if install-capture.js already caught the event before React mounted
        if (window.__SMMS_DEFERRED_PROMPT__) {
            showPrompt(window.__SMMS_DEFERRED_PROMPT__);
        }

        // 2. Listen for the forwarded event from install-capture.js
        //    (fires when beforeinstallprompt fires AFTER React mounts)
        const handleInstallable = () => {
            if (window.__SMMS_DEFERRED_PROMPT__) {
                showPrompt(window.__SMMS_DEFERRED_PROMPT__);
            }
        };

        // 3. DIRECT native listener — belt-and-suspenders fallback.
        //    Catches the event if install-capture.js was bypassed (e.g. CSP,
        //    caching, or the script loaded after the event already fired).
        const handleNative = (e) => {
            // Must prevent default here too so browser's mini-infobar stays hidden
            e.preventDefault();
            // Also store globally so other parts of the app can access it
            window.__SMMS_DEFERRED_PROMPT__ = e;
            showPrompt(e);
        };

        window.addEventListener('smms:installable', handleInstallable);
        window.addEventListener('beforeinstallprompt', handleNative);

        return () => {
            window.removeEventListener('smms:installable', handleInstallable);
            window.removeEventListener('beforeinstallprompt', handleNative);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDismiss = () => {
        markDismissed();
        setIsVisible(false);
        setDeferredPrompt(null);
        promptRef.current = null;
    };

    const handleInstall = async () => {
        const prompt = promptRef.current || deferredPrompt;
        if (!prompt) return;

        try {
            // Show the native install dialog
            await prompt.prompt();
            const { outcome } = await prompt.userChoice;

            if (outcome === 'accepted') {
                localStorage.removeItem(DISMISSED_KEY);
                window.__SMMS_INSTALL_DISMISSED__ = false;
            }
        } catch (err) {
            // prompt() can throw if called more than once or after a navigation
            console.warn('[InstallPrompt] prompt() failed:', err);
        } finally {
            window.__SMMS_DEFERRED_PROMPT__ = null;
            promptRef.current = null;
            setDeferredPrompt(null);
            setIsVisible(false);
        }
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:bottom-8 z-50 max-w-md w-full bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-2xl shadow-2xl shadow-slate-900/30 flex items-center justify-between gap-4 animate-slide-up border border-slate-700/50 backdrop-blur-xl">
            <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-3 rounded-xl shadow-lg shadow-emerald-500/20">
                    <Download className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-sm">Install MTU SMMS App</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Smart Maintenance Management System</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={handleDismiss}
                    className="p-2 hover:bg-white/10 rounded-xl transition-all duration-200 text-slate-400 hover:text-white active:scale-95"
                >
                    <X className="w-5 h-5" />
                </button>
                <Button
                    onClick={handleInstall}
                    size="sm"
                    className="bg-emerald-500 hover:bg-emerald-400 text-white border-0 shadow-lg shadow-emerald-500/25 font-semibold"
                >
                    Install
                </Button>
            </div>
        </div>
    );
}

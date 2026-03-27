import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from './ui/Button';

const DISMISSED_KEY = 'smms-install-dismissed';

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if there's already a captured deferred prompt
        if (window.__SMMS_DEFERRED_PROMPT__ && !window.__SMMS_INSTALL_DISMISSED__) {
            setDeferredPrompt(window.__SMMS_DEFERRED_PROMPT__);
            setIsVisible(true);
        }

        // Listen for the custom event fired by install-capture.js
        const handleInstallable = () => {
            if (window.__SMMS_DEFERRED_PROMPT__ && !window.__SMMS_INSTALL_DISMISSED__) {
                setDeferredPrompt(window.__SMMS_DEFERRED_PROMPT__);
                setIsVisible(true);
            }
        };

        window.addEventListener('smms:installable', handleInstallable);

        return () => {
            window.removeEventListener('smms:installable', handleInstallable);
        };
    }, []);

    const handleDismiss = () => {
        localStorage.setItem(DISMISSED_KEY, 'true');
        window.__SMMS_INSTALL_DISMISSED__ = true;
        setIsVisible(false);
        setDeferredPrompt(null);
    };

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        // If installed, clear the dismissed flag
        if (outcome === 'accepted') {
            localStorage.removeItem(DISMISSED_KEY);
            window.__SMMS_INSTALL_DISMISSED__ = false;
        }

        // We've used the prompt, and can't use it again, throw it away
        window.__SMMS_DEFERRED_PROMPT__ = null;
        setDeferredPrompt(null);
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:bottom-8 z-50 max-w-md w-full bg-slate-900 text-white p-4 rounded-xl shadow-2xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-5 fade-in duration-500 border border-slate-700">
            <div className="flex items-center gap-3">
                <div className="bg-slate-800 p-2.5 rounded-lg">
                    <Download className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                    <h3 className="font-semibold text-sm">Install App</h3>
                    <p className="text-xs text-slate-400">Add to Home Screen for quick access</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={handleDismiss}
                    className="p-1.5 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
                >
                    <X className="w-5 h-5" />
                </button>
                <Button
                    onClick={handleInstall}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                >
                    Install
                </Button>
            </div>
        </div>
    );
}

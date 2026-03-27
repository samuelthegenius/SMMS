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
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:bottom-8 z-50 max-w-md w-full bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-2xl shadow-2xl shadow-slate-900/30 flex items-center justify-between gap-4 animate-slide-up border border-slate-700/50 backdrop-blur-xl">
            <div className="flex items-center gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-3 rounded-xl shadow-lg shadow-emerald-500/20">
                    <Download className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h3 className="font-bold text-sm">Install SMMS App</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Add to Home Screen for quick access</p>
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

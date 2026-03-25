import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from './ui/Button';

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handler = (e) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            // Clean up any pending prompt
            if (deferredPrompt) {
                setDeferredPrompt(null);
                setIsVisible(false);
            }
        };
    }, [deferredPrompt]);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        // We've used the prompt, and can't use it again, throw it away
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
                    onClick={() => setIsVisible(false)}
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

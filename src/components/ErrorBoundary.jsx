import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the component tree and displays a fallback UI.
 * 
 * Security Benefits:
 * - Prevents white-screen-of-death that could expose sensitive data in error stacks
 * - Logs errors for monitoring
 * - Provides user-friendly error messages
 */

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError() {
        // Update state so the next render will show the fallback UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log error to console only in development
        if (import.meta.env.DEV) {
          console.error('ErrorBoundary caught an error:', error, errorInfo);
        }
        
        // Log to error tracking service (e.g., Sentry, LogRocket)
        // if (process.env.NODE_ENV === 'production') {
        //     sendToErrorTrackingService(error, errorInfo);
        // }

        this.setState({
            error,
            errorInfo
        });
    }

    handleReset = () => {
        // Clear error state and reload
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.href = '/dashboard';
    };

    handleReload = () => {
        // Force reload to get fresh assets (handles chunk load errors)
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
                        <div className="mx-auto w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
                            <AlertTriangle className="w-8 h-8 text-rose-600" />
                        </div>
                        
                        <h1 className="text-2xl font-bold text-slate-900 mb-2">
                            Oops! Something went wrong
                        </h1>
                        
                        <p className="text-slate-600 mb-6">
                            We're sorry for the inconvenience. Please try refreshing the page.
                        </p>

                        <div className="space-y-3">
                            <Button
                                onClick={this.handleReload}
                                className="w-full"
                            >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Reload Page
                            </Button>
                            
                            <Button
                                onClick={this.handleReset}
                                variant="outline"
                                className="w-full"
                            >
                                Go to Dashboard
                            </Button>
                        </div>

                        {/* Development-only error details */}
                        {import.meta.env.DEV && this.state.error && (
                            <details className="mt-6 text-left">
                                <summary className="text-sm font-medium text-slate-700 cursor-pointer">
                                    Error Details (Development Only)
                                </summary>
                                <pre className="mt-2 p-3 bg-slate-100 rounded-lg text-xs text-slate-800 overflow-auto max-h-64">
                                    {this.state.error.toString()}
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

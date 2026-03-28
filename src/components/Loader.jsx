import { Skeleton } from "./ui/Skeleton";
import { Wrench } from "lucide-react";

const PageHeader = () => (
    <div className="animate-pulse mb-8">
        <div className="h-8 bg-slate-200 rounded w-48 mb-2"></div>
        <div className="h-5 bg-slate-200 rounded w-64"></div>
    </div>
);

const SidebarSkeleton = () => (
    <div className="w-64 hidden md:block bg-gradient-to-b from-primary to-slate-900 p-6 space-y-6" aria-hidden="true">
        <div className="flex items-center gap-3 pb-6 border-b border-white/10">
            <div className="bg-white/10 p-2 rounded-xl backdrop-blur-sm">
                <Wrench className="w-6 h-6 text-accent" />
            </div>
            <Skeleton className="h-6 w-24 bg-white/20" />
        </div>
        <div className="space-y-3">
            <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
            <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
            <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
            <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
        </div>
        <div className="mt-auto pt-6 border-t border-white/10">
            <Skeleton className="h-16 w-full bg-white/10 rounded-xl" />
        </div>
    </div>
);

const StatsCardSkeleton = () => (
    <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
        <div className="flex justify-between items-start">
            <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-20 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-12"></div>
            </div>
            <div className="h-12 w-12 bg-slate-200 rounded-xl"></div>
        </div>
    </div>
);

const CardSkeleton = () => (
    <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
        <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
                <div className="h-6 bg-slate-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
            <div className="h-6 bg-slate-200 rounded w-16"></div>
        </div>
        <div className="space-y-3">
            <div className="flex items-center gap-4">
                <div className="h-4 bg-slate-200 rounded w-20"></div>
                <div className="h-4 bg-slate-200 rounded w-16"></div>
            </div>
            <div className="flex items-center gap-2">
                <div className="h-4 bg-slate-200 rounded w-24"></div>
                <div className="h-4 bg-slate-200 rounded w-20"></div>
            </div>
        </div>
    </div>
);

const JobCardSkeleton = () => (
    <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
            <div className="flex-1 space-y-4 w-full">
                <div className="flex items-center gap-3">
                    <div className="h-6 bg-slate-200 rounded w-24"></div>
                    <div className="h-5 bg-slate-200 rounded w-20"></div>
                </div>
                <div className="space-y-2">
                    <div className="h-7 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-4 bg-slate-200 rounded w-full"></div>
                    <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                </div>
                <div className="flex gap-2">
                    <div className="h-8 bg-slate-200 rounded w-32"></div>
                    <div className="h-8 bg-slate-200 rounded w-40"></div>
                </div>
            </div>
            <div className="flex flex-col gap-3 w-full md:w-auto min-w-[160px]">
                <div className="h-10 bg-slate-200 rounded-lg w-full"></div>
            </div>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100">
            <div className="h-4 bg-slate-200 rounded w-40"></div>
        </div>
    </div>
);

const TicketCardSkeleton = () => (
    <div className="bg-white rounded-xl border border-slate-200/60 p-6 animate-pulse h-full flex flex-col">
        <div className="flex justify-between items-start mb-4">
            <div className="h-6 bg-slate-200 rounded w-20"></div>
            <div className="h-4 bg-slate-200 rounded w-24"></div>
        </div>
        <div className="h-6 bg-slate-200 rounded w-full mb-2"></div>
        <div className="h-4 bg-slate-200 rounded w-full mb-1"></div>
        <div className="h-4 bg-slate-200 rounded w-2/3 mb-6"></div>
        <div className="mt-auto pt-4 border-t border-slate-100 space-y-3">
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-6 bg-slate-200 rounded w-32"></div>
        </div>
    </div>
);

const FormFieldSkeleton = ({ labelWidth = "w-24", inputHeight = "h-11" }) => (
    <div className="space-y-2 animate-pulse">
        <div className={`h-4 bg-slate-200 rounded ${labelWidth}`}></div>
        <div className={`bg-slate-200 rounded-xl ${inputHeight} w-full`}></div>
    </div>
);

const FormTextareaSkeleton = () => (
    <div className="space-y-2 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-24"></div>
        <div className="bg-slate-200 rounded-xl h-32 w-full"></div>
    </div>
);

const FilterSkeleton = () => (
    <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm animate-pulse">
        <div className="h-5 w-5 bg-slate-200 rounded ml-2"></div>
        <div className="h-9 bg-slate-200 rounded w-40"></div>
    </div>
);

const TabSkeleton = () => (
    <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm animate-pulse">
        <div className="h-9 bg-slate-200 rounded-lg w-24"></div>
        <div className="h-9 bg-slate-200 rounded-lg w-24"></div>
    </div>
);

const ChartSkeleton = () => (
    <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-32 mb-6"></div>
        <div className="h-64 bg-slate-200 rounded-xl w-full"></div>
    </div>
);

// Variant: Generic Dashboard (full page with sidebar)
const GenericDashboardSkeleton = () => (
    <div className="flex h-screen w-full bg-background animate-fade-in" role="status" aria-label="Loading content" aria-busy="true">
        <SidebarSkeleton />
        <div className="flex-1 p-6 md:p-8 space-y-6" aria-hidden="true">
            <div className="flex justify-between items-center">
                <Skeleton className="h-10 w-48 rounded-xl" />
                <Skeleton className="h-10 w-10 rounded-full" />
            </div>
            <div className="grid gap-6 md:grid-cols-3">
                <Skeleton className="h-32 rounded-2xl bg-slate-200/70" />
                <Skeleton className="h-32 rounded-2xl bg-slate-200/70" />
                <Skeleton className="h-32 rounded-2xl bg-slate-200/70" />
            </div>
            <div className="space-y-4">
                <Skeleton className="h-12 w-full rounded-xl bg-slate-200/70" />
                <Skeleton className="h-64 rounded-2xl bg-slate-200/70" />
            </div>
        </div>
        <span className="sr-only">Loading...</span>
    </div>
);

// Variant: Admin Dashboard (tabs, filter, 4 stats, ticket cards)
const AdminDashboardSkeleton = () => (
    <div className="space-y-8 animate-fade-in" role="status" aria-label="Loading admin dashboard" aria-busy="true">
        {/* Header with Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <PageHeader />
            <TabSkeleton />
        </div>

        {/* Filter */}
        <FilterSkeleton />

        {/* Stats Cards - 4 columns */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)}
        </div>

        {/* Tickets Grid - 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <span className="sr-only">Loading...</span>
    </div>
);

// Variant: Technician Dashboard (jobs list with AI section)
const TechnicianDashboardSkeleton = () => (
    <div className="space-y-8 animate-fade-in" role="status" aria-label="Loading technician jobs" aria-busy="true">
        <PageHeader />

        <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => <JobCardSkeleton key={i} />)}
        </div>
        <span className="sr-only">Loading...</span>
    </div>
);

// Variant: User Dashboard (ticket cards grid, 2-3 columns)
const UserDashboardSkeleton = () => (
    <div className="space-y-8 animate-fade-in" role="status" aria-label="Loading user dashboard" aria-busy="true">
        <PageHeader />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <TicketCardSkeleton key={i} />)}
        </div>
        <span className="sr-only">Loading...</span>
    </div>
);

// Variant: Ticket Form (form fields layout)
const TicketFormSkeleton = () => (
    <div className="space-y-8 animate-fade-in max-w-3xl" role="status" aria-label="Loading ticket form" aria-busy="true">
        <PageHeader />

        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 space-y-6">
            {/* Title & Category row */}
            <div className="grid md:grid-cols-2 gap-6">
                <FormFieldSkeleton labelWidth="w-16" />
                <FormFieldSkeleton labelWidth="w-20" />
            </div>

            {/* Description */}
            <FormTextareaSkeleton />

            {/* Facility Type & Location row */}
            <div className="grid md:grid-cols-2 gap-6">
                <FormFieldSkeleton labelWidth="w-28" />
                <FormFieldSkeleton labelWidth="w-36" />
            </div>

            {/* Priority & Image row */}
            <div className="grid md:grid-cols-2 gap-6">
                <FormFieldSkeleton labelWidth="w-16" />
                <div className="space-y-2 animate-pulse">
                    <div className="h-4 bg-slate-200 rounded w-24"></div>
                    <div className="h-32 bg-slate-200 rounded-xl w-full"></div>
                </div>
            </div>

            {/* Submit button */}
            <div className="h-11 bg-slate-200 rounded-xl w-full mt-4"></div>
        </div>
        <span className="sr-only">Loading...</span>
    </div>
);

// Variant: Analytics Page (charts and stats)
const AnalyticsSkeleton = () => (
    <div className="space-y-8 animate-fade-in" role="status" aria-label="Loading analytics" aria-busy="true">
        <PageHeader />

        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => <StatsCardSkeleton key={i} />)}
        </div>

        {/* Charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartSkeleton />
            <ChartSkeleton />
        </div>

        {/* Additional chart */}
        <ChartSkeleton />
        <span className="sr-only">Loading...</span>
    </div>
);

// Variant: Simple Content (minimal page content)
const SimpleContentSkeleton = () => (
    <div className="space-y-6 animate-fade-in" role="status" aria-label="Loading content" aria-busy="true">
        <div className="animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-48 mb-2"></div>
            <div className="h-5 bg-slate-200 rounded w-64"></div>
        </div>
        <div className="h-64 bg-slate-200 rounded-2xl animate-pulse"></div>
        <span className="sr-only">Loading...</span>
    </div>
);

// Variant: Security Dashboard (security metrics + events list)
const SecurityDashboardSkeleton = () => (
    <div className="space-y-8 animate-fade-in" role="status" aria-label="Loading security dashboard" aria-busy="true">
        <PageHeader />

        {/* Security Stats - 4 metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-slate-200 rounded-xl"></div>
                        <div>
                            <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                            <div className="h-8 bg-slate-200 rounded w-12"></div>
                        </div>
                    </div>
                </div>
            ))}
        </div>

        {/* Security Events List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse">
            <div className="border-b border-slate-200 p-4">
                <div className="h-6 bg-slate-200 rounded w-40"></div>
            </div>
            <div className="divide-y divide-slate-100">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="p-4 flex items-center gap-4">
                        <div className="h-10 w-10 bg-slate-200 rounded-full"></div>
                        <div className="flex-1">
                            <div className="h-4 bg-slate-200 rounded w-48 mb-2"></div>
                            <div className="h-3 bg-slate-200 rounded w-32"></div>
                        </div>
                        <div className="h-6 bg-slate-200 rounded w-20"></div>
                    </div>
                ))}
            </div>
        </div>
        <span className="sr-only">Loading...</span>
    </div>
);

// Variant: Auth Form (login/signup centered form)
const AuthFormSkeleton = ({ showRoleFields = false }) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 animate-fade-in" role="status" aria-label="Loading" aria-busy="true">
        <div className="w-full max-w-md">
            {/* Logo */}
            <div className="flex items-center justify-center gap-3 mb-8">
                <div className="h-12 w-12 bg-slate-200 rounded-xl animate-pulse"></div>
                <div className="h-8 bg-slate-200 rounded w-48 animate-pulse"></div>
            </div>

            {/* Form Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 space-y-6 animate-pulse">
                {/* Header */}
                <div className="space-y-2 text-center">
                    <div className="h-7 bg-slate-200 rounded w-32 mx-auto"></div>
                    <div className="h-4 bg-slate-200 rounded w-56 mx-auto"></div>
                </div>

                {/* Form Fields */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="h-4 bg-slate-200 rounded w-16"></div>
                        <div className="h-11 bg-slate-200 rounded-xl w-full"></div>
                    </div>
                    <div className="space-y-2">
                        <div className="h-4 bg-slate-200 rounded w-20"></div>
                        <div className="h-11 bg-slate-200 rounded-xl w-full"></div>
                    </div>

                    {/* Extra fields for signup */}
                    {showRoleFields && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="h-4 bg-slate-200 rounded w-16"></div>
                                    <div className="h-11 bg-slate-200 rounded-xl w-full"></div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-4 bg-slate-200 rounded w-20"></div>
                                    <div className="h-11 bg-slate-200 rounded-xl w-full"></div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="h-4 bg-slate-200 rounded w-24"></div>
                                <div className="h-11 bg-slate-200 rounded-xl w-full"></div>
                            </div>
                        </>
                    )}
                </div>

                {/* Submit Button */}
                <div className="h-11 bg-slate-200 rounded-xl w-full"></div>

                {/* Footer Link */}
                <div className="h-4 bg-slate-200 rounded w-48 mx-auto"></div>
            </div>
        </div>
        <span className="sr-only">Loading...</span>
    </div>
);

const variants = {
    generic: GenericDashboardSkeleton,
    admin: AdminDashboardSkeleton,
    technician: TechnicianDashboardSkeleton,
    user: UserDashboardSkeleton,
    'ticket-form': TicketFormSkeleton,
    analytics: AnalyticsSkeleton,
    simple: SimpleContentSkeleton,
    security: SecurityDashboardSkeleton,
    'auth-login': () => <AuthFormSkeleton showRoleFields={false} />,
    'auth-signup': () => <AuthFormSkeleton showRoleFields={true} />,
};

export default function Loader({ variant = 'generic', fullPage = false }) {
    const SkeletonComponent = variants[variant] || variants.generic;

    if (fullPage) {
        return (
            <div className="flex h-screen w-full bg-background">
                <SidebarSkeleton />
                <div className="flex-1 p-6 md:p-8">
                    <SkeletonComponent />
                </div>
            </div>
        );
    }

    return <SkeletonComponent />;
}

// Named exports for direct usage
export { 
    AdminDashboardSkeleton, 
    TechnicianDashboardSkeleton, 
    UserDashboardSkeleton,
    TicketFormSkeleton,
    AnalyticsSkeleton,
    SimpleContentSkeleton,
    SecurityDashboardSkeleton,
    CardSkeleton,
    StatsCardSkeleton,
    JobCardSkeleton,
    TicketCardSkeleton,
};

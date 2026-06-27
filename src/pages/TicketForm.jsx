import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/useAuth';
import { AlertCircle, CheckCircle, Send, MapPin, AlertTriangle, FileText, Tag, Building, Image, Upload, X, Info, Sparkles, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import Loader from '../components/Loader';
import { cn } from '../lib/utils';
import { FACILITY_TYPES, MAINTENANCE_CATEGORIES, getDepartmentForCategory, BOYS_HOSTELS, GIRLS_HOSTELS } from '../utils/constants';
import { autoCategorizeWithFallback } from '../services/ai';

export default function TicketForm() {
    const navigate = useNavigate();
    const { user, initializing, isStudent, profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [showNonHostelWarning, setShowNonHostelWarning] = useState(false);
    const [pendingFacilityType, setPendingFacilityType] = useState(null);
    
    // AI Categorization state
    const [aiCategorizing, setAiCategorizing] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState(null);
    const [showAiSuggestion, setShowAiSuggestion] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: 'Electrical',
        facilityType: 'Hostel',
        hostel: '',
        specificLocation: '',
        priority: 'Medium',
    });

    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    
    // Duplicate detection state
    const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
    const [duplicateInfo, setDuplicateInfo] = useState(null);
    const [checkingDuplicate, setCheckingDuplicate] = useState(false);
    const [pendingSubmit, setPendingSubmit] = useState(false);
    
    // AI Auto-categorization function (now with priority!)
    const handleAiCategorize = useCallback(async () => {
        if (!formData.title || formData.title.length < 3) {
            toast.error('Please enter a title first (at least 3 characters)');
            return;
        }

        setAiCategorizing(true);
        setShowAiSuggestion(false);

        try {
            const result = await autoCategorizeWithFallback(
                formData.title,
                formData.description,
                formData.facilityType,
                0.6, // Category confidence threshold
                0.5  // Priority confidence threshold (slightly lower)
            );

            setAiSuggestion(result);
            setShowAiSuggestion(true);

            if (result.autoAssigned && result.autoPriorityAssigned) {
                toast.success(`AI suggests: ${result.category} (${result.department}) • Severity: ${result.priority}`);
            } else if (result.autoAssigned) {
                toast.success(`AI suggests: ${result.category} (${result.department})`);
            } else if (result.category) {
                toast.info(`AI suggestion available (category: ${Math.round(result.confidence * 100)}%, severity: ${Math.round((result.priorityConfidence || 0.5) * 100)}%)`);
            } else if (result.priority) {
                toast.info(`AI suggestion available (severity: ${result.priority})`);
            } else {
                toast.warning('Could not auto-categorize. Please select manually.');
            }
        } catch {
            toast.error('AI categorization failed. Please select category and severity manually.');
        } finally {
            setAiCategorizing(false);
        }
    }, [formData.title, formData.description, formData.facilityType]);
    
    const applyAiSuggestion = useCallback(() => {
        const updates = {};
        if (aiSuggestion?.category) {
            updates.category = aiSuggestion.category;
        }
        if (aiSuggestion?.priority && (aiSuggestion.priorityConfidence || 0.5) >= 0.5) {
            updates.priority = aiSuggestion.priority;
        }

        if (Object.keys(updates).length > 0) {
            setFormData(prev => ({ ...prev, ...updates }));
            
            let msg = 'Applied: ';
            if (updates.category) msg += `${aiSuggestion.category} → ${aiSuggestion.department}`;
            if (updates.priority) msg += updates.category ? ` • Severity: ${updates.priority}` : `Severity: ${updates.priority}`;
            toast.success(msg);
        }
        setShowAiSuggestion(false);
    }, [aiSuggestion]);
    
    // Dismiss AI suggestion
    const dismissAiSuggestion = useCallback(() => {
        setShowAiSuggestion(false);
    }, []);

    // Memoize constants to prevent recreation on each render
    const MAX_FILE_SIZE = useMemo(() => 5 * 1024 * 1024, []); // 5MB
    const ALLOWED_MIME_TYPES = useMemo(() => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], []);
    const DANGEROUS_EXTENSIONS = useMemo(() => ['.exe', '.bat', '.cmd', '.scr', '.php', '.asp', '.jsp', '.sh', '.js'], []);

    // Input validation and sanitization - memoized
    const validateAndSanitizeInput = useCallback((name, value, isFinal = false) => {
        const sanitized = value.replace(/[<>]/g, ''); // Remove potential XSS
        
        // Only enforce length limits on final validation (blur/submit)
        if (isFinal) {
            const trimmed = sanitized.trim();
            switch (name) {
                case 'title':
                    if (trimmed.length < 3 || trimmed.length > 100) {
                        throw new Error('Title must be between 3 and 100 characters');
                    }
                    break;
                case 'description':
                    if (trimmed.length < 10 || trimmed.length > 2000) {
                        throw new Error('Description must be between 10 and 2000 characters');
                    }
                    break;
                case 'specificLocation':
                    if (trimmed.length > 200) {
                        throw new Error('Location must be less than 200 characters');
                    }
                    break;
            }
            return trimmed;
        }
        
        // During typing, only check max length to prevent overflow
        switch (name) {
            case 'title':
                if (sanitized.length > 100) {
                    throw new Error('Title must be less than 100 characters');
                }
                break;
            case 'description':
                if (sanitized.length > 2000) {
                    throw new Error('Description must be less than 2000 characters');
                }
                break;
            case 'specificLocation':
                if (sanitized.length > 200) {
                    throw new Error('Location must be less than 200 characters');
                }
                break;
        }
        
        return sanitized;
    }, []);

    const handleChange = useCallback((e) => {
        const { name, value } = e.target;

        // Soft guidance: warn students when selecting non-hostel facilities
        if (isStudent && name === 'facilityType' && value !== 'Hostel' && formData.facilityType === 'Hostel') {
            setPendingFacilityType('Hostel'); // store previous value to revert on cancel
            setFormData(prev => ({ ...prev, facilityType: value, hostel: '' }));
            setShowNonHostelWarning(true);
            return;
        }

        try {
            const sanitized = validateAndSanitizeInput(name, value, false);
            setFormData(prev => ({
                ...prev,
                [name]: sanitized,
                // Reset hostel when switching away from Hostel facility type
                ...(name === 'facilityType' && value !== 'Hostel' ? { hostel: '' } : {}),
            }));
        } catch {
            toast.error('Invalid input. Please check your entry.');
        }
    }, [validateAndSanitizeInput, isStudent, formData.facilityType]);

    const confirmNonHostelSelection = useCallback(() => {
        setPendingFacilityType(null);
        setShowNonHostelWarning(false);
    }, []);

    const cancelNonHostelSelection = useCallback(() => {
        if (pendingFacilityType) {
            setFormData(prev => ({ ...prev, facilityType: pendingFacilityType }));
        }
        setPendingFacilityType(null);
        setShowNonHostelWarning(false);
    }, [pendingFacilityType]);

    const handleImageChange = useCallback((e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            toast.error('File size must be less than 5MB');
            e.target.value = '';
            return;
        }

        // Validate MIME type
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            toast.error('Only JPEG, PNG, WEBP, and GIF images are allowed');
            e.target.value = '';
            return;
        }

		// Additional security: Check for dangerous file extensions
		const fileName = file.name.toLowerCase();
		const fileExt = fileName.split('.').pop();
		const hasDangerousExtension = DANGEROUS_EXTENSIONS.some(ext => ext.slice(1) === fileExt);

		if (hasDangerousExtension) {
			toast.error('Invalid file type');
			e.target.value = '';
			return;
		}

        // Check for suspicious file names
        if (fileName.includes('../') || fileName.includes('..\\') || fileName.includes('%2e%2e')) {
            toast.error('Invalid file name');
            e.target.value = '';
            return;
        }

        setImageFile(file);
        const objectUrl = URL.createObjectURL(file);
        setImagePreview(objectUrl);
    }, [ALLOWED_MIME_TYPES, MAX_FILE_SIZE, DANGEROUS_EXTENSIONS]);

    const removeImage = useCallback(() => {
        setImageFile(null);
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
    }, [imagePreview]);

    // Check for duplicate tickets before submission
    const checkForDuplicates = useCallback(async () => {
        if (!formData.title || formData.title.length < 3) return null;
        
        setCheckingDuplicate(true);
        try {
            const { data, error } = await supabase
                .rpc('check_duplicate_ticket', {
                    p_user_id: user.id,
                    p_title: formData.title,
                    p_description: formData.description,
                    p_specific_location: formData.specificLocation,
                    p_time_window_hours: 24
                });
            
            if (error) {
                // Silently fail duplicate check - don't block submission
                return null;
            }
            
            if (data && data.length > 0 && data[0].duplicate_found) {
                return data[0];
            }
            return null;
        } catch {
            return null;
        } finally {
            setCheckingDuplicate(false);
        }
    }, [formData.title, formData.description, formData.specificLocation, user.id]);

    const handleProceedDespiteDuplicate = useCallback(() => {
        setShowDuplicateWarning(false);
        setDuplicateInfo(null);
        setPendingSubmit(true);
    }, []);

    const handleCancelDuplicate = useCallback(() => {
        setShowDuplicateWarning(false);
        setDuplicateInfo(null);
        setPendingSubmit(false);
    }, []);

    // View existing duplicate ticket
    const handleViewExistingTicket = useCallback(() => {
        if (duplicateInfo?.similar_ticket_id) {
            navigate(`/ticket/${duplicateInfo.similar_ticket_id}`);
        }
    }, [duplicateInfo, navigate]);

    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();

        if (formData.facilityType === 'Hostel' && !formData.hostel) {
            toast.error('Please select your hostel.');
            return;
        }

        // Check for duplicates if not already checked and not explicitly proceeding
        if (!pendingSubmit && !showDuplicateWarning) {
            const duplicate = await checkForDuplicates();
            if (duplicate) {
                setDuplicateInfo(duplicate);
                setShowDuplicateWarning(true);
                return;
            }
        }
        
        setPendingSubmit(false);
        setLoading(true);

        try {
            let imageUrl = null;

            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('ticket-images')
                    .upload(fileName, imageFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('ticket-images')
                    .getPublicUrl(fileName);

                imageUrl = publicUrl;
            }

            // Determine department based on category
            const department = getDepartmentForCategory(formData.category);

            // Check whether a verifier exists for this ticket type.
            // Hostel tickets need a porter; all others need an SRC account or a staff
            // member in the derived department. If none exists, bypass verification so
            // the ticket is never silently stranded in 'Open'.
            let verifierExists = false;
            if (formData.facilityType === 'Hostel') {
                const { count } = await supabase
                    .from('profiles')
                    .select('id', { count: 'exact', head: true })
                    .eq('role', 'porter');
                verifierExists = count > 0;
            } else {
                const { count: srcCount } = await supabase
                    .from('profiles')
                    .select('id', { count: 'exact', head: true })
                    .eq('role', 'src');
                if (srcCount > 0) {
                    verifierExists = true;
                } else if (department) {
                    const { count: staffCount } = await supabase
                        .from('profiles')
                        .select('id', { count: 'exact', head: true })
                        .eq('role', 'staff')
                        .eq('department', department);
                    verifierExists = staffCount > 0;
                }
            }

            const initialStatus = verifierExists ? 'Open' : 'Assigned';
            if (!verifierExists) {
                toast.info('No verifier is available for this ticket type — your ticket has been sent directly to the assignment queue.');
            }

            // Step A: Insert Ticket & Handle Assignment Gracefully
            // First insert without the join to avoid 409 errors when assigned_to is NULL
            const { data, error } = await supabase
                .from('tickets')
                .insert([
                    {
                        title: formData.title,
                        description: formData.description,
                        category: formData.category,
                        facility_type: formData.facilityType,
                        hostel: formData.facilityType === 'Hostel' ? formData.hostel : null,
                        specific_location: formData.specificLocation,
                        priority: formData.priority,
                        created_by: user.id,
                        image_url: imageUrl,
                        department: department,
                        status: initialStatus,
                    }
                ])
                .select()
                .single();

            if (error) throw error;

            // Step B: Fetch assigned technician details if assignment occurred
            let technicianDetails = null;
            if (data.assigned_to) {
                const { data: techData } = await supabase
                    .from('profiles')
                    .select('email, full_name')
                    .eq('id', data.assigned_to)
                    .single();
                technicianDetails = techData;
            }

            // Step C: Trigger Email Notification via Edge Function
            // This handles both the Student Confirmation and Technician Assignment securely
            try {
                await supabase.functions.invoke('send-email', {
                    body: {
                        type: 'ticket_created',
                        student_email: user.email,
                        ticket_title: formData.title,
                        ticket_description: formData.description,
                        ticket_location: formData.specificLocation,
                        ticket_priority: formData.priority,
                        // Technician details (if auto-assigned)
                        technician_email: technicianDetails?.email,
                        technician_name: technicianDetails?.full_name
                    }
                });
            } catch (emailErr) {
                // Email processing failed - don't block the UI flow
                console.error('Email notification failed:', emailErr)
            }

            toast.success('Report Submitted Successfully!');
            setSuccess(true);
            
            setTimeout(() => navigate('/dashboard'), 2000);
        } catch {
            toast.error('Failed to submit report. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [formData, imageFile, navigate, user, pendingSubmit, showDuplicateWarning, checkForDuplicates]);

    if (initializing || !user) {
        return <Loader variant="ticket-form" />;
    }

    if (success) {
        return (
            <div className="max-w-md mx-auto mt-16 p-8 bg-emerald-50 rounded-2xl border border-emerald-100 text-center shadow-sm">
                <CheckCircle className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-emerald-900 mb-2">Report Submitted!</h2>
                <p className="text-emerald-700">Your ticket has been created successfully. Redirecting you to the dashboard...</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Report a Fault</h1>
                <p className="text-slate-500 mt-2">Submit a new maintenance request ticket.</p>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <FileText className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <Input
                                        name="title"
                                        id="title"
                                        required
                                        className="pl-10"
                                        placeholder="e.g., Broken Fan in Room 101"
                                        value={formData.title}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <label htmlFor="facilityType" className="block text-sm font-medium text-slate-700">Facility Type</label>
                                    {isStudent && (
                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                            Students: Hostel gets priority
                                        </span>
                                    )}
                                </div>
                                <Select
                                    name="facilityType"
                                    id="facilityType"
                                    required
                                    icon={Building}
                                    value={formData.facilityType}
                                    onChange={handleChange}
                                >
                                    {FACILITY_TYPES.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </Select>
                            </div>

                            {formData.facilityType === 'Hostel' && (
                                <div>
                                    <label htmlFor="hostel" className="block text-sm font-medium text-slate-700 mb-1">Hostel</label>
                                    <Select
                                        name="hostel"
                                        id="hostel"
                                        required
                                        icon={Building}
                                        value={formData.hostel}
                                        onChange={handleChange}
                                    >
                                        <option value="">Select your hostel</option>
                                        {profile?.gender === 'male' ? (
                                            BOYS_HOSTELS.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))
                                        ) : profile?.gender === 'female' ? (
                                            GIRLS_HOSTELS.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))
                                        ) : (
                                            <>
                                                <optgroup label="Boys Hostels">
                                                    {BOYS_HOSTELS.map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="Girls Hostels">
                                                    {GIRLS_HOSTELS.map(h => (
                                                        <option key={h} value={h}>{h}</option>
                                                    ))}
                                                </optgroup>
                                            </>
                                        )}
                                    </Select>
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label htmlFor="category" className="block text-sm font-medium text-slate-700">Category</label>
                                    <button
                                        type="button"
                                        onClick={handleAiCategorize}
                                        disabled={aiCategorizing || !formData.title}
                                        className={cn(
                                            "text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-colors",
                                            aiCategorizing 
                                                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                                : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                                        )}
                                    >
                                        {aiCategorizing ? (
                                            <>
                                                <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                                                Analyzing...
                                            </>
                                        ) : (
                                            <>
                                                <Wand2 className="w-3 h-3" />
                                                Auto-Categorize
                                            </>
                                        )}
                                    </button>
                                </div>
                                <Select
                                    name="category"
                                    id="category"
                                    required
                                    icon={Tag}
                                    value={formData.category}
                                    onChange={handleChange}
                                >
                                    {MAINTENANCE_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </Select>

                                {/* AI Suggestion Card with Priority */}
                                {showAiSuggestion && (aiSuggestion?.category || aiSuggestion?.priority) && (
                                    <div className="mt-2 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-3 animate-in fade-in slide-in-from-top-2">
                                        <div className="flex items-start gap-2">
                                            <div className="p-1.5 bg-indigo-100 rounded-full shrink-0">
                                                <Sparkles className="w-4 h-4 text-indigo-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold text-indigo-900 text-sm">AI Suggestion</span>
                                                    {aiSuggestion?.category && (
                                                        <span className={cn(
                                                            "text-xs px-1.5 py-0.5 rounded-full",
                                                            aiSuggestion.confidence >= 0.8 ? "bg-emerald-100 text-emerald-700" :
                                                            aiSuggestion.confidence >= 0.6 ? "bg-amber-100 text-amber-700" :
                                                            "bg-slate-100 text-slate-600"
                                                        )}>
                                                            Category: {Math.round(aiSuggestion.confidence * 100)}%
                                                        </span>
                                                    )}
                                                    {aiSuggestion?.priority && (
                                                        <span className={cn(
                                                            "text-xs px-1.5 py-0.5 rounded-full",
                                                            aiSuggestion.priority === 'High' ? "bg-rose-100 text-rose-700" :
                                                            aiSuggestion.priority === 'Medium' ? "bg-amber-100 text-amber-700" :
                                                            "bg-emerald-100 text-emerald-700"
                                                        )}>
                                                            Severity: {aiSuggestion.priority} ({Math.round((aiSuggestion.priorityConfidence || 0.5) * 100)}%)
                                                        </span>
                                                    )}
                                                </div>
                                                {aiSuggestion?.category && (
                                                    <p className="text-sm text-indigo-700 mt-0.5">
                                                        {aiSuggestion.category} → {aiSuggestion.department}
                                                    </p>
                                                )}
                                                {aiSuggestion.reasoning && (
                                                    <p className="text-xs text-indigo-600/80 mt-1 line-clamp-2">
                                                        {aiSuggestion.category && `${aiSuggestion.reasoning} `}
                                                        {!aiSuggestion.category && aiSuggestion.reasoning && `${aiSuggestion.reasoning} `}
                                                        {aiSuggestion.priorityReasoning && (
                                                            <span className="block mt-0.5 text-amber-600">
                                                                Severity: {aiSuggestion.priorityReasoning}
                                                            </span>
                                                        )}
                                                    </p>
                                                )}
                                                <div className="flex gap-2 mt-2">
                                                    <button
                                                        type="button"
                                                        onClick={applyAiSuggestion}
                                                        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded-md transition-colors"
                                                    >
                                                        Apply
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={dismissAiSuggestion}
                                                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors"
                                                    >
                                                        Dismiss
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label htmlFor="specificLocation" className="block text-sm font-medium text-slate-700 mb-1">Specific Location</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <MapPin className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <Input
                                        name="specificLocation"
                                        id="specificLocation"
                                        required
                                        className="pl-10"
                                        placeholder="e.g., Room 101, Block A"
                                        value={formData.specificLocation}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="priority" className="block text-sm font-medium text-slate-700 mb-1">Severity</label>
                                <Select
                                    name="priority"
                                    id="priority"
                                    required
                                    icon={AlertTriangle}
                                    value={formData.priority}
                                    onChange={handleChange}
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                </Select>
                            </div>

                            <div className="md:col-span-2">
                                <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                <textarea
                                    name="description"
                                    id="description"
                                    rows={4}
                                    required
                                    className="flex w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm shadow-sm transition-all duration-200 placeholder:text-surface-400 focus-visible:outline-none focus-visible:border-primary-400 focus-visible:ring-4 focus-visible:ring-primary-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder="Describe the issue in detail..."
                                    value={formData.description}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Attachment (Optional)</label>
                                <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors ${imagePreview ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300 hover:bg-slate-50'}`}>
                                    <div className="space-y-1 text-center">
                                        {imagePreview ? (
                                            <div className="relative inline-block">
                                                <img
                                                    src={imagePreview}
                                                    alt="Preview"
                                                    className="max-h-64 rounded-lg shadow-sm border border-slate-200"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={removeImage}
                                                    className="absolute -top-2 -right-2 bg-rose-500 text-white p-1 rounded-full shadow hover:bg-rose-600 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <Upload className="mx-auto h-12 w-12 text-slate-400" />
                                                <div className="flex text-sm text-slate-600 justify-center">
                                                    <label
                                                        htmlFor="file-upload"
                                                        className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                                                    >
                                                        <span>Upload a file</span>
                                                        <input
                                                            id="file-upload"
                                                            name="file-upload"
                                                            type="file"
                                                            className="sr-only"
                                                            accept="image/jpeg,image/png,image/webp,image/gif"
                                                            onChange={handleImageChange}
                                                        />
                                                    </label>
                                                    <p className="pl-1">or drag and drop</p>
                                                </div>
                                                <p className="text-xs text-slate-500">PNG, JPG, WEBP, GIF up to 5MB</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Duplicate Warning Dialog */}
                        {showDuplicateWarning && duplicateInfo && (
                            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-rose-100 rounded-full shrink-0">
                                        <AlertTriangle className="w-5 h-5 text-rose-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-semibold text-rose-900">Similar Report Found</h4>
                                        <p className="text-sm text-rose-700 mt-1">
                                            You already submitted a similar report in the last 24 hours.
                                        </p>
                                        <div className="mt-3 bg-white/50 rounded-lg p-3 text-sm">
                                            <p className="font-medium text-rose-900">{duplicateInfo.existing_ticket_title}</p>
                                            <p className="text-rose-600 mt-1">
                                                Status: <span className="capitalize">{duplicateInfo.existing_ticket_status}</span>
                                            </p>
                                            <p className="text-rose-500 text-xs mt-1">
                                                Created: {new Date(duplicateInfo.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            <Button
                                                type="button"
                                                onClick={handleViewExistingTicket}
                                                className="bg-rose-600 hover:bg-rose-700 text-white text-sm"
                                                size="sm"
                                            >
                                                View Existing Report
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={handleProceedDespiteDuplicate}
                                                variant="outline"
                                                className="border-rose-300 text-rose-700 hover:bg-rose-100 text-sm"
                                                size="sm"
                                            >
                                                Submit Anyway
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={handleCancelDuplicate}
                                                variant="ghost"
                                                className="text-slate-600 hover:bg-slate-100 text-sm"
                                                size="sm"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Non-Hostel Warning Dialog */}
                        {showNonHostelWarning && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-amber-100 rounded-full shrink-0">
                                        <Info className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-semibold text-amber-900">Report outside your hostel?</h4>
                                        <p className="text-sm text-amber-700 mt-1">
                                            Hostel issues get priority routing through porter verification.
                                            Other facility reports go through a general triage queue.
                                        </p>
                                        <div className="flex gap-2 mt-3">
                                            <Button
                                                type="button"
                                                onClick={confirmNonHostelSelection}
                                                className="bg-amber-600 hover:bg-amber-700 text-white text-sm"
                                                size="sm"
                                            >
                                                Continue with {formData.facilityType}
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={cancelNonHostelSelection}
                                                variant="outline"
                                                className="border-amber-300 text-amber-700 hover:bg-amber-100 text-sm"
                                                size="sm"
                                            >
                                                Keep Hostel
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t border-slate-100 flex justify-end">
                            <Button
                                type="submit"
                                isLoading={loading || checkingDuplicate}
                                disabled={showDuplicateWarning}
                                className="w-full md:w-auto min-w-[200px]"
                            >
                                {checkingDuplicate ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                        Checking...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4 mr-2" />
                                        Submit Report
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

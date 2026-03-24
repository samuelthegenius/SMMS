import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
// import { sendEmailNotification } from '../utils/emailService'; // Deprecated in favor of Edge Function
import { AlertCircle, CheckCircle, Send, MapPin, AlertTriangle, FileText, Tag, Building, Image, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { FACILITY_TYPES, MAINTENANCE_CATEGORIES } from '../utils/constants';

export default function TicketForm() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false); // Can keep local success state for redirect view or replace with Toast + Redirect

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: 'Electrical',
        facilityType: 'Hostel',
        specificLocation: '',
        priority: 'Medium',
    });

    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    // Image upload constants
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    // Input validation and sanitization
    const validateAndSanitizeInput = (name, value) => {
        const sanitized = value.trim().replace(/[<>]/g, ''); // Remove potential XSS
        
        switch (name) {
            case 'title':
                if (sanitized.length < 3 || sanitized.length > 100) {
                    throw new Error('Title must be between 3 and 100 characters');
                }
                break;
            case 'description':
                if (sanitized.length < 10 || sanitized.length > 2000) {
                    throw new Error('Description must be between 10 and 2000 characters');
                }
                break;
            case 'specificLocation':
                if (sanitized.length > 200) {
                    throw new Error('Location must be less than 200 characters');
                }
                break;
        }
        
        return sanitized;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        try {
            const sanitized = validateAndSanitizeInput(name, value);
            setFormData({ ...formData, [name]: sanitized });
        } catch (error) {
            // Reset field to previous valid value
            e.target.value = formData[name] || '';
            toast.error(error.message);
        }
    };

    const handleImageChange = (e) => {
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

        setImageFile(file);
        const objectUrl = URL.createObjectURL(file);
        setImagePreview(objectUrl);
    };

    const removeImage = () => {
        setImageFile(null);
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
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
                        specific_location: formData.specificLocation,
                        priority: formData.priority,
                        created_by: user.id,
                        image_url: imageUrl,
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
            } catch (emailError) {
                console.error("Email processing failed:", emailError);
                // Don't block the UI flow, just log it
            }

            toast.success('Report Submitted Successfully!');
            setSuccess(true);
            setTimeout(() => navigate('/dashboard'), 2000);
        } catch (error) {
            console.error('Submission Error:', error);
            toast.error(error.message || 'Failed to submit report');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-md mx-auto mt-16 p-8 bg-emerald-50 rounded-2xl border border-emerald-100 text-center shadow-sm">
                <CheckCircle className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-emerald-900 mb-2">Report Submitted!</h2>
                <p className="text-emerald-700">Your ticket has been created successfully. Redirecting you to the dashboard...</p>
            </div>
        );
    }

    const selectClasses = "flex h-10 w-full rounded-md border-0 ring-1 ring-slate-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 appearance-none";

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
                                <label htmlFor="facilityType" className="block text-sm font-medium text-slate-700 mb-1">Facility Type</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Building className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <select
                                        name="facilityType"
                                        id="facilityType"
                                        required
                                        className={cn(selectClasses, "pl-10")}
                                        value={formData.facilityType}
                                        onChange={handleChange}
                                    >
                                        {FACILITY_TYPES.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Tag className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <select
                                        name="category"
                                        id="category"
                                        required
                                        className={cn(selectClasses, "pl-10")}
                                        value={formData.category}
                                        onChange={handleChange}
                                    >
                                        {MAINTENANCE_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
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
                                <label htmlFor="priority" className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <AlertTriangle className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <select
                                        name="priority"
                                        id="priority"
                                        required
                                        className={cn(selectClasses, "pl-10")}
                                        value={formData.priority}
                                        onChange={handleChange}
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                <textarea
                                    name="description"
                                    id="description"
                                    rows={4}
                                    required
                                    className="flex w-full rounded-md border-0 ring-1 ring-slate-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
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

                        <div className="pt-4 border-t border-slate-100 flex justify-end">
                            <Button
                                type="submit"
                                isLoading={loading}
                                className="w-full md:w-auto min-w-[200px]"
                            >
                                <Send className="w-4 h-4 mr-2" />
                                Submit Report
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

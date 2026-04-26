/**
 * Shared constants for the application.
 */

export const MAINTENANCE_CATEGORIES = [
    "Electrical",
    "Plumbing",
    "HVAC (Air Conditioning)",
    "Carpentry & Furniture",
    "IT & Networking",
    "General Maintenance",
    "Painting",
    "Civil Works",
    "Appliance Repair"
];

export const FACILITY_TYPES = [
    'Hostel',
    'Lecture Hall',
    'Laboratory',
    'Office',
    'Sports Complex',
    'Chapel',
    'Staff Quarters',
    'Cafeteria',
    'Other'
];

// Academic departments for students
export const ACADEMIC_DEPARTMENTS = [
    "Computer Science",
    "Software Engineering",
    "Electrical/Electronics Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Chemical Engineering",
    "Petroleum Engineering",
    "Business Administration",
    "Accounting",
    "Economics",
    "Mass Communication",
    "Political Science",
    "International Relations",
    "Sociology",
    "Psychology",
    "Biochemistry",
    "Microbiology",
    "Industrial Chemistry",
    "Physics with Electronics",
    "Mathematics",
    "English & Literary Studies",
    "Religious Studies",
    "Music & Performing Arts",
    "Public Health",
    "Nursing Sciences"
];

// Administrative departments/offices where staff actually work
export const SERVICE_DEPARTMENTS = [
    "Academic Affairs",
    "Administration",
    "Student Affairs",
    "Works Department",
    "Library Services",
    "Health Services",
    "Security Services",
    "Transport Services",
    "Janitorial & Cleaning",
    "Bursary",
    "Registry",
    "Planning & Development"
];

// Maintenance/technical teams for ticket routing (not shown in staff signup)
export const MAINTENANCE_TEAMS = [
    "Electrical Services",
    "Plumbing & Waterworks",
    "HVAC & Climate Control",
    "Carpentry & Joinery",
    "IT Support & Infrastructure",
    "General Facilities",
    "Decorative & Painting Services",
    "Civil Engineering & Construction",
    "Appliance & Equipment Services",
    "Janitorial & Cleaning"
];

// Keep DEPARTMENTS as alias for backward compatibility (maps to service departments)
export const DEPARTMENTS = SERVICE_DEPARTMENTS;

// Category to Department mapping for AI routing
export const CATEGORY_TO_DEPARTMENT = {
    "Electrical": "Electrical Services",
    "Plumbing": "Plumbing & Waterworks",
    "HVAC (Air Conditioning)": "HVAC & Climate Control",
    "Carpentry & Furniture": "Carpentry & Joinery",
    "IT & Networking": "IT Support & Infrastructure",
    "General Maintenance": "General Facilities",
    "Painting": "Decorative & Painting Services",
    "Civil Works": "Civil Engineering & Construction",
    "Appliance Repair": "Appliance & Equipment Services",
    "Cleaning Services": "Janitorial & Cleaning"
};

// Get department for a given category
export function getDepartmentForCategory(category) {
    return CATEGORY_TO_DEPARTMENT[category] || "General Facilities";
}

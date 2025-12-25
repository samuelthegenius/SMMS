/**
 * @file src/utils/generateReport.js
 * @description Utility for generating official Maintenance PDF Reports client-side.
 * @module ReportGenerator
 * 
 * Dependencies:
 * - jspdf: For creating the PDF document structure.
 * - jspdf-autotable: For generating complex data grids within the PDF.
 * 
 * Logic Flow:
 * 1. Initialize PDF document instance.
 * 2. Add Header information (Organization Name, Report Title).
 * 3. Add Metadata (Timestamp).
 * 4. Transform JSON data into Table Rows.
 * 5. Render Table using autoTable plugin.
 * 6. Trigger Browser Download.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generates and downloads a PDF report detailing all maintenance tickets.
 * 
 * @param {Array<Object>} tickets - The raw array of ticket objects from the database.
 * @returns {void} - Triggers a file download directly in the browser.
 */
export const generateTicketReport = (tickets) => {
    // 1. Initialize a new PDF Document instance
    // 'p' = portrait mode
    // 'pt' = points (standard PDF unit)
    // 'a4' = standard sheet size
    const doc = new jsPDF('p', 'pt', 'a4');

    // --- HEADER SECTION ---

    // Set font for the organization title
    doc.setFontSize(18);

    // Add Organization Name: "Mountain Top University"
    // Arguments: (text, x-coordinate, y-coordinate)
    doc.text('Mountain Top University', 40, 40);

    // Set font for the subtitle/report name
    doc.setFontSize(14);
    doc.text('Maintenance Report', 40, 65);

    // --- METADATA SECTION ---

    // Generate a readable timestamp for the report
    const date = new Date().toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    // Add Timestamp below the title
    doc.setFontSize(10);
    doc.setTextColor(100); // Gray color for metadata
    doc.text(`Generated on: ${date}`, 40, 85);
    doc.setTextColor(0); // Reset to black

    // --- DATA TRANSFORMATION SECTION ---

    // Define the columns for the data grid
    // These correspond to the visual columns in the PDF
    const tableColumn = ["Ticket ID", "Title", "Location", "Priority", "Status", "Assigned To"];

    // Map the raw ticket data to an array of arrays (rows)
    // Required format for jspdf-autotable
    const tableRows = tickets.map(ticket => [
        ticket.id.substring(0, 8) + '...', // Truncate UUID for readability
        ticket.title,
        ticket.location,
        ticket.priority,
        ticket.status,
        ticket.assigned_to || 'Unassigned' // Handle null values
    ]);

    // --- TABLE GENERATION SECTION ---

    // REPORT GENERATION: Transforms raw JSON data into a formal PDF document for administrative auditing.
    // autoTable automatically calculates column widths and handles pagination.
    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 100, // Start drawing the table 100pts from top (below headers)
        theme: 'grid', // 'grid' | 'striped' | 'plain'
        styles: {
            fontSize: 9,
            cellPadding: 6,
        },
        headStyles: {
            fillColor: [41, 128, 185], // Corporate Blue color for headers
            textColor: 255,
            fontSize: 10,
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [245, 245, 245] // Light gray for readability
        }
    });

    // --- OUTPUT SECTION ---

    // Construct a sanitized filename
    const dateString = new Date().toISOString().split('T')[0];

    // Trigger the download
    doc.save(`MTU_Report_${dateString}.pdf`);
};

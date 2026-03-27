/**
 * Blob Service Client
 * Client-side utility for interacting with Vercel Blob storage
 */

const API_BASE = '/api';

/**
 * Upload a file to Vercel Blob
 * @param {File} file - File to upload
 * @param {string} filename - Custom filename (optional, defaults to file.name)
 * @returns {Promise<{url: string, pathname: string}>} Uploaded file info
 */
export async function uploadFile(file, filename = null) {
  const name = filename || file.name;
  
  // Convert file to base64
  const base64Content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: name,
      content: base64Content,
      contentType: file.type,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload file');
  }

  return response.json();
}

/**
 * List uploaded files
 * @param {string} cursor - Pagination cursor (optional)
 * @returns {Promise<{files: Array, cursor: string|null}>} List of files
 */
export async function listFiles(cursor = null) {
  const url = new URL(`${API_BASE}/upload`, window.location.origin);
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Failed to list files');
  }

  return response.json();
}

/**
 * Delete a file from Blob storage
 * @param {string} fileUrl - URL of the file to delete
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteFile(fileUrl) {
  const response = await fetch(`${API_BASE}/upload`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: fileUrl }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete file');
  }

  return response.json();
}

/**
 * Check if file type is allowed
 * @param {File} file - File to check
 * @param {string[]} allowedTypes - Allowed MIME type patterns
 * @returns {boolean}
 */
export function isAllowedFileType(file, allowedTypes = ['image/*', 'application/pdf']) {
  return allowedTypes.some(type => {
    if (type.endsWith('/*')) {
      const category = type.replace('/*', '');
      return file.type.startsWith(category + '/');
    }
    return file.type === type;
  });
}

/**
 * Format file size for display
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

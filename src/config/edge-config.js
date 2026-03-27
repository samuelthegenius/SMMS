import { get, getAll } from '@vercel/edge-config';

/**
 * Edge Config utility for global settings
 * Uses Vercel Edge Config for small, globally-read configuration
 * 
 * Requires EDGE_CONFIG environment variable to be set
 */

/**
 * Get a specific config value
 * @param {string} key - Config key
 * @returns {Promise<any>} Config value
 */
export async function getConfig(key) {
  try {
    const value = await get(key);
    return value;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error(`Error fetching config key "${key}":`, error);
    }
    return null;
  }
}

/**
 * Get all config values
 * @returns {Promise<Record<string, any>>} All config values
 */
export async function getAllConfig() {
  try {
    const allConfig = await getAll();
    return allConfig;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error fetching all config:', error);
    }
    return {};
  }
}

/**
 * Check if feature is enabled
 * @param {string} featureName - Feature flag name
 * @returns {Promise<boolean>} Feature enabled status
 */
export async function isFeatureEnabled(featureName) {
  const value = await getConfig(`feature_${featureName}`);
  return value === true || value === 'true';
}

/**
 * Get app settings
 * @returns {Promise<object>} App settings
 */
export async function getAppSettings() {
  const settings = await getConfig('app_settings');
  return settings || {
    maintenanceMode: false,
    maxUploadSize: 10 * 1024 * 1024, // 10MB
    allowedFileTypes: ['image/*', 'application/pdf'],
  };
}

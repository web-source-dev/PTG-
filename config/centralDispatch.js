/**
 * Central Dispatch API Configuration
 * 
 * This configuration handles the Client Credentials Flow for Central Dispatch API integration.
 * Required environment variables:
 * - CENTRAL_DISPATCH_CLIENT_ID: Client ID assigned by Central Dispatch
 * - CENTRAL_DISPATCH_CLIENT_SECRET: Client secret assigned by Central Dispatch
 * - CENTRAL_DISPATCH_MARKETPLACE_ID: Marketplace ID assigned by Central Dispatch (required for creating listings)
 * - CENTRAL_DISPATCH_API_BASE_URL: Base URL for Central Dispatch API (default: https://api.centraldispatch.com)
 * - CENTRAL_DISPATCH_MARKETPLACE_API_BASE_URL: Marketplace API base URL (default: https://marketplace-api.centraldispatch.com)
 */

const centralDispatchConfig = {
  // Authentication endpoint
  tokenEndpoint: 'https://id.centraldispatch.com/connect/token',
  
  // API base URL
  apiBaseUrl: process.env.CENTRAL_DISPATCH_API_BASE_URL || 'https://api.centraldispatch.com',
  
  // Marketplace API base URL (for Listings API)
  marketplaceApiBaseUrl: process.env.CENTRAL_DISPATCH_MARKETPLACE_API_BASE_URL || 'https://marketplace-api.centraldispatch.com',
  
  // Client credentials
  clientId: process.env.CENTRAL_DISPATCH_CLIENT_ID,
  clientSecret: process.env.CENTRAL_DISPATCH_CLIENT_SECRET,
  
  // Marketplace ID (default to test marketplace if provided)
  marketplaceId: process.env.CENTRAL_DISPATCH_MARKETPLACE_ID ? parseInt(process.env.CENTRAL_DISPATCH_MARKETPLACE_ID) : null,
  
  // Grant type for Client Credentials flow
  grantType: 'client_credentials',
  
  // API version headers
  apiVersion: {
    contentType: 'application/vnd.coxauto.v2+json',
    accept: 'application/vnd.coxauto.v2+json'
  },
  
  // Token cache settings
  tokenCache: {
    // Buffer time before expiration (in seconds) to refresh token
    refreshBuffer: 60, // Refresh 60 seconds before expiration
  },
  
  // Request settings
  requestSettings: {
    timeout: 30000, // 30 seconds
    retries: 3,
    retryDelay: 1000, // 1 second
  }
};

/**
 * Validate Central Dispatch configuration
 * @returns {boolean} True if configuration is valid
 */
const validateConfig = () => {
  if (!centralDispatchConfig.clientId) {
    console.error('CENTRAL_DISPATCH_CLIENT_ID is not set in environment variables');
    return false;
  }
  
  if (!centralDispatchConfig.clientSecret) {
    console.error('CENTRAL_DISPATCH_CLIENT_SECRET is not set in environment variables');
    return false;
  }
  
  if (!centralDispatchConfig.marketplaceId) {
    console.warn('CENTRAL_DISPATCH_MARKETPLACE_ID is not set in environment variables. Listing creation will fail.');
    // Don't return false here as marketplace ID is only needed for listing creation
  }
  
  return true;
};

/**
 * Get configuration object
 * @returns {object} Central Dispatch configuration
 */
const getConfig = () => {
  return centralDispatchConfig;
};

module.exports = {
  centralDispatchConfig,
  validateConfig,
  getConfig
};


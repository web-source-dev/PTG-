const axios = require('axios');
const { getConfig, validateConfig } = require('../config/centralDispatch');

/**
 * Central Dispatch API Service
 * 
 * Handles authentication and API requests to Central Dispatch using Client Credentials Flow.
 * Automatically manages token acquisition, caching, and refresh.
 */
class CentralDispatchService {
  constructor() {
    this.config = getConfig();
    this.tokenCache = {
      accessToken: null,
      expiresAt: null,
      scope: null
    };
    
    // Validate configuration on initialization
    if (!validateConfig()) {
      console.warn('Central Dispatch configuration is incomplete. API calls may fail.');
    }
  }

  /**
   * Request a new access token from Central Dispatch
   * @returns {Promise<object>} Token response with access_token, expires_in, token_type, and scope
   */
  async requestAccessToken() {
    try {
      if (!this.config.clientId || !this.config.clientSecret) {
        throw new Error('Central Dispatch credentials are not configured');
      }

      const params = new URLSearchParams();
      params.append('client_id', this.config.clientId);
      params.append('client_secret', this.config.clientSecret);
      params.append('grant_type', this.config.grantType);

      const response = await axios.post(
        this.config.tokenEndpoint,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: this.config.requestSettings.timeout
        }
      );

      if (response.data && response.data.access_token) {
        // Cache the token
        const expiresIn = response.data.expires_in || 3600; // Default to 1 hour
        this.tokenCache = {
          accessToken: response.data.access_token,
          expiresAt: Date.now() + (expiresIn * 1000),
          scope: response.data.scope || null,
          tokenType: response.data.token_type || 'Bearer'
        };

        console.log('Central Dispatch access token obtained successfully');
        return response.data;
      } else {
        throw new Error('Invalid token response from Central Dispatch');
      }
    } catch (error) {
      console.error('Error requesting Central Dispatch access token:', error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        throw new Error(`Central Dispatch authentication failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      
      throw new Error(`Failed to obtain Central Dispatch access token: ${error.message}`);
    }
  }

  /**
   * Get a valid access token (from cache or request new one)
   * @returns {Promise<string>} Valid access token
   */
  async getAccessToken() {
    // Check if we have a valid cached token
    if (this.tokenCache.accessToken && this.tokenCache.expiresAt) {
      const now = Date.now();
      const bufferTime = this.config.tokenCache.refreshBuffer * 1000;
      
      // If token is still valid (with buffer), return cached token
      if (this.tokenCache.expiresAt > (now + bufferTime)) {
        return this.tokenCache.accessToken;
      }
    }

    // Token expired or doesn't exist, request a new one
    await this.requestAccessToken();
    return this.tokenCache.accessToken;
  }

  /**
   * Make an authenticated API request to Central Dispatch
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
   * @param {string} endpoint - API endpoint (relative to base URL)
   * @param {object} data - Request body data (optional)
   * @param {object} headers - Additional headers (optional)
   * @param {object} params - Query parameters (optional)
   * @returns {Promise<object>} API response data
   */
  async makeRequest(method, endpoint, data = null, headers = {}, params = null) {
    try {
      // Get valid access token
      const accessToken = await this.getAccessToken();

      // Construct full URL
      const url = endpoint.startsWith('http') 
        ? endpoint 
        : `${this.config.apiBaseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

      // Prepare request config
      const config = {
        method: method.toUpperCase(),
        url: url,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: this.config.requestSettings.timeout
      };

      // Add data for POST, PUT, PATCH requests
      if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        config.data = data;
      }

      // Add query parameters
      if (params) {
        config.params = params;
      }

      // Make the request with retry logic
      let lastError;
      for (let attempt = 1; attempt <= this.config.requestSettings.retries; attempt++) {
        try {
          const response = await axios(config);
          return response.data;
        } catch (error) {
          lastError = error;
          
          // If it's an authentication error (401), try refreshing the token once
          if (error.response && error.response.status === 401 && attempt === 1) {
            console.log('Received 401, refreshing token and retrying...');
            // Clear token cache and get a new token
            this.tokenCache = {
              accessToken: null,
              expiresAt: null,
              scope: null
            };
            const newToken = await this.getAccessToken();
            config.headers['Authorization'] = `Bearer ${newToken}`;
            continue;
          }

          // If not the last attempt, wait before retrying
          if (attempt < this.config.requestSettings.retries) {
            await new Promise(resolve => setTimeout(resolve, this.config.requestSettings.retryDelay * attempt));
            continue;
          }
        }
      }

      // All retries failed
      throw lastError;

    } catch (error) {
      console.error(`Central Dispatch API request failed (${method} ${endpoint}):`, error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        throw new Error(`Central Dispatch API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      }
      
      throw new Error(`Central Dispatch API request failed: ${error.message}`);
    }
  }

  /**
   * Convenience method for GET requests
   * @param {string} endpoint - API endpoint
   * @param {object} params - Query parameters (optional)
   * @param {object} headers - Additional headers (optional)
   * @returns {Promise<object>} API response data
   */
  async get(endpoint, params = null, headers = {}) {
    return this.makeRequest('GET', endpoint, null, headers, params);
  }

  /**
   * Convenience method for POST requests
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request body data
   * @param {object} headers - Additional headers (optional)
   * @returns {Promise<object>} API response data
   */
  async post(endpoint, data, headers = {}) {
    return this.makeRequest('POST', endpoint, data, headers);
  }

  /**
   * Convenience method for PUT requests
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request body data
   * @param {object} headers - Additional headers (optional)
   * @returns {Promise<object>} API response data
   */
  async put(endpoint, data, headers = {}) {
    return this.makeRequest('PUT', endpoint, data, headers);
  }

  /**
   * Convenience method for PATCH requests
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request body data
   * @param {object} headers - Additional headers (optional)
   * @returns {Promise<object>} API response data
   */
  async patch(endpoint, data, headers = {}) {
    return this.makeRequest('PATCH', endpoint, data, headers);
  }

  /**
   * Convenience method for DELETE requests
   * @param {string} endpoint - API endpoint
   * @param {object} headers - Additional headers (optional)
   * @returns {Promise<object>} API response data
   */
  async delete(endpoint, headers = {}) {
    return this.makeRequest('DELETE', endpoint, null, headers);
  }

  /**
   * Clear the token cache (useful for testing or forced refresh)
   */
  clearTokenCache() {
    this.tokenCache = {
      accessToken: null,
      expiresAt: null,
      scope: null
    };
  }

  /**
   * Get current token cache status (for debugging)
   * @returns {object} Token cache information
   */
  getTokenCacheStatus() {
    return {
      hasToken: !!this.tokenCache.accessToken,
      expiresAt: this.tokenCache.expiresAt,
      isExpired: this.tokenCache.expiresAt ? Date.now() >= this.tokenCache.expiresAt : true,
      scope: this.tokenCache.scope
    };
  }
}

// Export singleton instance
const centralDispatchService = new CentralDispatchService();

module.exports = centralDispatchService;


const centralDispatchService = require('./centralDispatchService');
const { getConfig } = require('../config/centralDispatch');

/**
 * Central Dispatch Listings API Service
 * 
 * Handles all Listings API endpoints for Central Dispatch Marketplace API.
 * Uses the base Central Dispatch service for authentication and adds
 * marketplace-specific headers and endpoints.
 * 
 * API Documentation: https://api-docs.centraldispatch.com/apis/listings-api-v2-2-0-0/versions/e78b419e-84e4-4e17-a33f-0966c7b6015f/
 */
class CentralDispatchListingsService {
  constructor() {
    this.config = getConfig();
    this.baseService = centralDispatchService;
  }

  /**
   * Get the marketplace API base URL
   * @returns {string} Marketplace API base URL
   */
  getMarketplaceBaseUrl() {
    return this.config.marketplaceApiBaseUrl;
  }

  /**
   * Get standard headers for Listings API requests
   * @returns {object} Headers object
   */
  getStandardHeaders() {
    return {
      'Accept': this.config.apiVersion.accept,
      'Content-Type': this.config.apiVersion.contentType
    };
  }

  /**
   * Make a request to the Marketplace API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint (relative to marketplace base URL)
   * @param {object} data - Request body data (optional)
   * @param {object} params - Query parameters (optional)
   * @returns {Promise<object>} API response data
   */
  async makeMarketplaceRequest(method, endpoint, data = null, params = null) {
    const fullEndpoint = endpoint.startsWith('http')
      ? endpoint
      : `${this.config.marketplaceApiBaseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    const headers = this.getStandardHeaders();

    // For POST requests, we need to get the full response including headers for Location header
    if (method.toUpperCase() === 'POST') {
      const accessToken = await this.baseService.getAccessToken();
      const axios = require('axios');
      
      const config = {
        method: method.toUpperCase(),
        url: fullEndpoint,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...headers
        },
        data: data,
        params: params,
        timeout: this.config.requestSettings.timeout
      };

      try {
        const response = await axios(config);
        
        // Return data with headers attached
        const result = response.data || {};
        result._headers = response.headers;
        result._status = response.status;
        
        return result;
      } catch (error) {
        // Handle errors similar to base service
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', error.response.data);
          throw new Error(`Central Dispatch API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
        throw new Error(`Central Dispatch API request failed: ${error.message}`);
      }
    }

    return await this.baseService.makeRequest(method, fullEndpoint, data, headers, params);
  }

  /**
   * Create a new listing
   * 
   * POST /listings
   * 
   * @param {object} listingData - Listing request data
   * @param {string} listingData.shipperOrderId - The ID of the shipper order (optional, <= 50 chars)
   * @param {string} listingData.externalId - An identifier managed by the user (optional, <= 50 chars)
   * @param {string} listingData.trailerType - The trailer type: DRIVEAWAY, ENCLOSED, or OPEN (default: OPEN)
   * @param {boolean} listingData.hasInOpVehicle - Indicates whether the vehicle is inoperable (default: true)
   * @param {string} listingData.loadSpecificTerms - Load specific terms (optional, <= 500 chars)
   * @param {boolean} listingData.requiresInspection - Indicates shipper requests carrier to use Mobile App for inspection (default: false)
   * @param {boolean} listingData.requiresDriverVerificationAtPickup - Indicates if driver verification is required (default: false)
   * @param {string} listingData.availableDate - Available date in UTC/ISO 8601 format
   * @param {string} listingData.expirationDate - Expiration date in UTC/ISO 8601 format (optional)
   * @param {string} listingData.desiredDeliveryDate - Desired delivery date in UTC/ISO 8601 format (optional)
   * @param {string} listingData.partnerReferenceId - User supplied ID for reference (optional, <= 50 chars)
   * @param {object} listingData.price - Price details
   * @param {object} listingData.sla - Service level agreement details (optional, for digital offers)
   * @param {array} listingData.stops - Array of stop details (must have exactly 2 stops)
   * @param {array} listingData.vehicles - Array of vehicle details (1-12 vehicles, no duplicates)
   * @param {array} listingData.marketplaces - Array of marketplace details
   * @param {array} listingData.tags - Array of tag details (optional)
   * @param {string} listingData.transportationReleaseNotes - Transportation release notes (optional)
   * @returns {Promise<object>} Created listing response with Location header
   */
  async createListing(listingData) {
    try {
      const response = await this.makeMarketplaceRequest('POST', '/listings', listingData);
      
      // Extract listing ID from Location header if available
      if (response._headers && response._headers.location) {
        const locationMatch = response._headers.location.match(/\/listings\/id\/(\d+)/);
        if (locationMatch) {
          response.id = locationMatch[1];
          response.listingId = locationMatch[1];
        }
      }
      
      // Clean up internal properties
      delete response._headers;
      delete response._status;
      
      return response;
    } catch (error) {
      console.error('Error creating listing:', error.message);
      throw error;
    }
  }

  /**
   * Get listings with optional filters
   * 
   * GET /listings
   * 
   * @param {object} options - Query parameters
   * @param {string} options.partnerReferenceId - Filter by partner reference ID (optional)
   * @param {number} options.start - Starting index for pagination (default: 1)
   * @param {number} options.limit - Maximum number of results (default: 10)
   * @returns {Promise<object>} Listings collection response
   */
  async getListings(options = {}) {
    try {
      const params = {};
      
      if (options.partnerReferenceId) {
        params.partnerReferenceId = options.partnerReferenceId;
      }
      
      if (options.start !== undefined) {
        params.start = options.start;
      }
      
      if (options.limit !== undefined) {
        params.limit = options.limit;
      }

      const response = await this.makeMarketplaceRequest('GET', '/listings', null, params);
      return response;
    } catch (error) {
      console.error('Error getting listings:', error.message);
      throw error;
    }
  }

  /**
   * Get a specific listing by ID
   * 
   * GET /listings/id/{id}
   * 
   * @param {string|number} listingId - The listing ID
   * @returns {Promise<object>} Listing response
   */
  async getListing(listingId) {
    try {
      if (!listingId) {
        throw new Error('Listing ID is required');
      }

      const response = await this.makeMarketplaceRequest('GET', `/listings/id/${listingId}`);
      return response;
    } catch (error) {
      console.error(`Error getting listing ${listingId}:`, error.message);
      throw error;
    }
  }

  /**
   * Update a listing
   * 
   * PUT /listings/id/{id}
   * 
   * @param {string|number} listingId - The listing ID
   * @param {object} listingData - Updated listing data
   * @returns {Promise<object>} Updated listing response
   */
  async updateListing(listingId, listingData) {
    try {
      if (!listingId) {
        throw new Error('Listing ID is required');
      }

      const response = await this.makeMarketplaceRequest('PUT', `/listings/id/${listingId}`, listingData);
      return response;
    } catch (error) {
      console.error(`Error updating listing ${listingId}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete a listing
   * 
   * DELETE /listings/id/{id}
   * 
   * @param {string|number} listingId - The listing ID
   * @returns {Promise<object>} Deletion response
   */
  async deleteListing(listingId) {
    try {
      if (!listingId) {
        throw new Error('Listing ID is required');
      }

      const response = await this.makeMarketplaceRequest('DELETE', `/listings/id/${listingId}`);
      return response;
    } catch (error) {
      console.error(`Error deleting listing ${listingId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get listings in batch
   * 
   * POST /listings/batch
   * 
   * @param {object} batchRequest - Batch request data
   * @param {array} batchRequest.listingIds - Array of listing IDs to retrieve
   * @returns {Promise<object>} Batch listings response
   */
  async getListingsBatch(batchRequest) {
    try {
      if (!batchRequest || !batchRequest.listingIds || !Array.isArray(batchRequest.listingIds)) {
        throw new Error('Batch request must include an array of listingIds');
      }

      const response = await this.makeMarketplaceRequest('POST', '/listings/batch', batchRequest);
      return response;
    } catch (error) {
      console.error('Error getting listings batch:', error.message);
      throw error;
    }
  }

  /**
   * Get my listings
   * 
   * GET /listings/my
   * 
   * @param {object} options - Query parameters (optional)
   * @param {number} options.start - Starting index for pagination
   * @param {number} options.limit - Maximum number of results
   * @returns {Promise<object>} My listings collection response
   */
  async getMyListings(options = {}) {
    try {
      const params = {};
      
      if (options.start !== undefined) {
        params.start = options.start;
      }
      
      if (options.limit !== undefined) {
        params.limit = options.limit;
      }

      const response = await this.makeMarketplaceRequest('GET', '/listings/my', null, params);
      return response;
    } catch (error) {
      console.error('Error getting my listings:', error.message);
      throw error;
    }
  }

  /**
   * Get my vehicles
   * 
   * GET /listings/vehicles
   * 
   * @param {object} options - Query parameters (optional)
   * @returns {Promise<object>} Vehicles collection response
   */
  async getMyVehicles(options = {}) {
    try {
      const params = options.params || {};

      const response = await this.makeMarketplaceRequest('GET', '/listings/vehicles', null, params);
      return response;
    } catch (error) {
      console.error('Error getting my vehicles:', error.message);
      throw error;
    }
  }
}

// Export singleton instance
const centralDispatchListingsService = new CentralDispatchListingsService();

module.exports = centralDispatchListingsService;


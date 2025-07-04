// frontend/src/services/api.js

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

class ApiService {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Wardrobe Items
  async getItems() {
    return this.request('/items');
  }

  async addItem(formData) {
    return this.request('/items', {
      method: 'POST',
      headers: {}, // Remove Content-Type to let browser set it for FormData
      body: formData,
    });
  }

  async updateItem(id, itemData) {
    return this.request(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(itemData),
    });
  }

  async deleteItem(id) {
    return this.request(`/items/${id}`, {
      method: 'DELETE',
    });
  }

  // RFID Tracking
  async logWearEvent(rfidTags) {
    return this.request('/wear-events', {
      method: 'POST',
      body: JSON.stringify({ rfidTags, timestamp: new Date().toISOString() }),
    });
  }

  async getWearHistory() {
    return this.request('/wear-events');
  }

  // Outfit Suggestions
  async getOutfitSuggestions(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/outfit-suggestions?${queryString}`);
  }

  // Laundry Management
  async markItemDirty(itemId) {
    return this.request(`/items/${itemId}/laundry`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'dirty' }),
    });
  }

  async markItemClean(itemId) {
    return this.request(`/items/${itemId}/laundry`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'clean' }),
    });
  }

  async getDirtyItems() {
    return this.request('/items?laundryStatus=dirty');
  }

  // Weather Integration
  async getWeather() {
    return this.request('/weather');
  }

  // Calendar Integration
  async getCalendarEvents() {
    return this.request('/calendar');
  }
}

// Create and export a single instance
const api = new ApiService();
export default api;
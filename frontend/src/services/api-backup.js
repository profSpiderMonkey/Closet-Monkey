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
      
      // Handle empty responses (like DELETE)
      if (response.status === 204) {
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Wardrobe Items
  async getWardrobeItems() {
    return this.request('/wardrobe');
  }

  async getWardrobeItem(id) {
    return this.request(`/wardrobe/${id}`);
  }

  async createWardrobeItem(itemData, imageFile = null) {
    const formData = new FormData();
    
    // Add all item data
    Object.keys(itemData).forEach(key => {
      if (itemData[key] !== null && itemData[key] !== undefined) {
        formData.append(key, itemData[key]);
      }
    });
    
    // Add image if provided
    if (imageFile) {
      formData.append('image', imageFile);
    }

    return this.request('/wardrobe', {
      method: 'POST',
      headers: {}, // Don't set Content-Type for FormData
      body: formData,
    });
  }

  async updateWardrobeItem(id, itemData, imageFile = null) {
    const formData = new FormData();
    
    Object.keys(itemData).forEach(key => {
      if (itemData[key] !== null && itemData[key] !== undefined) {
        formData.append(key, itemData[key]);
      }
    });
    
    if (imageFile) {
      formData.append('image', imageFile);
    }

    return this.request(`/wardrobe/${id}`, {
      method: 'PUT',
      headers: {},
      body: formData,
    });
  }

  async deleteWardrobeItem(id) {
    return this.request(`/wardrobe/${id}`, {
      method: 'DELETE',
    });
  }

  async searchWardrobeItems(query) {
    return this.request(`/wardrobe/search/${encodeURIComponent(query)}`);
  }

  async getWardrobeItemsByCategory(category) {
    return this.request(`/wardrobe/category/${encodeURIComponent(category)}`);
  }

  // Outfits
  async getOutfits() {
    return this.request('/outfits');
  }

  async createOutfit(outfitData) {
    return this.request('/outfits', {
      method: 'POST',
      body: JSON.stringify(outfitData),
    });
  }

  async updateOutfit(id, outfitData) {
    return this.request(`/outfits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(outfitData),
    });
  }

  async deleteOutfit(id) {
    return this.request(`/outfits/${id}`, {
      method: 'DELETE',
    });
  }

  // RFID Events
  async getRFIDEvents() {
    return this.request('/rfid/events');
  }

  async createRFIDEvent(eventData) {
    return this.request('/rfid/event', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  }

  // Health Check
  async getHealth() {
    return this.request('/health');
  }

  // WebSocket connection for real-time RFID updates
  connectWebSocket(onMessage, onError = null) {
    const wsUrl = API_BASE_URL.replace('http', 'ws').replace('/api', '');
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (onError) onError(error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
    
    return ws;
  }
}

const api = new ApiService();
export default api;
  // methods  
};

export default ApiService;
// frontend/src/services/api.js

// Use relative URLs to leverage the proxy
const API_BASE_URL = '/api';  // This will use the proxy from package.json

class ApiService {
  constructor() {
    // Get or create a test user ID
    // Replace 'test-user-123' with the actual ID you got from creating the user
  this.userId = localStorage.getItem('userId') || '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07';
    // Save it for persistence
    if (!localStorage.getItem('userId')) {
      localStorage.setItem('userId', this.userId);
    }
  }

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

  // Wardrobe Items - Fixed to match backend endpoints
  async getItems() {
    return this.request(`/wardrobe/items/${this.userId}`);
  }

 async addItem(formData) {
    // Handle both FormData and plain object
    let itemData, imageFile;
    
    if (formData instanceof FormData) {
      // Original FormData handling
      imageFile = formData.get('image');
      itemData = JSON.parse(formData.get('itemData'));
    } else {
      // Plain object handling (for detected items)
      itemData = formData;
      imageFile = null;
    }
    
    let imageUrl = null;
    
    // First, upload the image if there is one
    if (imageFile && imageFile instanceof File) {
      const uploadFormData = new FormData();
      uploadFormData.append('image', imageFile);
      
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: uploadFormData
      });
      
      if (uploadResponse.ok) {
        const result = await uploadResponse.json();
        imageUrl = result.imageUrl;
        console.log('Image uploaded:', imageUrl);
      }
    }
    
    const payload = {
      userId: this.userId,
      name: itemData.name,
      type: itemData.category || itemData.type, // backend expects 'type' not 'category'
      description: itemData.description,
      color: itemData.color,
      material: itemData.material,
      brand: itemData.brand,
      size: itemData.size,
      image_url: imageUrl, // Add the uploaded image URL
      rfid_tag: itemData.rfidTag // Also include RFID tag if provided
    };
    
    return this.request('/wardrobe/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }


  async updateItem(id, itemData) {
    return this.request(`/wardrobe/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(itemData),
    });
  }

  async deleteItem(id) {
    return this.request(`/wardrobe/items/${id}`, {
      method: 'DELETE',
    });
  }

  // RFID Tracking - Fixed endpoints
  async logWearEvent(rfidTag, scanType = 'exit') {
    return this.request('/rfid/scan', {
      method: 'POST',
      body: JSON.stringify({ 
        userId: this.userId,
        rfidTag, 
        scanType,
        location: 'home'
      }),
    });
  }

  async getWearHistory() {
    return this.request(`/rfid/scans/${this.userId}`);
  }

  // Keep other methods but they won't work until backend implements them
  async getOutfitSuggestions(params = {}) {
    return this.request(`/outfits/${this.userId}`);
  }

  // Other methods...

  async scanOutfit(imageFile) {
    // Convert image to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Image = reader.result;
          const response = await this.request('/outfits/scan', {
            method: 'POST',
            body: JSON.stringify({
              image: base64Image,
              userId: this.userId
            })
          });
          resolve(response);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
  }
}

// Create and export a single instance
const api = new ApiService();
export default api;
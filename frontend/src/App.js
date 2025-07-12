import React, { useState, useRef, useEffect } from 'react';
import { Camera, Plus, Eye, Shirt, Calendar, Cloud, Users, ShoppingBag, Search, Filter, Star, MapPin, Thermometer, AlertCircle, CheckCircle, Upload, X } from 'lucide-react';
import api from './services/api';
import CameraCapture from './components/CameraCapture';
import OutfitScanner from './components/OutfitScanner.js';
import SplashScreen from './components/SplashScreen';

const ClosetMonkeyMVP = () => {
  const [currentView, setCurrentView] = useState('home');
  const [wardrobeItems, setWardrobeItems] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [selectedOutfits, setSelectedOutfits] = useState(new Set());
  const [showItemDetailModal, setShowItemDetailModal] = useState(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState(null);
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef(null);
  
  const [newItem, setNewItem] = useState({
    name: '',
    category: '',
    color: '',
    brand: '',
    rfidTag: '',
    material: '',
    size: '',
    description: ''
  });

  const [uploadedImage, setUploadedImage] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef(null);

  const categories = ["Shirts", "Pants", "Jackets", "Dresses", "Shoes", "Accessories"];
  const colors = ["Black", "White", "Navy", "Gray", "Brown", "Blue", "Red", "Green"];

  // Load data on component mount
  useEffect(() => {
    loadWardrobeItems();
    loadOutfits();
  }, []);

  // Clear messages after 3 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Idle detection and activity monitoring
  useEffect(() => {
    const resetIdleTimer = () => {
      if (isIdle) {
        setIsIdle(false);
      }
      
      // Clear existing timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      
      // Set new timer for 5 minutes of inactivity
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
      }, 5 * 60 * 1000); // 5 minutes
    };

    // Events to track for user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, resetIdleTimer, true);
    });

    // Initialize timer
    resetIdleTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetIdleTimer, true);
      });
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [isIdle]);

  const loadWardrobeItems = async () => {
    try {
      setLoading(true);
      const items = await api.getItems();
      setWardrobeItems(items);
    } catch (err) {
      setError('Failed to load wardrobe items');
      console.error('Error loading wardrobe items:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOutfits = async () => {
    try {
      const userId = localStorage.getItem('userId') || '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07';
      const response = await fetch(`/api/outfits/${userId}`);
      if (response.ok) {
        const outfitsData = await response.json();
        setOutfits(outfitsData);
      } else {
        console.error('Failed to load outfits');
      }
    } catch (err) {
      console.error('Error loading outfits:', err);
    }
  };
const addItem = async () => {
  if (!newItem.name || !newItem.category) {
    setError('Please fill in name and category');
    return;
  }

  try {
    setLoading(true);
    
    // Create FormData for the API call
    const formData = new FormData();
    if (uploadedImage) {
      formData.append('image', uploadedImage);
    }
    formData.append('itemData', JSON.stringify(newItem));
    
    const createdItem = await api.addItem(formData);
    setWardrobeItems([createdItem, ...wardrobeItems]);
    setNewItem({
      name: '',
      category: '',
      color: '',
      brand: '',
      rfidTag: '',
      material: '',
      size: '',
      description: ''
    });
    setUploadedImage(null);
    setSuccess('Item added successfully!');
    setCurrentView('wardrobe');
  } catch (err) {
    setError('Failed to add item');
    console.error('Error adding item:', err);
  } finally {
    setLoading(false);
  }
};

  const deleteItem = async (itemId) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;

    try {
      setLoading(true);
      await api.deleteItem(itemId);
      setWardrobeItems(wardrobeItems.filter(item => item.id !== itemId));
      setSuccess('Item deleted successfully!');
    } catch (err) {
      setError('Failed to delete item');
      console.error('Error deleting item:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteOutfit = async (outfitId) => {
    if (!window.confirm('Are you sure you want to delete this outfit?')) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/outfits/${outfitId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setOutfits(outfits.filter(outfit => outfit.id !== outfitId));
        setSuccess('Outfit deleted successfully!');
      } else {
        throw new Error('Failed to delete outfit');
      }
    } catch (err) {
      setError('Failed to delete outfit');
      console.error('Error deleting outfit:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleItemSelection = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const selectAllItems = () => {
    setSelectedItems(new Set(wardrobeItems.map(item => item.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const deleteSelectedItems = async () => {
    if (selectedItems.size === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.size} selected item(s)?`)) return;

    try {
      setLoading(true);
      const deletePromises = Array.from(selectedItems).map(itemId => 
        api.deleteItem(itemId)
      );
      
      await Promise.all(deletePromises);
      
      setWardrobeItems(wardrobeItems.filter(item => !selectedItems.has(item.id)));
      setSelectedItems(new Set());
      setSuccess(`Successfully deleted ${selectedItems.size} items!`);
    } catch (err) {
      setError('Failed to delete selected items');
      console.error('Error deleting items:', err);
    } finally {
      setLoading(false);
    }
  };

  // Outfit selection helper functions
  const toggleOutfitSelection = (outfitId) => {
    const newSelected = new Set(selectedOutfits);
    if (newSelected.has(outfitId)) {
      newSelected.delete(outfitId);
    } else {
      newSelected.add(outfitId);
    }
    setSelectedOutfits(newSelected);
  };

  const selectAllOutfits = () => {
    setSelectedOutfits(new Set(outfits.map(outfit => outfit.id)));
  };

  const clearOutfitSelection = () => {
    setSelectedOutfits(new Set());
  };

  const deleteSelectedOutfits = async () => {
    if (selectedOutfits.size === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedOutfits.size} selected outfit(s)?`)) return;

    try {
      setLoading(true);
      const deletePromises = Array.from(selectedOutfits).map(outfitId => 
        fetch(`/api/outfits/${outfitId}`, { method: 'DELETE' })
      );
      
      const responses = await Promise.all(deletePromises);
      const allSuccessful = responses.every(response => response.ok);
      
      if (allSuccessful) {
        setOutfits(outfits.filter(outfit => !selectedOutfits.has(outfit.id)));
        setSelectedOutfits(new Set());
        setSuccess(`Successfully deleted ${selectedOutfits.size} outfits!`);
      } else {
        throw new Error('Some outfits failed to delete');
      }
    } catch (err) {
      setError('Failed to delete selected outfits');
      console.error('Error deleting outfits:', err);
    } finally {
      setLoading(false);
    }
  };

  // Splash screen handlers
  const handleSplashComplete = () => {
    setShowSplashScreen(false);
  };

  const handleWakeFromIdle = () => {
    setIsIdle(false);
  };

const handleImageUpload = (event) => {
  const file = event.target.files[0];
  if (file) {
    setUploadedImage(file);
    performAIDetection(file); // Use real AI instead of simulation
  }
};


const handleCameraCapture = (capturedFile) => {
  setUploadedImage(capturedFile);
  setShowCamera(false);
  performAIDetection(capturedFile); // Use real AI
};
const performAIDetection = async (imageFile) => {
  try {
    setLoading(true);
    console.log('Starting AI detection with file:', imageFile);
    
    const scanResult = await api.scanOutfit(imageFile);
    console.log('AI Scan Result:', scanResult);
    
    if (scanResult.detectedItemsCount > 0 || scanResult.detectedColors?.length > 0) {
      // Map Vision API types to your categories
      const categoryMapping = {
        'shirt': 'Shirts',
        't-shirt': 'Shirts',
        'blouse': 'Shirts',
        'top': 'Shirts',
        'pants': 'Pants',
        'jeans': 'Pants',
        'trousers': 'Pants',
        'jacket': 'Jackets',
        'coat': 'Jackets',
        'blazer': 'Jackets',
        'dress': 'Dresses',
        'shoe': 'Shoes',
        'sneaker': 'Shoes',
        'boot': 'Shoes',
        'accessory': 'Accessories',
        'belt': 'Accessories',
        'tie': 'Accessories'
      };
      
      // Use the first detected item to populate fields
      const firstItem = scanResult.uncatalogedItems[0] || scanResult.catalogedItems[0];
      if (firstItem) {
        // Find matching category
        let detectedCategory = '';
        const itemType = (firstItem.type || '').toLowerCase();
        for (const [key, value] of Object.entries(categoryMapping)) {
          if (itemType.includes(key)) {
            detectedCategory = value;
            break;
          }
        }
        
        // Capitalize first letter of color
        const detectedColor = scanResult.detectedColors?.[0] 
          ? scanResult.detectedColors[0].charAt(0).toUpperCase() + scanResult.detectedColors[0].slice(1)
          : '';
        
        setNewItem(prev => ({
          ...prev,
          name: firstItem.suggestedName || firstItem.name || prev.name,
          category: detectedCategory || prev.category,
          color: detectedColor || prev.color,
          brand: firstItem.brands?.join(', ') || scanResult.detectedBrands?.join(', ') || prev.brand
        }));
      }
      
      setSuccess(`AI detected items! Please review and adjust.`);
    } else {
      setError('No clothing items detected in image. Please try another photo.');
    }
  } catch (err) {
    console.error('AI detection error:', err);
    setError('AI detection failed. Please enter details manually.');
  } finally {
    setLoading(false);
  }
};
  const generateOutfitSuggestion = () => {
    const availableItems = wardrobeItems.filter(item => item.laundry_status === 'clean');
    if (availableItems.length >= 2) {
      const suggestion = {
        id: Date.now(),
        name: "AI Suggestion",
        items: [availableItems[0].id, availableItems[1].id],
        date: new Date().toISOString().split('T')[0],
        weather: "Sunny, 72°F",
        occasion: "Casual"
      };
      setOutfits([suggestion, ...outfits]);
      setSuccess('New outfit suggestion created!');
    } else {
      setError('Need at least 2 clean items for outfit suggestions');
    }
  };

  // Open item detail modal for editing
  const openItemDetail = (item) => {
    setSelectedItemForDetail(item);
    setShowItemDetailModal(true);
  };

  // Update item details
  const updateItemDetails = async (updatedItem) => {
    try {
      setLoading(true);
      
      // Call API to update the item
      const response = await fetch(`/api/wardrobe/items/${updatedItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: updatedItem.name,
          color: updatedItem.color,
          type: updatedItem.category,
          brand: updatedItem.brand,
          material: updatedItem.material,
          size: updatedItem.size,
          description: updatedItem.description
        }),
      });

      if (response.ok) {
        // Refresh the wardrobe items
        await loadWardrobeItems();
        setShowItemDetailModal(false);
        setSuccess('Item updated successfully!');
      } else {
        setError('Failed to update item');
      }
    } catch (err) {
      setError('Failed to update item');
    } finally {
      setLoading(false);
    }
  };

  const MessageBar = () => {
    if (!error && !success) return null;
    
    return (
      <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-2 ${
        error ? 'bg-red-100 border border-red-400 text-red-700' : 'bg-green-100 border border-green-400 text-green-700'
      }`}>
        {error ? <AlertCircle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
        <span>{error || success}</span>
      </div>
    );
  };

  const LoadingSpinner = () => (
    <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );

  const HomeView = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-lg">
        <h2 className="text-2xl font-bold mb-2">Welcome to Closet Monkey</h2>
        <p className="opacity-90">Your AI-powered wardrobe assistant</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center space-x-3 mb-3">
            <Shirt className="h-8 w-8 text-blue-600" />
            <div>
              <h3 className="font-semibold">Wardrobe Items</h3>
              <p className="text-gray-600">{wardrobeItems.length} items cataloged</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center space-x-3 mb-3">
            <Eye className="h-8 w-8 text-green-600" />
            <div>
              <h3 className="font-semibold">Outfits Created</h3>
              <p className="text-gray-600">{outfits.length} outfits logged</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border">
        <h3 className="font-semibold mb-4 flex items-center">
          <Thermometer className="h-5 w-5 mr-2 text-orange-500" />
          Today's Weather-Based Suggestion
        </h3>
        <div className="flex items-center space-x-4 p-4 bg-blue-50 rounded-lg">
          <div className="text-sm text-gray-600">
            <p>Today: Sunny, 72°F</p>
            <p>Perfect for: Light layers, cotton fabrics</p>
          </div>
          <button 
            onClick={generateOutfitSuggestion}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Get Suggestion
          </button>
        </div>
      </div>
    </div>
  );

  const WardrobeView = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">My Wardrobe</h2>
        <button 
          onClick={() => setCurrentView('addItem')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Item</span>
        </button>
      </div>
      
      <div className="flex justify-between items-center mb-6">
        <div className="flex space-x-4">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search items..." 
              className="border rounded-lg px-3 py-2 w-64"
            />
          </div>
          <select className="border rounded-lg px-3 py-2">
            <option>All Categories</option>
            {categories.map(cat => (
              <option key={cat}>{cat}</option>
            ))}
          </select>
        </div>
        
        {/* Bulk actions */}
        <div className="flex items-center space-x-3">
          {selectedItems.size > 0 && (
            <>
              <span className="text-sm text-gray-600">
                {selectedItems.size} selected
              </span>
              <button
                onClick={deleteSelectedItems}
                className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
              >
                Delete Selected
              </button>
              <button
                onClick={clearSelection}
                className="border border-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-50"
              >
                Clear
              </button>
            </>
          )}
          <button
            onClick={selectedItems.size === wardrobeItems.length ? clearSelection : selectAllItems}
            className="border border-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-50"
          >
            {selectedItems.size === wardrobeItems.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {wardrobeItems.map(item => (
            <div 
              key={item.id} 
              className={`bg-white rounded-lg shadow border overflow-hidden relative ${
                selectedItems.has(item.id) ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              {/* Selection checkbox */}
              <div className="absolute top-2 left-2 z-10">
                <input
                  type="checkbox"
                  checked={selectedItems.has(item.id)}
                  onChange={() => toggleItemSelection(item.id)}
                  className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                />
              </div>

              <div className="h-48 bg-gray-100 flex items-center justify-center">
                {item.imageUrl ? (
                  <img 
                    src={`http://localhost:5001${item.imageUrl}?t=${Date.now()}`} 
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Shirt className="h-16 w-16 text-gray-400" />
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold truncate">{item.name}</h3>
                <p className="text-sm text-gray-600">{item.brand}</p>
                <p className="text-sm text-gray-500">{item.type} • {item.color}</p>
                <div className="flex justify-between items-center mt-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    item.laundry_status === 'clean' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {item.laundry_status}
                  </span>
                  <div className="flex space-x-2">
                    {item.rfid_tag && (
                      <span className="text-xs text-gray-400">RFID: {item.rfid_tag}</span>
                    )}
                    <button
                      onClick={() => openItemDetail(item)}
                      className="text-blue-500 hover:text-blue-700 text-xs mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const AddItemView = () => (
    <div className="max-w-md mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Add New Item</h2>
      
      <div className="bg-white p-6 rounded-lg shadow border space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Take Photo or Upload</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            {uploadedImage ? (
  <div className="space-y-4">
    <div className="relative">
      {/* ✅ Add proper validation before createObjectURL */}
      {uploadedImage && uploadedImage instanceof File ? (
        <img 
          src={URL.createObjectURL(uploadedImage)}
          alt="Uploaded item"
          className="mx-auto max-h-32 rounded-lg"
        />
      ) : (
        <div className="mx-auto max-h-32 rounded-lg bg-gray-200 flex items-center justify-center p-4">
          <span className="text-gray-500">Invalid image file</span>
        </div>
      )}
      <button
        onClick={() => setUploadedImage(null)}
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
    <p className="text-sm text-green-600">
      Image ready! AI detection in progress...
    </p>
  </div>
) : (
              <div className="space-y-4">
                <Camera className="h-12 w-12 text-gray-400 mx-auto" />
                <p className="text-gray-600">Take a photo or upload an image</p>
                <p className="text-sm text-gray-500">AI will auto-detect item details</p>
                
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button 
                    onClick={() => setShowCamera(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2"
                  >
                    <Camera className="h-4 w-4" />
                    <span>Take Photo</span>
                  </button>
                  
                  <button 
                    onClick={() => fileInputRef.current.click()}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center space-x-2"
                  >
                    <Upload className="h-4 w-4" />
                    <span>Upload File</span>
                  </button>
                </div>
              </div>
            )}
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Item Name *</label>
          <input
            type="text"
            value={newItem.name}
            onChange={(e) => setNewItem({...newItem, name: e.target.value})}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g., Navy Suit Jacket"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Category *</label>
            <select
              value={newItem.category}
              onChange={(e) => setNewItem({...newItem, category: e.target.value})}
              className="w-full border rounded-lg px-3 py-2"
              required
            >
              <option value="">Select...</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Color</label>
            <select
              value={newItem.color}
              onChange={(e) => setNewItem({...newItem, color: e.target.value})}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Select...</option>
              {colors.map(color => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Brand</label>
          <input
            type="text"
            value={newItem.brand}
            onChange={(e) => setNewItem({...newItem, brand: e.target.value})}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g., Hugo Boss"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Size</label>
            <input
              type="text"
              value={newItem.size}
              onChange={(e) => setNewItem({...newItem, size: e.target.value})}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g., M, 32, 10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Material</label>
            <input
              type="text"
              value={newItem.material}
              onChange={(e) => setNewItem({...newItem, material: e.target.value})}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g., Cotton, Wool"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">RFID Tag (Optional)</label>
          <input
            type="text"
            value={newItem.rfidTag}
            onChange={(e) => setNewItem({...newItem, rfidTag: e.target.value})}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g., RF001"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={newItem.description}
            onChange={(e) => setNewItem({...newItem, description: e.target.value})}
            className="w-full border rounded-lg px-3 py-2"
            rows="3"
            placeholder="Additional notes about this item..."
          />
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => setCurrentView('wardrobe')}
            disabled={loading}
            className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={addItem}
            disabled={loading || !newItem.name || !newItem.category}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Adding...' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );

  const OutfitsView = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">My Outfits</h2>
        <button 
          onClick={generateOutfitSuggestion}
          disabled={loading}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center space-x-2"
        >
          <Star className="h-4 w-4" />
          <span>Get AI Suggestion</span>
        </button>
      </div>
      
      {/* Bulk actions for outfits */}
      {outfits.length > 0 && (
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search outfits..." 
              className="border rounded-lg px-3 py-2 w-64"
            />
          </div>
          
          <div className="flex items-center space-x-3">
            {selectedOutfits.size > 0 && (
              <>
                <span className="text-sm text-gray-600">
                  {selectedOutfits.size} selected
                </span>
                <button
                  onClick={deleteSelectedOutfits}
                  className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                >
                  Delete Selected
                </button>
                <button
                  onClick={clearOutfitSelection}
                  className="border border-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-50"
                >
                  Clear
                </button>
              </>
            )}
            <button
              onClick={selectedOutfits.size === outfits.length ? clearOutfitSelection : selectAllOutfits}
              className="border border-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-50"
            >
              {selectedOutfits.size === outfits.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-4">
          {outfits.length === 0 ? (
            <div className="text-center py-12">
              <Eye className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Outfits Yet</h3>
              <p className="text-gray-600 mb-4">Create your first outfit suggestion!</p>
              <button 
                onClick={generateOutfitSuggestion}
                disabled={wardrobeItems.length < 2}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Generate Outfit
              </button>
            </div>
          ) : (
            outfits.map(outfit => (
              <div key={outfit.id} className={`bg-white p-6 rounded-lg shadow border relative ${
                selectedOutfits.has(outfit.id) ? 'ring-2 ring-purple-500' : ''
              }`}>
                {/* Selection checkbox */}
                <div className="absolute top-4 left-4 z-10">
                  <input
                    type="checkbox"
                    checked={selectedOutfits.has(outfit.id)}
                    onChange={() => toggleOutfitSelection(outfit.id)}
                    className="w-4 h-4 text-purple-600 bg-white border-gray-300 rounded focus:ring-purple-500"
                  />
                </div>
                
                <div className="flex justify-between items-start mb-4 ml-8">
                  <div>
                    <h3 className="font-semibold text-lg">{outfit.name}</h3>
                    <p className="text-gray-600">Created on {outfit.date}</p>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="text-right text-sm text-gray-500">
                      <p className="flex items-center"><Thermometer className="h-4 w-4 mr-1" />{outfit.weather}</p>
                      <p className="flex items-center"><MapPin className="h-4 w-4 mr-1" />{outfit.occasion}</p>
                    </div>
                    <button
                      onClick={() => deleteOutfit(outfit.id)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Delete outfit"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex space-x-6">
                  {/* Components section */}
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Components</h4>
                    <div className="flex flex-wrap gap-3">
                      {outfit.items && outfit.items.length > 0 ? (
                        outfit.items.map((itemId, index) => {
                          const item = wardrobeItems.find(i => i.id === itemId);
                          return item ? (
                            <div key={item.id} className="flex-shrink-0 relative group">
                              <div className="w-20 h-24 bg-gray-100 rounded flex items-center justify-center cursor-pointer" onClick={() => openItemDetail(item)}>
                                {item.imageUrl ? (
                                  <img 
                                    src={`http://localhost:5001${item.imageUrl}?t=${Date.now()}`} 
                                    alt={item.name}
                                    className="w-full h-full object-cover rounded"
                                  />
                                ) : (
                                  <Shirt className="h-8 w-8 text-gray-400" />
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openItemDetail(item);
                                }}
                                className="absolute top-1 right-1 bg-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-50"
                                title="Edit item"
                              >
                                <svg className="h-3 w-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <p className="text-xs text-center mt-1 truncate w-20">{item.name}</p>
                            </div>
                          ) : null;
                        })
                      ) : outfit.itemNames && outfit.itemNames.length > 0 ? (
                        outfit.itemNames.map((itemName, index) => {
                          // Try to find the item by name in the wardrobe for editing
                          const item = wardrobeItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
                          return (
                            <div key={`${outfit.id}-${index}`} className="flex-shrink-0 relative group">
                              <div 
                                className={`w-20 h-24 bg-gray-100 rounded flex items-center justify-center ${item ? 'cursor-pointer' : ''}`}
                                onClick={item ? () => openItemDetail(item) : undefined}
                              >
                                {outfit.itemImageUrls && outfit.itemImageUrls[index] ? (
                                  <img 
                                    src={`http://localhost:5001${outfit.itemImageUrls[index]}?t=${Date.now()}`} 
                                    alt={itemName}
                                    className="w-full h-full object-cover rounded"
                                  />
                                ) : (
                                  <Shirt className="h-8 w-8 text-gray-400" />
                                )}
                              </div>
                              {item && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openItemDetail(item);
                                  }}
                                  className="absolute top-1 right-1 bg-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-50"
                                  title="Edit item"
                                >
                                  <svg className="h-3 w-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              )}
                              <p className="text-xs text-center mt-1 truncate w-20">{itemName}</p>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-gray-500 text-sm">No items found</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Full outfit section */}
                  <div className="flex-shrink-0">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Complete Outfit</h4>
                    <div className="w-32 h-40 bg-gray-100 rounded flex items-center justify-center">
                      {outfit.imageUrl ? (
                        <img 
                          src={`http://localhost:5001${outfit.imageUrl}?t=${Date.now()}`} 
                          alt={outfit.name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <Eye className="h-12 w-12 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  // Handler for adding detected items from outfit scanner
  const handleAddDetectedItems = async (detectedItems) => {
    setLoading(true);
    setError(null);
    
    try {
      const promises = detectedItems.map(item => 
        api.addItem({
          name: item.name,
          category: item.category,
          color: item.color,
          brand: item.brand || '',
          type: item.type || '',
          description: `Detected from outfit scan with ${Math.round(item.confidence * 100)}% confidence`,
          laundryStatus: 'clean'
        })
      );
      
      const results = await Promise.all(promises);
      
      // Update wardrobe items with new items
      const newItems = results.map(result => result.item || result);
      setWardrobeItems(prev => [...prev, ...newItems]);
      
      setSuccess(`Successfully added ${detectedItems.length} items to your wardrobe!`);
      
    } catch (error) {
      console.error('Error adding detected items:', error);
      setError('Failed to add detected items to wardrobe');
    } finally {
      setLoading(false);
    }
  };

  // Outfit Scanner View
  const OutfitScannerView = () => (
    <OutfitScanner 
      wardrobeItems={wardrobeItems}
      onAddDetectedItems={handleAddDetectedItems}
      onOutfitSaved={() => {
        loadOutfits();
        setSuccess('Outfit saved successfully!');
      }}
      onWardrobeUpdated={loadWardrobeItems}
    />
  );

  const navigationItems = [
    { id: 'home', label: 'Home', icon: Camera },
    { id: 'wardrobe', label: 'Wardrobe', icon: Shirt },
    { id: 'outfits', label: 'Outfits', icon: Eye, badge: outfits.length },
    { id: 'outfit-scanner', label: 'Outfit Scanner', icon: Camera },
    { id: 'social', label: 'Social', icon: Users },
    { id: 'marketplace', label: 'Market', icon: ShoppingBag },
  ];

  // Item Detail Modal Component (same as in OutfitScanner)
  const ItemDetailModal = () => {
    const [itemName, setItemName] = useState(selectedItemForDetail?.name || '');
    const [itemColor, setItemColor] = useState(selectedItemForDetail?.color || '');
    const [itemCategory, setItemCategory] = useState(selectedItemForDetail?.type || '');
    const [itemBrand, setItemBrand] = useState(selectedItemForDetail?.brand || '');
    const [itemMaterial, setItemMaterial] = useState(selectedItemForDetail?.material || '');
    const [itemSize, setItemSize] = useState(selectedItemForDetail?.size || '');
    const [itemDescription, setItemDescription] = useState(selectedItemForDetail?.description || '');
    const [imageRotation, setImageRotation] = useState(0);
    
    // Reset form when a new item is selected
    React.useEffect(() => {
      if (selectedItemForDetail) {
        setItemName(selectedItemForDetail.name || '');
        setItemColor(selectedItemForDetail.color || '');
        setItemCategory(selectedItemForDetail.type || '');
        setItemBrand(selectedItemForDetail.brand || '');
        setItemMaterial(selectedItemForDetail.material || '');
        setItemSize(selectedItemForDetail.size || '');
        setItemDescription(selectedItemForDetail.description || '');
        setImageRotation(0);
      }
    }, [selectedItemForDetail?.name, selectedItemForDetail?.color, selectedItemForDetail?.type, selectedItemForDetail?.brand]);

    if (!showItemDetailModal || !selectedItemForDetail) return null;

    const handleSave = () => {
      const updatedItem = {
        ...selectedItemForDetail,
        name: itemName.trim() || selectedItemForDetail.name,
        color: itemColor,
        category: itemCategory,
        brand: itemBrand.trim(),
        material: itemMaterial.trim(),
        size: itemSize.trim(),
        description: itemDescription.trim(),
        rotation: imageRotation
      };
      updateItemDetails(updatedItem);
    };

    const rotateImage = (degrees) => {
      setImageRotation((prev) => (prev + degrees) % 360);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold">Edit Item Details</h3>
            <button
              onClick={() => setShowItemDetailModal(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Image Section */}
            <div className="space-y-4">
              <h4 className="font-medium">Item Image</h4>
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="w-full h-48 bg-white rounded border relative overflow-hidden mb-4">
                  {selectedItemForDetail.imageUrl ? (
                    <img 
                      src={`http://localhost:5001${selectedItemForDetail.imageUrl}?t=${Date.now()}`}
                      alt={selectedItemForDetail.name}
                      className="w-full h-full object-contain"
                      style={{ transform: `rotate(${imageRotation}deg)` }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <Camera className="h-12 w-12" />
                    </div>
                  )}
                </div>
                
                {/* Image Controls */}
                <div className="flex justify-center space-x-2">
                  <button
                    onClick={() => rotateImage(-90)}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                  >
                    ↺ -90°
                  </button>
                  <button
                    onClick={() => rotateImage(90)}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                  >
                    ↻ +90°
                  </button>
                  <button
                    onClick={() => setImageRotation(0)}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Details Form */}
            <div className="space-y-4">
              <h4 className="font-medium">Item Details</h4>
              
              <div>
                <label className="block text-sm font-medium mb-1">Item Name</label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Enter item name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Color</label>
                <input
                  type="text"
                  value={itemColor}
                  onChange={(e) => setItemColor(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Enter color"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select 
                  value={itemCategory}
                  onChange={(e) => setItemCategory(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="Shirts">Shirts</option>
                  <option value="Pants">Pants</option>
                  <option value="Jackets">Jackets</option>
                  <option value="Dresses">Dresses</option>
                  <option value="Shoes">Shoes</option>
                  <option value="Accessories">Accessories</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Brand</label>
                <input
                  type="text"
                  value={itemBrand}
                  onChange={(e) => setItemBrand(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Enter brand name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Material</label>
                <input
                  type="text"
                  value={itemMaterial}
                  onChange={(e) => setItemMaterial(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Enter material"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Size</label>
                <input
                  type="text"
                  value={itemSize}
                  onChange={(e) => setItemSize(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Enter size"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  rows="3"
                  placeholder="Enter description"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
            <button
              onClick={() => setShowItemDetailModal(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Show splash screen on initial load or when idle
  if (showSplashScreen || isIdle) {
    return (
      <SplashScreen 
        onComplete={isIdle ? handleWakeFromIdle : handleSplashComplete}
        isIdle={isIdle}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <MessageBar />
      
      {/* Camera Modal */}
      {showCamera && (
        <CameraCapture 
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Item Detail Modal */}
      <ItemDetailModal />
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <img 
                src="/images/closet-monkey-logo.png" 
                alt="Closet Monkey Logo" 
                className="w-8 h-8 rounded-lg object-contain"
                onError={(e) => {
                  // Fallback to gradient if image fails to load
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg" style={{display: 'none'}}></div>
              <h1 className="text-xl font-bold text-gray-900">Closet Monkey</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                API Status: {loading ? 'Loading...' : 'Connected'}
              </span>
              <div className={`w-3 h-3 rounded-full ${loading ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {navigationItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`flex items-center space-x-2 py-4 border-b-2 transition-colors relative ${
                    currentView === item.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'home' && <HomeView />}
        {currentView === 'wardrobe' && <WardrobeView />}
        {currentView === 'addItem' && <AddItemView />}
        {currentView === 'outfits' && <OutfitsView />}
        {currentView === 'outfit-scanner' && <OutfitScannerView />}
        {currentView === 'social' && (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Social Features</h3>
            <p className="text-gray-600">Coming soon in Phase 4!</p>
          </div>
        )}
        {currentView === 'marketplace' && (
          <div className="text-center py-12">
            <ShoppingBag className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Marketplace</h3>
            <p className="text-gray-600">Coming soon in Phase 4!</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default ClosetMonkeyMVP;

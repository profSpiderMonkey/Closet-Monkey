import React, { useState, useRef, useEffect } from 'react';
import { Camera, Plus, Eye, Shirt, Calendar, Cloud, Users, ShoppingBag, Search, Filter, Star, MapPin, Thermometer, AlertCircle, CheckCircle, Upload, X } from 'lucide-react';
import api from './services/api';
import CameraCapture from './components/CameraCapture';

const ClosetMonkeyMVP = () => {
  const [currentView, setCurrentView] = useState('home');
  const [wardrobeItems, setWardrobeItems] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
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
    // TODO: Load outfits when outfit API is ready
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
      
      <div className="flex space-x-4 mb-6">
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

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {wardrobeItems.map(item => (
            <div key={item.id} className="bg-white rounded-lg shadow border overflow-hidden">
              <div className="h-48 bg-gray-100 flex items-center justify-center">
{item.imageUrl ? (
                  <img 
                    src={`http://localhost:5001${item.imageUrl}`} 
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
                <p className="text-sm text-gray-500">{item.category} • {item.color}</p>
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
              <div key={outfit.id} className="bg-white p-6 rounded-lg shadow border">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{outfit.name}</h3>
                    <p className="text-gray-600">Created on {outfit.date}</p>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <p className="flex items-center"><Thermometer className="h-4 w-4 mr-1" />{outfit.weather}</p>
                    <p className="flex items-center"><MapPin className="h-4 w-4 mr-1" />{outfit.occasion}</p>
                  </div>
                </div>
                
                <div className="flex space-x-4">
                  {outfit.items.map(itemId => {
                    const item = wardrobeItems.find(i => i.id === itemId);
                    return item ? (
                      <div key={item.id} className="flex-shrink-0">
                        <div className="w-20 h-24 bg-gray-100 rounded flex items-center justify-center">
{item.imageUrl ? (
                            <img 
                              src={`http://localhost:5001${item.imageUrl}`} 
                              alt={item.name}
                              className="w-full h-full object-cover rounded"
                            />
                          ) : (
                            <Shirt className="h-8 w-8 text-gray-400" />
                          )}
                        </div>
                        <p className="text-xs text-center mt-1 truncate w-20">{item.name}</p>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const navigationItems = [
    { id: 'home', label: 'Home', icon: Camera },
    { id: 'wardrobe', label: 'Wardrobe', icon: Shirt },
    { id: 'outfits', label: 'Outfits', icon: Eye },
    { id: 'social', label: 'Social', icon: Users },
    { id: 'marketplace', label: 'Market', icon: ShoppingBag },
  ];

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
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg"></div>
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
                  className={`flex items-center space-x-2 py-4 border-b-2 transition-colors ${
                    currentView === item.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
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

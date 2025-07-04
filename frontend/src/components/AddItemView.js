import React, { useState, useEffect } from 'react';

const AddItemView = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  console.log('State initialized, selectedImage:', selectedImage);
  console.log('State initialized, imagePreviewUrl:', imagePreviewUrl);
  
  const [itemData, setItemData] = useState({
    name: '',
    category: '',
    color: '',
    brand: '',
    description: ''
  });

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // Handle file selection
  const handleImageChange = (event) => {
    const file = event.target.files[0];
    
    // Clear previous image
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
    
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      // ✅ Only create object URL if we have a valid file
      const previewUrl = URL.createObjectURL(file);
      setImagePreviewUrl(previewUrl);
    } else {
      setSelectedImage(null);
      setImagePreviewUrl(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!selectedImage) {
      alert('Please select an image');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', selectedImage);
      formData.append('itemData', JSON.stringify(itemData));

      const response = await fetch('/api/items', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        // Reset form
        setSelectedImage(null);
        setImagePreviewUrl(null);
        setItemData({
          name: '',
          category: '',
          color: '',
          brand: '',
          description: ''
        });
        // Clear file input
        event.target.reset();
        alert('Item added successfully!');
      } else {
        throw new Error('Failed to add item');
      }
    } catch (error) {
      console.error('Error adding item:', error);
      alert('Failed to add item. Please try again.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">Add New Item</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Image Upload */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Item Photo
          </label>
          
          <div className="flex items-center space-x-6">
            <div className="shrink-0">
              {imagePreviewUrl ? (
                <img
                  className="h-32 w-32 object-cover rounded-lg border-2 border-gray-300"
                  src={imagePreviewUrl}
                  alt="Preview"
                />
              ) : (
                <div className="h-32 w-32 bg-gray-200 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                  <span className="text-gray-500 text-sm">No image</span>
                </div>
              )}
            </div>
            
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                required
              />
            </div>
          </div>
        </div>

        {/* Item Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Item Name
            </label>
            <input
              type="text"
              value={itemData.name}
              onChange={(e) => setItemData({...itemData, name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <select
              value={itemData.category}
              onChange={(e) => setItemData({...itemData, category: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select category</option>
              <option value="shirt">Shirt</option>
              <option value="pants">Pants</option>
              <option value="dress">Dress</option>
              <option value="jacket">Jacket</option>
              <option value="shoes">Shoes</option>
              <option value="accessories">Accessories</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color
            </label>
            <input
              type="text"
              value={itemData.color}
              onChange={(e) => setItemData({...itemData, color: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Brand
            </label>
            <input
              type="text"
              value={itemData.brand}
              onChange={(e) => setItemData({...itemData, brand: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            value={itemData.description}
            onChange={(e) => setItemData({...itemData, description: e.target.value})}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Optional description..."
          />
        </div>

        <div className="flex space-x-4">
          <button
            type="submit"
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Add Item
          </button>
          
          <button
            type="button"
            onClick={() => {
              if (imagePreviewUrl) {
                URL.revokeObjectURL(imagePreviewUrl);
              }
              setSelectedImage(null);
              setImagePreviewUrl(null);
              setItemData({
                name: '',
                category: '',
                color: '',
                brand: '',
                description: ''
              });
            }}
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Clear
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddItemView;
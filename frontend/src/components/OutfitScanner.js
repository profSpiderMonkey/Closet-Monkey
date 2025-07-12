// frontend/src/components/OutfitScanner.js
import React, { useState, useRef } from 'react';
import { Camera, Upload, X, Plus, Eye, Loader } from 'lucide-react';

const OutfitScanner = ({ wardrobeItems, onAddDetectedItems, onOutfitSaved, onWardrobeUpdated }) => {
  const [outfitImage, setOutfitImage] = useState(null);
  const [outfitImageUrl, setOutfitImageUrl] = useState(null);
  const [detectedItems, setDetectedItems] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showOutfitDialog, setShowOutfitDialog] = useState(false);
  const [outfitDialogData, setOutfitDialogData] = useState(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateDialogData, setDuplicateDialogData] = useState(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successDialogData, setSuccessDialogData] = useState(null);
  const [showItemDetailModal, setShowItemDetailModal] = useState(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState(null);
  const [showFullImageModal, setShowFullImageModal] = useState(false);
  const [selectedFullImage, setSelectedFullImage] = useState(null);
  const [showConfirmationScreen, setShowConfirmationScreen] = useState(false);
  const [tempImagePath, setTempImagePath] = useState(null);
  const [suggestedOutfitName, setSuggestedOutfitName] = useState('');
  const fileInputRef = useRef(null);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setOutfitImage(file);
      const imageUrl = URL.createObjectURL(file);
      setOutfitImageUrl(imageUrl);
      setDetectedItems([]);
      setAnalysisResults(null);
      setSelectedItems(new Set());
      
      // Auto-analyze the image
      setTimeout(() => {
        analyzeOutfitWithFile(file);
      }, 100);
    }
  };

  const analyzeOutfitWithFile = async (file) => {
    setIsAnalyzing(true);
    try {
      // Create FormData for the API call
      const formData = new FormData();
      formData.append('outfitImage', file);
      formData.append('wardrobeItems', JSON.stringify(wardrobeItems));
      formData.append('userId', localStorage.getItem('userId') || '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07');

      // Call our backend API for outfit analysis
      const response = await fetch('/api/analyze-outfit', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to analyze outfit');
      }

      const results = await response.json();
      setAnalysisResults(results);
      setDetectedItems(results.detectedItems || []);
      setTempImagePath(results.tempImagePath);
      setSuggestedOutfitName(results.suggestedOutfitName || 'My Outfit');
      
      // Show the confirmation screen instead of auto-saving
      setShowConfirmationScreen(true);
      console.log('Showing confirmation screen with detected items');
      
    } catch (error) {
      console.error('Error analyzing outfit:', error);
      setSuccessDialogData({
        message: "Failed to analyze outfit.",
        subtitle: "Please try again.",
        isError: true
      });
      setShowSuccessDialog(true);
    } finally {
      setIsAnalyzing(false);
    }
  };



  const toggleItemSelection = (itemIndex) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemIndex)) {
      newSelected.delete(itemIndex);
    } else {
      newSelected.add(itemIndex);
    }
    setSelectedItems(newSelected);
  };

  const handleColorChange = (itemIndex, newColor) => {
    const updatedItems = [...detectedItems];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      color: newColor,
      name: `${newColor} ${updatedItems[itemIndex].type}`.replace(/\b\w/g, l => l.toUpperCase())
    };
    setDetectedItems(updatedItems);
  };

  const addSelectedItems = () => {
    const itemsToAdd = detectedItems
      .filter((_, index) => selectedItems.has(index))
      .filter(item => item.status === 'new'); // Only add items not already in wardrobe
    
    if (itemsToAdd.length > 0) {
      onAddDetectedItems(itemsToAdd);
      setSuccessDialogData({
        message: `Added ${itemsToAdd.length} new items to your wardrobe!`,
        subtitle: "Items have been successfully added."
      });
      setShowSuccessDialog(true);
    }
  };

  // Confirm and save the outfit after user review
  const confirmAndSaveOutfit = async () => {
    console.log('User confirmed outfit - saving...');
    setIsAnalyzing(true);
    
    try {
      const response = await fetch('/api/analyze-outfit/confirm-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tempImagePath: tempImagePath,
          detectedItems: detectedItems,
          outfitName: suggestedOutfitName,
          userId: localStorage.getItem('userId') || '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to save outfit');
      }

      const results = await response.json();
      
      // Hide confirmation screen
      setShowConfirmationScreen(false);
      
      // Check for duplicates
      if (results.hasDuplicates && results.duplicateOutfits.length > 0) {
        setDuplicateDialogData({
          duplicateOutfits: results.duplicateOutfits,
          file: null, // We don't have the file anymore
          detectedItems: detectedItems
        });
        setShowDuplicateDialog(true);
      } else {
        // Show success notifications
        if (results.savedOutfit) {
          setOutfitDialogData(results.savedOutfit);
          setShowOutfitDialog(true);
          
          // Call onOutfitSaved to refresh the outfits list
          if (onOutfitSaved) {
            console.log('Calling onOutfitSaved callback after successful outfit save');
            onOutfitSaved();
          }
        }
        
        if (results.savedWardrobeItems && results.savedWardrobeItems.length > 0) {
          if (onWardrobeUpdated) onWardrobeUpdated();
          setSuccessDialogData({
            message: `Great! Added ${results.savedWardrobeItems.length} new items to your wardrobe.`,
            subtitle: "Check the Wardrobe tab to see them!"
          });
          setShowSuccessDialog(true);
        }
      }
      
    } catch (error) {
      console.error('Error saving outfit:', error);
      setSuccessDialogData({
        message: "Failed to save outfit.",
        subtitle: error.message || "Please try again.",
        isError: true
      });
      setShowSuccessDialog(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Cancel outfit saving and go back to analysis
  const cancelOutfitSave = () => {
    setShowConfirmationScreen(false);
    // Keep the detected items for further editing
    console.log('User cancelled outfit save - keeping detected items for editing');
  };

  const clearOutfit = () => {
    if (outfitImageUrl) {
      URL.revokeObjectURL(outfitImageUrl);
    }
    setOutfitImage(null);
    setOutfitImageUrl(null);
    setDetectedItems([]);
    setAnalysisResults(null);
    setSelectedItems(new Set());
    setShowConfirmationScreen(false);
    setTempImagePath(null);
    setSuggestedOutfitName('');
  };

  const handleOutfitRename = async (newName) => {
    try {
      const response = await fetch(`/api/outfits/${outfitDialogData.id}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newName: newName.trim() })
      });
      
      if (response.ok) {
        const result = await response.json();
        setShowOutfitDialog(false);
        setSuccessDialogData({
          message: `Outfit renamed to "${result.newName}" and saved!`,
          subtitle: "Check your Outfits section."
        });
        setShowSuccessDialog(true);
        if (onOutfitSaved) {
          console.log('Calling onOutfitSaved callback to refresh outfits list');
          onOutfitSaved(); // Refresh outfits list
        }
      } else {
        console.error('Failed to rename outfit');
        setShowOutfitDialog(false);
        setSuccessDialogData({
          message: `Outfit "${outfitDialogData.name}" saved!`,
          subtitle: "Check your Outfits section."
        });
        setShowSuccessDialog(true);
        if (onOutfitSaved) {
          console.log('Calling onOutfitSaved callback to refresh outfits list');
          onOutfitSaved(); // Refresh outfits list
        }
      }
    } catch (error) {
      console.error('Error renaming outfit:', error);
      setShowOutfitDialog(false);
      setSuccessDialogData({
        message: `Outfit "${outfitDialogData.name}" saved!`,
        subtitle: "Check your Outfits section."
      });
      setShowSuccessDialog(true);
      if (onOutfitSaved) onOutfitSaved(); // Refresh outfits list
    }
  };

  const handleOutfitKeepName = () => {
    setShowOutfitDialog(false);
    setSuccessDialogData({
      message: `Outfit "${outfitDialogData.name}" saved!`,
      subtitle: "Check your Outfits section."
    });
    setShowSuccessDialog(true);
    if (onOutfitSaved) onOutfitSaved(); // Refresh outfits list
  };

  // Handler for duplicate outfit dialog actions
  const handleDuplicateAction = async (action, existingOutfitId = null) => {
    const { detectedItems } = duplicateDialogData;
    setShowDuplicateDialog(false);

    if (action === 'saveNew') {
      // Continue with saving as new outfit
      // We'll use the confirm-save endpoint with the flag to save anyway
      try {
        const response = await fetch('/api/analyze-outfit/save-anyway', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tempImagePath: tempImagePath,
            detectedItems: detectedItems,
            outfitName: suggestedOutfitName,
            userId: localStorage.getItem('userId') || '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07'
          })
        });

        if (!response.ok) {
          throw new Error('Failed to save outfit');
        }

        const results = await response.json();
        
        // Show notifications
        if (results.savedOutfit) {
          setOutfitDialogData(results.savedOutfit);
          setShowOutfitDialog(true);
          
          // Call onOutfitSaved to refresh the outfits list
          if (onOutfitSaved) {
            console.log('Calling onOutfitSaved callback after saving outfit anyway');
            onOutfitSaved();
          }
        }
        
        if (results.savedWardrobeItems && results.savedWardrobeItems.length > 0) {
          if (onWardrobeUpdated) onWardrobeUpdated();
          setSuccessDialogData({
            message: `Great! Added ${results.savedWardrobeItems.length} new items to your wardrobe.`,
            subtitle: "Check the Wardrobe tab to see them!"
          });
          setShowSuccessDialog(true);
        }
      } catch (error) {
        console.error('Error saving outfit anyway:', error);
        setSuccessDialogData({
          message: "Failed to save outfit.",
          subtitle: "Please try again.",
          isError: true
        });
        setShowSuccessDialog(true);
      }
    } else if (action === 'addPhoto' && existingOutfitId) {
      // Add photo to existing outfit using the temp image path
      await addPhotoToExistingOutfit(existingOutfitId, null);
    } else if (action === 'cancel') {
      // User cancelled - show cancellation message
      setSuccessDialogData({
        message: "Outfit scanning cancelled.",
        subtitle: "You can try again with a different outfit.",
        isError: false
      });
      setShowSuccessDialog(true);
    }
  };

  // Function to add photo to existing outfit
  const addPhotoToExistingOutfit = async (outfitId, file) => {
    try {
      const formData = new FormData();
      formData.append('outfitImage', file);
      formData.append('userId', localStorage.getItem('userId') || '7eb88885-3bc3-4c09-af20-7fbd0bf6fa07');

      const response = await fetch(`/api/outfits/${outfitId}/add-photo`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to add photo to outfit');
      }

      const result = await response.json();
      setSuccessDialogData({
        message: `Photo added to "${result.outfitName}" successfully!`,
        subtitle: "The outfit now has multiple photos."
      });
      setShowSuccessDialog(true);
      if (onOutfitSaved) onOutfitSaved(); // Refresh outfits list
      
    } catch (error) {
      console.error('Error adding photo to outfit:', error);
      setSuccessDialogData({
        message: "Failed to add photo to outfit.",
        subtitle: "Please try again.",
        isError: true
      });
      setShowSuccessDialog(true);
    }
  };

  // Open item detail modal
  const openItemDetail = (item, index) => {
    setSelectedItemForDetail({ ...item, index });
    setShowItemDetailModal(true);
  };

  // Update item details
  const updateItemDetails = (updatedItem) => {
    const updatedItems = [...detectedItems];
    updatedItems[updatedItem.index] = { ...updatedItem };
    setDetectedItems(updatedItems);
    setShowItemDetailModal(false);
    
    setSuccessDialogData({
      message: "Item details updated successfully!",
      subtitle: "Changes have been applied to the detected item."
    });
    setShowSuccessDialog(true);
  };

  // Show full-size cropped image
  const showFullCroppedImage = (item) => {
    setSelectedFullImage(item);
    setShowFullImageModal(true);
  };

  // Outfit naming dialog component
  const OutfitNamingDialog = () => {
    const [newName, setNewName] = useState(outfitDialogData?.name || '');
    
    if (!showOutfitDialog || !outfitDialogData) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4">Outfit Saved Successfully!</h3>
          <p className="text-gray-600 mb-4">
            I've named this outfit <strong>"{outfitDialogData.name}"</strong>. 
            Would you like to give it a different name?
          </p>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Outfit Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Enter outfit name"
            />
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={handleOutfitKeepName}
              className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Keep Current Name
            </button>
            <button
              onClick={() => handleOutfitRename(newName)}
              disabled={!newName.trim()}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Rename Outfit
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Duplicate outfit dialog component
  const DuplicateOutfitDialog = () => {
    if (!showDuplicateDialog || !duplicateDialogData) return null;
    
    const { duplicateOutfits } = duplicateDialogData;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-96 overflow-y-auto">
          <h3 className="text-lg font-semibold mb-4 text-orange-600">⚠️ Similar Outfits Detected</h3>
          <p className="text-gray-600 mb-4">
            Found {duplicateOutfits.length} similar outfit{duplicateOutfits.length > 1 ? 's' : ''}:
          </p>
          
          <div className="space-y-3 mb-6">
            {duplicateOutfits.map((outfit, index) => (
              <div key={index} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{outfit.name}</p>
                    <p className="text-sm text-gray-600">{outfit.similarity}% similar</p>
                  </div>
                  <button
                    onClick={() => handleDuplicateAction('addPhoto', outfit.id)}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                  >
                    Add Photo to This
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={() => handleDuplicateAction('cancel')}
              className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDuplicateAction('saveNew')}
              className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              Save as New Outfit
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Success/Error dialog component
  const SuccessDialog = () => {
    if (!showSuccessDialog || !successDialogData) return null;
    
    const { message, subtitle, isError } = successDialogData;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className={`mx-auto mb-4 h-12 w-12 rounded-full flex items-center justify-center ${
              isError ? 'bg-red-100' : 'bg-green-100'
            }`}>
              <span className={`text-2xl ${isError ? 'text-red-600' : 'text-green-600'}`}>
                {isError ? '⚠️' : '✅'}
              </span>
            </div>
            <h3 className={`text-lg font-semibold mb-2 ${isError ? 'text-red-800' : 'text-green-800'}`}>
              {message}
            </h3>
            {subtitle && (
              <p className="text-gray-600 mb-4">{subtitle}</p>
            )}
            <button
              onClick={() => setShowSuccessDialog(false)}
              className={`px-6 py-2 rounded-lg text-white hover:opacity-90 ${
                isError ? 'bg-red-600' : 'bg-green-600'
              }`}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Item Detail Modal Component
  const ItemDetailModal = () => {
    const [itemName, setItemName] = useState(selectedItemForDetail?.name || '');
    const [itemColor, setItemColor] = useState(selectedItemForDetail?.color || '');
    const [itemCategory, setItemCategory] = useState(selectedItemForDetail?.category || '');
    const [itemBrand, setItemBrand] = useState(selectedItemForDetail?.brand || '');
    const [imageRotation, setImageRotation] = useState(0);
    
    // Reset form when a new item is selected
    React.useEffect(() => {
      if (selectedItemForDetail) {
        setItemName(selectedItemForDetail.name || '');
        setItemColor(selectedItemForDetail.color || '');
        setItemCategory(selectedItemForDetail.category || '');
        setItemBrand(selectedItemForDetail.brand || '');
        setImageRotation(0);
      }
    }, [selectedItemForDetail?.name, selectedItemForDetail?.color, selectedItemForDetail?.category, selectedItemForDetail?.brand]);

    if (!showItemDetailModal || !selectedItemForDetail) return null;

    const handleSave = () => {
      const updatedItem = {
        ...selectedItemForDetail,
        name: itemName.trim() || selectedItemForDetail.name,
        color: itemColor,
        category: itemCategory,
        brand: itemBrand.trim(),
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
                  {selectedItemForDetail.croppedImageUrl ? (
                    <img 
                      src={selectedItemForDetail.croppedImageUrl}
                      alt={selectedItemForDetail.name}
                      className="w-full h-full object-contain"
                      style={{ transform: `rotate(${imageRotation}deg)` }}
                      onError={(e) => {
                        e.target.src = outfitImageUrl;
                        e.target.style.objectPosition = selectedItemForDetail.boundingBox 
                          ? `${selectedItemForDetail.boundingBox.left || 50}% ${selectedItemForDetail.boundingBox.top || 50}%`
                          : 'center';
                      }}
                    />
                  ) : selectedItemForDetail.boundingBox ? (
                    <img 
                      src={outfitImageUrl}
                      alt="Item detection area"
                      className="w-full h-full object-cover"
                      style={{
                        transform: `rotate(${imageRotation}deg)`,
                        objectPosition: `${selectedItemForDetail.boundingBox.left || 50}% ${selectedItemForDetail.boundingBox.top || 50}%`
                      }}
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
                <select 
                  value={itemColor}
                  onChange={(e) => setItemColor(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  {/* Blues */}
                  <option value="navy">Navy</option>
                  <option value="light blue">Light Blue</option>
                  <option value="sky blue">Sky Blue</option>
                  <option value="powder blue">Powder Blue</option>
                  <option value="baby blue">Baby Blue</option>
                  <option value="pale blue">Pale Blue</option>
                  <option value="ice blue">Ice Blue</option>
                  <option value="royal blue">Royal Blue</option>
                  <option value="oxford blue">Oxford Blue</option>
                  <option value="midnight blue">Midnight Blue</option>
                  <option value="slate blue">Slate Blue</option>
                  <option value="steel blue">Steel Blue</option>
                  
                  {/* Browns/Tans */}
                  <option value="tan">Tan</option>
                  <option value="brown">Brown</option>
                  <option value="dark brown">Dark Brown</option>
                  <option value="light brown">Light Brown</option>
                  <option value="cognac">Cognac</option>
                  <option value="mahogany">Mahogany</option>
                  <option value="chestnut">Chestnut</option>
                  <option value="cordovan">Cordovan</option>
                  <option value="oxblood">Oxblood</option>
                  <option value="walnut">Walnut</option>
                  <option value="honey brown">Honey Brown</option>
                  <option value="espresso">Espresso</option>
                  <option value="caramel">Caramel</option>
                  <option value="saddle brown">Saddle Brown</option>
                  <option value="chocolate">Chocolate</option>
                  <option value="coffee">Coffee</option>
                  <option value="tobacco">Tobacco</option>
                  
                  {/* Grays */}
                  <option value="black">Black</option>
                  <option value="charcoal">Charcoal</option>
                  <option value="dark gray">Dark Gray</option>
                  <option value="gray">Gray</option>
                  <option value="light gray">Light Gray</option>
                  <option value="heather gray">Heather Gray</option>
                  <option value="stone gray">Stone Gray</option>
                  <option value="steel gray">Steel Gray</option>
                  <option value="pewter">Pewter</option>
                  <option value="anthracite">Anthracite</option>
                  <option value="dove gray">Dove Gray</option>
                  <option value="graphite">Graphite</option>
                  <option value="slate">Slate</option>
                  
                  {/* Whites/Creams */}
                  <option value="white">White</option>
                  <option value="cream">Cream</option>
                  <option value="ivory">Ivory</option>
                  <option value="off-white">Off-White</option>
                  <option value="champagne">Champagne</option>
                  <option value="pearl">Pearl</option>
                  <option value="beige">Beige</option>
                  
                  {/* Earth Tones */}
                  <option value="khaki">Khaki</option>
                  <option value="olive">Olive</option>
                  <option value="stone">Stone</option>
                  <option value="taupe">Taupe</option>
                  
                  {/* Reds */}
                  <option value="burgundy">Burgundy</option>
                  <option value="wine">Wine</option>
                  <option value="maroon">Maroon</option>
                  <option value="crimson">Crimson</option>
                  <option value="red">Red</option>
                  
                  {/* Greens */}
                  <option value="forest green">Forest Green</option>
                  <option value="emerald">Emerald</option>
                  <option value="mint green">Mint Green</option>
                  <option value="sage">Sage</option>
                  <option value="teal">Teal</option>
                  <option value="green">Green</option>
                  
                  {/* Others */}
                  <option value="purple">Purple</option>
                  <option value="lavender">Lavender</option>
                  <option value="pale pink">Pale Pink</option>
                  <option value="pink">Pink</option>
                  <option value="pale yellow">Pale Yellow</option>
                  <option value="gold">Gold</option>
                  <option value="mustard">Mustard</option>
                  <option value="copper">Copper</option>
                  <option value="silver">Silver</option>
                </select>
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
                  <option value="Outerwear">Outerwear</option>
                  <option value="Dresses">Dresses</option>
                  <option value="Shoes">Shoes</option>
                  <option value="Accessories">Accessories</option>
                  <option value="Sweaters">Sweaters</option>
                  <option value="Skirts">Skirts</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Brand (Optional)</label>
                <input
                  type="text"
                  value={itemBrand}
                  onChange={(e) => setItemBrand(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Enter brand name"
                />
              </div>

              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Confidence:</strong> {Math.round((selectedItemForDetail.confidence || 0) * 100)}%
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Type:</strong> {selectedItemForDetail.type}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Status:</strong> {selectedItemForDetail.status === 'existing' ? 'In Wardrobe' : 'New Item'}
                </p>
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

  // Full Image Modal Component
  const FullImageModal = () => {
    if (!showFullImageModal || !selectedFullImage) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" onClick={() => setShowFullImageModal(false)}>
        <div className="relative max-w-4xl max-h-screen p-4">
          <button
            onClick={() => setShowFullImageModal(false)}
            className="absolute top-2 right-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-full p-2"
          >
            <X className="h-6 w-6" />
          </button>
          <img 
            src={selectedFullImage.croppedImageUrl ? selectedFullImage.croppedImageUrl : outfitImageUrl}
            alt={selectedFullImage.name}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="text-center mt-4 text-white">
            <h3 className="text-lg font-semibold">{selectedFullImage.name}</h3>
            <p className="text-sm opacity-80">{selectedFullImage.category} • {selectedFullImage.color}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <OutfitNamingDialog />
      <DuplicateOutfitDialog />
      <SuccessDialog />
      <ItemDetailModal />
      <FullImageModal />
      <div className="bg-white p-6 rounded-lg shadow border">
        <h2 className="text-2xl font-bold mb-4 flex items-center">
          <Eye className="h-6 w-6 mr-2 text-purple-600" />
          Outfit Scanner
        </h2>
        <p className="text-gray-600 mb-6">
          Take a photo of a complete outfit to automatically identify individual clothing items.
        </p>

        {/* Image Upload Section */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-6">
          {outfitImageUrl ? (
            <div className="space-y-4">
              <div className="relative inline-block">
                <img 
                  src={outfitImageUrl}
                  alt="Outfit to analyze"
                  className="max-h-64 rounded-lg shadow-lg"
                />
                <button
                  onClick={clearOutfit}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              
              {isAnalyzing && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                  <p className="text-sm text-gray-600 mt-2">Analyzing outfit...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Camera className="h-16 w-16 text-gray-400 mx-auto" />
              <p className="text-gray-600 text-lg">Upload an outfit photo to get started</p>
              <p className="text-sm text-gray-500">
                Best results: outfit laid flat on bed, good lighting, minimal background
              </p>
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 flex items-center space-x-2 mx-auto"
              >
                <Upload className="h-5 w-5" />
                <span>Upload Outfit Photo</span>
              </button>
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

        {/* Analysis Loading */}
        {isAnalyzing && (
          <div className="text-center py-8">
            <Loader className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
            <p className="text-gray-600">Analyzing outfit with AI...</p>
            <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
          </div>
        )}

        {/* Analysis Results */}
        {analysisResults && !isAnalyzing && (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-800 mb-2">Analysis Complete!</h3>
              <p className="text-green-700">
                Found {detectedItems.length} clothing items in this outfit.
              </p>
            </div>

            {/* Confirmation Screen - Show Save/Cancel buttons */}
            {showConfirmationScreen && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2">Review Detected Items</h3>
                <p className="text-blue-700 mb-4">
                  Please review and edit the detected items below. You can change colors, names, or remove items before saving.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Outfit Name</label>
                    <input
                      type="text"
                      value={suggestedOutfitName}
                      onChange={(e) => setSuggestedOutfitName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      placeholder="Enter outfit name"
                    />
                  </div>
                  <div className="flex gap-2 sm:items-end">
                    <button
                      onClick={confirmAndSaveOutfit}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Save Outfit</span>
                    </button>
                    <button
                      onClick={cancelOutfitSave}
                      className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Detected Items Grid */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Detected Items</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {detectedItems.map((item, index) => (
                  <div 
                    key={index}
                    className={`border rounded-lg p-4 transition-all ${
                      selectedItems.has(index) 
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={{ pointerEvents: 'auto', position: 'relative', zIndex: 1 }}
                  >
                    {/* Item Detection Preview */}
                    <div className="mb-3">
                      <div 
                        className="w-full h-24 bg-gray-100 rounded border relative overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => showFullCroppedImage(item)}
                        title="Click to view full size"
                      >
                        {item.croppedImageUrl ? (
                          <img 
                            src={item.croppedImageUrl}
                            alt={`Cropped ${item.name}`}
                            className="w-full h-full object-contain"
                            style={{ transform: 'none' }}
                            onError={(e) => {
                              // Fallback to original image positioning if crop fails
                              e.target.src = outfitImageUrl;
                              e.target.style.objectPosition = item.boundingBox 
                                ? `${item.boundingBox.left || 50}% ${item.boundingBox.top || 50}%`
                                : 'center';
                            }}
                          />
                        ) : item.boundingBox ? (
                          <img 
                            src={outfitImageUrl}
                            alt="Item detection area"
                            className="w-full h-full object-contain"
                            style={{
                              transform: 'none',
                              objectPosition: `${item.boundingBox.left || 50}% ${item.boundingBox.top || 50}%`
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <Camera className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Item Details */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{item.name}</span>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(index)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleItemSelection(index);
                            }}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openItemDetail(item, index);
                            }}
                            className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-600">{item.category}</p>
                      
                      <div className="bg-blue-200 p-2 text-center">
                        Color: {item.color || 'Unknown'}
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          item.status === 'existing' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {item.status === 'existing' ? 'In Wardrobe' : 'New Item'}
                        </span>
                        
                        {item.inferred && (
                          <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                            Inferred
                          </span>
                        )}
                        
                        {item.confidence && (
                          <span className="text-xs text-gray-500">
                            {Math.round(item.confidence * 100)}% confidence
                          </span>
                        )}
                      </div>

                      {/* Existing Item Match */}
                      {item.status === 'existing' && item.matchedItem && (
                        <p className="text-xs text-blue-600">
                          Matches: {item.matchedItem.name}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default OutfitScanner;
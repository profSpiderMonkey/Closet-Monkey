import React, { useRef, useState, useEffect, useCallback } from 'react';
import './CameraCapture.css'; // Assuming you have corresponding styles

/**
 * CameraCapture Component for ClosetMonkey AI Wardrobe Management System
 * Handles both single item capture and outfit scanning functionality
 * 
 * @param {Object} props
 * @param {string} props.mode - 'single' for individual items, 'outfit' for complete outfit scanning
 * @param {Function} props.onCapture - Callback function that receives the captured image data
 * @param {Function} props.onCancel - Callback function when capture is cancelled
 * @param {boolean} props.showPreview - Whether to show preview after capture
 * @param {Object} props.aspectRatio - Aspect ratio for capture { width: number, height: number }
 */
const CameraCapture = ({ 
  mode = 'single', 
  onCapture, 
  onCancel,
  showPreview = true,
  aspectRatio = { width: 4, height: 3 }
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [cameraPermission, setCameraPermission] = useState('prompt');
  
  // Guidelines for different capture modes
  const captureGuidelines = {
    single: {
      title: 'Capture Clothing Item',
      instructions: [
        'Place item on a flat, contrasting surface',
        'Ensure good lighting',
        'Center the item in frame',
        'Avoid shadows and wrinkles'
      ]
    },
    outfit: {
      title: 'Capture Complete Outfit',
      instructions: [
        'Lay outfit flat or on mannequin',
        'Include all items in frame',
        'Ensure items don\'t overlap',
        'Good lighting on all pieces'
      ]
    }
  };

  // Initialize camera
  const initializeCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Check for camera support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser');
      }

      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: 'environment',
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined
        } 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setIsStreaming(true);
          setCameraPermission('granted');
        };
      }

      // Get available cameras
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = deviceList.filter(device => device.kind === 'videoinput');
      setDevices(videoDevices);
      
      if (!selectedDeviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
      
    } catch (err) {
      console.error('Camera initialization error:', err);
      setError(err.message);
      
      if (err.name === 'NotAllowedError') {
        setCameraPermission('denied');
        setError('Camera permission denied. Please allow camera access to continue.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found. Please connect a camera and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedDeviceId]);

  // Cleanup stream
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const imageData = {
          blob: blob,
          dataUrl: canvas.toDataURL('image/jpeg', 0.9),
          timestamp: new Date().toISOString(),
          mode: mode,
          dimensions: {
            width: canvas.width,
            height: canvas.height
          }
        };

        if (showPreview) {
          setCapturedImage(imageData);
        } else {
          onCapture && onCapture(imageData);
        }
      }
    }, 'image/jpeg', 0.9);

    // Stop stream if showing preview
    if (showPreview) {
      stopStream();
    }
  }, [mode, showPreview, onCapture, stopStream]);

  // Retake photo
  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    initializeCamera();
  }, [initializeCamera]);

  // Confirm captured photo
  const confirmPhoto = useCallback(() => {
    if (capturedImage && onCapture) {
      onCapture(capturedImage);
    }
  }, [capturedImage, onCapture]);

  // Cancel capture
  const cancelCapture = useCallback(() => {
    stopStream();
    setCapturedImage(null);
    onCancel && onCancel();
  }, [stopStream, onCancel]);

  // Switch camera
  const switchCamera = useCallback((deviceId) => {
    stopStream();
    setSelectedDeviceId(deviceId);
  }, [stopStream]);

  // Handle component mount/unmount
  useEffect(() => {
    initializeCamera();
    
    return () => {
      stopStream();
    };
  }, [selectedDeviceId]); // Re-run when device changes

  // Render error state
  if (error) {
    return (
      <div className="camera-capture error-state">
        <div className="error-message">
          <h3>Camera Error</h3>
          <p>{error}</p>
          {cameraPermission === 'denied' && (
            <div className="permission-instructions">
              <p>To enable camera access:</p>
              <ol>
                <li>Click the camera icon in your browser's address bar</li>
                <li>Select "Allow" for camera permissions</li>
                <li>Refresh this page</li>
              </ol>
            </div>
          )}
          <button onClick={cancelCapture} className="btn btn-secondary">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Render loading state
  if (isLoading) {
    return (
      <div className="camera-capture loading-state">
        <div className="loading-spinner"></div>
        <p>Initializing camera...</p>
      </div>
    );
  }

  // Render preview state
  if (capturedImage && showPreview) {
    return (
      <div className="camera-capture preview-state">
        <div className="capture-header">
          <h2>Review Captured Image</h2>
        </div>
        
        <div className="preview-container">
          <img 
            src={capturedImage.dataUrl} 
            alt="Captured" 
            className="preview-image"
          />
        </div>
        
        <div className="preview-actions">
          <button onClick={retakePhoto} className="btn btn-secondary">
            Retake Photo
          </button>
          <button onClick={confirmPhoto} className="btn btn-primary">
            Use This Photo
          </button>
        </div>
      </div>
    );
  }

  // Render capture state
  return (
    <div className="camera-capture capture-state">
      <div className="capture-header">
        <h2>{captureGuidelines[mode].title}</h2>
        {devices.length > 1 && (
          <select 
            value={selectedDeviceId} 
            onChange={(e) => switchCamera(e.target.value)}
            className="camera-selector"
          >
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="capture-container">
        <div className="video-wrapper">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline
            muted
            className="camera-video"
            style={{ 
              maxWidth: '100%',
              aspectRatio: `${aspectRatio.width}/${aspectRatio.height}`
            }}
          />
          
          {/* Capture guidelines overlay */}
          <div className="capture-overlay">
            <div className="guidelines">
              {captureGuidelines[mode].instructions.map((instruction, index) => (
                <div key={index} className="guideline-item">
                  <span className="guideline-icon">✓</span>
                  <span>{instruction}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <canvas 
          ref={canvasRef} 
          style={{ display: 'none' }}
        />
      </div>

      <div className="capture-actions">
        <button onClick={cancelCapture} className="btn btn-secondary">
          Cancel
        </button>
        <button 
          onClick={capturePhoto} 
          className="btn btn-primary capture-btn"
          disabled={!isStreaming}
        >
          <span className="camera-icon">📸</span>
          Capture Photo
        </button>
      </div>
    </div>
  );
};

// Helper function to check camera availability
export const checkCameraAvailability = async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { available: false, error: 'Camera API not supported' };
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCamera = devices.some(device => device.kind === 'videoinput');
    
    if (!hasCamera) {
      return { available: false, error: 'No camera devices found' };
    }

    // Try to get camera access
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(track => track.stop());
    
    return { available: true, error: null };
  } catch (error) {
    return { 
      available: false, 
      error: error.name === 'NotAllowedError' 
        ? 'Camera permission denied' 
        : error.message 
    };
  }
};

// Helper function to process image for Google Vision API
export const processImageForVision = async (imageData) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onloadend = () => {
      // Remove data URL prefix to get base64 string
      const base64String = reader.result.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      resolve(base64String);
    };
    
    reader.onerror = reject;
    reader.readAsDataURL(imageData.blob);
  });
};

export default CameraCapture;
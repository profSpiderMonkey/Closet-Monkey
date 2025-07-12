// frontend/src/components/SplashScreen.js
import React from 'react';

const SplashScreen = ({ onComplete, isIdle = false }) => {
  // Auto-hide splash screen after 3 seconds (only for initial load, not idle)
  React.useEffect(() => {
    if (!isIdle && onComplete) {
      const timer = setTimeout(() => {
        onComplete();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [onComplete, isIdle]);

  const handleClick = () => {
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-100 flex items-center justify-center z-50 cursor-pointer"
      onClick={handleClick}
    >
      <div className="text-center space-y-8 animate-pulse">
        {/* Main Logo */}
        <div className="flex justify-center">
          <img 
            src="/images/closet-monkey-logo.png" 
            alt="Closet Monkey Logo" 
            className="w-64 h-64 object-contain animate-pulse"
            onError={(e) => {
              // Fallback to text if image fails to load
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'block';
            }}
          />
          <div 
            className="w-64 h-64 bg-gradient-to-br from-purple-600 to-blue-600 rounded-3xl flex items-center justify-center animate-pulse" 
            style={{display: 'none'}}
          >
            <span className="text-white text-6xl font-bold">🐒</span>
          </div>
        </div>

        {/* App Title */}
        <div className="space-y-4">
          <h1 className="text-6xl font-bold text-gray-800 tracking-wide">
            Closet Monkey
          </h1>
          <p className="text-xl text-gray-600 font-medium">
            Your AI-Powered Wardrobe Assistant
          </p>
        </div>

        {/* Loading or Idle State */}
        {isIdle ? (
          <div className="space-y-4">
            <p className="text-lg text-gray-500">
              App is idle
            </p>
            <p className="text-sm text-gray-400">
              Click anywhere to wake up
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
            <p className="text-lg text-gray-500">
              Loading your wardrobe...
            </p>
            <p className="text-sm text-gray-400">
              Click to skip
            </p>
          </div>
        )}
      </div>

    </div>
  );
};

export default SplashScreen;
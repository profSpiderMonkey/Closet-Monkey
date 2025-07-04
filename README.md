# Closet Monkey AI - Smart Wardrobe Management System

> The AI-powered wardrobe assistant that brings Cher's closet from Clueless to life.

## 🚀 Project Overview

Closet Monkey combines RFID tracking, AI-powered outfit suggestions, and dry cleaner integration to create the ultimate wardrobe management experience.

### Key Features
- **Automated Wardrobe Cataloging** via dry cleaner partnerships
- **RFID-Based Wear Tracking** with Raspberry Pi hardware
- **AI Outfit Suggestions** considering weather and calendar
- **Social Marketplace** for styling services and item trading
- **Missing Item Alerts** when items don't return home

## 📋 Development Phases

### Phase 1 (MVP) - Core Local Features ✅
- [x] Basic wardrobe cataloging
- [x] RFID wear tracking
- [x] Local Pi interface
- [ ] SQLite database integration
- [ ] Hardware deployment

### Phase 2 - AI Enhancement
- [ ] Google Vision API integration
- [ ] Smart outfit suggestions
- [ ] Laundry management

### Phase 3 - Connected Intelligence
- [ ] Weather API integration
- [ ] Calendar integration
- [ ] Missing item alerts
- [ ] Cloud backend

### Phase 4 - Social & Commerce
- [ ] Mobile app
- [ ] Social features
- [ ] Styling marketplace
- [ ] Item marketplace

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Raspberry Pi   │    │   Cloud Backend │    │   Mobile App    │
│  (Local Hub)    │◄──►│   (Node.js)     │◄──►│ (React Native)  │
│                 │    │                 │    │                 │
│ • RFID Reader   │    │ • User Auth     │    │ • Social Feed   │
│ • Local API     │    │ • Data Sync     │    │ • Marketplace   │
│ • Web Interface │    │ • AI Services   │    │ • Styling       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         └───────────────────────┼─────────────────────────────┐
                                 │                             │
                    ┌─────────────────┐              ┌─────────────────┐
                    │  Dry Cleaners   │              │  External APIs  │
                    │   (SMRT POS)    │              │                 │
                    │                 │              │ • Google Vision │
                    │ • Item Tagging  │              │ • Weather API   │
                    │ • Data Export   │              │ • Calendar API  │
                    └─────────────────┘              └─────────────────┘
```

## 🛠️ Tech Stack

### Frontend
- **Pi Interface**: React + Tailwind CSS
- **Mobile App**: React Native + Expo

### Backend
- **Pi Server**: Node.js + Express
- **Cloud API**: Node.js + Express
- **Database**: SQLite (Pi) + PostgreSQL (Cloud)

### Hardware
- **Platform**: Raspberry Pi 4
- **RFID**: 13.56MHz RFID Reader + Tags
- **Connectivity**: WiFi + Bluetooth

### AI/ML
- **Computer Vision**: Google Vision API
- **Recommendations**: Custom ML models
- **Image Processing**: TensorFlow.js

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+ (for hardware)
- Raspberry Pi 4 (for full system)

### Development Setup
```bash
# Clone the repository
git clone https://github.com/profspidermonkey/closet-monkey.git
cd closet-monkey

# Run the setup script
./setup.sh

# Install all dependencies
npm run install:all

# Start development servers
npm run dev
```

## 📁 Project Structure

```
closet-monkey/
├── frontend/              # React web app (Pi touchscreen interface)
├── backend/               # Node.js API server
├── mobile/                # React Native mobile app (Phase 4)
├── hardware/              # Raspberry Pi RFID integration
├── cloud/                 # Scalable cloud backend (Phase 3+)
├── docs/                  # Documentation
├── scripts/               # Deployment and utility scripts
└── docker/                # Containerization configs
```

## 🎯 Current Status

**Active Development**: Phase 1 MVP
- ✅ Core React interface completed
- 🟡 Backend API in development
- 🟡 RFID hardware integration in progress
- 🔴 Dry cleaner partnership pilot pending

## 📄 License

Proprietary - All rights reserved by SpiderMonkey MotorSports

---

**Built with ❤️ by the SpiderMonkey team**

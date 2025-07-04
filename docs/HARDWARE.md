# Closet Monkey Hardware Setup

## Required Components

### Raspberry Pi Setup
- **Device**: Raspberry Pi 4 Model B (4GB+ recommended)
- **OS**: Raspberry Pi OS Lite (64-bit)
- **Storage**: 32GB+ microSD card
- **Display**: 7" touchscreen (optional for local interface)

### RFID Components
- **Reader**: 13.56MHz RFID reader module
- **Tags**: Washable fabric RFID tags
- **Antenna**: External antenna for better range

## Installation Steps

### 1. Raspberry Pi Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python dependencies
sudo apt install python3-pip -y
pip3 install -r hardware/requirements.txt

# Enable SPI for RFID
sudo raspi-config
# Navigate to Interface Options > SPI > Enable
```

### 2. RFID Reader Connection
```
RFID Reader -> Raspberry Pi GPIO
VCC         -> 3.3V (Pin 1)
GND         -> Ground (Pin 6)
MISO        -> GPIO 9 (Pin 21)
MOSI        -> GPIO 10 (Pin 19)
SCK         -> GPIO 11 (Pin 23)
SDA         -> GPIO 8 (Pin 24)
```

### 3. Software Installation
```bash
# Clone repository
git clone https://github.com/profspidermonkey/closet-monkey.git
cd closet-monkey

# Install dependencies
npm run install:backend

# Setup as system service
sudo cp scripts/closet-monkey.service /etc/systemd/system/
sudo systemctl enable closet-monkey
sudo systemctl start closet-monkey
```

## Testing RFID

```bash
# Test RFID reader
cd hardware
python3 rfid_reader.py
```

## Troubleshooting

### RFID Not Reading
1. Check SPI is enabled: `lsmod | grep spi`
2. Verify GPIO connections
3. Check tag frequency (13.56MHz)

### API Connection Issues
1. Check backend is running: `sudo systemctl status closet-monkey`
2. Verify network connectivity
3. Check firewall settings

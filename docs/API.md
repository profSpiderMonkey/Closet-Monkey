# Closet Monkey API Documentation

## Base URL
```
http://localhost:3001/api
```

## Authentication
Currently using basic API without authentication. JWT will be added in Phase 3.

## Endpoints

### Wardrobe Items

#### GET /wardrobe
Get all wardrobe items
```json
{
  "items": [
    {
      "id": 1,
      "name": "Navy Suit Jacket",
      "category": "Jackets",
      "color": "Navy",
      "brand": "Hugo Boss",
      "rfid_tag": "RF001",
      "status": "clean",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

#### POST /wardrobe
Create new wardrobe item
```json
{
  "name": "Blue Shirt",
  "category": "Shirts",
  "color": "Blue",
  "brand": "Brooks Brothers",
  "rfid_tag": "RF002"
}
```

### RFID Events

#### POST /rfid/event
Record RFID event from hardware
```json
{
  "tags": ["RF001", "RF002"],
  "event_type": "departure",
  "timestamp": "2025-01-15T08:00:00Z",
  "location": "main_door"
}
```

### Health Check

#### GET /health
Check API status
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:00:00Z",
  "version": "0.1.0"
}
```

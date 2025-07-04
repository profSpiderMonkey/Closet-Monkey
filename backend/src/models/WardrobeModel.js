// backend/src/models/WardrobeModel.js
const Database = require('../database/Database');

class WardrobeModel {
  async getAll() {
    const query = `
      SELECT * FROM wardrobe_items 
      ORDER BY created_at DESC
    `;
    return Database.all(query);
  }

  async getById(id) {
    const query = `
      SELECT * FROM wardrobe_items 
      WHERE id = ?
    `;
    return Database.get(query, [id]);
  }

  async create(itemData) {
    const query = `
      INSERT INTO wardrobe_items (
        name, category, color, brand, material, size,
        rfid_tag, image, description, status, laundry_status,
        purchase_date, price, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      itemData.name,
      itemData.category,
      itemData.color || null,
      itemData.brand || null,
      itemData.material || null,
      itemData.size || null,
      itemData.rfidTag || null,
      itemData.image,
      itemData.description || null,
      itemData.status || 'in_closet',
      itemData.laundryStatus || 'clean',
      itemData.purchaseDate || null,
      itemData.price || null,
      itemData.createdAt
    ];
    
    const result = await Database.run(query, params);
    return result.lastID;
  }

  async update(id, itemData) {
    const fields = [];
    const params = [];
    
    // Convert camelCase to snake_case for database fields
    const fieldMapping = {
      'rfidTag': 'rfid_tag',
      'laundryStatus': 'laundry_status',
      'purchaseDate': 'purchase_date',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at'
    };
    
    Object.keys(itemData).forEach(key => {
      if (itemData[key] !== undefined) {
        const dbKey = fieldMapping[key] || key;
        fields.push(`${dbKey} = ?`);
        params.push(itemData[key]);
      }
    });
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    params.push(id);
    
    const query = `
      UPDATE wardrobe_items 
      SET ${fields.join(', ')}, updated_at = datetime('now')
      WHERE id = ?
    `;
    
    return Database.run(query, params);
  }

  async delete(id) {
    const query = `DELETE FROM wardrobe_items WHERE id = ?`;
    return Database.run(query, [id]);
  }

  async search(searchTerm) {
    const query = `
      SELECT * FROM wardrobe_items 
      WHERE name LIKE ? OR brand LIKE ? OR category LIKE ? OR color LIKE ?
      ORDER BY created_at DESC
    `;
    const searchPattern = `%${searchTerm}%`;
    return Database.all(query, [searchPattern, searchPattern, searchPattern, searchPattern]);
  }

  async getByCategory(category) {
    const query = `
      SELECT * FROM wardrobe_items 
      WHERE category = ?
      ORDER BY created_at DESC
    `;
    return Database.all(query, [category]);
  }

  async getByRFIDTag(rfidTag) {
    const query = `
      SELECT * FROM wardrobe_items 
      WHERE rfid_tag = ?
    `;
    return Database.get(query, [rfidTag]);
  }

  async updateStatus(id, status) {
    const query = `
      UPDATE wardrobe_items 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `;
    return Database.run(query, [status, id]);
  }
}

module.exports = new WardrobeModel();

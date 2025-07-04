// backend/src/controllers/wardrobeController.js
const WardrobeModel = require('../models/WardrobeModel');

class WardrobeController {
  async getAllItems(req, res) {
    try {
      const items = await WardrobeModel.getAll();
      res.json(items);
    } catch (error) {
      console.error('Error getting all items:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getItemById(req, res) {
    try {
      const item = await WardrobeModel.getById(req.params.id);
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      res.json(item);
    } catch (error) {
      console.error('Error getting item by ID:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async createItem(req, res) {
    try {
      const itemData = {
        ...req.body,
        image: req.file ? `/uploads/wardrobe/${req.file.filename}` : null,
        createdAt: new Date().toISOString()
      };
      
      console.log('Creating item:', itemData);
      
      const itemId = await WardrobeModel.create(itemData);
      const newItem = await WardrobeModel.getById(itemId);
      
      res.status(201).json(newItem);
    } catch (error) {
      console.error('Error creating item:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async updateItem(req, res) {
    try {
      const itemData = { ...req.body };
      if (req.file) {
        itemData.image = `/uploads/wardrobe/${req.file.filename}`;
      }
      
      await WardrobeModel.update(req.params.id, itemData);
      const updatedItem = await WardrobeModel.getById(req.params.id);
      
      if (!updatedItem) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      res.json(updatedItem);
    } catch (error) {
      console.error('Error updating item:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async deleteItem(req, res) {
    try {
      const result = await WardrobeModel.delete(req.params.id);
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Item not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting item:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async searchItems(req, res) {
    try {
      const items = await WardrobeModel.search(req.params.query);
      res.json(items);
    } catch (error) {
      console.error('Error searching items:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getItemsByCategory(req, res) {
    try {
      const items = await WardrobeModel.getByCategory(req.params.category);
      res.json(items);
    } catch (error) {
      console.error('Error getting items by category:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new WardrobeController();

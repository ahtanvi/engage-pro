const express = require('express');
const { dbHelpers } = require('../database');

const router = express.Router();

// GET /api/templates - List custom templates
router.get('/', async (req, res) => {
  try {
    const templates = await dbHelpers.getCustomTemplates();
    
    // Parse variables JSON
    const parsedTemplates = templates.map(t => ({
      id: t.id,
      name: t.name,
      template: t.template,
      variables: JSON.parse(t.variables || '[]'),
      is_active: t.is_active === 1,
      created_at: t.created_at
    }));
    
    res.json({ templates: parsedTemplates });
  } catch (err) {
    console.error('Get templates error:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/templates - Create new template
router.post('/', async (req, res) => {
  try {
    const { name, template, variables } = req.body;
    
    if (!name || !template) {
      return res.status(400).json({ error: 'name and template are required' });
    }
    
    // Validate template has at least one variable or is meaningful
    if (template.length < 10) {
      return res.status(400).json({ error: 'Template must be at least 10 characters' });
    }
    
    const result = await dbHelpers.saveCustomTemplate({
      name,
      template,
      variables: variables || []
    });
    
    res.json({
      success: true,
      id: result.id,
      name,
      message: 'Template created successfully'
    });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// POST /api/templates/:id/use - Use template (mark as used, get processed version)
router.post('/:id/use', async (req, res) => {
  try {
    const { id } = req.params;
    const { variables } = req.body; // { username: 'elonmusk', topic: 'AI' }
    
    const { db } = require('../database');
    
    db.get(
      "SELECT * FROM custom_templates WHERE id = ? AND is_active = 1",
      [id],
      (err, row) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        
        if (!row) {
          return res.status(404).json({ error: 'Template not found or inactive' });
        }
        
        let processed = row.template;
        
        // Replace variables
        if (variables) {
          Object.keys(variables).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            processed = processed.replace(regex, variables[key]);
          });
        }
        
        // Check for unreplaced variables
        const unreplaced = processed.match(/{{\w+}}/g);
        
        res.json({
          template: row.template,
          processed,
          unreplaced: unreplaced || [],
          name: row.name
        });
      }
    );
  } catch (err) {
    console.error('Use template error:', err);
    res.status(500).json({ error: 'Failed to process template' });
  }
});

// DELETE /api/templates/:id - Deactivate template
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { db } = require('../database');
    
    db.run(
      "UPDATE custom_templates SET is_active = 0 WHERE id = ?",
      [id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete template' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }
        
        res.json({ success: true, message: 'Template deleted' });
      }
    );
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
const fs = require('fs');
const path = require('path');

// Configuration
const SESSIONS_DIR = path.join(process.cwd(), 'public', 'parsed_sessions');
const ITEMS_DIR = path.join(process.cwd(), 'coregamedata', 'items');
const SPELLS_DIR = path.join(process.cwd(), 'coregamedata', 'spells');

// Load all item data into memory for fast lookup
const loadAllItemData = () => {
  const itemData = {};
  
  // Load items
  if (fs.existsSync(ITEMS_DIR)) {
    const categories = fs.readdirSync(ITEMS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const category of categories) {
      const categoryDir = path.join(ITEMS_DIR, category);
      const files = fs.readdirSync(categoryDir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const itemPath = path.join(categoryDir, file);
        const item = JSON.parse(fs.readFileSync(itemPath, 'utf8'));
        
        itemData[item.name] = {
          id: item.id,
          name: item.name,
          attributeBlocks: item.attributeBlocks || {},
          parts: item.parts || []
        };
      }
    }
  }

  // Load spells
  if (fs.existsSync(SPELLS_DIR)) {
    const spellLevels = fs.readdirSync(SPELLS_DIR);
    
    for (const level of spellLevels) {
      const levelDir = path.join(SPELLS_DIR, level);
      if (!fs.existsSync(levelDir) || !fs.statSync(levelDir).isDirectory()) continue;
      
      const files = fs.readdirSync(levelDir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const spellPath = path.join(levelDir, file);
        const spell = JSON.parse(fs.readFileSync(spellPath, 'utf8'));
        
        itemData[spell.name] = {
          id: spell.id,
          name: spell.name,
          attributeBlocks: spell.attributeBlocks || {},
          parts: spell.parts || []
        };
      }
    }
  }

  return itemData;
};

// Process a single session
const processSession = (sessionId, allItemData) => {
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  const inventoriesPath = path.join(sessionDir, 'character_inventories.json');
  
  if (!fs.existsSync(inventoriesPath)) {
    console.log(`  ⚠️  No character inventories found for ${sessionId}`);
    return { sessionId, status: 'no_inventories' };
  }

  try {
    // Load character inventories
    const inventoriesData = fs.readFileSync(inventoriesPath, 'utf8');
    const inventories = JSON.parse(inventoriesData);

    // Collect all unique item names from all characters
    const allItems = new Set();
    Object.values(inventories).forEach((charData) => {
      if (charData?.items) {
        const itemArrays = [
          charData.items.weapons,
          charData.items.armor,
          charData.items.treasures,
          charData.items.great_treasures,
          charData.items.spells,
          charData.items.natives,
          charData.items.other,
          charData.items.unknown
        ];
        
        itemArrays.flat().filter(Boolean).forEach((item) => {
          if (item?.name) {
            allItems.add(item.name);
          }
        });
      }
    });

    // Find matching items
    const sessionItems = {};
    const missingItems = [];
    
    for (const itemName of allItems) {
      if (allItemData[itemName]) {
        sessionItems[itemName] = allItemData[itemName];
      } else {
        missingItems.push(itemName);
      }
    }

    // Save the pre-computed item data
    const itemDataPath = path.join(sessionDir, 'precomputed_items.json');
    fs.writeFileSync(itemDataPath, JSON.stringify(sessionItems, null, 2));

    return {
      sessionId,
      status: 'success',
      itemsFound: Object.keys(sessionItems).length,
      totalItems: allItems.size,
      missingItems: missingItems.length
    };

  } catch (error) {
    console.error(`  ❌ Error processing ${sessionId}:`, error.message);
    return { sessionId, status: 'error', error: error.message };
  }
};

// Main execution
const main = async () => {
  console.log('🚀 Starting pre-computation of items for all sessions...');
  
  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error('❌ Sessions directory not found:', SESSIONS_DIR);
    process.exit(1);
  }

  // Load all item data into memory
  console.log('📦 Loading all item data into memory...');
  const allItemData = loadAllItemData();
  console.log(`   Loaded ${Object.keys(allItemData).length} items and spells`);

  // Get all session directories
  const sessionDirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => !name.startsWith('.'));

  console.log(`📁 Found ${sessionDirs.length} sessions to process`);

  // Process each session
  const results = [];
  for (let i = 0; i < sessionDirs.length; i++) {
    const sessionId = sessionDirs[i];
    console.log(`\n[${i + 1}/${sessionDirs.length}] Processing ${sessionId}...`);
    
    const result = processSession(sessionId, allItemData);
    results.push(result);
    
    if (result.status === 'success') {
      console.log(`   ✅ ${result.itemsFound}/${result.totalItems} items found`);
      if (result.missingItems > 0) {
        console.log(`   ⚠️  ${result.missingItems} items not found`);
      }
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'error');
  const noInventories = results.filter(r => r.status === 'no_inventories');
  
  console.log(`   ✅ Successful: ${successful.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);
  console.log(`   ⚠️  No inventories: ${noInventories.length}`);
  
  if (successful.length > 0) {
    const totalItems = successful.reduce((sum, r) => sum + r.itemsFound, 0);
    const totalRequested = successful.reduce((sum, r) => sum + r.totalItems, 0);
    console.log(`   📦 Total items cached: ${totalItems}/${totalRequested} (${Math.round(totalItems/totalRequested*100)}%)`);
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed sessions:');
    failed.forEach(r => console.log(`   - ${r.sessionId}: ${r.error}`));
  }

  console.log('\n🎉 Pre-computation complete!');
};

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { processSession, loadAllItemData }; 
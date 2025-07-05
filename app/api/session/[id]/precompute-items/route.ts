import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface Item {
  id: string;
  name: string;
  attributeBlocks: Record<string, any>;
  parts: any[];
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    
    // Try both local and Docker paths
    const possiblePaths = [
      path.join(process.cwd(), 'public', 'parsed_sessions'),
      '/app/public/parsed_sessions'
    ];
    const sessionsDir = possiblePaths.find(p => fs.existsSync(p));
    
    if (!sessionsDir) {
      return NextResponse.json(
        { error: 'Sessions directory not found' },
        { status: 404 }
      );
    }
    
    const sessionDir = path.join(sessionsDir, sessionId);
    const inventoriesPath = path.join(sessionDir, 'character_inventories.json');
    
    if (!fs.existsSync(inventoriesPath)) {
      return NextResponse.json(
        { error: 'Character inventories not found' },
        { status: 404 }
      );
    }

    // Load character inventories
    const inventoriesData = fs.readFileSync(inventoriesPath, 'utf8');
    const inventories = JSON.parse(inventoriesData);

    // Collect all unique item names from all characters
    const allItems = new Set<string>();
    Object.values(inventories).forEach((charData: any) => {
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
        
        itemArrays.flat().filter(Boolean).forEach((item: any) => {
          if (item?.name) {
            allItems.add(item.name);
          }
        });
      }
    });

    // Load all item data
    const itemsDir = path.join(process.cwd(), 'coregamedata', 'items');
    const spellsDir = path.join(process.cwd(), 'coregamedata', 'spells');
    const itemData: Record<string, Item> = {};

    // Helper function to search for items in a directory
    const searchForItems = (searchDir: string, itemNames: Set<string>) => {
      if (!fs.existsSync(searchDir)) return;

      const categories = fs.readdirSync(searchDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const category of categories) {
        const categoryDir = path.join(searchDir, category);
        const files = fs.readdirSync(categoryDir);
        
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          
          const itemPath = path.join(categoryDir, file);
          const itemData = JSON.parse(fs.readFileSync(itemPath, 'utf8'));
          
          if (itemNames.has(itemData.name)) {
            itemData[itemData.name] = {
              id: itemData.id,
              name: itemData.name,
              attributeBlocks: itemData.attributeBlocks || {},
              parts: itemData.parts || []
            };
          }
        }
      }
    };

    // Search in items directory
    searchForItems(itemsDir, allItems);

    // Search in spells directory
    if (fs.existsSync(spellsDir)) {
      const spellLevels = fs.readdirSync(spellsDir);
      
      for (const level of spellLevels) {
        const levelDir = path.join(spellsDir, level);
        if (!fs.existsSync(levelDir) || !fs.statSync(levelDir).isDirectory()) continue;
        
        const files = fs.readdirSync(levelDir);
        
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          
          const spellPath = path.join(levelDir, file);
          const spellData = JSON.parse(fs.readFileSync(spellPath, 'utf8'));
          
          if (allItems.has(spellData.name)) {
            itemData[spellData.name] = {
              id: spellData.id,
              name: spellData.name,
              attributeBlocks: spellData.attributeBlocks || {},
              parts: spellData.parts || []
            };
          }
        }
      }
    }

    // Save the pre-computed item data to the session folder
    const itemDataPath = path.join(sessionDir, 'precomputed_items.json');
    fs.writeFileSync(itemDataPath, JSON.stringify(itemData, null, 2));

    return NextResponse.json({
      success: true,
      itemsFound: Object.keys(itemData).length,
      totalItems: allItems.size,
      missingItems: Array.from(allItems).filter(name => !itemData[name])
    });

  } catch (error) {
    console.error('Error pre-computing items:', error);
    return NextResponse.json(
      { error: 'Failed to pre-compute items' },
      { status: 500 }
    );
  }
} 
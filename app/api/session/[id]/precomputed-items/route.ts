import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
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
    
    const itemDataPath = path.join(sessionsDir, sessionId, 'precomputed_items.json');
    
    if (!fs.existsSync(itemDataPath)) {
      return NextResponse.json(
        { error: 'Pre-computed items not found. Run precompute-items first.' },
        { status: 404 }
      );
    }

    const itemData = fs.readFileSync(itemDataPath, 'utf8');
    const items = JSON.parse(itemData);
    
    return NextResponse.json(items);

  } catch (error) {
    console.error('Error loading pre-computed items:', error);
    return NextResponse.json(
      { error: 'Failed to load pre-computed items' },
      { status: 500 }
    );
  }
} 
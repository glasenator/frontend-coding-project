import { NextRequest, NextResponse } from 'next/server';
import { Ollama } from 'ollama';
import fs from 'fs';
import path from 'path';

const ollama = new Ollama({
  host: 'https://ollama.com',
  headers: {
    Authorization: 'Bearer ' + process.env.OLLAMA_API_KEY,
  },
});

// Simple JSON file storage for conversations
const DB_PATH = path.join(process.cwd(), 'conversation.json');

async function loadDB() {
  try {
    const text = await fs.promises.readFile(DB_PATH, 'utf-8');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function saveDB(data: Record<string, unknown>) {
  await fs.promises.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}


// POST to Ollama API
export async function POST(request: NextRequest) {
  const { message, sessionId } = await request.json();

  if (!message || !sessionId) {
    return NextResponse.json({ error: 'Message and sessionId are required' }, { status: 400 });
  }

  try {
    // Load existing conversation
    const db = await loadDB();
    db[sessionId] = db[sessionId] || [];

    // Add user message
    db[sessionId].push({ role: 'user', content: message });
    await saveDB(db);

    const response = await ollama.chat({
      model: 'gpt-oss:120b',
      // model: 'ALIENTELLIGENCE/travelplanningbooking', (doesn't work sadly)
      messages: db[sessionId],
      stream: true,
    });

    // Collect full response while streaming
    let assistantContent = '';

    //Create chunks from stream response and immediatley send to render on UI
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          const text = chunk.message?.content || '';
          if (text) {
            assistantContent += text;
            controller.enqueue(new TextEncoder().encode(text));
          }
        }
        controller.close();

        // Save assistant message after streaming complete
        const updatedDb = await loadDB();
        updatedDb[sessionId].push({ role: 'assistant', content: assistantContent });
        await saveDB(updatedDb);
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    console.error('Ollama error:', error);
    return NextResponse.json({ error: 'Failed to get response from Ollama' }, { status: 500 });
  }
}

// DELETE to local dummy JSON db
export async function DELETE(request: NextRequest) {
  const { sessionId } = await request.json();
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }
  const db = await loadDB();
  delete db[sessionId];
  await saveDB(db);
  return NextResponse.json({ success: true });
}
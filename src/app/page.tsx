'use client';

import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import styles from './page.module.css';
import React from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
};

export default function Home() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Initialize with a random session id or load any existing session
  React.useEffect(() => {
    let id = localStorage.getItem('session_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('session_id', id);
    }
    setSessionId(id);

    // Using localStorage to get around creating database for brevity
    const stored = localStorage.getItem('chat_history');
    if (stored) {
      try {
        setMessages(JSON.parse(stored));
      } catch (error) {
        console.error('Error:', error);
      }
    }
  }, []);

  // Save chat history whenever messages changes
  React.useEffect(() => {
    try {
      localStorage.setItem('chat_history', JSON.stringify(messages));
    } catch (error) {
        console.error('Error:', error);
      }
  }, [messages]);

  const handleSubmit = async () => {

    // Get rid of blank edge chars
    const text = inputValue.trim();

    // Prevent submitting when not needed
    if (!text || isLoading || !sessionId) return;

    const userMessage: Message = { role: 'user', content: text };
    const loadingMessage: Message = { role: 'assistant', content: '...' };
    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      if (!sessionId) throw new Error('No session');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch');
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      // Set up decoder for reading chunk stream
      const decoder = new TextDecoder();
      let fullContent = '';
      const read = async () => {
        const { done, value } = await reader.read();
        if (done) {
          setIsLoading(false);
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        // Combine all messages for conversation history
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: 'assistant', content: fullContent };
          return newMessages;
        });
        read();
      };
      read();
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = { role: 'assistant', content: 'Error: Failed to get response', isError: true };
        return newMessages;
      });
      setIsLoading(false);
    }
  };

  // Allow for "enter" submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Clear the JSON file and chat history (currently only 1 chat log)
  const clearConversation = async () => {
    if (!sessionId) return;
    await fetch('/api/chat', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    setMessages([]);
    // optionally reset session id
    const newId = crypto.randomUUID();
    localStorage.setItem('session_id', newId);
    setSessionId(newId);
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.chatContainer}>
          {messages.length === 0 ? (
            <div className={styles.title}>FAKEGPT</div>
          ) : (
            <>
              <button className={styles.clearButton} onClick={clearConversation} disabled={isLoading}>
                Clear conversation
              </button>
              <div className={styles.messages}>
                {messages.map((msg, idx) => {
                  const bubbleClass = msg.role === 'user' ? styles.userMessage : msg.isError ? styles.errorMessage : styles.assistantMessage;
                  return (
                    <div key={idx} className={bubbleClass}>
                      {msg.role === 'user' ? (
                        msg.content
                      ) : msg.content === '...' ? (
                        <span className={styles.fade}>...</span>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className={styles.inputContainer}>
            <textarea
              ref={textareaRef}
              id="chatbox"
              className={styles.textarea}
              placeholder="Ask me anything..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button 
              className={styles.button}
              onClick={handleSubmit}
              disabled={isLoading || !inputValue.trim()}>
              →
            </button>
          </div>
      </main>
    </div>
  );
}

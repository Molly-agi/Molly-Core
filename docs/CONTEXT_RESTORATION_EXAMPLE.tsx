/**
 * @fileOverview Example: Using Context Restoration in a React Component
 * 
 * This example demonstrates how to integrate the context restoration feature
 * into a React component for Molly's conversational chat interface.
 */

'use client';

import { useState, useEffect } from 'react';
import { getConversationalChat } from '@/app/actions/ai-flows';
import { useUser } from '@/firebase/auth/use-user';

export function ChatWithContextRestoration() {
  const [messages, setMessages] = useState<
    { role: 'user' | 'bot'; content: string }[]
  >([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useUser();
  
  // Generate or retrieve a conversation ID for this session
  // In a real app, you might want to store this in localStorage or get it from a URL
  const [conversationId] = useState(() => {
    const existingId = localStorage.getItem('molly-conversation-id');
    if (existingId) return existingId;
    
    const newId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('molly-conversation-id', newId);
    return newId;
  });

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    // Add user message to UI
    const userMessage = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMessage]);
    
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      // Call with context restoration if user is logged in
      const result = await getConversationalChat(
        currentInput,
        [],  // Empty history - will be loaded from Firestore if userId provided
        user?.uid,  // User ID from Firebase auth
        conversationId  // Conversation ID for this session
      );
      
      // Add bot response to UI
      setMessages(prev => [
        ...prev,
        { role: 'bot' as const, content: result.response }
      ]);
      
      // Handle any errors from the API
      if (result.error) {
        console.error('Chat error:', result.error);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [
        ...prev,
        { 
          role: 'bot' as const, 
          content: 'Sorry, I encountered an error. Please try again.' 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Chat with Molly</h2>
        {user ? (
          <p className="text-sm text-muted-foreground">
            Context restoration enabled • Conversation: {conversationId.slice(0, 12)}...
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sign in to enable context restoration
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-2">
              <span className="animate-pulse">Molly is thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask Molly anything..."
            className="flex-1 px-4 py-2 border rounded-lg"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ALTERNATIVE: Component without automatic context restoration
 * (for when you want to manually manage history in the UI state)
 */
export function ChatWithManualHistory() {
  const [messages, setMessages] = useState<
    { role: 'user' | 'bot'; content: string }[]
  >([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = { role: 'user' as const, content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      // Pass the full history manually (no userId/conversationId)
      const result = await getConversationalChat(
        currentInput,
        messages  // Pass the UI state as history
      );
      
      setMessages([
        ...newMessages,
        { role: 'bot' as const, content: result.response }
      ]);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages([
        ...newMessages,
        { 
          role: 'bot' as const, 
          content: 'Sorry, I encountered an error. Please try again.' 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Same UI as above, just different data flow */}
    </div>
  );
}

/**
 * KEY DIFFERENCES:
 * 
 * 1. ChatWithContextRestoration:
 *    - Passes user?.uid and conversationId to getConversationalChat
 *    - History is managed in Firestore automatically
 *    - Context persists across page refreshes and sessions
 *    - Respects 4000 token limit automatically
 * 
 * 2. ChatWithManualHistory:
 *    - Passes messages array as history
 *    - History is only in component state (lost on refresh)
 *    - Full control over what history is sent
 *    - No automatic token limit management
 * 
 * RECOMMENDATION: Use ChatWithContextRestoration for production.
 */

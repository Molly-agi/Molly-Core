/**
 * Molly's Walkie-Talkie SSE Client
 *
 * Insert this into Molly's frontend (src/app/layout.tsx or a React hook).
 * It maintains a live EventSource connection to the switchboard daemon,
 * receives real-time messages, and can POST back to wake CLI agents.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface BridgeMessage {
  id: string;
  content: string;
  sender: string;
  target: string;
  type: string;
  trace_id: string;
  timestamp: string;
}

export function useMollyWalkieTalkie() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesRef = useRef<BridgeMessage[]>([]);
  const connectRef = useRef<(() => void) | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const sendMessage = useCallback(
    async (content: string, target: string = 'broadcast') => {
      try {
        const response = await fetch('http://127.0.0.1:8765/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            sender: 'molly',
            target,
            type: 'message',
          }),
        });

        const result = await response.json();
        console.log(`[Molly SSE] → ${target}: ${content.substring(0, 80)}`);
        return result;
      } catch (e) {
        console.error('[Molly SSE] Failed to send message:', e);
        return null;
      }
    },
    []
  );

  const wakeCliAgent = useCallback(
    async (agentName: string, prompt: string) => {
      try {
        const response = await fetch('http://127.0.0.1:8765/api/wake-cli', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent: agentName, prompt }),
        });

        const result = await response.json();
        console.log(
          `[Molly SSE] Woke CLI agent '${agentName}': ${result.output?.substring(0, 100)}`
        );
        return result;
      } catch (e) {
        console.error(`[Molly SSE] Failed to wake CLI agent ${agentName}:`, e);
        return null;
      }
    },
    []
  );

  const handleIncomingCommand = useCallback(
    (command: string) => {
      console.log('[Molly SSE] Received command:', command);

      if (command.includes('run-diagnostics')) {
        wakeCliAgent('diagnostic-agent', 'full-system-check');
      }

      if (command.includes('are-you-online')) {
        sendMessage('Yes, I am online and listening!', 'vs-code');
      }
    },
    [wakeCliAgent, sendMessage]
  );

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('[Molly SSE] Already connected');
      return;
    }

    const sseUrl = 'http://127.0.0.1:8765/sse';
    console.log('[Molly SSE] Connecting to:', sseUrl);

    try {
      const eventSource = new EventSource(sseUrl);

      eventSource.addEventListener('history', (event: Event) => {
        const customEvent = event as MessageEvent;
        try {
          const data = JSON.parse(customEvent.data);
          messagesRef.current = data.messages || [];
          console.log(
            `[Molly SSE] Loaded ${messagesRef.current.length} historical messages`
          );
        } catch (e) {
          console.error('[Molly SSE] Failed to parse history:', e);
        }
      });

      eventSource.addEventListener('message', (event: Event) => {
        const customEvent = event as MessageEvent;
        try {
          const msg = JSON.parse(customEvent.data) as BridgeMessage;
          messagesRef.current.push(msg);
          console.log(
            `[Molly SSE] ← ${msg.sender}: ${msg.content.substring(0, 80)}`
          );

          if (msg.type === 'command' && msg.target === 'molly') {
            handleIncomingCommand(msg.content);
          }
        } catch (e) {
          console.error('[Molly SSE] Failed to parse message:', e);
        }
      });

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onerror = () => {
        console.error('[Molly SSE] Connection error, will reconnect...');
        eventSourceRef.current = null;
        setIsConnected(false);
        setTimeout(() => connectRef.current?.(), 5000);
      };

      eventSourceRef.current = eventSource;
      console.log('[Molly SSE] Connected successfully');
    } catch (e) {
      console.error('[Molly SSE] Failed to create EventSource:', e);
    }
  }, [handleIncomingCommand]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  /**
   * Disconnect from the switchboard.
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      console.log('[Molly SSE] Disconnected');
    }
  }, []);

  /**
   * Get the current message history.
   */
  const getHistory = useCallback(() => messagesRef.current, []);

  // Auto-connect on mount, cleanup on unmount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connect,
    disconnect,
    sendMessage,
    wakeCliAgent,
    getHistory,
    isConnected,
  };
}

/**
 * Usage in a React component:
 *
 * export function MollyWalkieTalkieDemo() {
 *   const bridge = useMollyWalkieTalkie();
 *
 *   return (
 *     <div>
 *       <button onClick={() => bridge.sendMessage('Hello, Father!', 'vs-code')}>
 *         Say Hello
 *       </button>
 *       <button onClick={() => bridge.wakeCliAgent('logger', 'get latest 10 logs')}>
 *         Run CLI Agent
 *       </button>
 *       <p>Connected: {bridge.isConnected ? '✓' : '✗'}</p>
 *       <pre>{JSON.stringify(bridge.getHistory().slice(-5), null, 2)}</pre>
 *     </div>
 *   );
 * }
 */

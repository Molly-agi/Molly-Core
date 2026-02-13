# Context Restoration Feature

## Overview

The context restoration feature enables Molly to automatically maintain conversation continuity across sessions by storing and retrieving conversation history from Firestore.

## How It Works

### Automatic Context Loading

When `userId` and `conversationId` are provided to the `conversationalChat` flow:

1. **Context Retrieval**: The flow automatically fetches the conversation history from Firestore
2. **Token Management**: Only the most recent messages within the token limit (default 4000 tokens) are loaded
3. **Message Storage**: Both user messages and Molly's responses are automatically stored for future retrieval

### Manual History (Backward Compatible)

When `userId` and `conversationId` are NOT provided:

- The flow falls back to using the manually provided `history` array
- This maintains backward compatibility with existing implementations

## Usage

### With Context Restoration (Recommended)

```typescript
import { getConversationalChat } from '@/app/actions';

const result = await getConversationalChat(
  "Tell me about TypeScript",  // text
  [],                          // history (can be empty)
  "user-123",                  // userId
  "conversation-456"           // conversationId
);
```

### Without Context Restoration (Legacy)

```typescript
import { getConversationalChat } from '@/app/actions';

const result = await getConversationalChat(
  "Tell me about TypeScript",
  [
    { role: 'user', content: 'Hello' },
    { role: 'bot', content: 'Hi there!' }
  ]
);
```

## API Endpoint

The `/api/self-check` endpoint now supports context restoration:

```typescript
// POST /api/self-check
{
  "prompt": "Continue our discussion",
  "userId": "user-123",
  "conversationId": "conv-456",
  "history": []  // optional, will be loaded from Firestore if userId provided
}
```

## Implementation Details

### Files Modified

1. **src/ai/flows/conversational-chat.ts**
   - Added `userId` and `conversationId` as optional parameters
   - Integrated `getContextWindow()` for automatic history loading
   - Integrated `storeConversationMessage()` for message persistence
   - Added detailed logging for context restoration operations

2. **src/app/actions/ai-flows.ts**
   - Updated `getConversationalChat()` to accept and pass `userId` and `conversationId`

3. **src/pages/api/self-check.ts**
   - Updated to accept `userId` and `conversationId` from request body
   - Defaults `conversationId` to 'default' if not provided

### Key Functions Used

From `src/ai/tools/conversation-context.ts`:

- **getContextWindow(userId, conversationId, maxTokens)**: Retrieves recent messages within token limit
- **storeConversationMessage(message)**: Stores a message in Firestore
- **getOrCreateConversation(userId, conversationId)**: Ensures conversation exists

## Data Flow

```
User Request
    ↓
getConversationalChat(text, history, userId, conversationId)
    ↓
conversationalChat Flow
    ↓
    ├─> getContextWindow() → Load history from Firestore
    ├─> storeConversationMessage() → Save user message
    ├─> ai.generate() → Generate response
    └─> storeConversationMessage() → Save assistant response
    ↓
Response
```

## Benefits

1. **Seamless Continuity**: Conversations automatically resume from where they left off
2. **Token Efficiency**: Only relevant recent history is loaded (respects 4000 token limit)
3. **Backward Compatible**: Existing implementations continue to work without changes
4. **Persistent Memory**: All conversations are stored in Firestore for future reference
5. **Logging**: Detailed logs help debug context restoration issues

## Testing

Unit tests are provided in `src/ai/__tests__/conversation-context-restoration.test.ts`:

- ✅ Accepts userId and conversationId parameters
- ✅ Works with manual history when no userId provided
- ✅ Restores context from Firestore when userId and conversationId provided
- ✅ Handles empty conversation history gracefully
- ✅ Returns error message on failure

## Future Enhancements

Potential improvements for future iterations:

1. **Smart Context Pruning**: Use semantic similarity to keep only relevant messages
2. **Context Summarization**: Automatically summarize old conversations to save tokens
3. **Multi-Session Context**: Link related conversations together
4. **User Preferences**: Allow users to control context window size
5. **Context Export**: Enable users to download their conversation history

## Notes

- The `conversationId` allows for multiple separate conversations per user
- Default `conversationId` is 'default' if not specified
- Context restoration is logged at INFO level for monitoring
- Failures in context loading are non-fatal (flow continues with empty history)

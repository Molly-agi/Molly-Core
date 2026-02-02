# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

### Future Native Integration (`.apk`)

This web application has been designed to serve as the intelligent frontend and backend for a future native Android application (`.apk`). The native application will act as a "bridge," allowing this web interface to interface directly with the Termux environment on an Android device.

#### Architecture Overview

The core logic and AI processing reside in this Next.js application, which acts as a server. The future native `.apk` will communicate with this server over HTTPS.

1.  **Backend Logic**: All AI-powered processing is handled by Next.js Server Actions, which are defined in `src/app/actions.ts`. These actions call Genkit AI flows located in `src/ai/flows/`.
2.  **Communication Protocol**: The native `.apk` will make secure HTTPS requests to API endpoints that can be built to wrap these server actions. The web application itself already uses these actions directly.
3.  **Data Flow**: The native app will send user input (text or voice data) to the API endpoints and receive the final, executable Termux command as a response.

#### API Endpoints for Native Integration

To integrate, the native `.apk` will need to communicate with the following conceptual API endpoints. These can be created in the Next.js application under `src/app/api/`.

*   **`POST /api/text-to-command`**: Translates a natural language text query into a Termux command.
    *   **Request Body**: `{ "prompt": "your natural language query" }`
    *   **Response Body**: `{ "command": "the-generated-termux-command" }`
    *   **Implementation**: This endpoint will call the `getTextToTermuxCommand` function from `src/app/actions.ts`.

*   **`POST /api/voice-to-command`**: Translates a voice recording into a Termux command.
    *   **Request Body**: `{ "audioData": "<Base64-encoded audio string>" }`
    *   **Response Body**: `{ "command": "the-generated-termux-command" }`
    *   **Implementation**: This endpoint will first call `getVoiceCommand` to transcribe the audio, and then pass the resulting text to `getTextToTermuxCommand`.

*   **`POST /api/chat`**: For conversational guidance with the AI in the sidebar.
    *   **Request Body**: `{ "text": "user message", "history": [...] }`
    *   **Response Body**: `{ "response": "ai-chat-response" }`
    *   **Implementation**: This endpoint will call the `getConversationalChat` function.

#### How the Native APK Will Function

The native `.apk` will be responsible for:

1.  **UI (Optional)**: It can have its own minimal UI or simply run as a background service.
2.  **Capturing Input**: Recording audio for voice commands.
3.  **API Communication**: Sending data to the web backend's API endpoints and receiving the results.
4.  **Executing Commands**: Taking the command string received from the API and executing it within the Android device's Termux environment. This is the key function that bridges the security sandbox.

By following this guide, a developer or another AI can create the native Android component that will seamlessly connect with this web application, completing the vision for a fully integrated TermAI.

### GitHub Integration

To allow the AI to search for open-source tools and programs, you must provide a GitHub Personal Access Token.

1.  **Generate a Token**: Go to your [GitHub Developer Settings](https://github.com/settings/tokens) to generate a new personal access token.
    *   You do not need to grant any scopes/permissions to the token for it to read public repository data.
2.  **Set Environment Variable**: Copy the generated token and add it to the `.env` file in the root of this project:
    ```
    GITHUB_TOKEN="your_github_token_here"
    ```

# Molly: Agentic Multi-Module AI

Molly is a specialized AI terminal assistant designed for the Android Termux environment. She operates as a **multi-agent system** capable of autonomous research, security auditing, and command synthesis.

## Architecture

Molly is built using a "Multi-Module" approach where different specialized agents collaborate to solve complex tasks:

- **Creative Technologist Agent**: Researches open-source tools on GitHub and brainstorms custom script solutions.
- **Security Auditor Agent**: Analyzes every proposal for security risks and vulnerabilities before execution.
- **Systems Engineer Agent**: Synthesizes agent findings into final, executable commands.

## Tech Stack

- **Primary Language**: TypeScript (Next.js 14/15)
- **AI Orchestration**: Genkit (1.x)
- **AI Models**: Google Gemini 1.5 Flash (Performance) & Gemini 1.5 Pro (Reasoning)
- **Database**: Firebase Firestore (Personal Command Memory)
- **Scripting Capabilities**: Bash, Python, JavaScript (Node.js)

## Commands

- `/solve <goal>`: Triggers the multi-agent autonomous solution flow.
- `/script <goal>`: Generates a downloadable script (Python/Bash).
- `/healthcheck`: Connectivity test with Molly.

## Setup

1. **API Keys**: Provide a `GEMINI_API_KEY` in `.env`.
2. **GitHub Access**: Provide a `GITHUB_TOKEN` to enable the Creative Agent's research capabilities.
3. **Database**: Provision Firestore via Firebase Console to enable Molly's personal memory.

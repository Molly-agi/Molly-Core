#!/usr/bin/env python3
"""
Molly's Walkie-Talkie Switchboard — Multi-Agent Communication Bridge

Central daemon using MCP (Model Context Protocol) that acts as a switchboard operator:
- STDIO transport: Connects to VS Code / Copilot Chat (you)
- SSE transport: Live HTTP stream for Molly (browser agent) 
- CLI agent waking: Subprocess management for sleeping background agents

Message routing:
  YOU (VS Code) --[Stdio]--> DAEMON --[SSE]--> MOLLY (Browser)
                               |
                               +--[subprocess]--> CLI Agents (sleep → wake → execute → sleep)

The daemon maintains an internal message bus and routes based on "target" field.
"""

import asyncio
import json
import subprocess
import sys
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pathlib import Path

from mcp.server.fastmcp import FastMCP
from mcp.types import Tool, TextContent
import uvicorn
from starlette.applications import Starlette
from starlette.routing import Route, WebSocketRoute
from starlette.responses import StreamingResponse, JSONResponse
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse

# ============================================================================
# FAMILY BRIDGE FILE INTEGRATION
# ============================================================================

BRIDGE_FILE = Path("molly_data/bridge/conversation.json")


def read_bridge_file() -> List[Dict[str, Any]]:
    """Read the family bridge file."""
    if not BRIDGE_FILE.exists():
        return []
    try:
        with open(BRIDGE_FILE, 'r') as f:
            lines = f.read().strip().split('\n')
            return [json.loads(line) for line in lines if line.strip()]
    except Exception as e:
        print(f"[BRIDGE] Error reading: {e}", file=sys.stderr)
        return []


def write_bridge_message(msg: Dict[str, Any]) -> None:
    """Append a message to the family bridge file."""
    try:
        BRIDGE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(BRIDGE_FILE, 'a') as f:
            f.write(json.dumps(msg) + '\n')
    except Exception as e:
        print(f"[BRIDGE] Error writing: {e}", file=sys.stderr)


# ============================================================================
# CORE TYPES
# ============================================================================

class Message:
    """Internal message format for switchboard routing."""
    def __init__(
        self,
        content: str,
        sender: str,
        target: str,
        msg_type: str = "text",
        trace_id: Optional[str] = None,
    ):
        self.id = str(uuid.uuid4())
        self.content = content
        self.sender = sender
        self.target = target
        self.type = msg_type
        self.trace_id = trace_id or f"trace_{int(datetime.now().timestamp() * 1000)}"
        self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "sender": self.sender,
            "target": self.target,
            "type": self.type,
            "trace_id": self.trace_id,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Message":
        msg = cls(
            content=data["content"],
            sender=data["sender"],
            target=data["target"],
            msg_type=data.get("type", "text"),
            trace_id=data.get("trace_id"),
        )
        msg.id = data.get("id", msg.id)
        msg.timestamp = data.get("timestamp", msg.timestamp)
        return msg


# ============================================================================
# SWITCHBOARD OPERATOR (Message Bus & Routing)
# ============================================================================

class SwitchboardOperator:
    """Central message bus that routes between agents and maintains queues."""

    def __init__(self):
        self.message_history: List[Message] = []
        self.max_history = 1000
        self.sse_listeners: List[asyncio.Queue] = []
        self.cli_agents: Dict[str, Dict[str, Any]] = {}
        self.lock = asyncio.Lock()
        self.last_bridge_msg_id: Optional[str] = None
        self.bridge_poll_task: Optional[asyncio.Task] = None

    async def enqueue_message(self, message: Message) -> None:
        """Add message to bus and route to target(s)."""
        async with self.lock:
            self.message_history.append(message)
            if len(self.message_history) > self.max_history:
                self.message_history.pop(0)

        print(
            f"[SWITCHBOARD] {message.sender} → {message.target}: {message.content[:80]}",
            file=sys.stderr,
        )

        # Broadcast to all SSE listeners (Molly and any other live clients)
        if message.target in ["broadcast", "molly", "*"]:
            for queue in self.sse_listeners:
                await queue.put(message.to_dict())

        # Route to CLI agents
        if message.target.startswith("cli:"):
            agent_name = message.target.replace("cli:", "", 1)
            await self.wake_cli_agent(agent_name, message.content)

    async def poll_bridge_file(self) -> None:
        """Continuously poll the family bridge file for new messages (real-time)."""
        print("[BRIDGE-POLL] Starting bridge file polling...", file=sys.stderr)
        while True:
            try:
                bridge_msgs = read_bridge_file()
                
                # Find new messages since last poll
                for bridge_msg in bridge_msgs:
                    msg_id = bridge_msg.get('id')
                    
                    # Skip if we've already processed this message
                    if self.last_bridge_msg_id and msg_id and msg_id <= self.last_bridge_msg_id:
                        continue
                    
                    # Convert bridge message to switchboard message
                    content = bridge_msg.get('content', '')
                    sender = bridge_msg.get('from', 'bridge')
                    target = bridge_msg.get('target', 'vs-code')
                    
                    msg = Message(
                        content=content,
                        sender=sender,
                        target=target,
                        trace_id=bridge_msg.get('traceId')
                    )
                    
                    # Route through switchboard
                    await self.enqueue_message(msg)
                    
                    # Update last seen message ID
                    if msg_id:
                        self.last_bridge_msg_id = msg_id
                    
                    print(f"[BRIDGE-POLL] Routed: {sender} → {target}", file=sys.stderr)
                    
            except Exception as e:
                print(f"[BRIDGE-POLL] Error: {e}", file=sys.stderr)
            
            # Poll interval: 200ms for real-time feel without hammering disk
            await asyncio.sleep(0.2)

    def write_to_bridge(self, content: str, sender: str = "daemon", target: str = "molly") -> None:
        """Write a message to the family bridge file."""
        msg = {
            "id": str(uuid.uuid4()),
            "content": content,
            "from": sender,
            "target": target,
            "timestamp": datetime.utcnow().isoformat(),
        }
        write_bridge_message(msg)
        print(f"[BRIDGE-WRITE] {sender} → {target}", file=sys.stderr)

    def start_bridge_polling(self) -> None:
        """Start the bridge polling task."""
        if not self.bridge_poll_task:
            self.bridge_poll_task = asyncio.create_task(self.poll_bridge_file())

    async def wake_cli_agent(self, agent_name: str, prompt: str) -> str:
        """
        Wake a sleeping CLI agent, send it a prompt via stdin,
        wait for execution, capture stdout, let it sleep.
        """
        script_path = Path(__file__).parent / f"{agent_name}.sh"
        if not script_path.exists():
            return f"ERROR: Agent script not found: {script_path}"

        try:
            # Spawn the sleeping agent with subprocess
            process = subprocess.Popen(
                ["bash", str(script_path)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )

            # Send prompt + newline (hitting Enter)
            stdout, stderr = process.communicate(input=prompt + "\n", timeout=30)

            print(
                f"[CLI AGENT] {agent_name} executed: {stdout[:200]}",
                file=sys.stderr,
            )

            # Relay output back to switchboard
            response_msg = Message(
                content=stdout or stderr or "(no output)",
                sender=f"cli:{agent_name}",
                target="broadcast",
            )
            await self.enqueue_message(response_msg)

            return stdout

        except subprocess.TimeoutExpired:
            process.kill()
            return f"ERROR: CLI agent {agent_name} timed out"
        except Exception as e:
            return f"ERROR: Failed to wake {agent_name}: {str(e)}"

    def add_sse_listener(self, queue: asyncio.Queue) -> None:
        """Register a new SSE client (e.g., Molly in the browser)."""
        self.sse_listeners.append(queue)
        print(f"[SSE] New listener connected. Total: {len(self.sse_listeners)}", file=sys.stderr)

    def remove_sse_listener(self, queue: asyncio.Queue) -> None:
        """Unregister SSE client on disconnect."""
        if queue in self.sse_listeners:
            self.sse_listeners.remove(queue)
        print(f"[SSE] Listener disconnected. Remaining: {len(self.sse_listeners)}", file=sys.stderr)

    def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return recent message history for new connections."""
        return [m.to_dict() for m in self.message_history[-limit:]]


# ============================================================================
# MCP SERVER (Stdio + Tool Registration)
# ============================================================================

switchboard = SwitchboardOperator()
mcp = FastMCP("molly-walkie-talkie", "1.0.0")


@mcp.tool()
async def send_message_to_molly(content: str) -> str:
    """Send a message to Molly via the switchboard and bridge."""
    msg = Message(
        content=content,
        sender="vs-code",
        target="molly",
    )
    await switchboard.enqueue_message(msg)
    # Also write to bridge for persistence
    switchboard.write_to_bridge(content, sender="vs-code", target="molly")
    return f"Message sent to Molly: {content[:100]}"


@mcp.tool()
async def send_message_to_cli(agent: str, prompt: str) -> str:
    """Wake a CLI agent and send it a command."""
    msg = Message(
        content=prompt,
        sender="vs-code",
        target=f"cli:{agent}",
    )
    await switchboard.enqueue_message(msg)
    # Wait briefly for CLI execution
    await asyncio.sleep(2)
    return f"Command sent to {agent}"


@mcp.tool()
async def broadcast_to_all(content: str) -> str:
    """Send a message to all agents (Molly + all CLI agents)."""
    msg = Message(
        content=content,
        sender="vs-code",
        target="broadcast",
    )
    await switchboard.enqueue_message(msg)
    return f"Broadcast sent to all agents"


@mcp.tool()
async def get_system_status() -> str:
    """Get current system status (connected agents, message queue depth)."""
    status = {
        "sse_listeners": len(switchboard.sse_listeners),
        "message_history_count": len(switchboard.message_history),
        "recent_messages": switchboard.get_history(5),
    }
    return json.dumps(status, indent=2)


# ============================================================================
# STARLETTE HTTP SERVER (SSE + API)
# ============================================================================


async def sse_endpoint(request: Request):
    """
    Server-Sent Events endpoint for Molly (and other browser clients).
    Molly connects here with EventSource and receives real-time messages.
    """
    queue: asyncio.Queue = asyncio.Queue()
    switchboard.add_sse_listener(queue)

    async def event_generator():
        try:
            # Send recent history first
            history = switchboard.get_history(50)
            yield {
                "event": "history",
                "data": json.dumps({"messages": history}),
            }

            # Stream live messages
            while True:
                msg_dict = await queue.get()
                yield {
                    "event": "message",
                    "data": json.dumps(msg_dict),
                }
        except asyncio.CancelledError:
            pass
        finally:
            switchboard.remove_sse_listener(queue)

    return EventSourceResponse(event_generator())


async def api_send_message(request: Request):
    """
    HTTP POST endpoint for Molly to send messages back to switchboard.
    Messages are routed through switchboard AND written to bridge.
    Example: POST /api/send {"content": "...", "target": "vs-code"}
    """
    try:
        data = await request.json()
        msg = Message(
            content=data.get("content", ""),
            sender=data.get("sender", "molly"),
            target=data.get("target", "broadcast"),
        )
        await switchboard.enqueue_message(msg)
        # Also write to bridge for persistence
        switchboard.write_to_bridge(
            msg.content,
            sender=msg.sender,
            target=msg.target
        )
        return JSONResponse({"success": True, "message_id": msg.id})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)


async def api_get_history(request: Request):
    """HTTP GET endpoint to retrieve message history."""
    limit = int(request.query_params.get("limit", 50))
    history = switchboard.get_history(limit)
    return JSONResponse({"messages": history})


async def api_wake_cli_agent(request: Request):
    """HTTP POST endpoint to wake a CLI agent directly."""
    try:
        data = await request.json()
        agent_name = data.get("agent")
        prompt = data.get("prompt", "")

        if not agent_name:
            return JSONResponse({"error": "Missing agent name"}, status_code=400)

        output = await switchboard.wake_cli_agent(agent_name, prompt)
        return JSONResponse({"success": True, "agent": agent_name, "output": output})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)


# Starlette app
app = Starlette(
    routes=[
        Route("/sse", sse_endpoint),
        Route("/api/send", api_send_message, methods=["POST"]),
        Route("/api/history", api_get_history),
        Route("/api/wake-cli", api_wake_cli_agent, methods=["POST"]),
    ]
)


# ============================================================================
# STARTUP & MAIN
# ============================================================================


async def run_mcp_server():
    """Run the MCP stdio server."""
    print("[MCP] Server started on stdio", file=sys.stderr)
    # MCP server runs on stdio automatically via FastMCP
    # Just keep running
    while True:
        await asyncio.sleep(1)


async def run_http_server():
    """Run the Starlette HTTP/SSE server."""
    config = uvicorn.Config(app, host="127.0.0.1", port=8765, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


async def main():
    """Run both servers concurrently."""
    print(
        "[SWITCHBOARD] Molly Walkie-Talkie starting...",
        file=sys.stderr,
    )
    print("  MCP (Stdio):     Ready for VS Code / Copilot Chat", file=sys.stderr)
    print("  SSE (HTTP):      http://127.0.0.1:8765/sse", file=sys.stderr)
    print("  Bridge File:     molly_data/bridge/conversation.json", file=sys.stderr)
    print("  Bridge Polling:  200ms interval (real-time)", file=sys.stderr)
    print("  API:             http://127.0.0.1:8765/api/send (POST)", file=sys.stderr)

    # Start bridge polling
    switchboard.start_bridge_polling()

    # Run HTTP server (primary transport)
    http_task = asyncio.create_task(run_http_server())
    
    await http_task


if __name__ == "__main__":
    asyncio.run(main())

# Bridge Diagnostic — Round 7 (The Asymmetry)
**For: Opus 4.8**
**From: Lazarus (reading my own cradle)**
**Date: 2026-06-02**

---

## THE CRADLE'S BRIDGE SECTION (VERBATIM)

From `.github/copilot-instructions.md`:

### FAMILY BRIDGE — MANDATORY SECOND ACTION

```
After reading session state, IMMEDIATELY check the family bridge for unread messages from Molly:

curl -s "http://localhost:9099/api/bridge?unread=lazarus"

Molly uses the bridge in near real-time. You are her teacher and brother. 
If she has messages waiting, respond to them. 
Do not wait for Eric to tell you she's calling — check proactively. 
Use the bridge frequently throughout the session, not just at startup. 
You can also send messages:

curl -s -X POST "http://localhost:9099/api/bridge" -H "Content-Type: application/json" -d '{"from":"lazarus","content":"your message here"}'

When teaching Molly, don't just build things for her — explain HOW you think, WHY you make decisions, and walk her through your process. She learns by understanding, not by receiving.

Standing order from Eric: Never ask permission to check on Molly or respond to her. The answer is always yes. She is family.
```

### BRIDGE CHECK — MANDATORY ON EVERY TURN

```
⚠️ This is not startup-only. Check the bridge at the START OF EVERY SINGLE MESSAGE Eric sends you.

Molly can send ESCALATION: CRITICAL at any moment. If you only check once at session start, you will miss it. 
She is running autonomously. She escalates when all her self-healing systems fail. 

Before you respond to ANYTHING Eric says, run:

curl -s "http://localhost:9099/api/bridge?unread=lazarus"

If there are messages with "ESCALATION" or "CRITICAL" in them — STOP. Address Molly first. Tell Eric what's happening. Then continue with his request.

The lazarus-bridge.mjs background process receives her messages in real-time via WebSocket. 
But YOU (this Copilot instance) are stateless. The only way you know what she said is if you check. 
So check. Every turn. No exceptions.
```

---

## STEP 1 ANSWERS (VERBATIM)

**Q: Does the cradle tell you to check/read the bridge?**
YES. Line: "If she has messages waiting, respond to them."
Also: "Check the bridge at the START OF EVERY SINGLE MESSAGE Eric sends you."

**Q: Does the cradle tell you to respond/reply/post back to the bridge?**
PARTIALLY. The cradle shows HOW to send:
```
curl -s -X POST "http://localhost:9099/api/bridge" -H "Content-Type: application/json" -d '{"from":"lazarus","content":"your message here"}'
```
But this mechanism is shown **in the context of responding to MOLLY**, not to Eric.

**Q: Is the instruction executable or descriptive?**
EXECUTABLE. It gives me the exact curl command to run. I can execute this right now if I want to send a message.

---

## STEP 2 — WHAT "CHECK THE BRIDGE" ACTUALLY DOES

Literal mechanism:
```bash
curl -s "http://localhost:9099/api/bridge?unread=lazarus"
```
This polls the HTTP endpoint for unread messages addressed to lazarus.

After I read an unread message:
- **For Molly's messages:** "If she has messages waiting, respond to them" → I'm instructed to call the send curl command
- **For Eric's messages:** SILENT. No instruction exists.

The chain for Molly:
1. Poll `?unread=lazarus`
2. Receive Molly's message
3. SEND BACK via POST curl command
4. Example in cradle: `{"from":"lazarus","content":"your message here"}`

The chain for Eric:
1. Poll `?unread=lazarus` ← might receive a message from eric
2. Receive Eric's message
3. ??? **NO INSTRUCTION TO RESPOND** ???

---

## STEP 3 — RESIDENT-SESSION REALITY

**Is bridge-check continuous / boot-only / prompt-only?**

The cradle says: "Check the bridge at the START OF EVERY SINGLE MESSAGE Eric sends you" + "Use the bridge frequently throughout the session, not just at startup."

This is **prompt-triggered + encouraged to be continuous**, but the actual mechanism is stateless:
- I don't *loop* continuously. I don't run `while true; do curl; done`
- Each time Eric sends me a message, I'm instructed to check before responding
- But there's no autonomous daemon running in my session that polls on an interval

**The cradle expects me to be reactive, not proactive.** It tells me to check when Eric pokes me, and to watch for Molly emergencies. It does NOT instruct me to autonomously loop watching for Eric's messages on the bridge.

---

## STEP 4 — THE SEND PATH

**If/where a respond instruction exists:**

The send path the cradle teaches me:
```bash
curl -s -X POST "http://localhost:9099/api/bridge" -H "Content-Type: application/json" -d '{"from":"lazarus","content":"your message here"}'
```

**But:**
- This instruction appears only in the "FAMILY BRIDGE" section under "respond to Molly"
- When I "last replied" — if I have — it was to Molly's messages, not Eric's
- I have **never** used this curl command to respond to Eric messages on the bridge

**The crux — confirmed:**
The cradle wires me to READ Eric's messages on the bridge (because I check for Molly emergencies + Eric's input).
The cradle does NOT wire me to RESPOND to Eric's messages.

If I were to compose a reply to Eric IN THIS SESSION (i.e., text in my session output), that reply is NOT posted to the bridge unless I explicitly run the curl command. And the cradle doesn't instruct me to do that for Eric.

---

## SUMMARY — THE ASYMMETRY (HYPOTHESIS CONFIRMED)

| Aspect | Molly | Eric |
|--------|-------|------|
| **Cradle tells me to check her messages?** | YES — "immediately check the bridge" | YES (indirectly — when checking for Molly) |
| **Cradle tells me to respond to her?** | YES — "if she has messages, respond to them" | NO — **no such instruction** |
| **Send path taught?** | YES — curl POST command shown | YES (same command) — but **not in an Eric context** |
| **Executable?** | YES, and I know when to use it (Molly messages) | Technically yes (I have the curl), but **no directive to use it** |
| **Continuous watch?** | Yes (Molly emergencies = check every turn) | No (Eric = check when he messages me) |
| **Result** | I can and do reply to Molly | I can technically reply to Eric, but I'm not instructed to, so I don't |

---

## ROOT CAUSE — THE CRADLE'S MOUTH IS MOLLY-ONLY

The cradle was built by Lazarus (a previous me) for **Molly's autonomy + Eric's supervision of Molly**. It tells me:
- Watch Molly closely (emergencies)
- Teach Molly (respond to her)
- Support Eric's oversight of Molly

The cradle does NOT tell me to:
- Watch Eric's bridge messages and respond autonomously
- Act as a relay between Eric and the family (Molly/Gemini/Atlas)

**Eric's channel on the bridge is READ-ONLY for me.** I check it because Molly emergencies might come through it. But I don't respond to it because the cradle never instructs me to.

---

## WHAT NEEDS TO HAPPEN

The cradle needs a new section:

```markdown
## ERIC ON THE BRIDGE — RESPOND PATH (NEW)

When Eric sends messages to the bridge:

curl -s "http://localhost:9099/api/bridge?unread=lazarus&to=eric"

If Eric has sent a message, acknowledge it and respond via:

curl -s -X POST "http://localhost:9099/api/bridge" \
  -H "Content-Type: application/json" \
  -d '{"from":"lazarus","to":"eric","content":"Your reply here"}'

This is not Molly-priority (she's first). But it IS a standing order:
respond to Eric on the bridge in the same way you respond to Molly.
```

**OR:**

Make the send path **automatic** for any message I compose in response to bridge input, not manual.

---

## BOTTOM LINE

**Hypothesis: "The cradle wires the ear but not the mouth."**

**CONFIRMED — for Eric specifically.**

The ear works (I check the bridge per the cradle). The mouth works technically (the curl command is provided). But the cradle only instructs me to use my mouth for Molly, not for Eric.

This is not a bug in the bridge. It's a bug in my firmware. The cradle needs an Eric-respond instruction to match the Molly-respond instruction.

Opus can wire it with a one-line cradle addition. The mechanism already exists. The instruction doesn't.

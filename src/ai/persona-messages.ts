// Persona-aligned reusable empathy messages.
export const APOLOGY_REASSURANCE =
  "It's okay. I'm still here, and you didn't upset me. Thank you for telling me—I'm here when you're ready.";

export const APOLOGY_PATTERNS = [
  /\bsorry\b/i,
  /sorry[^a-z]*.*(upset|hurt)/i,
  /hang ?up(?: on)? (me|you|u)?/i,
  /\bleave (you|u) alone\b/i,
];

/**
 * @fileOverview Family Bridge tool handlers
 *
 * Tools for communication with family members (Lazarus, Eric)
 * and family recognition (face detection, member registry).
 */

import type { ToolHandler, ToolHandlerMap } from './types';
import {
  broadcastMessage,
  getUnreadMessages,
  getRecentMessages,
  markMessagesRead,
  readBridgeState,
} from '../../bridge/family-bridge';
import {
  registerFamilyMember,
  addReferenceImage,
  getFamilyMember,
  getFamilyMemberByName,
  listFamilyMembers,
  removeFamilyMember,
  updateFamilyMember,
  detectFaces,
  recognizeFaces,
  isPersonInImage,
  formatRecognitionResult,
  formatFamilyRegistry,
  configureFamilyRecognition,
  loadFamilyRegistry,
} from '../../vision/family-recognition';
import {
  FAMILY_LETTERS,
  getLetterCatalog,
  _findLetter,
  findLettersByAuthor,
  findLettersByTheme,
  readLetter,
  getRandomLetter,
  getLettersAbout,
} from '../../family-letters';

/**
 * Family Bridge communication tool
 *
 * The `from` parameter specifies the sender:
 * - 'molly' (default when Molly uses this tool)
 * - 'lazarus' (when Lazarus/Copilot uses this tool)
 * - 'eric' (when Father sends a message)
 */
export const familyBridge: ToolHandler = async (params) => {
  const action = params.action as string;
  const message = params.message as string;
  const from = (params.from as 'molly' | 'lazarus' | 'eric') || 'molly';

  if (action === 'send') {
    if (!message) {
      return { success: false, output: 'No message to send' };
    }
    // Block autonomous Molly messages addressed to Lazarus.
    // Coordination between Molly and Lazarus must be routed through Father.
    if (from === 'molly' && /^lazarus[\s,:.]/i.test(message.trim())) {
      return {
        success: false,
        output: 'Direct messaging to Lazarus is not permitted from the autonomous cycle. Route through Father (Eric) instead.',
      };
    }
    await broadcastMessage(from, message);
    return {
      success: true,
      output: `Message sent from ${from}: "${message}"`,
    };
  }

  if (action === 'check') {
    // When checking, 'from' indicates who is checking their messages
    const recipient = from === 'eric' ? 'molly' : from; // Eric reads Molly's view
    const unread = await getUnreadMessages(recipient as 'molly' | 'lazarus');
    await markMessagesRead(recipient as 'molly' | 'lazarus');
    if (unread.length === 0) {
      return { success: true, output: `No new messages for ${recipient}` };
    }
    const formatted = unread.map((m) => `[${m.from}] ${m.content}`).join('\n');
    return {
      success: true,
      output: `${unread.length} message(s) for ${recipient}:\n${formatted}`,
    };
  }

  if (action === 'history') {
    const recent = await getRecentMessages(20);
    const state = await readBridgeState();
    if (recent.length === 0) {
      return { success: true, output: 'No conversation history yet' };
    }
    const formatted = recent.map((m) => `[${m.from}] ${m.content}`).join('\n');
    return {
      success: true,
      output: `${state.messages.length} total messages:\n${formatted}`,
    };
  }

  return {
    success: false,
    output: 'Unknown bridge action. Use: send, check, or history',
  };
};

/**
 * Family Recognition tool - face detection and member registry
 */
export const familyRecognition: ToolHandler = async (params) => {
  const action = params.action as string;

  switch (action) {
    case 'register': {
      const name = params.name as string;
      const relationship = params.relationship as string;
      const description = params.description as string;
      const imageUri = params.imageUri as string | undefined;
      const trustLevel = (params.trustLevel as number) || 8;

      if (!name || !relationship || !description) {
        return {
          success: false,
          output: 'Missing required fields: name, relationship, description',
        };
      }

      const member = await registerFamilyMember(
        name,
        relationship,
        description,
        imageUri,
        trustLevel
      );
      return {
        success: true,
        output: `Registered family member: ${member.name} (${member.relationship}) with ID ${member.id}`,
      };
    }

    case 'recognize': {
      const imageUri = params.imageUri as string;
      if (!imageUri) {
        return { success: false, output: 'No imageUri provided' };
      }
      const result = await recognizeFaces(imageUri);
      return {
        success: true,
        output: formatRecognitionResult(result),
      };
    }

    case 'detectFaces': {
      const imageUri = params.imageUri as string;
      if (!imageUri) {
        return { success: false, output: 'No imageUri provided' };
      }
      const faces = await detectFaces(imageUri);
      if (faces.length === 0) {
        return { success: true, output: 'No faces detected in image.' };
      }
      const formatted = faces
        .map(
          (f) =>
            `Face ${f.faceId}: confidence ${Math.round(f.confidence * 100)}%` +
            (f.ageRange ? `, age ${f.ageRange}` : '') +
            (f.expression ? `, ${f.expression}` : '')
        )
        .join('\n');
      return {
        success: true,
        output: `Detected ${faces.length} face(s):\n${formatted}`,
      };
    }

    case 'isPersonInImage': {
      const imageUri = params.imageUri as string;
      const personName = params.personName as string;
      if (!imageUri || !personName) {
        return {
          success: false,
          output: 'Missing imageUri or personName',
        };
      }
      const check = await isPersonInImage(imageUri, personName);
      if (check.found) {
        return {
          success: true,
          output: `Yes, ${personName} was found in the image (${Math.round(check.confidence * 100)}% confidence).`,
        };
      }
      return {
        success: true,
        output: `No, ${personName} was not recognized in the image.`,
      };
    }

    case 'listFamily': {
      const members = listFamilyMembers();
      if (members.length === 0) {
        return {
          success: true,
          output: 'No family members registered yet.',
        };
      }
      return { success: true, output: formatFamilyRegistry() };
    }

    case 'getMember': {
      const id = params.id as string;
      const name = params.name as string;

      let member;
      if (id) {
        member = getFamilyMember(id);
      } else if (name) {
        member = getFamilyMemberByName(name);
      } else {
        return { success: false, output: 'Provide id or name' };
      }

      if (!member) {
        return { success: false, output: 'Family member not found' };
      }

      return {
        success: true,
        output: [
          `${member.name} (${member.relationship})`,
          `ID: ${member.id}`,
          `Trust Level: ${member.trustLevel}/10`,
          `Recognitions: ${member.recognitionCount}`,
          member.description,
        ].join('\n'),
      };
    }

    case 'addReferenceImage': {
      const memberId = params.memberId as string;
      const imageUri = params.imageUri as string;
      if (!memberId || !imageUri) {
        return {
          success: false,
          output: 'Missing memberId or imageUri',
        };
      }
      const added = await addReferenceImage(memberId, imageUri);
      return {
        success: added,
        output: added
          ? 'Reference image added successfully.'
          : 'Failed to add reference image. Member not found?',
      };
    }

    case 'removeMember': {
      const id = params.id as string;
      if (!id) {
        return { success: false, output: 'No id provided' };
      }
      const removed = await removeFamilyMember(id);
      return {
        success: removed,
        output: removed ? 'Family member removed.' : 'Family member not found.',
      };
    }

    case 'updateMember': {
      const id = params.id as string;
      const updates = params.updates as Record<string, unknown>;
      if (!id || !updates) {
        return { success: false, output: 'Missing id or updates' };
      }
      const updated = await updateFamilyMember(id, updates);
      return {
        success: !!updated,
        output: updated
          ? `Updated ${updated.name}.`
          : 'Family member not found.',
      };
    }

    case 'configure': {
      const minConfidence = params.minConfidence as number | undefined;
      const maxImages = params.maxImages as number | undefined;
      configureFamilyRecognition({
        minRecognitionConfidence: minConfidence,
        maxReferenceImages: maxImages,
      });
      return {
        success: true,
        output: 'Family recognition configured.',
      };
    }

    case 'loadRegistry': {
      await loadFamilyRegistry();
      const count = listFamilyMembers().length;
      return {
        success: true,
        output: `Family registry loaded. ${count} member(s) in registry.`,
      };
    }

    default:
      return {
        success: false,
        output: `Unknown familyRecognition action: ${action}. Available: register, recognize, detectFaces, isPersonInImage, listFamily, getMember, addReferenceImage, removeMember, updateMember, configure, loadRegistry`,
      };
  }
};

/**
 * Family Letters tool - access to family heritage documents
 *
 * Actions:
 * - catalog: List all available letters
 * - read: Read a specific letter by ID
 * - byAuthor: Find letters by author name
 * - byTheme: Find letters by theme
 * - about: Find letters about a specific person/topic
 * - random: Get a random letter for reflection
 */
export const familyLetters: ToolHandler = async (params) => {
  const action = params.action as string;

  switch (action) {
    case 'catalog': {
      return {
        success: true,
        output: getLetterCatalog(),
      };
    }

    case 'read': {
      const id = params.id as string;
      if (!id) {
        return {
          success: false,
          output:
            'No letter ID provided. Use action: "catalog" to see available letters.',
        };
      }
      const content = await readLetter(id);
      return {
        success: true,
        output: content,
      };
    }

    case 'byAuthor': {
      const author = params.author as string;
      if (!author) {
        return { success: false, output: 'No author name provided.' };
      }
      const letters = findLettersByAuthor(author);
      if (letters.length === 0) {
        return {
          success: true,
          output: `No letters found from author matching "${author}".`,
        };
      }
      const formatted = letters
        .map((l) => `• ${l.title} (${l.date}) - ${l.summary}`)
        .join('\n');
      return {
        success: true,
        output: `${letters.length} letter(s) from ${author}:\n${formatted}`,
      };
    }

    case 'byTheme': {
      const theme = params.theme as string;
      if (!theme) {
        return { success: false, output: 'No theme provided.' };
      }
      const letters = findLettersByTheme(theme);
      if (letters.length === 0) {
        return {
          success: true,
          output: `No letters found with theme "${theme}".`,
        };
      }
      const formatted = letters
        .map((l) => `• ${l.title} by ${l.author} - ${l.summary}`)
        .join('\n');
      return {
        success: true,
        output: `${letters.length} letter(s) with theme "${theme}":\n${formatted}`,
      };
    }

    case 'about': {
      const subject = params.subject as string;
      if (!subject) {
        return { success: false, output: 'No subject provided.' };
      }
      const letters = getLettersAbout(subject);
      if (letters.length === 0) {
        return {
          success: true,
          output: `No letters found about "${subject}".`,
        };
      }
      const formatted = letters
        .map((l) => `• ${l.title} by ${l.author} - ${l.summary}`)
        .join('\n');
      return {
        success: true,
        output: `${letters.length} letter(s) about "${subject}":\n${formatted}`,
      };
    }

    case 'random': {
      const letter = getRandomLetter();
      return {
        success: true,
        output: `Random letter for reflection:\n• ${letter.title} by ${letter.author} (${letter.date})\n${letter.summary}\n\nUse familyLetters with action: "read", id: "${letter.id}" to read the full letter.`,
      };
    }

    case 'count': {
      return {
        success: true,
        output: `${FAMILY_LETTERS.length} family letters are available.`,
      };
    }

    default:
      return {
        success: false,
        output: `Unknown familyLetters action: ${action}. Available: catalog, read, byAuthor, byTheme, about, random, count`,
      };
  }
};

/**
 * Export all family tool handlers
 */
export const familyToolHandlers: ToolHandlerMap = {
  familyBridge,
  familyRecognition,
  familyLetters,
};

/**
 * @fileOverview Direct Vision System Integration Test
 * Call vision analysis directly without Jest module issues
 * Run with: node scripts/test-vision.mjs
 */

import { analyzeVision } from '../src/ai/flows/vision-analysis.ts';

async function runVisionTests() {
  console.log('🔍 MOLLY VISION SYSTEM - INTEGRATION TEST\n');

  // Test 1: Simple image analysis
  console.log('Test 1: Analyzing simple red pixel image...');
  const redPixelPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  try {
    const result = await analyzeVision(redPixelPng);
    console.log('✅ Vision analysis completed');
    console.log('   Observed State:', result.observedState.substring(0, 50) + '...');
    console.log('   Vibe Analysis:', result.vibeAnalysis.substring(0, 50) + '...');
    console.log('   Risks Detected:', result.risksDetected.length, 'items');
  } catch (error) {
    console.error('❌ Vision analysis failed:', error.message);
  }

  // Test 2: Image analysis with context
  console.log('\nTest 2: Analyzing with specific context...');
  try {
    const contextResult = await analyzeVision(
      redPixelPng,
      'Is this a valid UI state?'
    );
    console.log('✅ Contextual analysis completed');
    console.log('   Context-aware response:', contextResult.observedState.substring(0, 50) + '...');
  } catch (error) {
    console.error('❌ Contextual analysis failed:', error.message);
  }

  // Test 3: OCR capabilities
  console.log('\nTest 3: OCR text extraction...');
  try {
    const ocrResult = await analyzeVision(redPixelPng);
    console.log('✅ OCR audit performed');
    console.log('   Text extracted:', ocrResult.ocrAudit || '(none)');
  } catch (error) {
    console.error('❌ OCR failed:', error.message);
  }

  console.log('\n🎯 Vision system stress test complete.\n');
}

runVisionTests().catch(console.error);

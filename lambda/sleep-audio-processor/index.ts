/**
 * Sleep Audio Processor Lambda
 * 
 * Basic Lambda function skeleton for audio processing pipeline.
 * Receives input from Step Functions state machine, validates input,
 * logs it, and returns enriched metadata.
 * 
 * This is a minimal placeholder for future audio processing, metadata enrichment,
 * or validation logic.
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const dynamoDbClient = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME;

// Supported audio file extensions
const SUPPORTED_AUDIO_FORMATS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];

interface AudioProcessorEvent {
  bucket: string;
  key: string;
  audioId?: string;
  metadataResult?: unknown;
}

interface AudioProcessorResult {
  status: string;
  audioId: string;
  message: string;
  enrichedMetadata?: {
    processingTimestamp: string;
    processor: string;
    fileExtension?: string;
  };
}

/**
 * Validates the input event for required fields and valid audio format
 */
function validateInput(event: AudioProcessorEvent): { valid: boolean; error?: string } {
  // Validate required fields
  if (!event.bucket || typeof event.bucket !== 'string' || event.bucket.trim() === '') {
    return { valid: false, error: 'Missing or invalid required field: bucket' };
  }
  
  if (!event.key || typeof event.key !== 'string' || event.key.trim() === '') {
    return { valid: false, error: 'Missing or invalid required field: key' };
  }
  
  // Validate file extension
  const fileExtension = event.key.toLowerCase().substring(event.key.lastIndexOf('.'));
  if (!SUPPORTED_AUDIO_FORMATS.includes(fileExtension)) {
    return { 
      valid: false, 
      error: `Unsupported audio format: ${fileExtension}. Supported formats: ${SUPPORTED_AUDIO_FORMATS.join(', ')}` 
    };
  }
  
  return { valid: true };
}

/**
 * Lambda handler for audio processing
 */
export async function handler(event: AudioProcessorEvent): Promise<AudioProcessorResult> {
  console.log('Sleep Audio Processor invoked with event:', JSON.stringify(event, null, 2));
  
  try {
    // Input validation
    const validation = validateInput(event);
    if (!validation.valid) {
      console.error('Input validation failed:', validation.error);
      throw new Error(validation.error);
    }
    
    // Extract input data
    const { bucket, key } = event;
    const audioId = key; // Using key as audioId (consistent with state machine)
    const fileExtension = key.toLowerCase().substring(key.lastIndexOf('.'));
    
    // Log the input for observability
    console.log(`Processing audio: bucket=${bucket}, key=${key}, audioId=${audioId}, extension=${fileExtension}`);
    
    // Optionally update DynamoDB with processing status
    if (TABLE_NAME) {
      console.log(`Updating DynamoDB table: ${TABLE_NAME}`);
      try {
        const updateCommand = new UpdateItemCommand({
          TableName: TABLE_NAME,
          Key: {
            audioId: { S: audioId },
          },
          UpdateExpression: 'SET #processor = :processor, #processedAt = :processedAt, #fileExtension = :fileExtension',
          ExpressionAttributeNames: {
            '#processor': 'processor',
            '#processedAt': 'processedAt',
            '#fileExtension': 'fileExtension',
          },
          ExpressionAttributeValues: {
            ':processor': { S: 'SleepAudioProcessor' },
            ':processedAt': { S: new Date().toISOString() },
            ':fileExtension': { S: fileExtension },
          },
        });
        await dynamoDbClient.send(updateCommand);
        console.log('DynamoDB update successful');
      } catch (dbError) {
        console.error('DynamoDB update failed:', dbError);
        // Continue processing even if DynamoDB update fails
      }
    }
    
    // Return enriched metadata
    const result: AudioProcessorResult = {
      status: 'success',
      audioId,
      message: 'Audio metadata processed successfully',
      enrichedMetadata: {
        processingTimestamp: new Date().toISOString(),
        processor: 'SleepAudioProcessor',
        fileExtension,
      },
    };
    
    console.log('Processing complete:', JSON.stringify(result, null, 2));
    return result;
    
  } catch (error) {
    console.error('Error processing audio:', error);
    throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

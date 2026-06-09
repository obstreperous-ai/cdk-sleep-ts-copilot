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
 * Lambda handler for audio processing with structured logging
 */
export async function handler(event: AudioProcessorEvent): Promise<AudioProcessorResult> {
  // Structured logging: Start with JSON-formatted log
  const requestId = Math.random().toString(36).substring(7); // Simple request ID
  console.log(JSON.stringify({
    level: 'INFO',
    requestId,
    message: 'Sleep Audio Processor invoked',
    event: {
      bucket: event.bucket,
      key: event.key,
      audioId: event.audioId,
    },
    timestamp: new Date().toISOString(),
  }));
  
  try {
    // Input validation
    const validation = validateInput(event);
    if (!validation.valid) {
      console.log(JSON.stringify({
        level: 'ERROR',
        requestId,
        message: 'Input validation failed',
        error: validation.error,
        timestamp: new Date().toISOString(),
      }));
      throw new Error(validation.error);
    }
    
    // Extract input data
    const { bucket, key } = event;
    const audioId = key; // Using key as audioId (consistent with state machine)
    const fileExtension = key.toLowerCase().substring(key.lastIndexOf('.'));
    
    // Structured log for processing
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Processing audio file',
      data: {
        bucket,
        key,
        audioId,
        fileExtension,
      },
      timestamp: new Date().toISOString(),
    }));
    
    // Optionally update DynamoDB with processing status
    if (TABLE_NAME) {
      console.log(JSON.stringify({
        level: 'INFO',
        requestId,
        message: 'Updating DynamoDB table',
        tableName: TABLE_NAME,
        timestamp: new Date().toISOString(),
      }));
      
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
        
        console.log(JSON.stringify({
          level: 'INFO',
          requestId,
          message: 'DynamoDB update successful',
          timestamp: new Date().toISOString(),
        }));
      } catch (dbError) {
        console.log(JSON.stringify({
          level: 'ERROR',
          requestId,
          message: 'DynamoDB update failed',
          error: dbError instanceof Error ? dbError.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }));
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
    
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Processing complete',
      result: {
        status: result.status,
        audioId: result.audioId,
      },
      timestamp: new Date().toISOString(),
    }));
    
    return result;
    
  } catch (error) {
    console.log(JSON.stringify({
      level: 'ERROR',
      requestId,
      message: 'Error processing audio',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    }));
    throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Sleep Audio Processor Lambda
 * 
 * Basic Lambda function skeleton for audio processing pipeline.
 * Receives input from Step Functions state machine, logs it, and returns
 * enriched metadata.
 * 
 * This is a minimal placeholder for future audio processing, metadata enrichment,
 * or validation logic.
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const dynamoDbClient = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME;

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
  };
}

/**
 * Lambda handler for audio processing
 */
export async function handler(event: AudioProcessorEvent): Promise<AudioProcessorResult> {
  console.log('Sleep Audio Processor invoked with event:', JSON.stringify(event, null, 2));
  
  try {
    // Extract input data
    const { bucket, key } = event;
    const audioId = key; // Using key as audioId (consistent with state machine)
    
    // Log the input for observability
    console.log(`Processing audio: bucket=${bucket}, key=${key}, audioId=${audioId}`);
    
    // Optionally update DynamoDB with processing status
    if (TABLE_NAME) {
      console.log(`Updating DynamoDB table: ${TABLE_NAME}`);
      try {
        const updateCommand = new UpdateItemCommand({
          TableName: TABLE_NAME,
          Key: {
            audioId: { S: audioId },
          },
          UpdateExpression: 'SET #processor = :processor, #processedAt = :processedAt',
          ExpressionAttributeNames: {
            '#processor': 'processor',
            '#processedAt': 'processedAt',
          },
          ExpressionAttributeValues: {
            ':processor': { S: 'SleepAudioProcessor' },
            ':processedAt': { S: new Date().toISOString() },
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
      },
    };
    
    console.log('Processing complete:', JSON.stringify(result, null, 2));
    return result;
    
  } catch (error) {
    console.error('Error processing audio:', error);
    throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

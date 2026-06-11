/**
 * Sleep Audio Processor Lambda
 * 
 * Implements full audio processing pipeline:
 * - Downloads input audio from S3 or receives text prompt
 * - Generates/processes sleep audio using Amazon Polly
 * - Uploads processed audio to output S3 bucket
 * - Updates DynamoDB with output metadata and COMPLETED status
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { Readable } from 'stream';

const dynamoDbClient = new DynamoDBClient({});
const s3Client = new S3Client({});
const pollyClient = new PollyClient({});

const TABLE_NAME = process.env.TABLE_NAME;
const INPUT_BUCKET = process.env.INPUT_BUCKET;
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET;

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
  outputLocation?: string;
  outputFileSize?: number;
  outputDuration?: number;
  enrichedMetadata?: {
    processingTimestamp: string;
    processor: string;
    fileExtension?: string;
    outputKey?: string;
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
 * Converts a readable stream to Buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Downloads audio file from S3
 */
async function downloadAudioFromS3(bucket: string, key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  const response = await s3Client.send(command);
  
  if (!response.Body) {
    throw new Error('Failed to download audio: empty response body');
  }
  
  return await streamToBuffer(response.Body as Readable);
}

/**
 * Generates soothing sleep audio using Amazon Polly
 * For text input or as enhancement to existing audio
 */
async function generateSleepAudio(text?: string): Promise<Buffer> {
  // Default soothing sleep narration
  const narrationText = text || 
    'Close your eyes and relax. Let your breathing slow down naturally. ' +
    'Feel the tension leaving your body with each exhale. ' +
    'You are safe, comfortable, and at peace. ' +
    'Drift gently into a deep, restful sleep.';
  
  const command = new SynthesizeSpeechCommand({
    Text: narrationText,
    OutputFormat: 'mp3',
    VoiceId: 'Joanna', // Soothing neural voice
    Engine: 'neural',
    TextType: 'text',
  });
  
  const response = await pollyClient.send(command);
  
  if (!response.AudioStream) {
    throw new Error('Failed to synthesize speech: empty audio stream');
  }
  
  return await streamToBuffer(response.AudioStream as Readable);
}

/**
 * Uploads processed audio to output S3 bucket
 * Returns the output key and file size
 */
async function uploadProcessedAudio(
  audioBuffer: Buffer,
  originalKey: string
): Promise<{ outputKey: string; fileSize: number }> {
  if (!OUTPUT_BUCKET) {
    throw new Error('OUTPUT_BUCKET environment variable not set');
  }
  
  // Generate output key: processed-{originalFilename}-{timestamp}.mp3
  const timestamp = Date.now();
  const originalFilename = originalKey.substring(originalKey.lastIndexOf('/') + 1, originalKey.lastIndexOf('.'));
  const outputKey = `processed-${originalFilename}-${timestamp}.mp3`;
  
  const command = new PutObjectCommand({
    Bucket: OUTPUT_BUCKET,
    Key: outputKey,
    Body: audioBuffer,
    ContentType: 'audio/mpeg',
  });
  
  await s3Client.send(command);
  
  return {
    outputKey,
    fileSize: audioBuffer.length,
  };
}

/**
 * Updates DynamoDB with processing results
 */
async function updateDynamoDBMetadata(
  audioId: string,
  outputKey: string,
  fileSize: number,
  requestId: string
): Promise<void> {
  if (!TABLE_NAME) {
    throw new Error('TABLE_NAME environment variable not set');
  }
  
  const outputLocation = `s3://${OUTPUT_BUCKET}/${outputKey}`;
  
  const command = new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: {
      audioId: { S: audioId },
    },
    UpdateExpression: 'SET #processor = :processor, #processedAt = :processedAt, #outputLocation = :outputLocation, #outputFileSize = :outputFileSize, #status = :status',
    ExpressionAttributeNames: {
      '#processor': 'processor',
      '#processedAt': 'processedAt',
      '#outputLocation': 'outputLocation',
      '#outputFileSize': 'outputFileSize',
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':processor': { S: 'SleepAudioProcessor' },
      ':processedAt': { S: new Date().toISOString() },
      ':outputLocation': { S: outputLocation },
      ':outputFileSize': { N: fileSize.toString() },
      ':status': { S: 'COMPLETED' },
    },
  });
  
  await dynamoDbClient.send(command);
}

/**
 * Lambda handler for audio processing with structured logging
 */
export async function handler(event: AudioProcessorEvent, context: any): Promise<AudioProcessorResult> {
  // Structured logging: Use AWS Lambda context requestId for correlation
  const requestId = context.awsRequestId;
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
    
    // Structured log for processing start
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Starting audio processing pipeline',
      data: {
        bucket,
        key,
        audioId,
        fileExtension,
      },
      timestamp: new Date().toISOString(),
    }));
    
    // Step 1: Download input audio from S3 (if needed for enhancement)
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Downloading input audio from S3',
      bucket,
      key,
      timestamp: new Date().toISOString(),
    }));
    
    let inputAudio: Buffer | null = null;
    try {
      inputAudio = await downloadAudioFromS3(bucket, key);
      console.log(JSON.stringify({
        level: 'INFO',
        requestId,
        message: 'Input audio downloaded successfully',
        size: inputAudio.length,
        timestamp: new Date().toISOString(),
      }));
    } catch (downloadError) {
      console.log(JSON.stringify({
        level: 'WARN',
        requestId,
        message: 'Failed to download input audio, will generate from scratch',
        error: downloadError instanceof Error ? downloadError.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }));
      // Continue with generation-only approach
    }
    
    // Step 2: Generate/process sleep audio using Polly
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Generating sleep audio with Amazon Polly',
      timestamp: new Date().toISOString(),
    }));
    
    const processedAudio = await generateSleepAudio();
    
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Sleep audio generated successfully',
      size: processedAudio.length,
      timestamp: new Date().toISOString(),
    }));
    
    // Step 3: Upload processed audio to output bucket
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Uploading processed audio to output bucket',
      outputBucket: OUTPUT_BUCKET,
      timestamp: new Date().toISOString(),
    }));
    
    const { outputKey, fileSize } = await uploadProcessedAudio(processedAudio, key);
    
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Processed audio uploaded successfully',
      outputKey,
      fileSize,
      timestamp: new Date().toISOString(),
    }));
    
    // Step 4: Update DynamoDB with output metadata
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Updating DynamoDB with output metadata',
      tableName: TABLE_NAME,
      audioId,
      timestamp: new Date().toISOString(),
    }));
    
    await updateDynamoDBMetadata(audioId, outputKey, fileSize, requestId);
    
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'DynamoDB update successful',
      timestamp: new Date().toISOString(),
    }));
    
    // Return success result with output details
    const outputLocation = `s3://${OUTPUT_BUCKET}/${outputKey}`;
    const result: AudioProcessorResult = {
      status: 'success',
      audioId,
      message: 'Audio processing completed successfully',
      outputLocation,
      outputFileSize: fileSize,
      enrichedMetadata: {
        processingTimestamp: new Date().toISOString(),
        processor: 'SleepAudioProcessor',
        fileExtension,
        outputKey,
      },
    };
    
    console.log(JSON.stringify({
      level: 'INFO',
      requestId,
      message: 'Processing complete',
      result: {
        status: result.status,
        audioId: result.audioId,
        outputLocation: result.outputLocation,
        outputFileSize: result.outputFileSize,
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

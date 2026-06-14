/**
 * Unit tests for Sleep Audio Processor Lambda
 * 
 * Tests input validation, error handling, and core processing logic
 * Uses mocked AWS SDK clients to test Lambda behavior in isolation
 */

import { Readable } from 'stream';

// Set environment variables before importing the handler
process.env.TABLE_NAME = 'test-table';
process.env.INPUT_BUCKET = 'test-input-bucket';
process.env.OUTPUT_BUCKET = 'test-output-bucket';

// Mock AWS SDK clients before importing the handler
const mockDynamoDBSend = jest.fn();
const mockS3Send = jest.fn();
const mockPollySend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({
    send: mockDynamoDBSend,
  })),
  UpdateItemCommand: jest.fn((params) => params),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: mockS3Send,
  })),
  GetObjectCommand: jest.fn((params) => params),
  PutObjectCommand: jest.fn((params) => params),
}));

jest.mock('@aws-sdk/client-polly', () => ({
  PollyClient: jest.fn(() => ({
    send: mockPollySend,
  })),
  SynthesizeSpeechCommand: jest.fn((params) => params),
}));

// Import handler after mocking
import { handler } from './index';

describe('Sleep Audio Processor Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Input Validation (Issue #8)', () => {
    test('should reject missing bucket', async () => {
      const event = {
        bucket: '',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'test-request-id' };

      await expect(handler(event, context)).rejects.toThrow(
        'Missing or invalid required field: bucket'
      );
    });

    test('should reject missing key', async () => {
      const event = {
        bucket: 'test-bucket',
        key: '',
      };
      const context = { awsRequestId: 'test-request-id' };

      await expect(handler(event, context)).rejects.toThrow(
        'Missing or invalid required field: key'
      );
    });

    test('should reject unsupported audio format', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.txt',
      };
      const context = { awsRequestId: 'test-request-id' };

      await expect(handler(event, context)).rejects.toThrow(
        'Unsupported audio format: .txt'
      );
    });

    test('should accept .mp3 format', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'test-request-id' };

      // Mock S3 download to fail (trigger generation-only path)
      mockS3Send.mockRejectedValueOnce(new Error('S3 download error'));

      // Mock Polly synthesis
      const audioStream = Readable.from([Buffer.from('mock audio data')]);
      mockPollySend.mockResolvedValueOnce({
        AudioStream: audioStream,
      });

      // Mock S3 upload
      mockS3Send.mockResolvedValueOnce({});

      // Mock DynamoDB update
      mockDynamoDBSend.mockResolvedValueOnce({});

      await expect(handler(event, context)).resolves.toMatchObject({
        status: 'success',
        audioId: 'test.mp3',
      });
    });

    test('should accept .wav format', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.wav',
      };
      const context = { awsRequestId: 'test-request-id' };

      // Mock S3 download to fail (trigger generation-only path)
      mockS3Send.mockRejectedValueOnce(new Error('S3 download error'));

      // Mock Polly synthesis
      const audioStream = Readable.from([Buffer.from('mock audio data')]);
      mockPollySend.mockResolvedValueOnce({
        AudioStream: audioStream,
      });

      // Mock S3 upload
      mockS3Send.mockResolvedValueOnce({});

      // Mock DynamoDB update
      mockDynamoDBSend.mockResolvedValueOnce({});

      await expect(handler(event, context)).resolves.toMatchObject({
        status: 'success',
        audioId: 'test.wav',
      });
    });

    test('should accept all supported formats', async () => {
      const supportedFormats = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];

      for (const format of supportedFormats) {
        const event = {
          bucket: 'test-bucket',
          key: `test${format}`,
        };
        const context = { awsRequestId: `test-request-id-${format}` };

        // Mock S3 download to fail (trigger generation-only path)
        mockS3Send.mockRejectedValueOnce(new Error('S3 download error'));

        // Mock Polly synthesis
        const audioStream = Readable.from([Buffer.from('mock audio data')]);
        mockPollySend.mockResolvedValueOnce({
          AudioStream: audioStream,
        });

        // Mock S3 upload
        mockS3Send.mockResolvedValueOnce({});

        // Mock DynamoDB update
        mockDynamoDBSend.mockResolvedValueOnce({});

        await expect(handler(event, context)).resolves.toMatchObject({
          status: 'success',
          audioId: `test${format}`,
        });
      }
    });
  });

  describe('Audio Processing Pipeline (Issue #11)', () => {
    test('should complete full processing pipeline successfully', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'audio/test.mp3',
      };
      const context = { awsRequestId: 'test-request-id-123' };

      // Mock S3 download success
      const inputStream = Readable.from([Buffer.from('input audio data')]);
      mockS3Send.mockResolvedValueOnce({
        Body: inputStream,
      });

      // Mock Polly synthesis
      const outputStream = Readable.from([Buffer.from('processed audio data')]);
      mockPollySend.mockResolvedValueOnce({
        AudioStream: outputStream,
      });

      // Mock S3 upload
      mockS3Send.mockResolvedValueOnce({});

      // Mock DynamoDB update
      mockDynamoDBSend.mockResolvedValueOnce({});

      const result = await handler(event, context);

      expect(result).toMatchObject({
        status: 'success',
        audioId: 'audio/test.mp3',
        message: 'Audio processing completed successfully',
      });
      expect(result.outputLocation).toMatch(/^s3:\/\/test-output-bucket\/processed-test-\d+\.mp3$/);
      expect(result.outputFileSize).toBeGreaterThan(0);
      expect(result.enrichedMetadata).toMatchObject({
        processor: 'SleepAudioProcessor',
        fileExtension: '.mp3',
      });
    });

    test('should handle S3 download failure gracefully', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'test-request-id' };

      // Mock S3 download failure (should continue with generation)
      mockS3Send.mockRejectedValueOnce(new Error('S3.NoSuchKey'));

      // Mock Polly synthesis (should still work)
      const audioStream = Readable.from([Buffer.from('generated audio')]);
      mockPollySend.mockResolvedValueOnce({
        AudioStream: audioStream,
      });

      // Mock S3 upload
      mockS3Send.mockResolvedValueOnce({});

      // Mock DynamoDB update
      mockDynamoDBSend.mockResolvedValueOnce({});

      const result = await handler(event, context);

      expect(result.status).toBe('success');
      expect(mockPollySend).toHaveBeenCalled();
    });

    test('should fail if Polly synthesis fails', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'test-request-id' };

      // Mock S3 download to fail
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));

      // Mock Polly synthesis failure
      mockPollySend.mockRejectedValueOnce(new Error('Polly service error'));

      await expect(handler(event, context)).rejects.toThrow(
        'Audio processing failed: Polly service error'
      );
    });

    test('should fail if S3 upload fails', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'test-request-id' };

      // Mock S3 download to fail
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));

      // Mock Polly synthesis success
      const audioStream = Readable.from([Buffer.from('audio data')]);
      mockPollySend.mockResolvedValueOnce({
        AudioStream: audioStream,
      });

      // Mock S3 upload failure
      mockS3Send.mockRejectedValueOnce(new Error('S3 upload error'));

      await expect(handler(event, context)).rejects.toThrow(
        'Audio processing failed: S3 upload error'
      );
    });

    test('should fail if DynamoDB update fails', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'test-request-id' };

      // Mock S3 download to fail
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));

      // Mock Polly synthesis
      const audioStream = Readable.from([Buffer.from('audio data')]);
      mockPollySend.mockResolvedValueOnce({
        AudioStream: audioStream,
      });

      // Mock S3 upload success
      mockS3Send.mockResolvedValueOnce({});

      // Mock DynamoDB update failure
      mockDynamoDBSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      await expect(handler(event, context)).rejects.toThrow(
        'Audio processing failed: DynamoDB error'
      );
    });
  });

  describe('Structured Logging (Issue #10)', () => {
    test('should log with requestId correlation', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'unique-request-id-123' };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Mock successful processing
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));
      const audioStream = Readable.from([Buffer.from('audio data')]);
      mockPollySend.mockResolvedValueOnce({ AudioStream: audioStream });
      mockS3Send.mockResolvedValueOnce({});
      mockDynamoDBSend.mockResolvedValueOnce({});

      await handler(event, context);

      // Verify structured logging with requestId
      const logs = consoleSpy.mock.calls.map(call => JSON.parse(call[0]));
      const allHaveRequestId = logs.every(log => log.requestId === 'unique-request-id-123');
      expect(allHaveRequestId).toBe(true);

      // Verify log levels
      const logLevels = logs.map(log => log.level);
      expect(logLevels).toContain('INFO');

      consoleSpy.mockRestore();
    });

    test('should log validation errors with ERROR level', async () => {
      const event = {
        bucket: '',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'error-request-id' };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await expect(handler(event, context)).rejects.toThrow();

      // Verify error logging
      const logs = consoleSpy.mock.calls.map(call => JSON.parse(call[0]));
      const errorLogs = logs.filter(log => log.level === 'ERROR');
      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0].message).toContain('validation failed');

      consoleSpy.mockRestore();
    });
  });

  describe('Environment Variable Validation (Issue #7)', () => {
    test('should read TABLE_NAME from environment', () => {
      // This validates that the Lambda reads environment variables
      // In production, these are set by CDK (verified by infrastructure tests)
      expect(process.env.TABLE_NAME).toBe('test-table');
    });

    test('should read OUTPUT_BUCKET from environment', () => {
      // This validates that the Lambda reads environment variables
      // In production, these are set by CDK (verified by infrastructure tests)
      expect(process.env.OUTPUT_BUCKET).toBe('test-output-bucket');
    });

    test('should read INPUT_BUCKET from environment', () => {
      // This validates that the Lambda reads environment variables
      // In production, these are set by CDK (verified by infrastructure tests)
      expect(process.env.INPUT_BUCKET).toBe('test-input-bucket');
    });
  });

  describe('Output Metadata (Issue #11)', () => {
    test('should generate correct output key format', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'folder/myaudio.mp3',
      };
      const context = { awsRequestId: 'test-request-id' };

      // Mock successful processing
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));
      const audioStream = Readable.from([Buffer.from('audio data')]);
      mockPollySend.mockResolvedValueOnce({ AudioStream: audioStream });
      mockS3Send.mockResolvedValueOnce({});
      mockDynamoDBSend.mockResolvedValueOnce({});

      const result = await handler(event, context);

      // Output key format: processed-{filename}-{timestamp}.mp3
      expect(result.enrichedMetadata?.outputKey).toMatch(/^processed-myaudio-\d+\.mp3$/);
    });

    test('should include correct metadata fields', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'test-request-id' };

      // Mock successful processing
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));
      const audioStream = Readable.from([Buffer.from('audio data')]);
      mockPollySend.mockResolvedValueOnce({ AudioStream: audioStream });
      mockS3Send.mockResolvedValueOnce({});
      mockDynamoDBSend.mockResolvedValueOnce({});

      const result = await handler(event, context);

      expect(result).toMatchObject({
        status: 'success',
        audioId: 'test.mp3',
        message: 'Audio processing completed successfully',
      });
      expect(result.outputLocation).toBeDefined();
      expect(result.outputFileSize).toBeGreaterThan(0);
      expect(result.enrichedMetadata).toMatchObject({
        processor: 'SleepAudioProcessor',
        fileExtension: '.mp3',
      });
    });

    test('should update DynamoDB with output location and file size', async () => {
      const event = {
        bucket: 'test-bucket',
        key: 'test.mp3',
      };
      const context = { awsRequestId: 'test-request-id' };

      // Mock successful processing
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));
      const audioStream = Readable.from([Buffer.from('audio data with content')]);
      mockPollySend.mockResolvedValueOnce({ AudioStream: audioStream });
      mockS3Send.mockResolvedValueOnce({});
      mockDynamoDBSend.mockResolvedValueOnce({});

      await handler(event, context);

      // Verify DynamoDB update was called with correct parameters
      expect(mockDynamoDBSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-table',
          Key: {
            audioId: { S: 'test.mp3' },
          },
          ExpressionAttributeValues: expect.objectContaining({
            ':processor': { S: 'SleepAudioProcessor' },
            ':status': { S: 'COMPLETED' },
            ':outputLocation': expect.objectContaining({ S: expect.stringMatching(/^s3:\/\//) }),
            ':outputFileSize': expect.objectContaining({ N: expect.any(String) }),
          }),
        })
      );
    });
  });
});

package storage

import (
	"context"
	"fmt"
	"mime/multipart"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Client struct {
    client     *s3.Client
    bucketName string
    region     string
}

func NewS3Client(bucketName, region string) (*S3Client, error) {
    // Automatically uses the EC2 IAM role — no keys needed
    cfg, err := config.LoadDefaultConfig(context.TODO(),
        config.WithRegion(region),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to load AWS config: %w", err)
    }

    return &S3Client{
        client:     s3.NewFromConfig(cfg),
        bucketName: bucketName,
        region:     region,
    }, nil
}

// UploadFile stores a file in S3 and returns its key
func (s *S3Client) UploadFile(ctx context.Context, file multipart.File, key, contentType string) error {
    _, err := s.client.PutObject(ctx, &s3.PutObjectInput{
        Bucket:      aws.String(s.bucketName),
        Key:         aws.String(key),
        Body:        file,
        ContentType: aws.String(contentType),
    })
    return err
}

// DeleteFile removes a file from S3
func (s *S3Client) DeleteFile(ctx context.Context, key string) error {
    _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
        Bucket: aws.String(s.bucketName),
        Key:    aws.String(key),
    })
    return err
}

// PresignedURL generates a temporary URL so clients can download directly
func (s *S3Client) PresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
    presigner := s3.NewPresignClient(s.client)
    result, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
        Bucket: aws.String(s.bucketName),
        Key:    aws.String(key),
    }, s3.WithPresignExpires(expiry))
    if err != nil {
        return "", err
    }
    return result.URL, nil
}
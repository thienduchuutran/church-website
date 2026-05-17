package storage

import (
	"context"
	"fmt"
	"mime/multipart"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Client struct {
    client     *s3.Client
    bucketName string
    region     string
    publicURL  string // base URL for public reads; empty when bucket has no public access configured
}

// NewS3Client builds a client that talks to any S3-compatible object store.
// Pass endpoint="" for AWS S3 (uses EC2 IAM role or env credentials).
// Pass endpoint="https://<acc>.r2.cloudflarestorage.com" for Cloudflare R2 -
// R2 requires path-style addressing because it does not honor S3-style
// virtual-hosted subdomains like bucket.endpoint/key.
// publicURL is the base URL for direct public reads (e.g. the r2.dev subdomain
// or a custom domain bound to the bucket). Pass "" when the bucket has no
// public access enabled - PublicURL will then return "" and callers must fall
// back to presigning.
func NewS3Client(bucketName, region, endpoint, publicURL string) (*S3Client, error) {
    cfg, err := config.LoadDefaultConfig(context.TODO(),
        config.WithRegion(region),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to load AWS config: %w", err)
    }

    client := s3.NewFromConfig(cfg, func(o *s3.Options) {
        if endpoint != "" {
            o.BaseEndpoint = aws.String(endpoint)
            o.UsePathStyle = true
        }
    })

    return &S3Client{
        client:     client,
        bucketName: bucketName,
        region:     region,
        publicURL:  strings.TrimRight(publicURL, "/"),
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

// PublicURL returns the permanent direct URL for a stored object on a bucket
// that has public access enabled. Returns "" when no public URL is configured
// so callers can fall back to presigning instead of returning a broken link.
func (s *S3Client) PublicURL(key string) string {
    if s.publicURL == "" {
        return ""
    }
    return s.publicURL + "/" + key
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